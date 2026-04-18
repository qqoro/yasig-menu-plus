/**
 * 중복 게임 관리 핸들러
 *
 * - provider + externalId 기준 중복 감지
 * - originalTitle 기준 중복 감지
 * - 선택한 게임 삭제 (DB + 파일 시스템)
 */

import { shell } from "electron";
import { stat, access } from "fs/promises";
import type { IpcMainInvokeEvent } from "electron";
import { db } from "../db/db-manager.js";
import type {
  DuplicateGroup,
  GameItem,
  IpcMainEventMap,
  IpcRendererEventMap,
} from "../events.js";
import { deleteImage } from "../utils/downloader.js";
import { toAbsolutePath } from "../utils/image-path.js";
import { leftJoinUserGameData } from "./home-utils.js";

/**
 * 경로 존재 여부 확인 (fs/promises 기반)
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 관계 데이터 조회 및 맵 생성
 */
async function loadRelationsAndGroup(gamePaths: string[]): Promise<{
  makers: Map<string, string[]>;
  categories: Map<string, string[]>;
  tags: Map<string, string[]>;
}> {
  const [makers, categories, tags] = await Promise.all([
    db("gameMakers")
      .join("makers", "gameMakers.makerId", "makers.id")
      .whereIn("gameMakers.gamePath", gamePaths)
      .select("gameMakers.gamePath", "makers.name"),
    db("gameCategories")
      .join("categories", "gameCategories.categoryId", "categories.id")
      .whereIn("gameCategories.gamePath", gamePaths)
      .select("gameCategories.gamePath", "categories.name"),
    db("gameTags")
      .join("tags", "gameTags.tagId", "tags.id")
      .whereIn("gameTags.gamePath", gamePaths)
      .select("gameTags.gamePath", "tags.name"),
  ]);

  const groupByPath = (
    relations: Array<{ gamePath: string; name: string }>,
  ) => {
    const map = new Map<string, string[]>();
    for (const r of relations) {
      if (!map.has(r.gamePath)) map.set(r.gamePath, []);
      map.get(r.gamePath)!.push(r.name);
    }
    return map;
  };

  return {
    makers: groupByPath(makers as Array<{ gamePath: string; name: string }>),
    categories: groupByPath(
      categories as Array<{ gamePath: string; name: string }>,
    ),
    tags: groupByPath(tags as Array<{ gamePath: string; name: string }>),
  };
}

/**
 * 파일 시스템에서 파일 생성/수정일 조회
 */
async function getFileStats(filePath: string): Promise<{
  fileCreatedAt: Date | null;
  fileModifiedAt: Date | null;
}> {
  try {
    if (await pathExists(filePath)) {
      const stats = await stat(filePath);
      return {
        fileCreatedAt: stats.birthtime,
        fileModifiedAt: stats.mtime,
      };
    }
  } catch (error) {
    console.error(`파일 정보 조회 실패: ${filePath}`, error);
  }
  return { fileCreatedAt: null, fileModifiedAt: null };
}

/**
 * DB 결과를 GameItem으로 변환
 */
async function buildGameItems(
  games: Array<{
    path: string;
    title: string;
    originalTitle: string;
    source: string;
    thumbnail: string | null;
    executablePath: string | null;
    isCompressFile: number | boolean;
    hasExecutable?: number | boolean;
    publishDate: Date | null;
    isFavorite?: number | boolean;
    isHidden?: number | boolean;
    isClear?: number | boolean;
    provider?: string | null;
    externalId?: string | null;
    lastPlayedAt?: Date | null;
    createdAt?: Date | null;
    translatedTitle?: string | null;
    translationSource?: string | null;
    rating?: number | null;
    totalPlayTime?: number;
  }>,
  relations: {
    makers: Map<string, string[]>;
    categories: Map<string, string[]>;
    tags: Map<string, string[]>;
  },
): Promise<GameItem[]> {
  const items = await Promise.all(
    games.map(async (g) => {
      const fileStats = await getFileStats(g.path);
      return {
        path: g.path,
        title: g.title,
        originalTitle: g.originalTitle,
        source: g.source,
        thumbnail: toAbsolutePath(g.thumbnail),
        executablePath: g.executablePath || null,
        isCompressFile: Boolean(g.isCompressFile),
        hasExecutable:
          g.hasExecutable !== undefined ? Boolean(g.hasExecutable) : true,
        publishDate: g.publishDate || null,
        translatedTitle: g.translatedTitle || null,
        translationSource: g.translationSource || null,
        rating: g.rating,
        isFavorite:
          g.isFavorite !== undefined ? Boolean(g.isFavorite) : undefined,
        isHidden: g.isHidden !== undefined ? Boolean(g.isHidden) : undefined,
        isClear: g.isClear !== undefined ? Boolean(g.isClear) : undefined,
        provider: g.provider || null,
        externalId: g.externalId || null,
        lastPlayedAt: g.lastPlayedAt || null,
        createdAt: g.createdAt || null,
        totalPlayTime: g.totalPlayTime,
        fileCreatedAt: fileStats.fileCreatedAt,
        fileModifiedAt: fileStats.fileModifiedAt,
        makers: relations.makers.get(g.path) || [],
        categories: relations.categories.get(g.path) || [],
        tags: relations.tags.get(g.path) || [],
      };
    }),
  );
  return items;
}

/**
 * 중복 게임 그룹 조회 핸들러
 *
 * 중복 기준:
 * 1. provider + externalId 동일
 * 2. fingerprint 동일 (같은 실행파일 구성)
 * 3. originalTitle 정확히 일치
 */
