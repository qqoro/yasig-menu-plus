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
} from "../../db/test-utils.js";

/**
 * batchToggleGamesHandler 통합 테스트
 * 실행: pnpm test -- src/main/handlers/__tests__/batch-toggle.test.ts
 */

// ========== 모듈 모킹 ==========

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
}));

// toAbsolutePath를 패스스루로 모킹
vi.mock("../../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));

// validator 모킹
vi.mock("../../utils/validator.js", () => ({
  validatePath: vi.fn(),
  validateDirectoryPath: vi.fn(),
  validateSearchQuery: vi.fn(),
  validateUrl: vi.fn(),
}));

// store 모킹
vi.mock("../../store.js", () => ({
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
vi.mock("../../workers/run-scan-worker.js", () => ({
  runScanWorker: vi.fn(),
}));
vi.mock("../../services/ProcessMonitor.js", () => ({
  processMonitor: { isExeFile: vi.fn(), startSession: vi.fn() },
}));
vi.mock("../../lib/fingerprint.js", () => ({
  computeFingerprint: vi.fn(() => "mock-fp"),
}));
vi.mock("../../utils/downloader.js", () => ({
  deleteImage: vi.fn(),
}));

// db-manager 모킹: testDb를 동적 참조
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: {
    getKnex: () => dbRef.current!,
  },
}));

// 모킹 후 import (vi.mock 호이스팅)
import { batchToggleGamesHandler } from "../home.js";

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

// ============================================
// batchToggleGamesHandler — 빈 배열
// ============================================
describe("batchToggleGamesHandler — 빈 배열", () => {
  it("빈 paths 배열이면 updatedCount 0을 반환해야 한다", async () => {
    const result = await batchToggleGamesHandler({} as any, {
      paths: [],
      field: "is_favorite",
      value: true,
    });

    expect(result.field).toBe("is_favorite");
    expect(result.updatedCount).toBe(0);
  });
});

// ============================================
// batchToggleGamesHandler — is_hidden 배치 토글
// ============================================
describe("batchToggleGamesHandler — is_hidden 배치 토글", () => {
  it("여러 게임의 isHidden을 일괄 true로 설정해야 한다", async () => {
    await seedGame(db, {
      path: "/games/game-a",
      title: "Game A",
      source: "/library/path",
      isHidden: false,
    });
    await seedGame(db, {
      path: "/games/game-b",
      title: "Game B",
      source: "/library/path",
      isHidden: false,
    });
    await seedGame(db, {
      path: "/games/game-c",
      title: "Game C",
      source: "/library/path",
      isHidden: false,
    });

    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/game-a", "/games/game-b", "/games/game-c"],
      field: "is_hidden",
      value: true,
    });

    expect(result.field).toBe("is_hidden");
    expect(result.updatedCount).toBe(3);

    // DB 확인
    const games = await db("games")
      .whereIn("path", ["/games/game-a", "/games/game-b", "/games/game-c"])
      .select("path", "isHidden");

    for (const game of games) {
      expect(game.isHidden).toBe(1);
    }
  });

  it("여러 게임의 isHidden을 일괄 false로 설정해야 한다", async () => {
    await seedGame(db, {
      path: "/games/game-a",
      title: "Game A",
      source: "/library/path",
      isHidden: true,
    });
    await seedGame(db, {
      path: "/games/game-b",
      title: "Game B",
      source: "/library/path",
      isHidden: true,
    });

    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/game-a", "/games/game-b"],
      field: "is_hidden",
      value: false,
    });

    expect(result.field).toBe("is_hidden");
    expect(result.updatedCount).toBe(2);

    // DB 확인
    const games = await db("games")
      .whereIn("path", ["/games/game-a", "/games/game-b"])
      .select("path", "isHidden");

    for (const game of games) {
      expect(game.isHidden).toBe(0);
    }
  });
});

