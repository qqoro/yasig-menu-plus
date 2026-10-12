/**
 * games-read 툴 테스트 — 인메모리 SQLite
 */
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
  seedGameImage,
  seedGameTag,
  seedGameMaker,
  seedGameCategory,
} from "../../db/test-utils.js";

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock("../../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));
vi.mock("../../utils/validator.js", () => ({
  validatePath: vi.fn(),
  validateDirectoryPath: vi.fn(),
  validateSearchQuery: vi.fn(),
  validateUrl: vi.fn(),
}));
vi.mock("../../store.js", () => ({
  getTranslationSettings: () => ({
    titleDisplayPriority: ["translated", "collected", "original"],
  }),
  DEFAULT_TITLE_DISPLAY_PRIORITY: ["translated", "collected", "original"],
  getExcludedExecutables: () => [],
  getLibraryPaths: () => ["/library/path"],
  getDisabledLibraryPaths: () => [],
  getOfflineLibraryPaths: () => [],
  getScanDepth: () => 5,
  getEnableNonGameContent: () => false,
}));
vi.mock("../../utils/downloader.js", () => ({
  deleteImage: vi.fn(),
  downloadImage: vi.fn(),
  deleteThumbnail: vi.fn(),
}));
vi.mock("../../workers/run-scan-worker.js", () => ({ runScanWorker: vi.fn() }));
vi.mock("../../lib/fingerprint.js", () => ({
  computeFingerprint: vi.fn(() => Promise.resolve("mock-fp")),
}));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: { getKnex: () => dbRef.current! },
}));

import {
  exportGameListTool,
  findDuplicatesTool,
  getGameImagesTool,
  getGameTool,
  listCategories,
  listMakers,
  listTags,
  searchGamesTool,
} from "./games-read.js";

beforeAll(async () => {
  dbRef.current = await createTestDb();
});
afterAll(async () => {
  await dbRef.current?.destroy();
});
beforeEach(async () => {
  await truncateAll(dbRef.current!);
});

describe("searchGamesTool", () => {
  it("활성 라이브러리의 게임을 요약 형태로 돌려줘야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a", title: "Alpha" });
    await seedGame(dbRef.current!, { path: "/games/b", title: "Beta" });
    const result = await searchGamesTool({ limit: 50, offset: 0 });
    expect(result.total).toBe(2);
    expect(result.games.map((g) => g.path)).toEqual(["/games/a", "/games/b"]);
    expect(result.games[0]).not.toHaveProperty("source");
  });

  it("limit/offset을 적용해야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a", title: "Alpha" });
    await seedGame(dbRef.current!, { path: "/games/b", title: "Beta" });
    const result = await searchGamesTool({ limit: 1, offset: 1 });
    expect(result.total).toBe(2);
    expect(result.games.map((g) => g.path)).toEqual(["/games/b"]);
    expect(result.limit).toBe(1);
    expect(result.offset).toBe(1);
  });

  it("query로 제목을 검색해야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a", title: "Alpha" });
    await seedGame(dbRef.current!, { path: "/games/b", title: "Beta" });
    const result = await searchGamesTool({
      query: "Bet",
      limit: 50,
      offset: 0,
    });
    expect(result.games.map((g) => g.path)).toEqual(["/games/b"]);
  });
});

describe("getGameTool", () => {
  it("상세 요약을 돌려줘야 한다", async () => {
    await seedGame(dbRef.current!, {
      path: "/games/a",
      title: "Alpha",
      memo: "m",
    });
    const game = await getGameTool({ path: "/games/a" });
    expect(game.title).toBe("Alpha");
    expect(game.memo).toBe("m");
  });

  it("없는 게임이면 오류를 던져야 한다", async () => {
    await expect(getGameTool({ path: "/none" })).rejects.toThrow(
      "게임을 찾을 수 없습니다.",
    );
  });
});

describe("listTags / listMakers / listCategories", () => {
  it("이름과 게임 수를 count 내림차순으로 돌려줘야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a" });
    await seedGame(dbRef.current!, { path: "/games/b" });
    await seedGameTag(dbRef.current!, "/games/a", "rare");
    await seedGameTag(dbRef.current!, "/games/a", "common");
    await seedGameTag(dbRef.current!, "/games/b", "common");
    await seedGameMaker(dbRef.current!, "/games/a", "circle1");
    await seedGameCategory(dbRef.current!, "/games/b", "RPG");

    expect(await listTags()).toEqual([
      { name: "common", count: 2 },
      { name: "rare", count: 1 },
    ]);
    expect(await listMakers()).toEqual([{ name: "circle1", count: 1 }]);
    expect(await listCategories()).toEqual([{ name: "RPG", count: 1 }]);
  });
});

describe("getGameImagesTool", () => {
  it("이미지 경로 목록을 돌려줘야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a" });
    await seedGameImage(dbRef.current!, "/games/a", "img1.jpg", 0);
    const result = await getGameImagesTool({ path: "/games/a" });
    expect(result).toEqual([{ path: "/absolute/img1.jpg", sortOrder: 0 }]);
  });
});

describe("findDuplicatesTool", () => {
  it("같은 externalId 게임을 그룹으로 묶고 게임은 요약 형태여야 한다", async () => {
    await seedGame(dbRef.current!, {
      path: "/games/a",
      provider: "dlsite",
      externalId: "RJ1",
    });
    await seedGame(dbRef.current!, {
      path: "/games/b",
      provider: "dlsite",
      externalId: "RJ1",
    });
    const groups = await findDuplicatesTool();
    expect(groups).toHaveLength(1);
    expect(groups[0].type).toBe("externalId");
    expect(groups[0].games.map((g) => g.path).sort()).toEqual([
      "/games/a",
      "/games/b",
    ]);
    expect(groups[0].games[0]).not.toHaveProperty("source");
  });
});

describe("exportGameListTool", () => {
  it("path 열이 빠진 요청에도 path를 끝에 붙여야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a", title: "Alpha" });
    const result = await exportGameListTool({
      columns: ["title"],
      includeHeader: true,
    });
    expect(result.columns).toEqual(["title", "path"]);
    expect(result.rowCount).toBe(1);
    expect(result.tsv).toBe("제목\t경로\nAlpha\t/games/a\n");
  });

  it("columns를 생략하면 앱 기본 열을 쓰고 헤더를 포함해야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a", title: "Alpha" });
    const result = await exportGameListTool({ includeHeader: true });
    expect(result.columns).toContain("path");
    expect(result.columns).toContain("title");
    expect(result.tsv.startsWith("제목\t")).toBe(true);
  });
});
