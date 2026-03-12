/**
 * 플레이 타임 관련 핸들러
 *
 * - 플레이 타임 조회
 * - 플레이 세션 목록 조회
 */

import type { IpcMainInvokeEvent } from "electron";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";

/**
 * 플레이 타임 조회 핸들러
 */
export async function getPlayTimeHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getPlayTime"],
): Promise<IpcMainEventMap["playTimeLoaded"]> {
  const { path } = payload;

  const game = await db("games")
    .leftJoin("userGameData", "games.fingerprint", "userGameData.fingerprint")
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

  const game = await db("games")
    .where("path", path)
    .select("fingerprint")
    .first();
  if (!game?.fingerprint) return { sessions: [] };

  const userData = await db("userGameData")
    .where("fingerprint", game.fingerprint)
    .select("id")
    .first();
  if (!userData) return { sessions: [] };

  const sessions = await db("playSessions")
    .where("userGameDataId", userData.id)
    .orderBy("startedAt", "desc")
    .limit(limit);

  return { sessions };
}
