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
} from "../db/test-utils.js";

/**
 * home-game-control.ts 핸들러 통합 테스트
 * 실행: pnpm test -- src/main/handlers/home-game-control.test.ts
 */

// ========== 모듈 모킹 ==========

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: {
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
    trashItem: vi.fn(),
    openExternal: vi.fn(),
  },
}));

// toAbsolutePath를 패스스루로 모킹
vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));

// validator 모킹 — 테스트에서 항상 성공하도록
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
  getExcludedExecutables: () => ["Config.exe", "Uninstall.exe"],
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

// fs 모킹 — existsSync만 모킹 (readdirSync/statSync는 마이그레이션에서 사용하므로 원본 유지)
vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  };
});

// collectors/registry 모킹 (openOriginalSiteHandler에서 dynamic import로 사용)
vi.mock("../collectors/registry.js", () => ({
  getCollectorUrl: vi.fn(
    (provider: string, externalId: string): string | null => {
      if (provider === "dlsite")
        return `https://www.dlsite.com/maniax/work/=/product_id/${externalId}.html`;
      if (provider === "steam")
        return `https://store.steampowered.com/app/${externalId}`;
      return null;
    },
  ),
}));

// home-scan 모킹 (playGameHandler에서 사용)
vi.mock("./home-scan.js", () => ({
  findExecutables: vi.fn(() => []),
  selectBestExecutable: vi.fn(() => null),
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
import {
  toggleGameHandler,
  batchToggleGamesHandler,
  setExecutablePathHandler,
  getExcludedExecutablesHandler,
  addExcludedExecutableHandler,
  removeExcludedExecutableHandler,
  openOriginalSiteHandler,
} from "./home-game-control.js";
import { addExcludedExecutable, removeExcludedExecutable } from "../store.js";
import { shell } from "electron";

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
  it("존재하지 않는 게임 경로로 isHidden 토글하면 에러가 발생해야 한다", async () => {
    await expect(
      toggleGameHandler({} as any, { path: "/games/nonexistent" }, "is_hidden"),
    ).rejects.toThrow("게임을 찾을 수 없습니다.");
  });

  it("존재하지 않는 게임 경로로 isFavorite 토글하면 에러가 발생해야 한다", async () => {
    await expect(
      toggleGameHandler(
        {} as any,
        { path: "/games/nonexistent" },
        "is_favorite",
      ),
    ).rejects.toThrow("게임을 찾을 수 없습니다.");
  });

  it("존재하지 않는 게임 경로로 isClear 토글하면 에러가 발생해야 한다", async () => {
    await expect(
      toggleGameHandler({} as any, { path: "/games/nonexistent" }, "is_clear"),
    ).rejects.toThrow("게임을 찾을 수 없습니다.");
  });
});

// ============================================
// batchToggleGamesHandler — 빈 배열
// ============================================
describe("batchToggleGamesHandler — 빈 배열", () => {
  it("빈 배열이면 updatedCount: 0을 반환해야 한다", async () => {
    const result = await batchToggleGamesHandler({} as any, {
      paths: [],
      field: "is_hidden",
      value: true,
    });

    expect(result.field).toBe("is_hidden");
    expect(result.updatedCount).toBe(0);
  });

  it("빈 배열 + is_favorite 필드도 updatedCount: 0을 반환해야 한다", async () => {
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
// batchToggleGamesHandler — isHidden 일괄 업데이트
// ============================================
describe("batchToggleGamesHandler — isHidden 일괄 업데이트", () => {
  it("여러 게임의 isHidden을 일괄적으로 true로 설정해야 한다", async () => {
    await seedGame(db, {
      path: "/games/batch-1",
      title: "Batch 1",
      source: "/library/path",
      isHidden: false,
    });
    await seedGame(db, {
      path: "/games/batch-2",
      title: "Batch 2",
      source: "/library/path",
      isHidden: false,
    });
    await seedGame(db, {
      path: "/games/batch-3",
      title: "Batch 3",
      source: "/library/path",
      isHidden: false,
    });

    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/batch-1", "/games/batch-2", "/games/batch-3"],
      field: "is_hidden",
      value: true,
    });

    expect(result.field).toBe("is_hidden");
    expect(result.updatedCount).toBe(3);

    // DB 확인
    const games = await db("games")
      .whereIn("path", ["/games/batch-1", "/games/batch-2", "/games/batch-3"])
      .select("path", "isHidden");
    for (const game of games) {
      expect(game.isHidden).toBe(1);
    }
  });

  it("여러 게임의 isHidden을 일괄적으로 false로 설정해야 한다", async () => {
    await seedGame(db, {
      path: "/games/batch-unhide-1",
      title: "Batch Unhide 1",
      source: "/library/path",
      isHidden: true,
    });
    await seedGame(db, {
      path: "/games/batch-unhide-2",
      title: "Batch Unhide 2",
      source: "/library/path",
      isHidden: true,
    });

    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/batch-unhide-1", "/games/batch-unhide-2"],
      field: "is_hidden",
      value: false,
    });

    expect(result.field).toBe("is_hidden");
    expect(result.updatedCount).toBe(2);

    const games = await db("games")
      .whereIn("path", ["/games/batch-unhide-1", "/games/batch-unhide-2"])
      .select("path", "isHidden");
    for (const game of games) {
      expect(game.isHidden).toBe(0);
    }
  });
});

// ============================================
// batchToggleGamesHandler — isFavorite 일괄 업데이트
// ============================================
describe("batchToggleGamesHandler — isFavorite 일괄 업데이트", () => {
  it("여러 게임의 isFavorite를 일괄적으로 true로 설정해야 한다 (userGameData 자동 생성 포함)", async () => {
    await seedGame(db, {
      path: "/games/fav-batch-1",
      title: "Fav Batch 1",
      source: "/library/path",
      fingerprint: "fp-fav-batch-1",
    });
    await seedGame(db, {
      path: "/games/fav-batch-2",
      title: "Fav Batch 2",
      source: "/library/path",
      fingerprint: "fp-fav-batch-2",
    });

    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/fav-batch-1", "/games/fav-batch-2"],
      field: "is_favorite",
      value: true,
    });

    expect(result.field).toBe("is_favorite");
    expect(result.updatedCount).toBe(2);

    // DB 확인 — userGameData가 자동 생성되고 isFavorite이 설정되었는지
    const userData1 = await db("userGameData")
      .where("fingerprint", "fp-fav-batch-1")
      .first();
    expect(userData1).toBeDefined();
    expect(userData1.isFavorite).toBe(1);

    const userData2 = await db("userGameData")
      .where("fingerprint", "fp-fav-batch-2")
      .first();
    expect(userData2).toBeDefined();
    expect(userData2.isFavorite).toBe(1);
  });

  it("이미 userGameData가 있는 게임의 isFavorite를 일괄 해제해야 한다", async () => {
    await seedGame(db, {
      path: "/games/unfav-batch-1",
      title: "Unfav Batch 1",
      source: "/library/path",
      fingerprint: "fp-unfav-batch-1",
    });
    await seedUserGameData(db, "/games/unfav-batch-1", {
      isFavorite: true,
    });

    await seedGame(db, {
      path: "/games/unfav-batch-2",
      title: "Unfav Batch 2",
      source: "/library/path",
      fingerprint: "fp-unfav-batch-2",
    });
    await seedUserGameData(db, "/games/unfav-batch-2", {
      isFavorite: true,
    });

    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/unfav-batch-1", "/games/unfav-batch-2"],
      field: "is_favorite",
      value: false,
    });

    expect(result.field).toBe("is_favorite");
    expect(result.updatedCount).toBe(2);

    const userData1 = await db("userGameData")
      .where("fingerprint", "fp-unfav-batch-1")
      .first();
    expect(userData1.isFavorite).toBe(0);

    const userData2 = await db("userGameData")
      .where("fingerprint", "fp-unfav-batch-2")
      .first();
    expect(userData2.isFavorite).toBe(0);
  });
});