// ============================================
// batchToggleGamesHandler — is_favorite 배치 토글
// ============================================
describe("batchToggleGamesHandler — is_favorite 배치 토글", () => {
  it("여러 게임의 isFavorite를 일괄 true로 설정해야 한다", async () => {
    await seedGame(db, {
      path: "/games/fav-a",
      title: "Fav A",
      source: "/library/path",
      fingerprint: "fp-fav-a",
    });
    await seedGame(db, {
      path: "/games/fav-b",
      title: "Fav B",
      source: "/library/path",
      fingerprint: "fp-fav-b",
    });

    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/fav-a", "/games/fav-b"],
      field: "is_favorite",
      value: true,
    });

    expect(result.field).toBe("is_favorite");
    expect(result.updatedCount).toBe(2);

    // DB 확인 — userGameData가 자동 생성되고 isFavorite=1
    const userData = await db("userGameData")
      .whereIn("fingerprint", ["fp-fav-a", "fp-fav-b"])
      .select("fingerprint", "isFavorite");

    expect(userData).toHaveLength(2);
    for (const data of userData) {
      expect(data.isFavorite).toBe(1);
    }
  });

  it("기존 userGameData가 있는 게임도 일괄 토글해야 한다", async () => {
    await seedGame(db, {
      path: "/games/fav-existing",
      title: "Fav Existing",
      source: "/library/path",
      fingerprint: "fp-fav-existing",
    });
    await seedUserGameData(db, "/games/fav-existing", {
      isFavorite: true,
    });

    // false로 일괄 설정
    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/fav-existing"],
      field: "is_favorite",
      value: false,
    });

    expect(result.field).toBe("is_favorite");
    expect(result.updatedCount).toBe(1);

    const userData = await db("userGameData")
      .where("fingerprint", "fp-fav-existing")
      .first();
    expect(userData.isFavorite).toBe(0);
  });
});

// ============================================
// batchToggleGamesHandler — is_clear 배치 토글
// ============================================
describe("batchToggleGamesHandler — is_clear 배치 토글", () => {
  it("여러 게임의 isClear를 일괄 true로 설정해야 한다", async () => {
    await seedGame(db, {
      path: "/games/clear-a",
      title: "Clear A",
      source: "/library/path",
      fingerprint: "fp-clear-a",
    });
    await seedGame(db, {
      path: "/games/clear-b",
      title: "Clear B",
      source: "/library/path",
      fingerprint: "fp-clear-b",
    });

    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/clear-a", "/games/clear-b"],
      field: "is_clear",
      value: true,
    });

    expect(result.field).toBe("is_clear");
    expect(result.updatedCount).toBe(2);

    // DB 확인
    const userData = await db("userGameData")
      .whereIn("fingerprint", ["fp-clear-a", "fp-clear-b"])
      .select("fingerprint", "isClear");

    expect(userData).toHaveLength(2);
    for (const data of userData) {
      expect(data.isClear).toBe(1);
    }
  });

  it("isClear를 일괄 false로 되돌릴 수 있어야 한다", async () => {
    await seedGame(db, {
      path: "/games/clear-revert",
      title: "Clear Revert",
      source: "/library/path",
      fingerprint: "fp-clear-revert",
    });
    await seedUserGameData(db, "/games/clear-revert", {
      isClear: true,
    });

    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/clear-revert"],
      field: "is_clear",
      value: false,
    });

    expect(result.updatedCount).toBe(1);

    const userData = await db("userGameData")
      .where("fingerprint", "fp-clear-revert")
      .first();
    expect(userData.isClear).toBe(0);
  });
});

// ============================================
// batchToggleGamesHandler — 부분 매칭 (일부 경로만 존재)
// ============================================
describe("batchToggleGamesHandler — 부분 매칭", () => {
  it("존재하는 게임만 is_hidden 업데이트되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/exists",
      title: "Exists",
      source: "/library/path",
      isHidden: false,
    });

    // /games/nonexistent는 DB에 없음
    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/exists", "/games/nonexistent"],
      field: "is_hidden",
      value: true,
    });

    // 존재하는 게임만 업데이트
    expect(result.updatedCount).toBe(1);

    const game = await db("games").where("path", "/games/exists").first();
    expect(game!.isHidden).toBe(1);
  });
});
