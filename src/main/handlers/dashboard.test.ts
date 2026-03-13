import type { Knex } from "knex";
import type { IpcMainInvokeEvent } from "electron";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createTestDb,
  truncateAll,
  seedGame,
  seedUserGameData,
  seedGameMaker,
  seedGameCategory,
  seedGameTag,
} from "../db/test-utils.js";

// ========== 모킹 ==========

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
}));

vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));

vi.mock("../utils/validator.js", () => ({
  validatePath: vi.fn(),
  validateDirectoryPath: vi.fn(),
  validateSearchQuery: vi.fn(),
  validateUrl: vi.fn(),
}));

vi.mock("../store.js", () => ({
  getTranslationSettings: () => ({
    titleDisplayPriority: ["translated", "collected", "original"],
  }),
  getExcludedExecutables: () => [],
  getLibraryPaths: () => [],
  getScanDepth: () => 5,
  DEFAULT_TITLE_DISPLAY_PRIORITY: ["translated", "collected", "original"],
  addExcludedExecutable: vi.fn(),
  removeExcludedExecutable: vi.fn(),
  addLibraryPath: vi.fn(),
  removeLibraryPath: vi.fn(),
  removeLibraryScanHistory: vi.fn(),
  updateLibraryScanHistory: vi.fn(),
  getLastRefreshedAt: vi.fn(),
  setLastRefreshedAt: vi.fn(),
  getAllLibraryScanHistory: vi.fn(),
  getLibraryScanHistory: vi.fn(),
}));

vi.mock("../workers/run-scan-worker.js", () => ({ runScanWorker: vi.fn() }));
vi.mock("../services/ProcessMonitor.js", () => ({
  processMonitor: { isExeFile: vi.fn(), startSession: vi.fn() },
}));
vi.mock("../lib/fingerprint.js", () => ({
  computeFingerprint: vi.fn(() => "mock-fp"),
}));
vi.mock("../utils/downloader.js", () => ({ deleteImage: vi.fn() }));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: { getKnex: () => dbRef.current! },
}));

// 모킹 후 import
import { getDashboardStatsHandler } from "./dashboard.js";

// ========== 헬퍼 ==========

/** play_sessions 시드 헬퍼 */
async function seedPlaySession(
  db: Knex,
  userGameDataId: number,
  overrides: Record<string, any> = {},
) {
  const defaults = {
    userGameDataId,
    startedAt: new Date().toISOString(),
    endedAt: new Date().toISOString(),
    durationSeconds: 3600,
  };
  const data = { ...defaults, ...overrides };
  const [id] = await db("playSessions").insert(data);
  return db("playSessions").where("id", id).first();
}

/** 가짜 IpcMainInvokeEvent 생성 */
const fakeEvent = {} as IpcMainInvokeEvent;

// ========== 셋업 ==========

let db: Knex;

