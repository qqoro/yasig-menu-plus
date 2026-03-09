/**
 * 유저 게임 데이터 서비스
 *
 * 게임의 유저 데이터(별점, 플레이타임, 즐겨찾기 등)를
 * external_key 또는 fingerprint로 관리
 */

import { db } from "../db/db-manager.js";

/**
 * external_key 생성 (provider + externalId → "provider:externalId")
 */
export function buildExternalKey(
  provider: string | null,
  externalId: string | null,
): string | null {
  if (!provider || !externalId || externalId === "") return null;
  return `${provider}:${externalId}`;
}

/**
 * 게임에 연결된 user_game_data 조회.
 * userGameDataId가 없으면 external_key → fingerprint 순으로 탐색 후 연결.
 */
export async function findAndLinkUserGameData(
  gamePath: string,
  options?: {
    provider?: string | null;
    externalId?: string | null;
    fingerprint?: string | null;
  },
): Promise<number | null> {
  // 1. 이미 연결된 경우
  const game = await db("games")
    .where("path", gamePath)
    .select("userGameDataId", "provider", "externalId", "fingerprint")
    .first();
  if (!game) return null;
  if (game.userGameDataId) return game.userGameDataId;

  const provider = options?.provider ?? game.provider;
  const externalId = options?.externalId ?? game.externalId;
  const fingerprint = options?.fingerprint ?? game.fingerprint;

  // 2. external_key로 검색
  const externalKey = buildExternalKey(provider, externalId);
  if (externalKey) {
    const existing = await db("userGameData")
      .where("externalKey", externalKey)
      .first();
    if (existing) {
      await db("games")
        .where("path", gamePath)
        .update({ userGameDataId: existing.id });
      // fingerprint도 업데이트 (이중 안전망)
      if (fingerprint && !existing.fingerprint) {
        await db("userGameData")
          .where("id", existing.id)
          .update({ fingerprint });
      }
      return existing.id;
    }
  }

  // 3. fingerprint로 검색
  if (fingerprint) {
    const existing = await db("userGameData")
      .where("fingerprint", fingerprint)
      .first();
    if (existing) {
      await db("games")
        .where("path", gamePath)
        .update({ userGameDataId: existing.id });
      // external_key도 업데이트
      if (externalKey && !existing.externalKey) {
        await db("userGameData")
          .where("id", existing.id)
          .update({ externalKey });
      }
      return existing.id;
    }
  }

  return null;
}

/**
 * 유저 데이터 조회 또는 생성. 별점/플레이타임 기록 시 호출.
 */
export async function getOrCreateUserGameData(
  gamePath: string,
): Promise<number> {
  // 이미 연결된 경우
  const linked = await findAndLinkUserGameData(gamePath);
  if (linked) return linked;

  const game = await db("games")
    .where("path", gamePath)
    .select("provider", "externalId", "fingerprint")
    .first();
  if (!game) throw new Error("게임을 찾을 수 없습니다.");

  const externalKey = buildExternalKey(game.provider, game.externalId);

  // 새로 생성
  const [inserted] = await db("userGameData")
    .insert({
      externalKey,
      fingerprint: game.fingerprint,
      createdAt: new Date(),
    })
    .returning("id");

  const userGameDataId = inserted.id;
  await db("games").where("path", gamePath).update({ userGameDataId });
  return userGameDataId;
}

/**
 * 콜렉터 수집 완료 시 external_key 연결/업데이트
 */
export async function linkExternalKey(
  gamePath: string,
  provider: string,
  externalId: string,
): Promise<void> {
  const externalKey = buildExternalKey(provider, externalId);
  if (!externalKey) return;

  const game = await db("games")
    .where("path", gamePath)
    .select("userGameDataId", "fingerprint")
    .first();
  if (!game) return;

  if (game.userGameDataId) {
    // 이미 연결된 user_game_data에 external_key 추가 (없으면)
    const existing = await db("userGameData")
      .where("id", game.userGameDataId)
      .first();
    if (existing && !existing.externalKey) {
      // 동일 external_key를 가진 다른 레코드가 있는지 확인
      const duplicate = await db("userGameData")
        .where("externalKey", externalKey)
        .whereNot("id", existing.id)
        .first();
      if (!duplicate) {
        await db("userGameData")
          .where("id", existing.id)
          .update({ externalKey });
      }
    }
  } else {
    // 연결되지 않은 경우: external_key로 기존 user_game_data 검색
    await findAndLinkUserGameData(gamePath, { provider, externalId });
  }
}