export async function findDuplicatesHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["findDuplicates"],
): Promise<IpcMainEventMap["duplicatesFound"]> {
  // 모든 게임 조회 (숨김 포함)
  const games = await leftJoinUserGameData(db("games"))
    .select(
      "games.path",
      "games.title",
      "games.originalTitle",
      "games.source",
      "games.thumbnail",
      "games.executablePath",
      "games.isCompressFile",
      "games.hasExecutable",
      "games.publishDate",
      "games.isHidden",
      "games.provider",
      "games.externalId",
      "games.fingerprint",
      "games.createdAt",
      "games.translatedTitle",
      "games.translationSource",
      "userGameData.isFavorite",
      "userGameData.isClear",
      "userGameData.lastPlayedAt",
      "userGameData.rating",
      "userGameData.totalPlayTime",
    )
    .orderBy("games.createdAt", "asc");

  if (games.length === 0) {
    return { groups: [] };
  }

  // 관계 데이터 조회
  const gamePaths = games.map((g) => g.path);
  const relations = await loadRelationsAndGroup(gamePaths);
  const gameItems = await buildGameItems(games, relations);

  // 중복 그룹화
  const groups: DuplicateGroup[] = [];
  const processedPaths = new Set<string>();

  // 1. provider + externalId 기준 그룹화
  const externalIdGroups = new Map<string, GameItem[]>();
  for (const game of gameItems) {
    if (game.provider && game.externalId) {
      const key = `${game.provider}:${game.externalId}`;
      if (!externalIdGroups.has(key)) {
        externalIdGroups.set(key, []);
      }
      externalIdGroups.get(key)!.push(game);
    }
  }

  // 2개 이상인 그룹만 추가
  for (const [key, groupGames] of externalIdGroups) {
    if (groupGames.length >= 2) {
      const [provider, _externalId] = key.split(":");
      groups.push({
        id: key,
        type: "externalId",
        provider,
        games: groupGames,
      });
      for (const g of groupGames) {
        processedPaths.add(g.path);
      }
    }
  }

  // 2. fingerprint 기준 그룹화 (이미 처리된 경로 제외)
  // raw 결과에서 path → fingerprint 맵 생성
  const fingerprintByPath = new Map<string, string>();
  for (const g of games) {
    if (g.fingerprint) {
      fingerprintByPath.set(g.path, g.fingerprint);
    }
  }

  const fingerprintGroups = new Map<string, GameItem[]>();
  for (const game of gameItems) {
    const fp = fingerprintByPath.get(game.path);
    if (!processedPaths.has(game.path) && fp) {
      if (!fingerprintGroups.has(fp)) {
        fingerprintGroups.set(fp, []);
      }
      fingerprintGroups.get(fp)!.push(game);
    }
  }

  for (const [fp, groupGames] of fingerprintGroups) {
    if (groupGames.length >= 2) {
      groups.push({
        id: fp,
        type: "fingerprint",
        games: groupGames,
      });
      for (const g of groupGames) {
        processedPaths.add(g.path);
      }
    }
  }

  // 3. originalTitle 기준 그룹화 (이미 처리된 경로 제외)
  const titleGroups = new Map<string, GameItem[]>();
  for (const game of gameItems) {
    if (!processedPaths.has(game.path)) {
      const key = game.originalTitle;
      if (!titleGroups.has(key)) {
        titleGroups.set(key, []);
      }
      titleGroups.get(key)!.push(game);
    }
  }

  // 2개 이상인 그룹만 추가
  for (const [title, groupGames] of titleGroups) {
    if (groupGames.length >= 2) {
      groups.push({
        id: title,
        type: "originalTitle",
        games: groupGames,
      });
    }
  }

  return { groups };
}

/**
 * 게임 삭제 핸들러 (DB + 파일 시스템)
 *
 * 삭제 대상:
 * - DB: games, gameMakers, gameCategories, gameTags, gameImages, playSessions
 * - 파일: 게임 폴더/파일, 썸네일, 이미지
 */
export async function deleteGamesHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["deleteGames"],
): Promise<IpcMainEventMap["gamesDeleted"]> {
  const { paths } = payload;

  if (paths.length === 0) {
    return { deletedCount: 0 };
  }

  // 삭제 전 썸네일 및 이미지 경로 조회
  const gamesToDelete = await db("games")
    .whereIn("path", paths)
    .select("path", "thumbnail", "isCompressFile");

  const thumbnailsToDelete = gamesToDelete
    .map((g) => g.thumbnail)
    .filter((t): t is string => t !== null);

  const imagesToDelete = await db("gameImages")
    .whereIn("gamePath", paths)
    .pluck("path");

  // 관계 데이터 삭제 (CASCADE로 자동 삭제되지만 명시적으로)
  await db("gameMakers").whereIn("gamePath", paths).delete();
  await db("gameCategories").whereIn("gamePath", paths).delete();
  await db("gameTags").whereIn("gamePath", paths).delete();
  await db("gameImages").whereIn("gamePath", paths).delete();
  // playSessions는 user_game_data에 속하므로 보존

  // 게임 레코드 삭제
  const deletedCount = await db("games").whereIn("path", paths).delete();

  // 실제 파일 삭제 (휴지통으로 이동)
  for (const game of gamesToDelete) {
    try {
      if (await pathExists(game.path)) {
        // 휴지통으로 이동 (복원 가능)
        shell.trashItem(game.path);
      }
    } catch (error) {
      console.error(`게임 폴더 삭제 실패: ${game.path}`, error);
    }
  }

  // 썸네일 및 이미지 파일 삭제 (상대 경로를 절대 경로로 변환)
  for (const thumbnail of thumbnailsToDelete) {
    await deleteImage(toAbsolutePath(thumbnail) ?? thumbnail);
  }
  for (const imagePath of imagesToDelete) {
    await deleteImage(toAbsolutePath(imagePath) ?? imagePath);
  }

  return { deletedCount };
}
