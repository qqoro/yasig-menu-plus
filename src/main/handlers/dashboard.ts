/**
 * 대시보드 통계 핸들러
 */

import type { IpcMainInvokeEvent } from "electron";
import { db } from "../db/db-manager.js";
import { getFolderSize } from "../lib/folder-size.js";
import type { DashboardStats, IpcMainEventMap } from "../events.js";
import { buildTitleOrderParts, leftJoinUserGameData } from "./home-utils.js";
import { toAbsolutePath } from "../utils/image-path.js";
import {
  DEFAULT_TITLE_DISPLAY_PRIORITY,
  getLibraryPaths,
  getTranslationSettings,
} from "../store.js";

/**
 * 설정의 제목 표시 우선순위(titleDisplayPriority)를 반영한 표시 제목 SQL 표현식
 * (홈 화면 제목 정렬과 동일한 COALESCE 로직 — home-utils.buildTitleOrderParts)
 */
function displayTitleExpr(): string {
  const priority =
    getTranslationSettings().titleDisplayPriority ??
    DEFAULT_TITLE_DISPLAY_PRIORITY;
  return buildTitleOrderParts(priority);
}

/** 라이브러리 개요 통계 */
async function getOverviewStats(): Promise<DashboardStats["overview"]> {
  const totalRow = await db("games")
    .where("isHidden", false)
    .count("path as count")
    .first();

  const totalGames = (totalRow as any)?.count ?? 0;

  const favoriteRow = await leftJoinUserGameData(db("games"))
    .where("games.isHidden", false)
    .andWhereRaw("user_game_data.is_favorite = 1")
    .count("games.path as count")
    .first();
  const favoriteCount = (favoriteRow as any)?.count ?? 0;

  const clearedRow = await leftJoinUserGameData(db("games"))
    .where("games.isHidden", false)
    .andWhereRaw("user_game_data.is_clear = 1")
    .count("games.path as count")
    .first();
  const clearedCount = (clearedRow as any)?.count ?? 0;

  const clearedRate =
    totalGames > 0 ? Math.round((clearedCount / totalGames) * 100) : 0;

  const playTimeRow = await db("userGameData")
    .sum("totalPlayTime as total")
    .first();
  const totalPlayTime = (playTimeRow as any)?.total ?? 0;

  const ratingRow = await db("userGameData")
    .whereNotNull("rating")
    .avg("rating as avg")
    .first();
  const averageRating = (ratingRow as any)?.avg
    ? Math.round((ratingRow as any).avg * 10) / 10
    : null;

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // started_at은 epoch ms 정수로 저장되므로 getTime()으로 비교한다
  // (ISO 문자열과 비교하면 SQLite 타입 정렬 규칙상 INTEGER < TEXT로 항상 거짓)
  const weekPlayRow = await db("playSessions")
    .where("startedAt", ">=", weekStart.getTime())
    .sum("durationSeconds as total")
    .first();
  const thisWeekPlayTime = (weekPlayRow as any)?.total ?? 0;

  const monthPlayRow = await db("playSessions")
    .where("startedAt", ">=", monthStart.getTime())
    .sum("durationSeconds as total")
    .first();
  const thisMonthPlayTime = (monthPlayRow as any)?.total ?? 0;

  return {
    totalGames,
    favoriteCount,
    clearedCount,
    clearedRate,
    totalPlayTime,
    averageRating,
    thisWeekPlayTime,
    thisMonthPlayTime,
  };
}

/** TOP 10 플레이 게임 */
async function getTopPlayedGames(): Promise<DashboardStats["topPlayedGames"]> {
  const rows = await leftJoinUserGameData(db("games"))
    .where("games.isHidden", false)
    .whereNotNull("user_game_data.total_play_time")
    .andWhereRaw("user_game_data.total_play_time > 0")
    .orderByRaw("user_game_data.total_play_time DESC")
    .limit(10)
    .select(
      "games.path",
      db.raw(`${displayTitleExpr()} as title`),
      "games.thumbnail",
      "userGameData.totalPlayTime",
    );

  return (rows as any[]).map((r) => ({
    path: r.path,
    title: r.title,
    thumbnail: toAbsolutePath(r.thumbnail),
    totalPlayTime: r.totalPlayTime ?? 0,
  }));
}

