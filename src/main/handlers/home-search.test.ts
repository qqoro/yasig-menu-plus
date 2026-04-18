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
 * parseSearchQuery / getAutocompleteSuggestionsHandler / getRandomGameHandler 테스트
 * 실행: pnpm test -- src/main/handlers/home-search.test.ts
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

// validator 모킹
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
  getOfflineLibraryPaths: () => [],
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

// fs/promises 모킹 — 프로덕션 코드가 fs/promises를 사용
vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    access: vi.fn(() => Promise.resolve()),
  };
});

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
import {
  parseSearchQuery,
  getAutocompleteSuggestionsHandler,
  getRandomGameHandler,
} from "./home-search.js";

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

/** 랜덤 게임 / 검색 페이로드 기본값 생성 */
function makeSearchPayload(overrides: Record<string, any> = {}): any {
  const defaults = {
    sourcePaths: ["/library/path"],
    searchQuery: {
      query: "",
      filters: {
        showHidden: false,
        showFavorites: false,
        showNotFavorites: false,
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
// parseSearchQuery — 순수 함수 단위 테스트
// ============================================
describe("parseSearchQuery", () => {
  it("일반 텍스트만 있으면 textQuery로 파싱해야 한다", () => {
    const result = parseSearchQuery("Dragon Quest");
    expect(result.textQuery).toBe("Dragon Quest");
    expect(result.tags).toEqual([]);
    expect(result.circles).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.provider).toBeUndefined();
    expect(result.externalId).toBeUndefined();
  });

  it("tag:value를 파싱해야 한다", () => {
    const result = parseSearchQuery("tag:RPG");
    expect(result.tags).toEqual(["RPG"]);
    expect(result.textQuery).toBeUndefined();
  });

  it("circle:value를 파싱해야 한다", () => {
    const result = parseSearchQuery("circle:StudioA");
    expect(result.circles).toEqual(["StudioA"]);
    expect(result.textQuery).toBeUndefined();
  });

  it("category:value를 파싱해야 한다", () => {
    const result = parseSearchQuery("category:Adventure");
    expect(result.categories).toEqual(["Adventure"]);
    expect(result.textQuery).toBeUndefined();
  });

  it("provider:value를 파싱해야 한다", () => {
    const result = parseSearchQuery("provider:dlsite");
    expect(result.provider).toBe("dlsite");
    expect(result.textQuery).toBeUndefined();
  });

  it("id:value를 파싱해야 한다", () => {
    const result = parseSearchQuery("id:RJ123456");
    expect(result.externalId).toBe("RJ123456");
    expect(result.textQuery).toBeUndefined();
  });

  it("한글 prefix 태그:를 파싱해야 한다", () => {
    const result = parseSearchQuery("태그:판타지");
    expect(result.tags).toEqual(["판타지"]);
    expect(result.textQuery).toBeUndefined();
  });

  it("한글 prefix 서클:를 파싱해야 한다", () => {
    const result = parseSearchQuery("서클:스튜디오A");
    expect(result.circles).toEqual(["스튜디오A"]);
  });

  it("한글 prefix 카테고리:를 파싱해야 한다", () => {
    const result = parseSearchQuery("카테고리:RPG");
    expect(result.categories).toEqual(["RPG"]);
  });

  it("한글 prefix 제공자:를 파싱해야 한다", () => {
    const result = parseSearchQuery("제공자:steam");
    expect(result.provider).toBe("steam");
  });

  it("한글 prefix 아이디:를 파싱해야 한다", () => {
    const result = parseSearchQuery("아이디:RJ999999");
    expect(result.externalId).toBe("RJ999999");
  });

  it("텍스트 + prefix 복합 검색을 파싱해야 한다", () => {
    const result = parseSearchQuery("Dragon tag:RPG circle:Studio");
    expect(result.textQuery).toBe("Dragon");
    expect(result.tags).toEqual(["RPG"]);
    expect(result.circles).toEqual(["Studio"]);
  });

  it("여러 태그를 동시에 파싱해야 한다", () => {
    const result = parseSearchQuery("tag:RPG tag:Fantasy tag:Pixel");
    expect(result.tags).toEqual(["RPG", "Fantasy", "Pixel"]);
    expect(result.textQuery).toBeUndefined();
  });

  it("빈 값 prefix를 무시해야 한다 (tag: 뒤에 공백)", () => {
    const result = parseSearchQuery("tag: something");
    // "tag:" 뒤에 공백이 오면 값이 없으므로 태그로 파싱되지 않아야 함
    expect(result.tags).toEqual([]);
    // "something"은 일반 텍스트로 남아야 함
    expect(result.textQuery).toBe("something");
  });

  it("빈 쿼리를 올바르게 처리해야 한다", () => {
    const result = parseSearchQuery("");
    expect(result.textQuery).toBeUndefined();
    expect(result.tags).toEqual([]);
    expect(result.circles).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.provider).toBeUndefined();
    expect(result.externalId).toBeUndefined();
  });

  it("여러 종류의 prefix를 동시에 파싱해야 한다", () => {
    const result = parseSearchQuery(
      "GameTitle tag:RPG circle:Studio category:Action provider:dlsite id:RJ001",
    );
    expect(result.textQuery).toBe("GameTitle");
    expect(result.tags).toEqual(["RPG"]);
    expect(result.circles).toEqual(["Studio"]);
    expect(result.categories).toEqual(["Action"]);
    expect(result.provider).toBe("dlsite");
    expect(result.externalId).toBe("RJ001");
  });

  it("한글과 영문 prefix를 혼합하여 파싱해야 한다", () => {
    const result = parseSearchQuery("tag:RPG 서클:스튜디오");
    expect(result.tags).toEqual(["RPG"]);
    expect(result.circles).toEqual(["스튜디오"]);
  });
});

// ============================================
// getAutocompleteSuggestionsHandler — 자동완성 제안
// ============================================
describe("getAutocompleteSuggestionsHandler", () => {
  describe("prefix 없는 경우 (부분 매칭)", () => {
    it("빈 쿼리이면 모든 prefix 목록을 반환해야 한다", async () => {
      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "" as any,
        query: "",
      });

      expect(result.suggestions).toEqual([
        "tag:",
        "태그:",
        "circle:",
        "서클:",
        "category:",
        "카테고리:",
        "provider:",
        "제공자:",
        "id:",
        "아이디:",
      ]);
    });

    it("영문 부분 입력 시 매칭되는 prefix를 반환해야 한다 (t → tag:)", async () => {
      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "" as any,
        query: "t",
      });

      expect(result.suggestions).toContain("tag:");
      // "t"로 시작하는 영문 prefix만 포함
      expect(result.suggestions).not.toContain("circle:");
      expect(result.suggestions).not.toContain("provider:");
    });

    it("영문 부분 입력 시 여러 prefix가 매칭될 수 있다 (c → circle:, category:)", async () => {
      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "" as any,
        query: "c",
      });

      expect(result.suggestions).toContain("circle:");
      expect(result.suggestions).toContain("category:");
    });

    it("한글 부분 입력 시 매칭되는 한글 prefix를 반환해야 한다 (태 → 태그:)", async () => {
      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "" as any,
        query: "태",
      });

      expect(result.suggestions).toContain("태그:");
    });

    it("매칭되는 prefix가 없으면 빈 배열을 반환해야 한다", async () => {
      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "" as any,
        query: "xyz",
      });

      expect(result.suggestions).toEqual([]);
    });
  });

  describe("prefix: tag — 태그 자동완성", () => {
    it("DB에 있는 태그를 LIKE 검색하여 반환해야 한다", async () => {
      // 게임 및 태그 시드
      await seedGame(db, {
        path: "/games/game1",
        title: "Game 1",
        source: "/library/path",
      });
      await seedGameTag(db, "/games/game1", "RPG");
      await seedGameTag(db, "/games/game1", "Fantasy");
      await seedGameTag(db, "/games/game1", "Action");

      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "tag",
        query: "R",
      });

      expect(result.suggestions).toContain("RPG");
      expect(result.suggestions).not.toContain("Fantasy");
      expect(result.suggestions).not.toContain("Action");
    });

    it("빈 쿼리이면 모든 태그를 반환해야 한다", async () => {
      await seedGame(db, {
        path: "/games/game1",
        title: "Game 1",
        source: "/library/path",
      });
      await seedGameTag(db, "/games/game1", "RPG");
      await seedGameTag(db, "/games/game1", "Action");

      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "tag",
        query: "",
      });

      // 빈 쿼리 "%%" → 모든 태그 반환
      expect(result.suggestions).toContain("RPG");
      expect(result.suggestions).toContain("Action");
    });

    it("한글 prefix 태그:도 동일하게 동작해야 한다", async () => {
      await seedGame(db, {
        path: "/games/game1",
        title: "Game 1",
        source: "/library/path",
      });
      await seedGameTag(db, "/games/game1", "판타지");

      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "태그" as any,
        query: "판",
      });

      expect(result.suggestions).toContain("판타지");
    });
  });

  describe("prefix: circle — 서클 자동완성", () => {
    it("DB에 있는 제작사를 LIKE 검색하여 반환해야 한다", async () => {
      await seedGame(db, {
        path: "/games/game1",
        title: "Game 1",
        source: "/library/path",
      });
      await seedGameMaker(db, "/games/game1", "Studio Alpha");
      await seedGameMaker(db, "/games/game1", "Studio Beta");

      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "circle",
        query: "Alpha",
      });

      expect(result.suggestions).toContain("Studio Alpha");
      expect(result.suggestions).not.toContain("Studio Beta");
    });
  });

  describe("prefix: category — 카테고리 자동완성", () => {
    it("DB에 있는 카테고리를 LIKE 검색하여 반환해야 한다", async () => {
      await seedGame(db, {
        path: "/games/game1",
        title: "Game 1",
        source: "/library/path",
      });
      await seedGameCategory(db, "/games/game1", "RPG");
      await seedGameCategory(db, "/games/game1", "Adventure");

      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "category",
        query: "RPG",
      });

      expect(result.suggestions).toContain("RPG");
      expect(result.suggestions).not.toContain("Adventure");
    });
  });

  describe("prefix: provider — 제공자 자동완성", () => {
    it("고정 제공자 목록에서 startsWith 매칭해야 한다", async () => {
      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "provider",
        query: "dl",
      });

      expect(result.suggestions).toEqual(["dlsite"]);
    });

    it("빈 쿼리이면 모든 제공자를 반환해야 한다", async () => {
      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "provider",
        query: "",
      });

      // 빈 쿼리는 startsWith("") → 모든 항목 포함
      expect(result.suggestions).toEqual(["dlsite", "steam", "getchu", "cien"]);
    });

    it("매칭되는 제공자가 없으면 빈 배열을 반환해야 한다", async () => {
      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "provider",
        query: "xyz",
      });

      expect(result.suggestions).toEqual([]);
    });
  });

  describe("prefix: id — 외부 ID 자동완성", () => {
    it("DB에 있는 externalId를 LIKE 검색하여 반환해야 한다", async () => {
      await seedGame(db, {
        path: "/games/game1",
        title: "Game 1",
        source: "/library/path",
        externalId: "RJ123456",
        provider: "dlsite",
      });
      await seedGame(db, {
        path: "/games/game2",
        title: "Game 2",
        source: "/library/path",
        externalId: "RJ789012",
        provider: "dlsite",
      });
      await seedGame(db, {
        path: "/games/game3",
        title: "Game 3",
        source: "/library/path",
        externalId: "12345",
        provider: "steam",
      });

      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "id",
        query: "RJ",
      });

      expect(result.suggestions).toContain("RJ123456");
      expect(result.suggestions).toContain("RJ789012");
      expect(result.suggestions).not.toContain("12345");
    });

    it("externalId가 없는 게임은 반환하지 않아야 한다", async () => {
      await seedGame(db, {
        path: "/games/no-id",
        title: "No ID Game",
        source: "/library/path",
        externalId: null,
      });

      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "id",
        query: "",
      });

      expect(result.suggestions).toEqual([]);
    });

    it("중복 externalId는 제거해야 한다", async () => {
      // 동일한 externalId를 가진 게임 2개
      await seedGame(db, {
        path: "/games/game1",
        title: "Game 1",
        source: "/library/path",
        externalId: "RJ123456",
        provider: "dlsite",
      });
      await seedGame(db, {
        path: "/games/game2",
        title: "Game 2",
        source: "/library/path",
        externalId: "RJ123456",
        provider: "dlsite",
      });

      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "id",
        query: "RJ",
      });

      // 중복 제거되어 1개만 반환
      expect(result.suggestions).toEqual(["RJ123456"]);
    });
  });

  describe("응답 형식", () => {
    it("prefix, query, suggestions 필드를 포함해야 한다", async () => {
      const result = await getAutocompleteSuggestionsHandler({} as any, {
        prefix: "tag",
        query: "test",
      });

      expect(result).toHaveProperty("prefix", "tag");
      expect(result).toHaveProperty("query", "test");
      expect(result).toHaveProperty("suggestions");
      expect(Array.isArray(result.suggestions)).toBe(true);
    });
  });
});

