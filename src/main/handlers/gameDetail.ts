/**
 * 게임 상세 정보 조회 핸들러
 */

import { ipcMain } from "electron";
import { db } from "../db/db-manager.js";
import type { GameDetailItem } from "../events.js";
import { IpcRendererSend } from "../events.js";

/**
 * 게임 상세 정보 조회
 */
export async function getGameDetail(
  path: string,
): Promise<GameDetailItem | null> {
  const game = await db("games").where("path", path).first();

  if (!game) {
    return null;
  }

  // 관계 데이터 조회
  const makers = (await db("game_makers")
    .join("makers", "game_makers.makerId", "makers.id")
    .where("game_makers.gamePath", path)
    .select("makers.name")
    .pluck("name")) as string[];

  const categories = (await db("game_categories")
    .join("categories", "game_categories.categoryId", "categories.id")
    .where("game_categories.gamePath", path)
    .select("categories.name")
    .pluck("name")) as string[];

  const tags = (await db("game_tags")
    .join("tags", "game_tags.tagId", "tags.id")
    .where("game_tags.gamePath", path)
    .select("tags.name")
    .pluck("name")) as string[];

// 날짜 필드 변환 (숫자 타임스탬프 또는 Date 객체 처리)
const toDate = (value: unknown): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return null;
};

// GameDetailItem 타입으로 변환
  return {
    path: game.path,
    title: game.title,
    originalTitle: game.originalTitle,
    translatedTitle: game.translatedTitle,
    translationSource: game.translationSource,
    source: game.source,
    thumbnail: game.thumbnail,
    executablePath: game.executablePath,
    isCompressFile: Boolean(game.isCompressFile),
    publishDate: toDate(game.publishDate),
    isFavorite: Boolean(game.isFavorite),
    isHidden: Boolean(game.isHidden),
    isClear: Boolean(game.isClear),
    provider: game.provider,
    externalId: game.externalId,
    lastPlayedAt: toDate(game.lastPlayedAt),
    createdAt: toDate(game.createdAt),
    updatedAt: toDate(game.updatedAt),
    rating: game.rating,
    totalPlayTime: game.totalPlayTime,
    makers,
    categories,
    tags,
    memo: game.memo,
  };
}

/**
 * 핸들러 등록
 */
export function registerHandlers(): void {
  ipcMain.handle(IpcRendererSend.GetGameDetail, async (_event, { path }) => {
    try {
      const game = await getGameDetail(path);
      return { game };
    } catch (error) {
      console.error("게임 상세 정보 조회 실패:", error);
      return { game: null };
    }
  });
}
