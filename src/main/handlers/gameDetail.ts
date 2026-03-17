/**
 * 게임 상세 정보 조회 핸들러
 */

import { ipcMain } from "electron";
import { db } from "../db/db-manager.js";
import type { GameDetailItem } from "../events.js";
import { IpcRendererSend } from "../events.js";
import { toAbsolutePath } from "../utils/image-path.js";
import { leftJoinUserGameData } from "./home-utils.js";

/**
 * 게임 상세 정보 조회
 */
export async function getGameDetail(
  path: string,
): Promise<GameDetailItem | null> {
  // games 테이블과 userGameData 테이블을 LEFT JOIN하여 유저 데이터 포함
  const game = await leftJoinUserGameData(db("games"))
    .where("games.path", path)
    .select(
      // games 테이블 컬럼 (명시적 선택으로 id 충돌 방지)
      "games.path",
      "games.title",
      "games.originalTitle",
      "games.translatedTitle",
      "games.translationSource",
      "games.source",
      "games.thumbnail",
      "games.executablePath",
      "games.isCompressFile",
      "games.hasExecutable",
      "games.publishDate",
      "games.isHidden",
      "games.provider",
      "games.externalId",
      "games.memo",
      "games.createdAt",
      "games.updatedAt",
      // userGameData 테이블 컬럼
      "userGameData.rating",
      "userGameData.totalPlayTime",
      "userGameData.isFavorite",
      "userGameData.isClear",
      "userGameData.lastPlayedAt",
    )
    .first();

  if (!game) {
    return null;
  }

  // 관계 데이터 조회
  const makers = (await db("gameMakers")
    .join("makers", "gameMakers.makerId", "makers.id")
    .where("gameMakers.gamePath", path)
    .select("makers.name")
    .pluck("name")) as string[];

  const categories = (await db("gameCategories")
    .join("categories", "gameCategories.categoryId", "categories.id")
    .where("gameCategories.gamePath", path)
    .select("categories.name")
    .pluck("name")) as string[];

  const tags = (await db("gameTags")
    .join("tags", "gameTags.tagId", "tags.id")
    .where("gameTags.gamePath", path)
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
    thumbnail: toAbsolutePath(game.thumbnail),
    executablePath: game.executablePath,
    isCompressFile: Boolean(game.isCompressFile),
    hasExecutable:
      game.hasExecutable !== undefined ? Boolean(game.hasExecutable) : true,
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
