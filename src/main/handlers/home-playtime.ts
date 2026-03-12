/**
 * 플레이 타임 관련 핸들러
 *
 * - 플레이 타임 조회
 * - 플레이 세션 목록 조회
 */

import type { IpcMainInvokeEvent } from "electron";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import { leftJoinUserGameData } from "./home-utils.js";

/**
 * 플레이 타임 조회 핸들러
 */
export async function getPlayTimeHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getPlayTime"],
): Promise<IpcMainEventMap["playTimeLoaded"]> {
  const { path } = payload;

  const game = await leftJoinUserGameData(db("games"))
    .where("games.path", path)
    .select("userGameData.totalPlayTime")
    .first();

  return {
    path,
    totalPlayTime: game?.totalPlayTime ?? 0,
  };
}

/**
 * 플레이 세션 목록 조회 핸들러
 */
export async function getPlaySessionsHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getPlaySessions"],
): Promise<IpcMainEventMap["playSessionsLoaded"]> {
  const { path, limit = 10 } = payload;

  // getOrCreateUserGameData는 쓰기 작업(INSERT)도 하므로,
  // 읽기 전용 조회에는 별도 함수 사용
  const game = await db("games")
    .where("path", path)
    .select("provider", "externalId", "fingerprint")
    .first();
  if (!game) return { sessions: [] };

  // externalKey 우선 → fingerprint fallback (getOrCreateUserGameData와 동일 로직)
  const externalKey =
    game.provider && game.externalId && game.externalId !== ""
      ? `${game.provider}:${game.externalId}`
      : null;

  let userData;
  if (externalKey) {
    userData = await db("userGameData")
      .where("externalKey", externalKey)
      .select("id")
      .first();
  }
  if (!userData && game.fingerprint) {
    userData = await db("userGameData")
      .where("fingerprint", game.fingerprint)
      .select("id")
      .first();
  }
  if (!userData) return { sessions: [] };

  const sessions = await db("playSessions")
    .where("userGameDataId", userData.id)
    .orderBy("startedAt", "desc")
    .limit(limit);

  return { sessions };
}
