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
  seedGame,
  seedGameCategory,
  seedGameImage,
  seedGameMaker,
  seedGameTag,
  truncateAll,
} from "../../db/test-utils.js";

/**
 * home-library 핸들러 통합 테스트
 * 실행: pnpm test -- src/main/handlers/__tests__/home-library.test.ts
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

// normalizePath를 identity로 모킹 (경로를 그대로 반환)
vi.mock("../../lib/normalize-path.js", () => ({
  normalizePath: (p: string) => p,
}));

// store 모킹 — 라이브러리 경로/스캔 기록 관련 함수
// vi.mock 팩토리는 호이스팅되므로 외부 변수 참조 불가 → 인라인으로 정의
vi.mock("../../store.js", () => ({
  getLibraryPaths: vi.fn(() => ["/library/a", "/library/b"]),
  addLibraryPath: vi.fn(),
  removeLibraryPath: vi.fn(),
  getLibraryScanHistory: vi.fn(() => null),
  getAllLibraryScanHistory: vi.fn(() => ({})),
  removeLibraryScanHistory: vi.fn(),
  updateLibraryScanHistory: vi.fn(),
  getLastRefreshedAt: vi.fn(() => null),
  setLastRefreshedAt: vi.fn(),
  getScanDepth: vi.fn(() => 5),
  // home.ts에서 import하는 store 함수들
  getTranslationSettings: () => ({
    titleDisplayPriority: ["translated", "collected", "original"],
  }),
  getExcludedExecutables: () => [],
  DEFAULT_TITLE_DISPLAY_PRIORITY: ["translated", "collected", "original"],
  addExcludedExecutable: vi.fn(),
  removeExcludedExecutable: vi.fn(),
}));

// deleteImage 모킹
vi.mock("../../utils/downloader.js", () => ({
  deleteImage: vi.fn(),
}));

// scanFolder 모킹
vi.mock("./home-scan.js", () => ({
  scanFolder: vi.fn(),
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
import * as store from "../../store.js";
import {
  getLibraryPathsHandler,
  getLastRefreshedHandler,
  setLastRefreshedHandler,
  removeLibraryPathHandler,
} from "../home-library.js";

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
  vi.clearAllMocks();
});

// ============================================
// removeLibraryPathHandler
// ============================================
describe("removeLibraryPathHandler", () => {
  it("경로 하위 게임이 있으면 관계 데이터도 함께 삭제해야 한다", async () => {
    const libraryPath = "/library/games";
    const gamePath = "/library/games/game-a";

    // 게임 및 관계 데이터 시드
    await seedGame(db, {
      path: gamePath,
      title: "Game A",
      source: libraryPath,
      thumbnail: "thumb-a.jpg",
    });
    await seedGameMaker(db, gamePath, "MakerA");
    await seedGameCategory(db, gamePath, "CategoryA");
    await seedGameTag(db, gamePath, "TagA");
    await seedGameImage(db, gamePath, "/images/img1.jpg", 1);

    // 관계 데이터 존재 확인
    expect(await db("gameMakers").where("gamePath", gamePath)).toHaveLength(1);
    expect(await db("gameCategories").where("gamePath", gamePath)).toHaveLength(
      1,
    );
    expect(await db("gameTags").where("gamePath", gamePath)).toHaveLength(1);
    expect(await db("gameImages").where("gamePath", gamePath)).toHaveLength(1);

    const result = await removeLibraryPathHandler({} as any, {
      path: libraryPath,
    });

    expect(result.deletedGameCount).toBe(1);
    expect(result.path).toBe(libraryPath);

    // 관계 데이터 삭제 확인
    expect(await db("gameMakers").where("gamePath", gamePath)).toHaveLength(0);
    expect(await db("gameCategories").where("gamePath", gamePath)).toHaveLength(
      0,
    );
    expect(await db("gameTags").where("gamePath", gamePath)).toHaveLength(0);
    expect(await db("gameImages").where("gamePath", gamePath)).toHaveLength(0);

    // 게임 레코드 삭제 확인
    expect(await db("games").where("path", gamePath)).toHaveLength(0);
  });

  it("경로 하위 게임이 없으면 deletedGame = 0을 반환해야 한다", async () => {
    const libraryPath = "/library/empty";

    const result = await removeLibraryPathHandler({} as any, {
      path: libraryPath,
    });

    expect(result.deletedGameCount).toBe(0);
    expect(result.path).toBe(libraryPath);
  });

  it("다른 source의 게임은 삭제되지 않아야 한다", async () => {
    const targetPath = "/library/target";
    const otherPath = "/library/other";

    // 대상 경로의 게임
    await seedGame(db, {
      path: "/library/target/game-a",
      title: "Game A",
      source: targetPath,
    });

    // 다른 경로의 게임
    await seedGame(db, {
      path: "/library/other/game-b",
      title: "Game B",
      source: otherPath,
    });

    const result = await removeLibraryPathHandler({} as any, {
      path: targetPath,
    });

    expect(result.deletedGameCount).toBe(1);

    // 다른 경로의 게임은 유지
    const remaining = await db("games")
      .where("source", otherPath)
      .select("path");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].path).toBe("/library/other/game-b");
  });

  it("썸네일/이미지 파일 삭제가 호출되어야 한다", async () => {
    const libraryPath = "/library/media-test";
    const gamePath = "/library/media-test/game-a";

    await seedGame(db, {
      path: gamePath,
      title: "Game A",
      source: libraryPath,
      thumbnail: "thumb-a.jpg",
    });
    await seedGameImage(db, gamePath, "/images/extra1.jpg", 1);
    await seedGameImage(db, gamePath, "/images/extra2.jpg", 2);

    const { deleteImage } = await import("../../utils/downloader.js");

    await removeLibraryPathHandler({} as any, {
      path: libraryPath,
    });

    // 썸네일 1개 + 이미지 2개 = 총 3회 호출
    expect(deleteImage).toHaveBeenCalledTimes(3);
    expect(deleteImage).toHaveBeenCalledWith("/absolute/thumb-a.jpg");
    expect(deleteImage).toHaveBeenCalledWith("/absolute//images/extra1.jpg");
    expect(deleteImage).toHaveBeenCalledWith("/absolute//images/extra2.jpg");
  });

  it("설정에서 경로가 제거되어야 한다", async () => {
    const libraryPath = "/library/to-remove";

    await removeLibraryPathHandler({} as any, {
      path: libraryPath,
    });

    expect(store.removeLibraryPath).toHaveBeenCalledWith(libraryPath);
  });

  it("스캔 기록이 삭제되어야 한다", async () => {
    const libraryPath = "/library/scan-record";

    await removeLibraryPathHandler({} as any, {
      path: libraryPath,
    });

    expect(store.removeLibraryScanHistory).toHaveBeenCalledWith(libraryPath);
  });
});

// ============================================
// getLibraryPathsHandler
// ============================================
describe("getLibraryPathsHandler", () => {
  it("store에서 경로 목록을 반환해야 한다", async () => {
    store.getLibraryPaths.mockReturnValueOnce(["/library/a", "/library/b"]);

    const result = await getLibraryPathsHandler({} as any, {});

    expect(result.paths).toEqual(["/library/a", "/library/b"]);
    expect(store.getLibraryPaths).toHaveBeenCalled();
  });
});

// ============================================
// setLastRefreshedHandler / getLastRefreshedHandler
// ============================================
describe("setLastRefreshedHandler / getLastRefreshedHandler", () => {
  it("시간 저장 후 조회 시 동일한 값이 반환되어야 한다", async () => {
    const timestamp = "2025-06-01T12:00:00.000Z";

    // store 모킹: set 후 get에서 동일한 값 반환
    store.setLastRefreshedAt.mockImplementation((ts: string) => {
      store.getLastRefreshedAt.mockReturnValue(ts);
    });

    // 저장
    await setLastRefreshedHandler({} as any, { timestamp });
    expect(store.setLastRefreshedAt).toHaveBeenCalledWith(timestamp);

    // 조회
    const result = await getLastRefreshedHandler({} as any, {});
    expect(result.timestamp).toBe(timestamp);
    expect(store.getLastRefreshedAt).toHaveBeenCalled();
  });
});