// ============================================
// batchToggleGamesHandler — isClear 일괄 업데이트
// ============================================
describe("batchToggleGamesHandler — isClear 일괄 업데이트", () => {
  it("여러 게임의 isClear를 일괄적으로 true로 설정해야 한다", async () => {
    await seedGame(db, {
      path: "/games/clear-batch-1",
      title: "Clear Batch 1",
      source: "/library/path",
      fingerprint: "fp-clear-batch-1",
    });
    await seedGame(db, {
      path: "/games/clear-batch-2",
      title: "Clear Batch 2",
      source: "/library/path",
      fingerprint: "fp-clear-batch-2",
    });

    const result = await batchToggleGamesHandler({} as any, {
      paths: ["/games/clear-batch-1", "/games/clear-batch-2"],
      field: "is_clear",
      value: true,
    });

    expect(result.field).toBe("is_clear");
    expect(result.updatedCount).toBe(2);

    const userData1 = await db("userGameData")
      .where("fingerprint", "fp-clear-batch-1")
      .first();
    expect(userData1).toBeDefined();
    expect(userData1.isClear).toBe(1);

    const userData2 = await db("userGameData")
      .where("fingerprint", "fp-clear-batch-2")
      .first();
    expect(userData2).toBeDefined();
    expect(userData2.isClear).toBe(1);
  });
});

