import type { Knex } from "knex";
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

/**
 * searchGamesHandler / toggleGameHandler 통합 테스트
 * 실행: pnpm test -- src/main/handlers/home.test.ts
 */

// ========== 모듈 모킹 ==========

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
}));

// toAbsolutePath를 패스스루로 모킹
vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));

// validator 모킹 — validateDirectoryPath는 테스트에서 항상 성공하도록
vi.mock("../utils/validator.js", () => ({
  validatePath: vi.fn(),
  validateDirectoryPath: vi.fn(),
  validateSearchQuery: vi.fn(),
  validateUrl: vi.fn(),
}));

// store 모킹
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

// worker/서비스/유틸 모킹
vi.mock("../workers/run-scan-worker.js", () => ({
  runScanWorker: vi.fn(),
}));
vi.mock("../services/ProcessMonitor.js", () => ({
  processMonitor: { isExeFile: vi.fn(), startSession: vi.fn() },
}));
vi.mock("../lib/fingerprint.js", () => ({
  computeFingerprint: vi.fn(() => "mock-fp"),
}));
vi.mock("../utils/downloader.js", () => ({
  deleteImage: vi.fn(),
}));

// db-manager 모킹: testDb를 동적 참조
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: {
    getKnex: () => dbRef.current!,
  },
}));

// 모킹 후 import (vi.mock 호이스팅)
import { searchGamesHandler, toggleGameHandler } from "./home.js";

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

// ========== 헬퍼 ==========

/** 검색 페이로드 기본값 생성 */
function makeSearchPayload(overrides: Record<string, any> = {}): any {
  const defaults = {
    sourcePaths: ["/library/path"],
    searchQuery: {
      query: "",
      filters: {
        showHidden: false,
        showFavorites: false,
        showCleared: false,
        showNotCleared: false,
        showCompressed: false,
        showNotCompressed: false,
        showWithExternalId: false,
        showWithoutExternalId: false,
      },
      sortBy: "title",
      sortOrder: "asc",
      offset: 0,
      limit: 20,
    },
  };

  // searchQuery 내부 오버라이드 지원
  if (overrides.searchQuery) {
    defaults.searchQuery = {
      ...defaults.searchQuery,
      ...overrides.searchQuery,
      filters: {
        ...defaults.searchQuery.filters,
        ...overrides.searchQuery.filters,
      },
    };
    delete overrides.searchQuery;
  }

  return { ...defaults, ...overrides };
}

// ============================================
// searchGamesHandler — 기본 목록 조회
// ============================================
describe("searchGamesHandler — 기본 목록 조회", () => {
  it("숨김 게임 제외, title asc 정렬로 반환해야 한다", async () => {
    // 일반 게임 2개 + 숨김 게임 1개 시드
    await seedGame(db, {
      path: "/games/beta-game",
      title: "Beta Game",
      source: "/library/path",
      isHidden: false,
    });
    await seedGame(db, {
      path: "/games/alpha-game",
      title: "Alpha Game",
      source: "/library/path",
      isHidden: false,
    });
    await seedGame(db, {
      path: "/games/hidden-game",
      title: "Hidden Game",
      source: "/library/path",
      isHidden: true,
    });

    const result = await searchGamesHandler({} as any, makeSearchPayload());

    // 숨김 게임 제외 → 2개만 반환
    expect(result.totalCount).toBe(2);
    expect(result.games).toHaveLength(2);
    expect(result.hasMore).toBe(false);

    // title asc 정렬: Alpha → Beta
    expect(result.games[0].title).toBe("Alpha Game");
    expect(result.games[1].title).toBe("Beta Game");

    // 숨김 게임이 포함되지 않아야 한다
    const titles = result.games.map((g: any) => g.title);
    expect(titles).not.toContain("Hidden Game");
  });
});

// ============================================
// searchGamesHandler — 텍스트 검색
// ============================================
describe("searchGamesHandler — 텍스트 검색", () => {
  it("title LIKE 매칭으로 게임을 검색해야 한다", async () => {
    await seedGame(db, {
      path: "/games/dragon-quest",
      title: "Dragon Quest",
      source: "/library/path",
    });
    await seedGame(db, {
      path: "/games/final-fantasy",
      title: "Final Fantasy",
      source: "/library/path",
    });
    await seedGame(db, {
      path: "/games/dragon-age",
      title: "Dragon Age",
      source: "/library/path",
    });

    const result = await searchGamesHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: { query: "Dragon" },
      }),
    );

    expect(result.totalCount).toBe(2);
    expect(result.games).toHaveLength(2);

    const titles = result.games.map((g: any) => g.title);
    expect(titles).toContain("Dragon Quest");
    expect(titles).toContain("Dragon Age");
    expect(titles).not.toContain("Final Fantasy");
  });

  it("translatedTitle로도 검색되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/some-game",
      title: "Some Game",
      translatedTitle: "어떤 게임",
      source: "/library/path",
    });
    await seedGame(db, {
      path: "/games/other-game",
      title: "Other Game",
      source: "/library/path",
    });

    const result = await searchGamesHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: { query: "어떤" },
      }),
    );

    expect(result.totalCount).toBe(1);
    expect(result.games[0].path).toBe("/games/some-game");
  });
});