beforeAll(async () => {
  db = await createTestDb();
  dbRef.current = db;
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(async () => {
  await truncateAll(db);
});

// ========== 테스트 ==========

describe("getDashboardStatsHandler", () => {
  it("데이터가 없을 때 기본값을 반환해야 한다", async () => {
    const result = await getDashboardStatsHandler(fakeEvent);

    expect(result.stats.overview).toEqual({
      totalGames: 0,
      favoriteCount: 0,
      clearedCount: 0,
      clearedRate: 0,
      totalPlayTime: 0,
      averageRating: null,
      thisWeekPlayTime: 0,
      thisMonthPlayTime: 0,
    });
    expect(result.stats.topPlayedGames).toEqual([]);
    expect(result.stats.longestSession).toBeNull();
    expect(result.stats.mostNeglectedGames).toEqual([]);
    expect(result.stats.monthlyPlayTime).toEqual([]);
    expect(result.stats.hourlyPattern).toEqual([]);
    expect(result.stats.weekdayPattern).toEqual([]);
    expect(result.stats.ratingDistribution).toEqual([]);
    expect(result.stats.topMakers).toEqual([]);
    expect(result.stats.categoryDistribution).toEqual([]);
    expect(result.stats.tagDistribution).toEqual([]);
    expect(result.stats.providerDistribution).toEqual([]);
    expect(result.stats.yearDistribution).toEqual([]);
  });

  // ============================================
  // overview - 라이브러리 개요
  // ============================================
  describe("overview", () => {
    it("totalGames - 숨김 게임을 제외한 총 게임 수를 반환해야 한다", async () => {
      await seedGame(db, { path: "/game1", fingerprint: "fp1" });
      await seedGame(db, { path: "/game2", fingerprint: "fp2" });
      await seedGame(db, {
        path: "/game3",
        fingerprint: "fp3",
        isHidden: true,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.overview.totalGames).toBe(2);
    });

    it("favoriteCount - 즐겨찾기 게임 수를 반환해야 한다", async () => {
      const game1 = await seedGame(db, { path: "/game1", fingerprint: "fp1" });
      const game2 = await seedGame(db, { path: "/game2", fingerprint: "fp2" });
      await seedGame(db, { path: "/game3", fingerprint: "fp3" });

      await seedUserGameData(db, game1.path, { isFavorite: true });
      await seedUserGameData(db, game2.path, { isFavorite: true });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.overview.favoriteCount).toBe(2);
    });

    it("clearedCount 및 clearedRate를 반환해야 한다", async () => {
      const game1 = await seedGame(db, { path: "/game1", fingerprint: "fp1" });
      const game2 = await seedGame(db, { path: "/game2", fingerprint: "fp2" });
      await seedGame(db, { path: "/game3", fingerprint: "fp3" });
      await seedGame(db, { path: "/game4", fingerprint: "fp4" });

      await seedUserGameData(db, game1.path, { isClear: true });
      await seedUserGameData(db, game2.path, { isClear: true });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.overview.clearedCount).toBe(2);
      // 4개 게임 중 2개 클리어 = 50%
      expect(result.stats.overview.clearedRate).toBe(50);
    });

    it("totalPlayTime - 전체 플레이 시간 합계를 반환해야 한다", async () => {
      const game1 = await seedGame(db, { path: "/game1", fingerprint: "fp1" });
      const game2 = await seedGame(db, { path: "/game2", fingerprint: "fp2" });

      await seedUserGameData(db, game1.path, { totalPlayTime: 3600 });
      await seedUserGameData(db, game2.path, { totalPlayTime: 7200 });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.overview.totalPlayTime).toBe(10800);
    });

    it("averageRating - 평균 별점을 반환해야 한다", async () => {
      const game1 = await seedGame(db, { path: "/game1", fingerprint: "fp1" });
      const game2 = await seedGame(db, { path: "/game2", fingerprint: "fp2" });
      const _game3 = await seedGame(db, { path: "/game3", fingerprint: "fp3" });

      await seedUserGameData(db, game1.path, { rating: 4 });
      await seedUserGameData(db, game2.path, { rating: 5 });
      // game3에는 rating 없음 — 평균에 포함되지 않아야 한다

      const result = await getDashboardStatsHandler(fakeEvent);

      // (4 + 5) / 2 = 4.5
      expect(result.stats.overview.averageRating).toBe(4.5);
    });

    it("averageRating - 별점이 없으면 null을 반환해야 한다", async () => {
      await seedGame(db, { path: "/game1", fingerprint: "fp1" });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.overview.averageRating).toBeNull();
    });

    it("thisWeekPlayTime - 이번 주 플레이 시간을 반환해야 한다", async () => {
      const game = await seedGame(db, { path: "/game1", fingerprint: "fp1" });
      const ugd = await seedUserGameData(db, game.path, {
        totalPlayTime: 5000,
      });

      // 오늘 날짜의 세션 → 이번 주에 포함
      const now = new Date();
      await seedPlaySession(db, ugd.id, {
        startedAt: now.toISOString(),
        durationSeconds: 1800,
      });

      // 2주 전 세션 → 이번 주에 포함되지 않음
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      await seedPlaySession(db, ugd.id, {
        startedAt: twoWeeksAgo.toISOString(),
        durationSeconds: 9999,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.overview.thisWeekPlayTime).toBe(1800);
    });

    it("thisMonthPlayTime - 이번 달 플레이 시간을 반환해야 한다", async () => {
      const game = await seedGame(db, { path: "/game1", fingerprint: "fp1" });
      const ugd = await seedUserGameData(db, game.path, {
        totalPlayTime: 5000,
      });

      // 이번 달 세션
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 2);
      await seedPlaySession(db, ugd.id, {
        startedAt: thisMonth.toISOString(),
        durationSeconds: 2400,
      });

      // 3개월 전 세션
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      await seedPlaySession(db, ugd.id, {
        startedAt: threeMonthsAgo.toISOString(),
        durationSeconds: 8888,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.overview.thisMonthPlayTime).toBe(2400);
    });
  });

  // ============================================
  // topPlayedGames - TOP 10 플레이 게임
  // ============================================
  describe("topPlayedGames", () => {
    it("플레이 시간이 있는 게임만 내림차순으로 반환해야 한다", async () => {
      const game1 = await seedGame(db, {
        path: "/game1",
        title: "Game A",
        fingerprint: "fp1",
      });
      const game2 = await seedGame(db, {
        path: "/game2",
        title: "Game B",
        fingerprint: "fp2",
      });
      const game3 = await seedGame(db, {
        path: "/game3",
        title: "Game C",
        fingerprint: "fp3",
      });

      await seedUserGameData(db, game1.path, { totalPlayTime: 100 });
      await seedUserGameData(db, game2.path, { totalPlayTime: 500 });
      await seedUserGameData(db, game3.path, { totalPlayTime: 0 }); // 0인 게임은 제외

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.topPlayedGames).toHaveLength(2);
      expect(result.stats.topPlayedGames[0].title).toBe("Game B");
      expect(result.stats.topPlayedGames[0].totalPlayTime).toBe(500);
      expect(result.stats.topPlayedGames[1].title).toBe("Game A");
      expect(result.stats.topPlayedGames[1].totalPlayTime).toBe(100);
    });

    it("최대 10개까지만 반환해야 한다", async () => {
      // 12개 게임 시드
      for (let i = 1; i <= 12; i++) {
        const game = await seedGame(db, {
          path: `/game${i}`,
          title: `Game ${i}`,
          fingerprint: `fp${i}`,
        });
        await seedUserGameData(db, game.path, { totalPlayTime: i * 100 });
      }

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.topPlayedGames).toHaveLength(10);
      // 가장 많이 플레이한 게임이 첫 번째
      expect(result.stats.topPlayedGames[0].totalPlayTime).toBe(1200);
    });

    it("숨김 게임은 제외해야 한다", async () => {
      const game1 = await seedGame(db, {
        path: "/game1",
        title: "Visible",
        fingerprint: "fp1",
      });
      const game2 = await seedGame(db, {
        path: "/game2",
        title: "Hidden",
        fingerprint: "fp2",
        isHidden: true,
      });

      await seedUserGameData(db, game1.path, { totalPlayTime: 100 });
      await seedUserGameData(db, game2.path, { totalPlayTime: 200 });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.topPlayedGames).toHaveLength(1);
      expect(result.stats.topPlayedGames[0].title).toBe("Visible");
    });
  });

  // ============================================
  // longestSession - 최장 단일 세션
  // ============================================
  describe("longestSession", () => {
    it("데이터가 없으면 null을 반환해야 한다", async () => {
      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.longestSession).toBeNull();
    });

    it("최장 세션 정보를 반환해야 한다", async () => {
      const game = await seedGame(db, {
        path: "/game1",
        title: "Long Session Game",
        fingerprint: "fp1",
      });
      const ugd = await seedUserGameData(db, game.path);

      const sessionDate = "2025-06-15T10:00:00.000Z";
      await seedPlaySession(db, ugd.id, {
        startedAt: sessionDate,
        durationSeconds: 1000,
      });
      await seedPlaySession(db, ugd.id, {
        startedAt: "2025-06-16T10:00:00.000Z",
        durationSeconds: 5000,
      });
      await seedPlaySession(db, ugd.id, {
        startedAt: "2025-06-17T10:00:00.000Z",
        durationSeconds: 3000,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.longestSession).not.toBeNull();
      expect(result.stats.longestSession!.durationSeconds).toBe(5000);
      expect(result.stats.longestSession!.gameTitle).toBe("Long Session Game");
      expect(result.stats.longestSession!.startedAt).toBe(
        "2025-06-16T10:00:00.000Z",
      );
    });

    it("여러 게임의 세션 중 최장 세션을 찾아야 한다", async () => {
      const game1 = await seedGame(db, {
        path: "/game1",
        title: "Game A",
        fingerprint: "fp1",
      });
      const game2 = await seedGame(db, {
        path: "/game2",
        title: "Game B",
        fingerprint: "fp2",
      });

      const ugd1 = await seedUserGameData(db, game1.path);
      const ugd2 = await seedUserGameData(db, game2.path);

      await seedPlaySession(db, ugd1.id, { durationSeconds: 2000 });
      await seedPlaySession(db, ugd2.id, { durationSeconds: 8000 });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.longestSession!.durationSeconds).toBe(8000);
      expect(result.stats.longestSession!.gameTitle).toBe("Game B");
    });
  });

  // ============================================
  // mostNeglectedGames - 가장 오래 방치된 게임 TOP 5
  // ============================================
  describe("mostNeglectedGames", () => {
    it("플레이타임이 없는 게임을 createdAt 오름차순으로 반환해야 한다", async () => {
      // 플레이타임이 있는 게임
      const playedGame = await seedGame(db, {
        path: "/played",
        title: "Played",
        fingerprint: "fpPlayed",
      });
      await seedUserGameData(db, playedGame.path, { totalPlayTime: 100 });

      // 플레이타임이 없는 게임 (user_game_data 없음)
      await seedGame(db, {
        path: "/neglected1",
        title: "Neglected 1",
        fingerprint: "fpN1",
      });
      await seedGame(db, {
        path: "/neglected2",
        title: "Neglected 2",
        fingerprint: "fpN2",
      });

      // 플레이타임이 0인 게임
      const zeroGame = await seedGame(db, {
        path: "/zero",
        title: "Zero Play",
        fingerprint: "fpZero",
      });
      await seedUserGameData(db, zeroGame.path, { totalPlayTime: 0 });

      const result = await getDashboardStatsHandler(fakeEvent);

      // 플레이타임이 없거나 0인 게임 3개
      expect(result.stats.mostNeglectedGames).toHaveLength(3);
      // 플레이타임이 있는 게임은 포함되지 않아야 한다
      const titles = result.stats.mostNeglectedGames.map((g: any) => g.title);
      expect(titles).not.toContain("Played");
    });

    it("최대 5개까지만 반환해야 한다", async () => {
      for (let i = 1; i <= 7; i++) {
        await seedGame(db, {
          path: `/neglected${i}`,
          title: `Neglected ${i}`,
          fingerprint: `fpN${i}`,
        });
      }

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.mostNeglectedGames).toHaveLength(5);
    });

    it("숨김 게임은 제외해야 한다", async () => {
      await seedGame(db, {
        path: "/visible",
        title: "Visible",
        fingerprint: "fpV",
      });
      await seedGame(db, {
        path: "/hidden",
        title: "Hidden",
        fingerprint: "fpH",
        isHidden: true,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.mostNeglectedGames).toHaveLength(1);
      expect(result.stats.mostNeglectedGames[0].title).toBe("Visible");
    });
  });

  // ============================================
  // ratingDistribution - 별점 분포
  // ============================================
  describe("ratingDistribution", () => {
    it("별점별 게임 수를 반환해야 한다", async () => {
      const game1 = await seedGame(db, { path: "/g1", fingerprint: "fp1" });
      const game2 = await seedGame(db, { path: "/g2", fingerprint: "fp2" });
      const game3 = await seedGame(db, { path: "/g3", fingerprint: "fp3" });
      const game4 = await seedGame(db, { path: "/g4", fingerprint: "fp4" });

      await seedUserGameData(db, game1.path, { rating: 5 });
      await seedUserGameData(db, game2.path, { rating: 5 });
      await seedUserGameData(db, game3.path, { rating: 3 });
      await seedUserGameData(db, game4.path, { rating: null }); // null은 제외

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.ratingDistribution).toHaveLength(2);

      const rating5 = result.stats.ratingDistribution.find(
        (r: any) => r.rating === 5,
      );
      const rating3 = result.stats.ratingDistribution.find(
        (r: any) => r.rating === 3,
      );

      expect(rating5!.count).toBe(2);
      expect(rating3!.count).toBe(1);
    });
  });

  // ============================================
  // topMakers - 제작사 TOP 10
  // ============================================
  describe("topMakers", () => {
    it("게임 수 내림차순으로 제작사를 반환해야 한다", async () => {
      const game1 = await seedGame(db, { path: "/g1", fingerprint: "fp1" });
      const game2 = await seedGame(db, { path: "/g2", fingerprint: "fp2" });
      const game3 = await seedGame(db, { path: "/g3", fingerprint: "fp3" });

      await seedGameMaker(db, game1.path, "Popular Maker");
      await seedGameMaker(db, game2.path, "Popular Maker");
      await seedGameMaker(db, game3.path, "Popular Maker");

      await seedGameMaker(db, game1.path, "Less Maker");

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.topMakers).toHaveLength(2);
      expect(result.stats.topMakers[0].name).toBe("Popular Maker");
      expect(result.stats.topMakers[0].count).toBe(3);
      expect(result.stats.topMakers[1].name).toBe("Less Maker");
      expect(result.stats.topMakers[1].count).toBe(1);
    });

    it("숨김 게임의 제작사는 제외해야 한다", async () => {
      const visible = await seedGame(db, {
        path: "/visible",
        fingerprint: "fpV",
      });
      const hidden = await seedGame(db, {
        path: "/hidden",
        fingerprint: "fpH",
        isHidden: true,
      });

      await seedGameMaker(db, visible.path, "Visible Maker");
      await seedGameMaker(db, hidden.path, "Hidden Maker");

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.topMakers).toHaveLength(1);
      expect(result.stats.topMakers[0].name).toBe("Visible Maker");
    });

    it("최대 10개까지만 반환해야 한다", async () => {
      // 12개의 서로 다른 제작사
      for (let i = 1; i <= 12; i++) {
        const game = await seedGame(db, {
          path: `/g${i}`,
          fingerprint: `fp${i}`,
        });
        await seedGameMaker(db, game.path, `Maker ${i}`);
      }

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.topMakers).toHaveLength(10);
    });
  });

  // ============================================
  // categoryDistribution - 카테고리별 분포
  // ============================================
  describe("categoryDistribution", () => {
    it("카테고리별 게임 수를 반환해야 한다", async () => {
      const game1 = await seedGame(db, { path: "/g1", fingerprint: "fp1" });
      const game2 = await seedGame(db, { path: "/g2", fingerprint: "fp2" });

      await seedGameCategory(db, game1.path, "RPG");
      await seedGameCategory(db, game2.path, "RPG");
      await seedGameCategory(db, game1.path, "Adventure");

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.categoryDistribution).toHaveLength(2);
      const rpg = result.stats.categoryDistribution.find(
        (c: any) => c.name === "RPG",
      );
      const adventure = result.stats.categoryDistribution.find(
        (c: any) => c.name === "Adventure",
      );

      expect(rpg!.count).toBe(2);
      expect(adventure!.count).toBe(1);
    });

    it("숨김 게임의 카테고리는 제외해야 한다", async () => {
      const visible = await seedGame(db, {
        path: "/visible",
        fingerprint: "fpV",
      });
      const hidden = await seedGame(db, {
        path: "/hidden",
        fingerprint: "fpH",
        isHidden: true,
      });

      await seedGameCategory(db, visible.path, "RPG");
      await seedGameCategory(db, hidden.path, "Action");

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.categoryDistribution).toHaveLength(1);
      expect(result.stats.categoryDistribution[0].name).toBe("RPG");
    });
  });

  // ============================================
  // tagDistribution - 태그별 분포
  // ============================================
  describe("tagDistribution", () => {
    it("태그별 게임 수를 반환해야 한다", async () => {
      const game1 = await seedGame(db, { path: "/g1", fingerprint: "fp1" });
      const game2 = await seedGame(db, { path: "/g2", fingerprint: "fp2" });

      await seedGameTag(db, game1.path, "pixel-art");
      await seedGameTag(db, game2.path, "pixel-art");
      await seedGameTag(db, game1.path, "fantasy");

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.tagDistribution).toHaveLength(2);
      const pixelArt = result.stats.tagDistribution.find(
        (t: any) => t.name === "pixel-art",
      );
      const fantasy = result.stats.tagDistribution.find(
        (t: any) => t.name === "fantasy",
      );

      expect(pixelArt!.count).toBe(2);
      expect(fantasy!.count).toBe(1);
    });

    it("숨김 게임의 태그는 제외해야 한다", async () => {
      const visible = await seedGame(db, {
        path: "/visible",
        fingerprint: "fpV",
      });
      const hidden = await seedGame(db, {
        path: "/hidden",
        fingerprint: "fpH",
        isHidden: true,
      });

      await seedGameTag(db, visible.path, "good-tag");
      await seedGameTag(db, hidden.path, "hidden-tag");

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.tagDistribution).toHaveLength(1);
      expect(result.stats.tagDistribution[0].name).toBe("good-tag");
    });
  });

  // ============================================
  // providerDistribution - 제공자별 분포
  // ============================================
  describe("providerDistribution", () => {
    it("제공자별 게임 수를 반환해야 한다", async () => {
      await seedGame(db, {
        path: "/g1",
        fingerprint: "fp1",
        provider: "dlsite",
      });
      await seedGame(db, {
        path: "/g2",
        fingerprint: "fp2",
        provider: "dlsite",
      });
      await seedGame(db, {
        path: "/g3",
        fingerprint: "fp3",
        provider: "steam",
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.providerDistribution).toHaveLength(2);
      const dlsite = result.stats.providerDistribution.find(
        (p: any) => p.provider === "dlsite",
      );
      const steam = result.stats.providerDistribution.find(
        (p: any) => p.provider === "steam",
      );

      expect(dlsite!.count).toBe(2);
      expect(steam!.count).toBe(1);
    });

    it("provider가 null이면 'unknown'으로 분류해야 한다", async () => {
      await seedGame(db, {
        path: "/g1",
        fingerprint: "fp1",
        provider: null,
      });
      await seedGame(db, {
        path: "/g2",
        fingerprint: "fp2",
        provider: "dlsite",
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      const unknown = result.stats.providerDistribution.find(
        (p: any) => p.provider === "unknown",
      );
      expect(unknown).toBeDefined();
      expect(unknown!.count).toBe(1);
    });

    it("숨김 게임은 제외해야 한다", async () => {
      await seedGame(db, {
        path: "/visible",
        fingerprint: "fpV",
        provider: "dlsite",
      });
      await seedGame(db, {
        path: "/hidden",
        fingerprint: "fpH",
        provider: "dlsite",
        isHidden: true,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      const dlsite = result.stats.providerDistribution.find(
        (p: any) => p.provider === "dlsite",
      );
      expect(dlsite!.count).toBe(1);
    });
  });

  // ============================================
  // yearDistribution - 발매연도별 분포
  // ============================================
  describe("yearDistribution", () => {
    it("발매연도별 게임 수를 반환해야 한다", async () => {
      // publishDate는 밀리초 단위 Unix timestamp
      const year2023 = new Date("2023-06-15").getTime();
      const year2024 = new Date("2024-03-20").getTime();

      await seedGame(db, {
        path: "/g1",
        fingerprint: "fp1",
        publishDate: year2023,
      });
      await seedGame(db, {
        path: "/g2",
        fingerprint: "fp2",
        publishDate: year2023,
      });
      await seedGame(db, {
        path: "/g3",
        fingerprint: "fp3",
        publishDate: year2024,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.yearDistribution).toHaveLength(2);
      const y2023 = result.stats.yearDistribution.find(
        (y: any) => y.year === 2023,
      );
      const y2024 = result.stats.yearDistribution.find(
        (y: any) => y.year === 2024,
      );

      expect(y2023!.count).toBe(2);
      expect(y2024!.count).toBe(1);
    });

    it("publishDate가 null인 게임은 제외해야 한다", async () => {
      await seedGame(db, {
        path: "/g1",
        fingerprint: "fp1",
        publishDate: null,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.yearDistribution).toHaveLength(0);
    });

    it("숨김 게임은 제외해야 한다", async () => {
      const year2023 = new Date("2023-06-15").getTime();

      await seedGame(db, {
        path: "/visible",
        fingerprint: "fpV",
        publishDate: year2023,
      });
      await seedGame(db, {
        path: "/hidden",
        fingerprint: "fpH",
        publishDate: year2023,
        isHidden: true,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      const y2023 = result.stats.yearDistribution.find(
        (y: any) => y.year === 2023,
      );
      expect(y2023!.count).toBe(1);
    });
  });

  // ============================================
  // monthlyPlayTime - 월별 플레이 추이
  // ============================================
  describe("monthlyPlayTime", () => {
    it("월별 플레이 시간과 세션 수를 반환해야 한다", async () => {
      const game = await seedGame(db, { path: "/g1", fingerprint: "fp1" });
      const ugd = await seedUserGameData(db, game.path);

      // 최근 달에 세션 생성
      const now = new Date();
      const thisMonth = new Date(now.getFullYear(), now.getMonth(), 5);
      const expectedMonth = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, "0")}`;

      await seedPlaySession(db, ugd.id, {
        startedAt: thisMonth.toISOString(),
        durationSeconds: 1000,
      });
      await seedPlaySession(db, ugd.id, {
        startedAt: thisMonth.toISOString(),
        durationSeconds: 2000,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.monthlyPlayTime.length).toBeGreaterThanOrEqual(1);
      const thisMonthData = result.stats.monthlyPlayTime.find(
        (m: any) => m.month === expectedMonth,
      );
      expect(thisMonthData).toBeDefined();
      expect(thisMonthData!.totalSeconds).toBe(3000);
      expect(thisMonthData!.sessionCount).toBe(2);
    });
  });

  // ============================================
  // hourlyPattern - 시간대별 플레이 패턴
  // ============================================
  describe("hourlyPattern", () => {
    it("시간대별 통계를 반환해야 한다", async () => {
      const game = await seedGame(db, { path: "/g1", fingerprint: "fp1" });
      const ugd = await seedUserGameData(db, game.path);

      // 14시에 세션 생성 (UTC 기준)
      await seedPlaySession(db, ugd.id, {
        startedAt: "2025-06-15T14:30:00.000Z",
        durationSeconds: 1500,
      });
      await seedPlaySession(db, ugd.id, {
        startedAt: "2025-06-16T14:00:00.000Z",
        durationSeconds: 2500,
      });

      // 20시에 세션
      await seedPlaySession(db, ugd.id, {
        startedAt: "2025-06-15T20:00:00.000Z",
        durationSeconds: 500,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.hourlyPattern.length).toBeGreaterThanOrEqual(2);

      const hour14 = result.stats.hourlyPattern.find((h: any) => h.hour === 14);
      expect(hour14).toBeDefined();
      expect(hour14!.totalSeconds).toBe(4000);
      expect(hour14!.sessionCount).toBe(2);

      const hour20 = result.stats.hourlyPattern.find((h: any) => h.hour === 20);
      expect(hour20).toBeDefined();
      expect(hour20!.totalSeconds).toBe(500);
      expect(hour20!.sessionCount).toBe(1);
    });
  });

  // ============================================
  // weekdayPattern - 요일별 플레이 패턴
  // ============================================
  describe("weekdayPattern", () => {
    it("요일별 통계를 반환해야 한다", async () => {
      const game = await seedGame(db, { path: "/g1", fingerprint: "fp1" });
      const ugd = await seedUserGameData(db, game.path);

      // 2025-06-15 = 일요일 (weekday=0)
      await seedPlaySession(db, ugd.id, {
        startedAt: "2025-06-15T10:00:00.000Z",
        durationSeconds: 1000,
      });

      // 2025-06-16 = 월요일 (weekday=1)
      await seedPlaySession(db, ugd.id, {
        startedAt: "2025-06-16T10:00:00.000Z",
        durationSeconds: 2000,
      });

      const result = await getDashboardStatsHandler(fakeEvent);

      expect(result.stats.weekdayPattern.length).toBeGreaterThanOrEqual(2);

      const sunday = result.stats.weekdayPattern.find(
        (w: any) => w.weekday === 0,
      );
      expect(sunday).toBeDefined();
      expect(sunday!.totalSeconds).toBe(1000);

      const monday = result.stats.weekdayPattern.find(
        (w: any) => w.weekday === 1,
      );
      expect(monday).toBeDefined();
      expect(monday!.totalSeconds).toBe(2000);
    });
  });
});