// ============================================
// setExecutablePathHandler — 정상 업데이트
// ============================================
describe("setExecutablePathHandler — 실행 파일 경로 지정", () => {
  it("게임의 executablePath를 업데이트해야 한다", async () => {
    await seedGame(db, {
      path: "/games/set-exe",
      title: "Set Exe Game",
      source: "/library/path",
    });

    const result = await setExecutablePathHandler({} as any, {
      path: "/games/set-exe",
      executablePath: "/games/set-exe/game.exe",
    });

    expect(result.path).toBe("/games/set-exe");
    expect(result.executablePath).toBe("/games/set-exe/game.exe");

    // DB 확인
    const game = await db("games").where("path", "/games/set-exe").first();
    expect(game!.executablePath).toBe("/games/set-exe/game.exe");
  });

  it("존재하지 않는 게임에 실행 파일 경로를 설정하면 에러가 발생해야 한다", async () => {
    await expect(
      setExecutablePathHandler({} as any, {
        path: "/games/nonexistent",
        executablePath: "/games/nonexistent/game.exe",
      }),
    ).rejects.toThrow("게임을 찾을 수 없습니다.");
  });

  it("executablePath를 다른 값으로 변경할 수 있어야 한다", async () => {
    await seedGame(db, {
      path: "/games/change-exe",
      title: "Change Exe Game",
      source: "/library/path",
      executablePath: "/games/change-exe/old.exe",
    });

    const result = await setExecutablePathHandler({} as any, {
      path: "/games/change-exe",
      executablePath: "/games/change-exe/new.exe",
    });

    expect(result.executablePath).toBe("/games/change-exe/new.exe");

    const game = await db("games").where("path", "/games/change-exe").first();
    expect(game!.executablePath).toBe("/games/change-exe/new.exe");
  });
});

// ============================================
// getExcludedExecutablesHandler — 실행 제외 목록 조회
// ============================================
describe("getExcludedExecutablesHandler — 실행 제외 목록 조회", () => {
  it("store에서 실행 제외 목록을 반환해야 한다", async () => {
    const result = await getExcludedExecutablesHandler(
      {} as any,
      undefined as any,
    );

    // store 모킹에서 ["Config.exe", "Uninstall.exe"] 반환
    expect(result.executables).toEqual(["Config.exe", "Uninstall.exe"]);
  });
});