// ============================================
// searchGamesHandler — showHidden 필터
// ============================================
describe("searchGamesHandler — showHidden 필터", () => {
  it("showHidden=true면 isHidden=1인 게임만 반환해야 한다", async () => {
    await seedGame(db, {
      path: "/games/visible",
      title: "Visible",
      source: "/library/path",
      isHidden: false,
    });
    await seedGame(db, {
      path: "/games/hidden",
      title: "Hidden",
      source: "/library/path",
      isHidden: true,
    });

    const result = await searchGamesHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: {
          filters: { showHidden: true },
        },
      }),
    );

    expect(result.totalCount).toBe(1);
    expect(result.games[0].title).toBe("Hidden");
    expect(result.games[0].isHidden).toBe(true);
  });
});

// ============================================
// searchGamesHandler — showFavorites 필터
// ============================================
describe("searchGamesHandler — showFavorites 필터", () => {
  it("showFavorites=true면 isFavorite=1인 게임만 반환해야 한다", async () => {
    // 즐겨찾기 게임
    await seedGame(db, {
      path: "/games/fav-game",
      title: "Favorite Game",
      source: "/library/path",
      fingerprint: "fp-fav",
    });
    await seedUserGameData(db, "/games/fav-game", {
      isFavorite: true,
    });

    // 일반 게임
    await seedGame(db, {
      path: "/games/normal-game",
      title: "Normal Game",
      source: "/library/path",
      fingerprint: "fp-normal",
    });
    await seedUserGameData(db, "/games/normal-game", {
      isFavorite: false,
    });

    const result = await searchGamesHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: {
          filters: { showFavorites: true },
        },
      }),
    );

    expect(result.totalCount).toBe(1);
    expect(result.games[0].title).toBe("Favorite Game");
    expect(result.games[0].isFavorite).toBe(true);
  });
});

// ============================================
// searchGamesHandler — 정렬 (createdAt desc)
// ============================================
describe("searchGamesHandler — 정렬", () => {
  it("createdAt desc 정렬이 올바르게 적용되어야 한다", async () => {
    // 시간 차이를 두고 삽입
    await seedGame(db, {
      path: "/games/old-game",
      title: "Old Game",
      source: "/library/path",
    });

    // createdAt을 직접 갱신하여 시간 차이 보장
    await db("games")
      .where("path", "/games/old-game")
      .update({ createdAt: new Date("2024-01-01T00:00:00.000Z") });

    await seedGame(db, {
      path: "/games/new-game",
      title: "New Game",
      source: "/library/path",
    });
    await db("games")
      .where("path", "/games/new-game")
      .update({ createdAt: new Date("2025-01-01T00:00:00.000Z") });

    const result = await searchGamesHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: {
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      }),
    );

    expect(result.games).toHaveLength(2);
    // desc: 최신이 먼저
    expect(result.games[0].title).toBe("New Game");
    expect(result.games[1].title).toBe("Old Game");
  });
});

// ============================================
// searchGamesHandler — 페이지네이션
// ============================================
describe("searchGamesHandler — 페이지네이션", () => {
  it("offset/limit, hasMore, totalCount가 올바르게 동작해야 한다", async () => {
    // 5개 게임 시드
    for (let i = 1; i <= 5; i++) {
      await seedGame(db, {
        path: `/games/game-${String(i).padStart(2, "0")}`,
        title: `Game ${String(i).padStart(2, "0")}`,
        source: "/library/path",
      });
    }

    // 첫 페이지: limit=2
    const page1 = await searchGamesHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: {
          offset: 0,
          limit: 2,
        },
      }),
    );

    expect(page1.totalCount).toBe(5);
    expect(page1.games).toHaveLength(2);
    expect(page1.hasMore).toBe(true);

    // 두 번째 페이지: offset=2, limit=2
    const page2 = await searchGamesHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: {
          offset: 2,
          limit: 2,
        },
      }),
    );

    expect(page2.totalCount).toBe(5);
    expect(page2.games).toHaveLength(2);
    expect(page2.hasMore).toBe(true);

    // 마지막 페이지: offset=4, limit=2
    const page3 = await searchGamesHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: {
          offset: 4,
          limit: 2,
        },
      }),
    );

    expect(page3.totalCount).toBe(5);
    expect(page3.games).toHaveLength(1);
    expect(page3.hasMore).toBe(false);

    // 페이지 간 게임이 겹치지 않아야 한다
    const allPaths = [
      ...page1.games.map((g: any) => g.path),
      ...page2.games.map((g: any) => g.path),
      ...page3.games.map((g: any) => g.path),
    ];
    const uniquePaths = new Set(allPaths);
    expect(uniquePaths.size).toBe(5);
  });
});