/** 최장 단일 세션 */
async function getLongestSession(): Promise<DashboardStats["longestSession"]> {
  const row = await db("playSessions")
    .join("userGameData", "playSessions.userGameDataId", "userGameData.id")
    .orderBy("playSessions.durationSeconds", "desc")
    .limit(1)
    .select(
      "playSessions.durationSeconds",
      "playSessions.startedAt",
      "userGameData.id as userGameDataId",
    )
    .first();

  if (!row) return null;

  const game = await db("games")
    .joinRaw(
      `
      JOIN user_game_data ON user_game_data.id = COALESCE(
        (SELECT id FROM user_game_data
         WHERE external_key = games.provider || ':' || games.external_id
           AND games.provider IS NOT NULL
           AND games.external_id IS NOT NULL
           AND games.external_id != ''
         LIMIT 1),
        (SELECT id FROM user_game_data
         WHERE fingerprint = games.fingerprint
           AND games.fingerprint IS NOT NULL
         LIMIT 1)
      )
    `,
    )
    .where("user_game_data.id", (row as any).userGameDataId)
    .select(db.raw(`${displayTitleExpr()} as title`))
    .first();

  return {
    gameTitle: (game as any)?.title ?? "알 수 없는 게임",
    durationSeconds: (row as any).durationSeconds,
    startedAt: (row as any).startedAt,
  };
}

/** 가장 오래 방치된 게임 TOP 5 */
async function getMostNeglectedGames(): Promise<
  DashboardStats["mostNeglectedGames"]
> {
  const rows = await leftJoinUserGameData(db("games"))
    .where("games.isHidden", false)
    .andWhere(function () {
      this.whereNull("user_game_data.total_play_time").orWhereRaw(
        "user_game_data.total_play_time = 0",
      );
    })
    .orderBy("games.createdAt", "asc")
    .limit(5)
    .select(
      "games.path",
      db.raw(`${displayTitleExpr()} as title`),
      "games.thumbnail",
      "games.createdAt",
    );

  return (rows as any[]).map((r) => ({
    path: r.path,
    title: r.title,
    thumbnail: toAbsolutePath(r.thumbnail),
    createdAt: r.createdAt,
  }));
}

/** 월별 플레이 추이 (최근 12개월) */
async function getMonthlyPlayTime(): Promise<
  DashboardStats["monthlyPlayTime"]
> {
  // started_at은 epoch ms 정수 → /1000 'unixepoch' 변환 후 'localtime'으로 로컬 시간대 기준 그룹핑
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

  const rows = await db("playSessions")
    .select(
      db.raw(
        "strftime('%Y-%m', started_at / 1000, 'unixepoch', 'localtime') as month",
      ),
      db.raw("SUM(duration_seconds) as totalSeconds"),
      db.raw("COUNT(*) as sessionCount"),
    )
    .where("startedAt", ">=", twelveMonthsAgo.getTime())
    .groupByRaw(
      "strftime('%Y-%m', started_at / 1000, 'unixepoch', 'localtime')",
    )
    .orderBy("month", "asc");

  return rows as any[];
}

/** 시간대별 플레이 패턴 */
async function getHourlyPattern(): Promise<DashboardStats["hourlyPattern"]> {
  // started_at은 epoch ms 정수 → 로컬 시간대 기준 시간 그룹핑
  const rows = await db("playSessions")
    .select(
      db.raw(
        "CAST(strftime('%H', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour",
      ),
      db.raw("SUM(duration_seconds) as totalSeconds"),
      db.raw("COUNT(*) as sessionCount"),
    )
    .groupByRaw("strftime('%H', started_at / 1000, 'unixepoch', 'localtime')")
    .orderBy("hour", "asc");

  return rows as any[];
}

/** 요일별 플레이 패턴 */
async function getWeekdayPattern(): Promise<DashboardStats["weekdayPattern"]> {
  // started_at은 epoch ms 정수 → 로컬 시간대 기준 요일(0=일요일) 그룹핑
  const rows = await db("playSessions")
    .select(
      db.raw(
        "CAST(strftime('%w', started_at / 1000, 'unixepoch', 'localtime') AS INTEGER) as weekday",
      ),
      db.raw("SUM(duration_seconds) as totalSeconds"),
      db.raw("COUNT(*) as sessionCount"),
    )
    .groupByRaw("strftime('%w', started_at / 1000, 'unixepoch', 'localtime')")
    .orderBy("weekday", "asc");

  return rows as any[];
}

/** 별점 분포 */
async function getRatingDistribution(): Promise<
  DashboardStats["ratingDistribution"]
> {
  const rows = await db("userGameData")
    .whereNotNull("rating")
    .select("rating", db.raw("COUNT(*) as count"))
    .groupBy("rating")
    .orderBy("rating", "asc");

  return rows as any[];
}

