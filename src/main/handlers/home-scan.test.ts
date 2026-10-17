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
  seedGameImage,
} from "../db/test-utils.js";

/**
 * home-scan.ts / home-library.ts 통합 테스트
 * 실행: pnpm test -- src/main/handlers/home-scan.test.ts
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
  getOfflineLibraryPaths: vi.fn(() => []),
  getScanDepth: () => 5,
  getEnableNonGameContent: () => false,
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
  computeFingerprint: vi.fn(() => Promise.resolve("mock-fp")),
}));
vi.mock("../utils/downloader.js", () => ({
  deleteImage: vi.fn(),
}));
vi.mock("../lib/folder-size.js", () => ({
  getGameSize: vi.fn(() => Promise.resolve(null)),
}));

// normalizePath 모킹 — 테스트에서는 입력 경로를 그대로 반환
vi.mock("../lib/normalize-path.js", () => ({
  normalizePath: (p: string) => p,
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

// fs 모킹 — 원본 유지 (test-utils 등에서 사용)
vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

// fs/promises 모킹 — home-scan에서 pathExists(access) 사용
vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    access: vi.fn(() => Promise.resolve()),
  };
});

// 모킹 후 import (vi.mock 호이스팅)
import {
  countUnmeasuredSizeGames,
  selectBestExecutable,
  scanFolder,
  scanLibraryPaths,
} from "./home-scan.js";
import { getGameSize } from "../lib/folder-size.js";
import { removeLibraryPathHandler } from "./home-library.js";
import { runScanWorker } from "../workers/run-scan-worker.js";
import { deleteImage } from "../utils/downloader.js";
import { access } from "fs/promises";
import { computeFingerprint } from "../lib/fingerprint.js";
import {
  getOfflineLibraryPaths,
  removeLibraryPath,
  removeLibraryScanHistory,
  updateLibraryScanHistory,
} from "../store.js";

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
  // 기본: access는 경로 존재함 (resolve)
  vi.mocked(access).mockImplementation(() => Promise.resolve());
  // 기본: computeFingerprint는 "mock-fp" 반환
  vi.mocked(computeFingerprint).mockResolvedValue("mock-fp");
  // 기본: 스캔 결과 없음 (이전 테스트의 후보 목록이 새지 않도록)
  vi.mocked(runScanWorker).mockResolvedValue([]);
  // 기본: 용량 측정 불가(null), 오프라인 경로 없음
  vi.mocked(getGameSize).mockResolvedValue(null);
  vi.mocked(getOfflineLibraryPaths).mockReturnValue([]);
});

// ============================================
// selectBestExecutable — 실행 파일 우선순위 선택
// ============================================
describe("selectBestExecutable — 실행 파일 우선순위 선택", () => {
  it("빈 배열 → null 반환해야 한다", () => {
    expect(selectBestExecutable([])).toBeNull();
  });

  it("1개면 그대로 반환해야 한다", () => {
    expect(selectBestExecutable(["/game/setup.lnk"])).toBe("/game/setup.lnk");
  });

  it(".exe 파일이 최우선이어야 한다", () => {
    const executables = [
      "/game/shortcut.lnk",
      "/game/game.exe",
      "/game/link.url",
    ];
    expect(selectBestExecutable(executables)).toBe("/game/game.exe");
  });

  it(".exe가 없으면 .lnk가 우선이어야 한다", () => {
    const executables = ["/game/link.url", "/game/shortcut.lnk"];
    expect(selectBestExecutable(executables)).toBe("/game/shortcut.lnk");
  });

  it(".exe, .lnk가 없으면 .url이 선택되어야 한다", () => {
    const executables = ["/game/other.bat", "/game/link.url"];
    expect(selectBestExecutable(executables)).toBe("/game/link.url");
  });

  it("우선순위 확장자가 없으면 첫 번째 항목 반환해야 한다", () => {
    const executables = ["/game/start.bat", "/game/run.cmd"];
    expect(selectBestExecutable(executables)).toBe("/game/start.bat");
  });

  it("대소문자 구분 없이 매칭해야 한다", () => {
    const executables = ["/game/shortcut.LNK", "/game/GAME.EXE"];
    expect(selectBestExecutable(executables)).toBe("/game/GAME.EXE");
  });
});

// ============================================
// scanFolder — 폴더 스캔하여 DB 동기화
// ============================================
describe("scanFolder — 폴더 스캔", () => {
  it("존재하지 않는 경로 → {addedCount: 0, deletedCount: 0} 반환해야 한다", async () => {
    vi.mocked(access).mockRejectedValue(new Error("ENOENT"));

    const result = await scanFolder("/nonexistent/path");

    expect(result).toEqual({ addedCount: 0, deletedCount: 0 });
  });

  it("새 게임을 DB에 추가해야 한다", async () => {
    vi.mocked(runScanWorker).mockResolvedValue([
      {
        path: "/library/game-a",
        name: "game-a",
        isCompressFile: false,
        hasExecutable: true,
      },
      {
        path: "/library/game-b",
        name: "game-b",
        isCompressFile: false,
        hasExecutable: true,
      },
    ]);

    const result = await scanFolder("/library");

    // 2개 추가 확인
    expect(result.addedCount).toBe(2);
    expect(result.deletedCount).toBe(0);

    // DB에 게임이 등록되었는지 확인
    const games = await db("games").select("path", "title", "source");
    expect(games).toHaveLength(2);

    const paths = games.map((g) => g.path);
    expect(paths).toContain("/library/game-a");
    expect(paths).toContain("/library/game-b");

    // source가 올바른지 확인
    for (const game of games) {
      expect(game.source).toBe("/library");
    }
  });

  it("압축파일 게임의 제목에서 확장자를 제거해야 한다", async () => {
    vi.mocked(runScanWorker).mockResolvedValue([
      {
        path: "/library/archive-game.zip",
        name: "archive-game.zip",
        isCompressFile: true,
        hasExecutable: true,
      },
    ]);

    const result = await scanFolder("/library");

    expect(result.addedCount).toBe(1);

    // 제목에서 확장자 제거 확인
    const game = await db("games")
      .where("path", "/library/archive-game.zip")
      .first();
    expect(game!.title).toBe("archive-game");
    expect(game!.originalTitle).toBe("archive-game.zip");
    expect(game!.isCompressFile).toBe(1); // SQLite: boolean → 1
  });

  it("기존 게임을 업데이트해야 한다 (재스캔)", async () => {
    // 기존 게임 시드
    await seedGame(db, {
      path: "/library/existing-game",
      title: "Existing Game",
      originalTitle: "old-name",
      source: "/library",
      fingerprint: "old-fp",
    });

    vi.mocked(runScanWorker).mockResolvedValue([
      {
        path: "/library/existing-game",
        name: "new-name",
        isCompressFile: false,
        hasExecutable: true,
      },
    ]);
    vi.mocked(computeFingerprint).mockResolvedValue("new-fp");

    const result = await scanFolder("/library");

    // 추가/삭제 0 (기존 게임 업데이트만)
    expect(result.addedCount).toBe(0);
    expect(result.deletedCount).toBe(0);

    // originalTitle이 업데이트되었는지 확인
    const game = await db("games")
      .where("path", "/library/existing-game")
      .first();
    expect(game!.originalTitle).toBe("new-name");
    // title은 기존 값 유지 (정보 수집으로 변경된 값 보존)
    expect(game!.title).toBe("Existing Game");
    // fingerprint 업데이트 확인
    expect(game!.fingerprint).toBe("new-fp");
  });

  it("fingerprint 변경 시 userGameData도 갱신해야 한다", async () => {
    // 기존 게임 + userGameData 시드
    await seedGame(db, {
      path: "/library/fp-game",
      title: "FP Game",
      source: "/library",
      fingerprint: "old-fp",
    });
    await seedUserGameData(db, "/library/fp-game", {
      fingerprint: "old-fp",
      totalPlayTime: 3600,
    });

    vi.mocked(runScanWorker).mockResolvedValue([
      {
        path: "/library/fp-game",
        name: "FP Game",
        isCompressFile: false,
        hasExecutable: true,
      },
    ]);
    vi.mocked(computeFingerprint).mockResolvedValue("new-fp");

    await scanFolder("/library");

    // userGameData의 fingerprint도 갱신되었는지 확인
    const userData = await db("userGameData")
      .where("fingerprint", "new-fp")
      .first();
    expect(userData).toBeDefined();
    expect(userData!.totalPlayTime).toBe(3600);

    // 이전 fingerprint로는 조회 불가
    const oldData = await db("userGameData")
      .where("fingerprint", "old-fp")
      .first();
    expect(oldData).toBeUndefined();
  });

  it("존재하지 않는 게임을 DB에서 삭제해야 한다", async () => {
    // DB에 게임 2개 시드
    await seedGame(db, {
      path: "/library/keep-game",
      title: "Keep Game",
      source: "/library",
    });
    await seedGame(db, {
      path: "/library/delete-game",
      title: "Delete Game",
      source: "/library",
      thumbnail: "thumb/delete.jpg",
    });

    // 관계 데이터도 시드
    await seedGameMaker(db, "/library/delete-game", "Studio X");
    await seedGameCategory(db, "/library/delete-game", "RPG");
    await seedGameTag(db, "/library/delete-game", "tag-a");
    await seedGameImage(db, "/library/delete-game", "img/delete-1.jpg", 0);

    // 스캔 결과: keep-game만 존재
    vi.mocked(runScanWorker).mockResolvedValue([
      {
        path: "/library/keep-game",
        name: "keep-game",
        isCompressFile: false,
        hasExecutable: true,
      },
    ]);

    const result = await scanFolder("/library");

    expect(result.deletedCount).toBe(1);

    // delete-game이 삭제되었는지 확인
    const deleted = await db("games")
      .where("path", "/library/delete-game")
      .first();
    expect(deleted).toBeUndefined();

    // keep-game은 남아있어야 한다
    const kept = await db("games").where("path", "/library/keep-game").first();
    expect(kept).toBeDefined();

    // 관계 데이터도 삭제되었는지 확인
    const makers = await db("gameMakers")
      .where("gamePath", "/library/delete-game")
      .select();
    expect(makers).toHaveLength(0);

    const categories = await db("gameCategories")
      .where("gamePath", "/library/delete-game")
      .select();
    expect(categories).toHaveLength(0);

    const tags = await db("gameTags")
      .where("gamePath", "/library/delete-game")
      .select();
    expect(tags).toHaveLength(0);

    const images = await db("gameImages")
      .where("gamePath", "/library/delete-game")
      .select();
    expect(images).toHaveLength(0);
  });

  it("삭제 시 썸네일과 이미지 파일 삭제(deleteImage)를 호출해야 한다", async () => {
    // 썸네일과 이미지가 있는 게임 시드
    await seedGame(db, {
      path: "/library/img-game",
      title: "Image Game",
      source: "/library",
      thumbnail: "thumb/img-game.jpg",
    });
    await seedGameImage(db, "/library/img-game", "images/img-1.jpg", 0);
    await seedGameImage(db, "/library/img-game", "images/img-2.jpg", 1);

    // 스캔 결과: 비어있음 (게임 없음)
    vi.mocked(runScanWorker).mockResolvedValue([]);

    await scanFolder("/library");

    // deleteImage가 썸네일 1회 + 이미지 2회 = 총 3회 호출
    expect(deleteImage).toHaveBeenCalledTimes(3);
    // 썸네일 삭제 호출 확인 (toAbsolutePath 모킹으로 /absolute/ 접두사 추가)
    expect(deleteImage).toHaveBeenCalledWith("/absolute/thumb/img-game.jpg");
    expect(deleteImage).toHaveBeenCalledWith("/absolute/images/img-1.jpg");
    expect(deleteImage).toHaveBeenCalledWith("/absolute/images/img-2.jpg");
  });

  it("스캔 완료 후 updateLibraryScanHistory를 호출해야 한다", async () => {
    vi.mocked(runScanWorker).mockResolvedValue([
      {
        path: "/library/game-1",
        name: "game-1",
        isCompressFile: false,
        hasExecutable: true,
      },
    ]);

    await scanFolder("/library");

    // updateLibraryScanHistory(sourcePath, totalGameCount) 호출 확인
    expect(updateLibraryScanHistory).toHaveBeenCalledWith("/library", 1);
  });

  it("빈 스캔 결과면 addedCount=0, deletedCount=0이어야 한다", async () => {
    vi.mocked(runScanWorker).mockResolvedValue([]);

    const result = await scanFolder("/library");

    expect(result.addedCount).toBe(0);
    expect(result.deletedCount).toBe(0);
    expect(updateLibraryScanHistory).toHaveBeenCalledWith("/library", 0);
  });
});

describe("scanFolder — 용량 측정", () => {
  it("새 게임은 용량을 측정해 저장해야 한다", async () => {
    vi.mocked(runScanWorker).mockResolvedValue([
      {
        path: "/library/game-a",
        name: "game-a",
        isCompressFile: false,
        hasExecutable: true,
      },
    ]);
    vi.mocked(getGameSize).mockResolvedValue(1234);

    await scanFolder("/library");

    const game = await db("games").where("path", "/library/game-a").first();
    expect(game!.sizeBytes).toBe(1234);
    expect(getGameSize).toHaveBeenCalledWith("/library/game-a", false);
  });

  it("변경 없는 게임이라도 용량이 없으면 용량만 채우고 updatedAt은 유지해야 한다", async () => {
    await seedGame(db, {
      path: "/library/game-a",
      source: "/library",
      fingerprint: "fp",
      dirMtimeMs: 100,
      hasExecutable: true,
      updatedAt: null,
    });
    vi.mocked(runScanWorker).mockResolvedValue([
      {
        path: "/library/game-a",
        name: "game-a",
        isCompressFile: false,
        hasExecutable: true,
        mtimeMs: 100,
      },
    ]);
    vi.mocked(getGameSize).mockResolvedValue(5000);

    await scanFolder("/library");

    const game = await db("games").where("path", "/library/game-a").first();
    expect(game!.sizeBytes).toBe(5000);
    expect(game!.updatedAt).toBeNull();
    expect(computeFingerprint).not.toHaveBeenCalled();
  });

  it("변경 없고 용량도 있는 게임은 용량을 다시 측정하지 않아야 한다", async () => {
    await seedGame(db, {
      path: "/library/game-a",
      source: "/library",
      fingerprint: "fp",
      dirMtimeMs: 100,
      hasExecutable: true,
      sizeBytes: 777,
    });
    vi.mocked(runScanWorker).mockResolvedValue([
      {
        path: "/library/game-a",
        name: "game-a",
        isCompressFile: false,
        hasExecutable: true,
        mtimeMs: 100,
      },
    ]);

    await scanFolder("/library");

    const game = await db("games").where("path", "/library/game-a").first();
    expect(game!.sizeBytes).toBe(777);
    expect(getGameSize).not.toHaveBeenCalled();
  });

  it("변경된 게임은 용량을 다시 측정하고, 측정 실패 시 기존 값을 유지해야 한다", async () => {
    await seedGame(db, {
      path: "/library/game-a",
      source: "/library",
      fingerprint: "fp",
      dirMtimeMs: 100,
      sizeBytes: 777,
    });
    await seedGame(db, {
      path: "/library/game-b",
      source: "/library",
      fingerprint: "fp-b",
      dirMtimeMs: 100,
      sizeBytes: 888,
    });
    vi.mocked(runScanWorker).mockResolvedValue([
      {
        path: "/library/game-a",
        name: "game-a",
        isCompressFile: false,
        hasExecutable: true,
        mtimeMs: 200,
      },
      {
        path: "/library/game-b",
        name: "game-b",
        isCompressFile: false,
        hasExecutable: true,
        mtimeMs: 200,
      },
    ]);
    vi.mocked(getGameSize).mockImplementation(async (p) =>
      p === "/library/game-a" ? 999 : null,
    );

    await scanFolder("/library");

    const games = await db("games").orderBy("path").select("sizeBytes");
    expect(games.map((g) => g.sizeBytes)).toEqual([999, 888]);
  });
});

describe("countUnmeasuredSizeGames — 용량 미측정 게임 수", () => {
  it("지정 경로의 용량 미측정 게임만 세야 한다", async () => {
    await seedGame(db, { path: "/lib-a/1", source: "/lib-a", sizeBytes: null });
    await seedGame(db, { path: "/lib-a/2", source: "/lib-a", sizeBytes: 10 });
    await seedGame(db, { path: "/lib-b/1", source: "/lib-b", sizeBytes: null });

    expect(await countUnmeasuredSizeGames(["/lib-a"])).toBe(1);
    expect(await countUnmeasuredSizeGames(["/lib-a", "/lib-b"])).toBe(2);
  });

  it("오프라인 라이브러리는 대소문자 무관하게 제외해야 한다", async () => {
    await seedGame(db, { path: "/lib-a/1", source: "/lib-a", sizeBytes: null });
    await seedGame(db, { path: "/LIB-B/1", source: "/LIB-B", sizeBytes: null });
    vi.mocked(getOfflineLibraryPaths).mockReturnValue(["/lib-b"]);

    expect(await countUnmeasuredSizeGames(["/lib-a", "/LIB-B"])).toBe(1);
  });

  it("빈 경로 목록이면 0을 반환해야 한다", async () => {
    expect(await countUnmeasuredSizeGames([])).toBe(0);
  });
});

describe("scanLibraryPaths — 여러 경로 스캔 합산", () => {
  it("존재하지 않는 경로들은 전부 스킵돼 0을 반환해야 한다", async () => {
    const result = await scanLibraryPaths(["/nonexistent/a", "/nonexistent/b"]);
    expect(result).toEqual({ addedCount: 0, deletedCount: 0 });
  });

  it("빈 배열이면 0을 반환해야 한다", async () => {
    const result = await scanLibraryPaths([]);
    expect(result).toEqual({ addedCount: 0, deletedCount: 0 });
  });
});

// ============================================
// removeLibraryPathHandler — 라이브러리 경로 제거
// ============================================
describe("removeLibraryPathHandler — 라이브러리 경로 제거", () => {
  it("해당 경로의 게임과 관계 데이터를 모두 삭제해야 한다", async () => {
    // 게임 2개 시드 (같은 source)
    await seedGame(db, {
      path: "/lib-a/game-1",
      title: "Game 1",
      source: "/lib-a",
      thumbnail: "thumb/game-1.jpg",
    });
    await seedGame(db, {
      path: "/lib-a/game-2",
      title: "Game 2",
      source: "/lib-a",
      thumbnail: "thumb/game-2.jpg",
    });

    // 관계 데이터 시드
    await seedGameMaker(db, "/lib-a/game-1", "Maker A");
    await seedGameCategory(db, "/lib-a/game-1", "Category A");
    await seedGameTag(db, "/lib-a/game-1", "Tag A");
    await seedGameImage(db, "/lib-a/game-1", "img/game-1-a.jpg", 0);
    await seedGameMaker(db, "/lib-a/game-2", "Maker B");
    await seedGameTag(db, "/lib-a/game-2", "Tag B");

    const result = await removeLibraryPathHandler({} as any, {
      path: "/lib-a",
    });

    // 반환값 확인
    expect(result.path).toBe("/lib-a");
    expect(result.deletedGameCount).toBe(2);

    // 게임 삭제 확인
    const games = await db("games").where("source", "/lib-a").select();
    expect(games).toHaveLength(0);

    // 관계 데이터 삭제 확인
    const makers = await db("gameMakers")
      .whereIn("gamePath", ["/lib-a/game-1", "/lib-a/game-2"])
      .select();
    expect(makers).toHaveLength(0);

    const categories = await db("gameCategories")
      .whereIn("gamePath", ["/lib-a/game-1", "/lib-a/game-2"])
      .select();
    expect(categories).toHaveLength(0);

    const tags = await db("gameTags")
      .whereIn("gamePath", ["/lib-a/game-1", "/lib-a/game-2"])
      .select();
    expect(tags).toHaveLength(0);

    const images = await db("gameImages")
      .whereIn("gamePath", ["/lib-a/game-1", "/lib-a/game-2"])
      .select();
    expect(images).toHaveLength(0);
  });

  it("썸네일과 이미지 파일을 삭제해야 한다", async () => {
    await seedGame(db, {
      path: "/lib-b/game-x",
      title: "Game X",
      source: "/lib-b",
      thumbnail: "thumb/game-x.jpg",
    });
    await seedGameImage(db, "/lib-b/game-x", "img/x-1.jpg", 0);
    await seedGameImage(db, "/lib-b/game-x", "img/x-2.jpg", 1);

    await removeLibraryPathHandler({} as any, { path: "/lib-b" });

    // deleteImage 호출 확인: 썸네일 1회 + 이미지 2회 = 3회
    expect(deleteImage).toHaveBeenCalledTimes(3);
    expect(deleteImage).toHaveBeenCalledWith("/absolute/thumb/game-x.jpg");
    expect(deleteImage).toHaveBeenCalledWith("/absolute/img/x-1.jpg");
    expect(deleteImage).toHaveBeenCalledWith("/absolute/img/x-2.jpg");
  });

  it("설정에서 경로를 제거하는 store 함수를 호출해야 한다", async () => {
    // 게임이 없는 경로도 store 함수는 호출되어야 함
    await removeLibraryPathHandler({} as any, {
      path: "/lib-empty",
    });

    // removeLibraryPath (store alias: removeLibraryPathFromStore) 호출 확인
    expect(removeLibraryPath).toHaveBeenCalledWith("/lib-empty");
    // removeLibraryScanHistory 호출 확인
    expect(removeLibraryScanHistory).toHaveBeenCalledWith("/lib-empty");
  });

  it("userGameData는 보존해야 한다", async () => {
    // 게임 + userGameData 시드
    await seedGame(db, {
      path: "/lib-c/game-with-data",
      title: "Game With Data",
      source: "/lib-c",
      fingerprint: "fp-data",
    });
    await seedUserGameData(db, "/lib-c/game-with-data", {
      fingerprint: "fp-data",
      totalPlayTime: 7200,
      isFavorite: true,
    });

    await removeLibraryPathHandler({} as any, { path: "/lib-c" });

    // 게임은 삭제됨
    const game = await db("games")
      .where("path", "/lib-c/game-with-data")
      .first();
    expect(game).toBeUndefined();

    // userGameData는 보존됨
    const userData = await db("userGameData")
      .where("fingerprint", "fp-data")
      .first();
    expect(userData).toBeDefined();
    expect(userData!.totalPlayTime).toBe(7200);
    expect(userData!.isFavorite).toBe(1);
  });

  it("해당 경로에 게임이 없으면 deletedGameCount=0이어야 한다", async () => {
    const result = await removeLibraryPathHandler({} as any, {
      path: "/lib-no-games",
    });

    expect(result.path).toBe("/lib-no-games");
    expect(result.deletedGameCount).toBe(0);

    // store 함수는 여전히 호출되어야 함
    expect(removeLibraryPath).toHaveBeenCalledWith("/lib-no-games");
    expect(removeLibraryScanHistory).toHaveBeenCalledWith("/lib-no-games");
  });

  it("다른 라이브러리 경로의 게임은 영향받지 않아야 한다", async () => {
    // 두 개의 다른 source에 게임 시드
    await seedGame(db, {
      path: "/lib-d/game-d",
      title: "Game D",
      source: "/lib-d",
    });
    await seedGame(db, {
      path: "/lib-e/game-e",
      title: "Game E",
      source: "/lib-e",
    });

    // /lib-d만 제거
    await removeLibraryPathHandler({} as any, { path: "/lib-d" });

    // /lib-d 게임은 삭제됨
    const gameD = await db("games").where("path", "/lib-d/game-d").first();
    expect(gameD).toBeUndefined();

    // /lib-e 게임은 남아있음
    const gameE = await db("games").where("path", "/lib-e/game-e").first();
    expect(gameE).toBeDefined();
    expect(gameE!.title).toBe("Game E");
  });
});
