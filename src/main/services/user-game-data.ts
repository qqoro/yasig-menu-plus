/**
 * 유저 게임 데이터 서비스
 *
 * fingerprint / external_key 기반으로 user_game_data를 조회/생성.
 * external_key 우선 → fingerprint fallback 순서.
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
 * 유저 데이터 조회 또는 생성.
 *
 * 1. external_key로 검색 (우선)
 *    - 찾으면 → fingerprint 다르면 갱신 후 반환
 * 2. fingerprint로 검색
 * 3. 없으면 → 새로 생성
 */
export async function getOrCreateUserGameData(
  gamePath: string,
): Promise<number> {
  const game = await db("games")
    .where("path", gamePath)
    .select("provider", "externalId", "fingerprint")
    .first();
  if (!game) throw new Error("게임을 찾을 수 없습니다.");

  const externalKey = buildExternalKey(game.provider, game.externalId);

  // 1. external_key로 검색 (우선)
  if (externalKey) {
    const existing = await db("userGameData")
      .where("externalKey", externalKey)
      .first();
    if (existing) {
      // fingerprint가 다르면 갱신 (버전업 대응)
      if (game.fingerprint && existing.fingerprint !== game.fingerprint) {
        // UNIQUE 충돌 방지: 새 fingerprint를 가진 다른 레코드가 있는지 확인
        const conflicting = await db("userGameData")
          .where("fingerprint", game.fingerprint)
          .whereNot("id", existing.id)
          .first();
        if (!conflicting) {
          await db("userGameData")
            .where("id", existing.id)
            .update({ fingerprint: game.fingerprint });
        }
      }
      return existing.id;
    }
  }

  // 2. fingerprint로 검색
  if (game.fingerprint) {
    const existing = await db("userGameData")
      .where("fingerprint", game.fingerprint)
      .first();
    if (existing) {
      // external_key도 업데이트 (없으면)
      if (externalKey && !existing.externalKey) {
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
      return existing.id;
    }
  }

  // 3. 새로 생성
  const [inserted] = await db("userGameData")
    .insert({
      externalKey,
      fingerprint: game.fingerprint,
      createdAt: new Date(),
    })
    .returning("id");

  return inserted.id;
}

/**
 * 콜렉터 수집 완료 시 user_game_data의 external_key 갱신
 */
export async function updateUserGameDataExternalKey(
  gamePath: string,
  provider: string,
  externalId: string,
): Promise<void> {
  const externalKey = buildExternalKey(provider, externalId);
  if (!externalKey) return;

  const game = await db("games")
    .where("path", gamePath)
    .select("fingerprint")
    .first();
  if (!game?.fingerprint) return;

  const existing = await db("userGameData")
    .where("fingerprint", game.fingerprint)
    .first();
  if (!existing) return;

  // external_key가 없으면 추가
  if (!existing.externalKey) {
    const duplicate = await db("userGameData")
      .where("externalKey", externalKey)
      .whereNot("id", existing.id)
      .first();
    if (!duplicate) {
      await db("userGameData").where("id", existing.id).update({ externalKey });
    }
  }
}