/** 제작사 TOP 10 */
async function getTopMakers(): Promise<DashboardStats["topMakers"]> {
  const rows = await db("gameMakers")
    .join("makers", "gameMakers.makerId", "makers.id")
    .join("games", "gameMakers.gamePath", "games.path")
    .where("games.isHidden", false)
    .select(
      "makers.name",
      db.raw("COUNT(DISTINCT game_makers.game_path) as count"),
    )
    .groupBy("makers.id", "makers.name")
    .orderBy("count", "desc")
    .limit(10);

  return rows as any[];
}

/** 카테고리별 게임 분포 */
async function getCategoryDistribution(): Promise<
  DashboardStats["categoryDistribution"]
> {
  const rows = await db("gameCategories")
    .join("categories", "gameCategories.categoryId", "categories.id")
    .join("games", "gameCategories.gamePath", "games.path")
    .where("games.isHidden", false)
    .select(
      "categories.name",
      db.raw("COUNT(DISTINCT game_categories.game_path) as count"),
    )
    .groupBy("categories.id", "categories.name")
    .orderBy("count", "desc");

  return rows as any[];
}

/** 태그별 게임 분포 (상위 20개) */
async function getTagDistribution(): Promise<
  DashboardStats["tagDistribution"]
> {
  const rows = await db("gameTags")
    .join("tags", "gameTags.tagId", "tags.id")
    .join("games", "gameTags.gamePath", "games.path")
    .where("games.isHidden", false)
    .select("tags.name", db.raw("COUNT(DISTINCT game_tags.game_path) as count"))
    .groupBy("tags.id", "tags.name")
    .orderBy("count", "desc")
    .limit(100);

  return rows as any[];
}

/** 제공자별 분포 */
async function getProviderDistribution(): Promise<
  DashboardStats["providerDistribution"]
> {
  const rows = await db("games")
    .where("isHidden", false)
    .select(
      db.raw("COALESCE(provider, 'unknown') as provider"),
      db.raw("COUNT(*) as count"),
    )
    .groupByRaw("COALESCE(provider, 'unknown')")
    .orderBy("count", "desc");

  return rows as any[];
}

/** 발매연도별 분포 */
async function getYearDistribution(): Promise<
  DashboardStats["yearDistribution"]
> {
  const rows = await db("games")
    .where("isHidden", false)
    .whereNotNull("publishDate")
    .select(
      db.raw(
        "CAST(strftime('%Y', publish_date / 1000, 'unixepoch') AS INTEGER) as year",
      ),
      db.raw("COUNT(*) as count"),
    )
    .groupByRaw("strftime('%Y', publish_date / 1000, 'unixepoch')")
    .orderBy("year", "desc");

  return rows as any[];
}

/** 대시보드 통계 메인 핸들러 */
export async function getDashboardStatsHandler(
  _event: IpcMainInvokeEvent,
): Promise<IpcMainEventMap["dashboardStats"]> {
  const overview = await getOverviewStats();
  const topPlayedGames = await getTopPlayedGames();
  const longestSession = await getLongestSession();
  const mostNeglectedGames = await getMostNeglectedGames();
  const monthlyPlayTime = await getMonthlyPlayTime();
  const hourlyPattern = await getHourlyPattern();
  const weekdayPattern = await getWeekdayPattern();
  const ratingDistribution = await getRatingDistribution();
  const topMakers = await getTopMakers();
  const categoryDistribution = await getCategoryDistribution();
  const tagDistribution = await getTagDistribution();
  const providerDistribution = await getProviderDistribution();
  const yearDistribution = await getYearDistribution();

  return {
    stats: {
      overview,
      topPlayedGames,
      longestSession,
      mostNeglectedGames,
      monthlyPlayTime,
      hourlyPattern,
      weekdayPattern,
      ratingDistribution,
      topMakers,
      categoryDistribution,
      tagDistribution,
      providerDistribution,
      yearDistribution,
    },
  };
}

/** 라이브러리 저장공간 조회 핸들러 */
export async function getLibraryStorageSizeHandler(
  _event: IpcMainInvokeEvent,
): Promise<IpcMainEventMap["libraryStorageSize"]> {
  const libraryPaths = getLibraryPaths();
  const libraries: Array<{ path: string; size: number; gameCount: number }> =
    [];

  // 각 라이브러리 병렬 처리
  const libraryResults = await Promise.all(
    libraryPaths.map(async (libPath) => {
      const [size, gameCountRow] = await Promise.all([
        getFolderSize(libPath),
        db("games").where("source", libPath).count("path as count").first(),
      ]);
      return {
        path: libPath,
        size,
        gameCount: (gameCountRow as any)?.count ?? 0,
      };
    }),
  );
  libraries.push(...libraryResults);

  const totalSize = libraries.reduce((sum, lib) => sum + lib.size, 0);

  return { totalSize, libraries };
}