// ============================================
// searchGamesHandler — 고급 검색: tag: 필터
// ============================================
describe("searchGamesHandler — 고급 검색: tag 필터", () => {
  it("tag:RPG로 특정 태그가 있는 게임만 조회해야 한다", async () => {
    // RPG 태그 게임
    await seedGame(db, {
      path: "/games/rpg-game",
      title: "RPG Game",
      source: "/library/path",
    });
    await seedGameTag(db, "/games/rpg-game", "RPG");
    await seedGameTag(db, "/games/rpg-game", "Fantasy");

    // 액션 태그 게임
    await seedGame(db, {
      path: "/games/action-game",
      title: "Action Game",
      source: "/library/path",
    });
    await seedGameTag(db, "/games/action-game", "Action");

    const result = await searchGamesHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: { query: "tag:RPG" },
      }),
    );

    expect(result.totalCount).toBe(1);
    expect(result.games[0].title).toBe("RPG Game");
  });

  it("tag:와 텍스트 검색을 동시에 사용할 수 있어야 한다", async () => {
    await seedGame(db, {
      path: "/games/rpg-dragon",
      title: "Dragon RPG",
      source: "/library/path",
    });
    await seedGameTag(db, "/games/rpg-dragon", "RPG");

    await seedGame(db, {
      path: "/games/rpg-knight",
      title: "Knight RPG",
      source: "/library/path",
    });
    await seedGameTag(db, "/games/rpg-knight", "RPG");

    await seedGame(db, {
      path: "/games/action-dragon",
      title: "Dragon Action",
      source: "/library/path",
    });
    await seedGameTag(db, "/games/action-dragon", "Action");

    // "Dragon tag:RPG" → Dragon이 제목에 포함되고 RPG 태그가 있는 게임만
    const result = await searchGamesHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: { query: "Dragon tag:RPG" },
      }),
    );

    expect(result.totalCount).toBe(1);
    expect(result.games[0].title).toBe("Dragon RPG");
  });
});

// ============================================
// searchGamesHandler — 관계 데이터 포함
// ============================================
describe("searchGamesHandler — 관계 데이터 포함", () => {
  it("makers/categories/tags 배열이 올바르게 반환되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/full-game",
      title: "Full Game",
      source: "/library/path",
    });

    await seedGameMaker(db, "/games/full-game", "Studio A");
    await seedGameMaker(db, "/games/full-game", "Studio B");
    await seedGameCategory(db, "/games/full-game", "RPG");
    await seedGameCategory(db, "/games/full-game", "Adventure");
    await seedGameTag(db, "/games/full-game", "pixel-art");
    await seedGameTag(db, "/games/full-game", "fantasy");
    await seedGameTag(db, "/games/full-game", "indie");

    const result = await searchGamesHandler({} as any, makeSearchPayload());

    expect(result.games).toHaveLength(1);
    const game = result.games[0];

    expect(game.makers).toHaveLength(2);
    expect(game.makers).toContain("Studio A");
    expect(game.makers).toContain("Studio B");

    expect(game.categories).toHaveLength(2);
    expect(game.categories).toContain("RPG");
    expect(game.categories).toContain("Adventure");

    expect(game.tags).toHaveLength(3);
    expect(game.tags).toContain("pixel-art");
    expect(game.tags).toContain("fantasy");
    expect(game.tags).toContain("indie");
  });

  it("관계 데이터가 없으면 빈 배열이어야 한다", async () => {
    await seedGame(db, {
      path: "/games/no-relations",
      title: "No Relations",
      source: "/library/path",
    });

    const result = await searchGamesHandler({} as any, makeSearchPayload());

    expect(result.games).toHaveLength(1);
    const game = result.games[0];
    expect(game.makers).toEqual([]);
    expect(game.categories).toEqual([]);
    expect(game.tags).toEqual([]);
  });
});