// ============================================
// addExcludedExecutableHandler — 실행 제외 목록 추가
// ============================================
describe("addExcludedExecutableHandler — 실행 제외 목록 추가", () => {
  it("파일명만 추출하여 store에 추가해야 한다", async () => {
    const result = await addExcludedExecutableHandler({} as any, {
      executable: "Setup.exe",
    });

    expect(result.executable).toBe("Setup.exe");
    expect(addExcludedExecutable).toHaveBeenCalledWith("Setup.exe");
  });

  it("경로가 포함된 경우 파일명만 추출해야 한다 (Unix 경로)", async () => {
    const result = await addExcludedExecutableHandler({} as any, {
      executable: "/games/some-game/Config.exe",
    });

    expect(result.executable).toBe("Config.exe");
    expect(addExcludedExecutable).toHaveBeenCalledWith("Config.exe");
  });

  it("경로가 포함된 경우 파일명만 추출해야 한다 (Windows 경로)", async () => {
    const result = await addExcludedExecutableHandler({} as any, {
      executable: "C:\\Games\\SomeGame\\Uninstall.exe",
    });

    expect(result.executable).toBe("Uninstall.exe");
    expect(addExcludedExecutable).toHaveBeenCalledWith("Uninstall.exe");
  });
});

// ============================================
// removeExcludedExecutableHandler — 실행 제외 목록 제거
// ============================================
describe("removeExcludedExecutableHandler — 실행 제외 목록 제거", () => {
  it("store에서 실행 제외 항목을 제거해야 한다", async () => {
    const result = await removeExcludedExecutableHandler({} as any, {
      executable: "Config.exe",
    });

    expect(result.executable).toBe("Config.exe");
    expect(removeExcludedExecutable).toHaveBeenCalledWith("Config.exe");
  });
});

// ============================================
// openOriginalSiteHandler — 원본 사이트 열기
// ============================================
describe("openOriginalSiteHandler — 원본 사이트 열기", () => {
  it("DLSite provider가 있는 게임의 원본 사이트를 열어야 한다", async () => {
    await seedGame(db, {
      path: "/games/dlsite-game",
      title: "DLSite Game",
      source: "/library/path",
      provider: "dlsite",
      externalId: "RJ123456",
    });

    await openOriginalSiteHandler({} as any, {
      path: "/games/dlsite-game",
    });

    expect(shell.openExternal).toHaveBeenCalledWith(
      "https://www.dlsite.com/maniax/work/=/product_id/RJ123456.html",
    );
  });

  it("Steam provider가 있는 게임의 원본 사이트를 열어야 한다", async () => {
    await seedGame(db, {
      path: "/games/steam-game",
      title: "Steam Game",
      source: "/library/path",
      provider: "steam",
      externalId: "12345",
    });

    await openOriginalSiteHandler({} as any, {
      path: "/games/steam-game",
    });

    expect(shell.openExternal).toHaveBeenCalledWith(
      "https://store.steampowered.com/app/12345",
    );
  });

  it("provider 정보가 없는 게임은 에러가 발생해야 한다", async () => {
    await seedGame(db, {
      path: "/games/no-provider",
      title: "No Provider Game",
      source: "/library/path",
      provider: null,
      externalId: null,
    });

    await expect(
      openOriginalSiteHandler({} as any, {
        path: "/games/no-provider",
      }),
    ).rejects.toThrow("원본 사이트 정보가 없습니다.");
  });

  it("provider만 있고 externalId가 없는 게임은 에러가 발생해야 한다", async () => {
    await seedGame(db, {
      path: "/games/no-external-id",
      title: "No External ID Game",
      source: "/library/path",
      provider: "dlsite",
      externalId: null,
    });

    await expect(
      openOriginalSiteHandler({} as any, {
        path: "/games/no-external-id",
      }),
    ).rejects.toThrow("원본 사이트 정보가 없습니다.");
  });

  it("존재하지 않는 게임은 에러가 발생해야 한다", async () => {
    await expect(
      openOriginalSiteHandler({} as any, {
        path: "/games/nonexistent",
      }),
    ).rejects.toThrow("원본 사이트 정보가 없습니다.");
  });

  it("지원하지 않는 provider인 경우 URL 생성 실패 에러가 발생해야 한다", async () => {
    await seedGame(db, {
      path: "/games/unknown-provider",
      title: "Unknown Provider Game",
      source: "/library/path",
      provider: "unknown",
      externalId: "99999",
    });

    await expect(
      openOriginalSiteHandler({} as any, {
        path: "/games/unknown-provider",
      }),
    ).rejects.toThrow("원본 사이트 URL을 생성할 수 없습니다.");
  });
});