// ============================================
// getRandomGameHandler — 랜덤 게임 조회
// ============================================
describe("getRandomGameHandler", () => {
  it("게임이 있으면 1개의 게임을 반환해야 한다", async () => {
    await seedGame(db, {
      path: "/games/game1",
      title: "Game 1",
      source: "/library/path",
    });
    await seedGame(db, {
      path: "/games/game2",
      title: "Game 2",
      source: "/library/path",
    });
    await seedGame(db, {
      path: "/games/game3",
      title: "Game 3",
      source: "/library/path",
    });

    const result = await getRandomGameHandler({} as any, makeSearchPayload());

    // 반드시 1개의 게임을 반환
    expect(result.game).not.toBeNull();
    expect(result.game).toHaveProperty("path");
    expect(result.game).toHaveProperty("title");
  });

  it("게임이 없으면 null을 반환해야 한다", async () => {
    const result = await getRandomGameHandler({} as any, makeSearchPayload());

    expect(result.game).toBeNull();
  });

  it("숨김 게임은 기본적으로 제외해야 한다", async () => {
    // 숨김 게임만 시드
    await seedGame(db, {
      path: "/games/hidden-game",
      title: "Hidden Game",
      source: "/library/path",
      isHidden: true,
    });

    const result = await getRandomGameHandler({} as any, makeSearchPayload());

    // 숨김 게임만 있으므로 결과 없음
    expect(result.game).toBeNull();
  });

  it("showHidden=true면 숨김 게임만 반환해야 한다", async () => {
    await seedGame(db, {
      path: "/games/visible",
      title: "Visible Game",
      source: "/library/path",
      isHidden: false,
    });
    await seedGame(db, {
      path: "/games/hidden",
      title: "Hidden Game",
      source: "/library/path",
      isHidden: true,
    });

    const result = await getRandomGameHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: {
          filters: { showHidden: true },
        },
      }),
    );

    expect(result.game).not.toBeNull();
    expect(result.game!.title).toBe("Hidden Game");
  });

  it("즐겨찾기 필터가 적용되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/fav-game",
      title: "Fav Game",
      source: "/library/path",
      fingerprint: "fp-fav",
    });
    await seedUserGameData(db, "/games/fav-game", { isFavorite: true });

    await seedGame(db, {
      path: "/games/normal-game",
      title: "Normal Game",
      source: "/library/path",
      fingerprint: "fp-normal",
    });
    await seedUserGameData(db, "/games/normal-game", { isFavorite: false });

    const result = await getRandomGameHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: {
          filters: { showFavorites: true },
        },
      }),
    );

    expect(result.game).not.toBeNull();
    expect(result.game!.title).toBe("Fav Game");
  });

  it("텍스트 검색 필터가 적용되어야 한다", async () => {
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

    const result = await getRandomGameHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: { query: "Dragon" },
      }),
    );

    expect(result.game).not.toBeNull();
    expect(result.game!.title).toBe("Dragon Quest");
  });

  it("tag: 필터가 적용되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/rpg-game",
      title: "RPG Game",
      source: "/library/path",
    });
    await seedGameTag(db, "/games/rpg-game", "RPG");

    await seedGame(db, {
      path: "/games/action-game",
      title: "Action Game",
      source: "/library/path",
    });
    await seedGameTag(db, "/games/action-game", "Action");

    const result = await getRandomGameHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: { query: "tag:RPG" },
      }),
    );

    expect(result.game).not.toBeNull();
    expect(result.game!.title).toBe("RPG Game");
  });

  it("circle: 필터가 적용되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/studio-a-game",
      title: "Studio A Game",
      source: "/library/path",
    });
    await seedGameMaker(db, "/games/studio-a-game", "Studio A");

    await seedGame(db, {
      path: "/games/studio-b-game",
      title: "Studio B Game",
      source: "/library/path",
    });
    await seedGameMaker(db, "/games/studio-b-game", "Studio B");

    const result = await getRandomGameHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: { query: "circle:A" },
      }),
    );

    expect(result.game).not.toBeNull();
    expect(result.game!.title).toBe("Studio A Game");
  });

  it("provider: 필터가 적용되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/dlsite-game",
      title: "DLsite Game",
      source: "/library/path",
      provider: "dlsite",
      externalId: "RJ001",
    });
    await seedGame(db, {
      path: "/games/steam-game",
      title: "Steam Game",
      source: "/library/path",
      provider: "steam",
      externalId: "12345",
    });

    const result = await getRandomGameHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: { query: "provider:dlsite" },
      }),
    );

    expect(result.game).not.toBeNull();
    expect(result.game!.title).toBe("DLsite Game");
  });

  it("압축 파일 필터가 적용되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/compressed",
      title: "Compressed Game",
      source: "/library/path",
      isCompressFile: true,
    });
    await seedGame(db, {
      path: "/games/normal",
      title: "Normal Game",
      source: "/library/path",
      isCompressFile: false,
    });

    const result = await getRandomGameHandler(
      {} as any,
      makeSearchPayload({
        searchQuery: {
          filters: { showCompressed: true },
        },
      }),
    );

    expect(result.game).not.toBeNull();
    expect(result.game!.title).toBe("Compressed Game");
  });

  it("관계 데이터(makers, categories, tags)가 포함되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/full-game",
      title: "Full Game",
      source: "/library/path",
    });
    await seedGameMaker(db, "/games/full-game", "Studio X");
    await seedGameCategory(db, "/games/full-game", "RPG");
    await seedGameTag(db, "/games/full-game", "pixel-art");

    const result = await getRandomGameHandler({} as any, makeSearchPayload());

    expect(result.game).not.toBeNull();
    expect(result.game!.makers).toContain("Studio X");
    expect(result.game!.categories).toContain("RPG");
    expect(result.game!.tags).toContain("pixel-art");
  });

  it("다른 소스 경로의 게임은 반환하지 않아야 한다", async () => {
    await seedGame(db, {
      path: "/games/other-lib-game",
      title: "Other Library Game",
      source: "/other/library/path",
    });

    const result = await getRandomGameHandler(
      {} as any,
      makeSearchPayload({ sourcePaths: ["/library/path"] }),
    );

    // 다른 소스 경로의 게임이므로 결과 없음
    expect(result.game).toBeNull();
  });

  it("게임이 1개만 있을 때 해당 게임을 반환해야 한다", async () => {
    await seedGame(db, {
      path: "/games/only-game",
      title: "Only Game",
      source: "/library/path",
    });

    const result = await getRandomGameHandler({} as any, makeSearchPayload());

    expect(result.game).not.toBeNull();
    expect(result.game!.title).toBe("Only Game");
    expect(result.game!.path).toBe("/games/only-game");
  });
});