// ============================================
// toggleGameHandler — isHidden 토글
// ============================================
describe("toggleGameHandler — isHidden 토글", () => {
  it("games.isHidden 0→1→0 토글이 동작해야 한다", async () => {
    await seedGame(db, {
      path: "/games/toggle-hidden",
      title: "Toggle Hidden",
      source: "/library/path",
      isHidden: false,
    });

    // 0 → 1
    const result1 = await toggleGameHandler(
      {} as any,
      { path: "/games/toggle-hidden" },
      "is_hidden",
    );
    expect(result1.value).toBe(true);
    expect(result1.path).toBe("/games/toggle-hidden");
    expect(result1.field).toBe("is_hidden");

    // DB 확인
    const game1 = await db("games")
      .where("path", "/games/toggle-hidden")
      .first();
    expect(game1!.isHidden).toBe(1);

    // 1 → 0
    const result2 = await toggleGameHandler(
      {} as any,
      { path: "/games/toggle-hidden" },
      "is_hidden",
    );
    expect(result2.value).toBe(false);

    // DB 확인
    const game2 = await db("games")
      .where("path", "/games/toggle-hidden")
      .first();
    expect(game2!.isHidden).toBe(0);
  });
});

// ============================================
// toggleGameHandler — isFavorite 토글
// ============================================
describe("toggleGameHandler — isFavorite 토글", () => {
  it("userGameData 자동 생성 + isFavorite 설정이 동작해야 한다", async () => {
    // fingerprint 필수 — getOrCreateUserGameData가 fingerprint로 조회
    await seedGame(db, {
      path: "/games/toggle-fav",
      title: "Toggle Fav",
      source: "/library/path",
      fingerprint: "fp-toggle-fav",
    });

    // userGameData가 없는 상태에서 토글 → 자동 생성
    const result1 = await toggleGameHandler(
      {} as any,
      { path: "/games/toggle-fav" },
      "is_favorite",
    );
    expect(result1.value).toBe(true);
    expect(result1.field).toBe("is_favorite");

    // userGameData가 생성되었는지 확인
    const userData1 = await db("userGameData")
      .where("fingerprint", "fp-toggle-fav")
      .first();
    expect(userData1).toBeDefined();
    expect(userData1.isFavorite).toBe(1);

    // true → false 토글
    const result2 = await toggleGameHandler(
      {} as any,
      { path: "/games/toggle-fav" },
      "is_favorite",
    );
    expect(result2.value).toBe(false);

    const userData2 = await db("userGameData")
      .where("fingerprint", "fp-toggle-fav")
      .first();
    expect(userData2.isFavorite).toBe(0);
  });
});

// ============================================
// toggleGameHandler — isClear 토글
// ============================================
describe("toggleGameHandler — isClear 토글", () => {
  it("userGameData 자동 생성 + isClear 설정이 동작해야 한다", async () => {
    await seedGame(db, {
      path: "/games/toggle-clear",
      title: "Toggle Clear",
      source: "/library/path",
      fingerprint: "fp-toggle-clear",
    });

    // 토글 → 자동 생성 + isClear = true
    const result1 = await toggleGameHandler(
      {} as any,
      { path: "/games/toggle-clear" },
      "is_clear",
    );
    expect(result1.value).toBe(true);
    expect(result1.field).toBe("is_clear");

    const userData1 = await db("userGameData")
      .where("fingerprint", "fp-toggle-clear")
      .first();
    expect(userData1).toBeDefined();
    expect(userData1.isClear).toBe(1);

    // true → false 토글
    const result2 = await toggleGameHandler(
      {} as any,
      { path: "/games/toggle-clear" },
      "is_clear",
    );
    expect(result2.value).toBe(false);

    const userData2 = await db("userGameData")
      .where("fingerprint", "fp-toggle-clear")
      .first();
    expect(userData2.isClear).toBe(0);
  });
});

// ============================================
// toggleGameHandler — 존재하지 않는 게임
// ============================================
describe("toggleGameHandler — 존재하지 않는 게임", () => {
  it("존재하지 않는 게임 경로로 토글하면 에러가 발생해야 한다", async () => {
    await expect(
      toggleGameHandler({} as any, { path: "/games/nonexistent" }, "is_hidden"),
    ).rejects.toThrow("게임을 찾을 수 없습니다.");
  });

  it("존재하지 않는 게임 경로로 isFavorite 토글해도 에러가 발생해야 한다", async () => {
    await expect(
      toggleGameHandler(
        {} as any,
        { path: "/games/nonexistent" },
        "is_favorite",
      ),
    ).rejects.toThrow("게임을 찾을 수 없습니다.");
  });
});
