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
 * findDuplicatesHandler / deleteGamesHandler 통합 테스트
 * 실행: pnpm test -- src/main/handlers/duplicates.test.ts
 */

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: {
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
    trashItem: vi.fn(),
  },
}));

// toAbsolutePath를 패스스루로 모킹
vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));

// deleteImage 모킹
vi.mock("../utils/downloader.js", () => ({
  deleteImage: vi.fn(),
}));

// fs 모킹 — existsSync/statSync는 duplicates.ts에서 파일 정보 조회에 사용
vi.mock("fs", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    statSync: vi.fn(() => ({
      birthtime: new Date("2025-01-01"),
      mtime: new Date("2025-06-01"),
    })),
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
import { findDuplicatesHandler, deleteGamesHandler } from "./duplicates.js";
import { deleteImage } from "../utils/downloader.js";
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
// findDuplicatesHandler — provider+externalId 중복
// ============================================
describe("findDuplicatesHandler — provider+externalId 중복", () => {
  it("같은 provider+externalId를 가진 게임 2개 → 1개 그룹 (type: externalId)", async () => {
    await seedGame(db, {
      path: "/games/game-a",
      title: "Game A",
      originalTitle: "Game A Original",
      source: "/lib",
      provider: "dlsite",
      externalId: "RJ123456",
    });
    await seedGame(db, {
      path: "/games/game-b",
      title: "Game B",
      originalTitle: "Game B Original",
      source: "/lib",
      provider: "dlsite",
      externalId: "RJ123456",
    });

    const result = await findDuplicatesHandler({} as any, undefined as any);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe("externalId");
    expect(result.groups[0].provider).toBe("dlsite");
    expect(result.groups[0].id).toBe("dlsite:RJ123456");
    expect(result.groups[0].games).toHaveLength(2);

    const paths = result.groups[0].games.map((g) => g.path);
    expect(paths).toContain("/games/game-a");
    expect(paths).toContain("/games/game-b");
  });
});

// ============================================
// findDuplicatesHandler — originalTitle 중복
// ============================================
describe("findDuplicatesHandler — originalTitle 중복", () => {
  it("같은 originalTitle 게임 2개 → 1개 그룹 (type: originalTitle)", async () => {
    await seedGame(db, {
      path: "/games/game-c",
      title: "Game C",
      originalTitle: "동일한 제목",
      source: "/lib",
    });
    await seedGame(db, {
      path: "/games/game-d",
      title: "Game D",
      originalTitle: "동일한 제목",
      source: "/lib",
    });

    const result = await findDuplicatesHandler({} as any, undefined as any);

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe("originalTitle");
    expect(result.groups[0].id).toBe("동일한 제목");
    expect(result.groups[0].games).toHaveLength(2);

    const paths = result.groups[0].games.map((g) => g.path);
    expect(paths).toContain("/games/game-c");
    expect(paths).toContain("/games/game-d");
  });
});

// ============================================
// findDuplicatesHandler — externalId 그룹 우선
// ============================================
describe("findDuplicatesHandler — externalId 그룹 우선", () => {
  it("externalId 그룹에 포함된 게임은 title 그룹에서 제외되어야 한다", async () => {
    // 같은 externalId + 같은 originalTitle을 가진 게임 2개
    await seedGame(db, {
      path: "/games/game-e",
      title: "Game E",
      originalTitle: "공통 제목",
      source: "/lib",
      provider: "steam",
      externalId: "12345",
    });
    await seedGame(db, {
      path: "/games/game-f",
      title: "Game F",
      originalTitle: "공통 제목",
      source: "/lib",
      provider: "steam",
      externalId: "12345",
    });

    const result = await findDuplicatesHandler({} as any, undefined as any);

    // externalId 그룹 1개만 존재해야 함 (originalTitle 그룹은 없어야 함)
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe("externalId");
    expect(result.groups[0].games).toHaveLength(2);
  });

  it("externalId 그룹에 속하지 않은 게임만 title 그룹에 포함되어야 한다", async () => {
    // externalId 중복 그룹 (game-1, game-2)
    await seedGame(db, {
      path: "/games/game-1",
      title: "Game 1",
      originalTitle: "공통 제목",
      source: "/lib",
      provider: "dlsite",
      externalId: "RJ999",
    });
    await seedGame(db, {
      path: "/games/game-2",
      title: "Game 2",
      originalTitle: "공통 제목",
      source: "/lib",
      provider: "dlsite",
      externalId: "RJ999",
    });
    // externalId 없지만 같은 originalTitle (game-3)
    await seedGame(db, {
      path: "/games/game-3",
      title: "Game 3",
      originalTitle: "다른 공통 제목",
      source: "/lib",
    });
    await seedGame(db, {
      path: "/games/game-4",
      title: "Game 4",
      originalTitle: "다른 공통 제목",
      source: "/lib",
    });

    const result = await findDuplicatesHandler({} as any, undefined as any);

    expect(result.groups).toHaveLength(2);

    const externalIdGroup = result.groups.find((g) => g.type === "externalId");
    const titleGroup = result.groups.find((g) => g.type === "originalTitle");

    expect(externalIdGroup).toBeDefined();
    expect(externalIdGroup!.games).toHaveLength(2);

    expect(titleGroup).toBeDefined();
    expect(titleGroup!.games).toHaveLength(2);

    // title 그룹에는 game-1, game-2가 포함되지 않아야 함
    const titlePaths = titleGroup!.games.map((g) => g.path);
    expect(titlePaths).not.toContain("/games/game-1");
    expect(titlePaths).not.toContain("/games/game-2");
    expect(titlePaths).toContain("/games/game-3");
    expect(titlePaths).toContain("/games/game-4");
  });
});

// ============================================
// findDuplicatesHandler — 중복 없음
// ============================================
describe("findDuplicatesHandler — 중복 없음", () => {
  it("모든 게임이 고유하면 빈 배열을 반환해야 한다", async () => {
    await seedGame(db, {
      path: "/games/unique-1",
      title: "Unique 1",
      originalTitle: "고유 제목 1",
      source: "/lib",
      provider: "dlsite",
      externalId: "RJ001",
    });
    await seedGame(db, {
      path: "/games/unique-2",
      title: "Unique 2",
      originalTitle: "고유 제목 2",
      source: "/lib",
      provider: "steam",
      externalId: "100",
    });

    const result = await findDuplicatesHandler({} as any, undefined as any);

    expect(result.groups).toEqual([]);
  });

  it("DB가 비어있으면 빈 배열을 반환해야 한다", async () => {
    const result = await findDuplicatesHandler({} as any, undefined as any);

    expect(result.groups).toEqual([]);
  });
});

// ============================================
// findDuplicatesHandler — 단독 게임 미포함
// ============================================
describe("findDuplicatesHandler — 단독 게임 미포함", () => {
  it("그룹 크기가 1인 경우 결과에 포함되지 않아야 한다", async () => {
    // externalId가 같은 게임이 1개뿐
    await seedGame(db, {
      path: "/games/solo-ext",
      title: "Solo External",
      originalTitle: "솔로 제목",
      source: "/lib",
      provider: "dlsite",
      externalId: "RJ555",
    });
    // originalTitle이 같은 게임이 1개뿐
    await seedGame(db, {
      path: "/games/solo-title",
      title: "Solo Title",
      originalTitle: "단독 제목",
      source: "/lib",
    });

    const result = await findDuplicatesHandler({} as any, undefined as any);

    expect(result.groups).toEqual([]);
  });
});

// ============================================
// findDuplicatesHandler — 관계 데이터 포함 확인
// ============================================
describe("findDuplicatesHandler — 관계 데이터", () => {
  it("각 게임에 makers, categories, tags가 포함되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/rel-a",
      title: "Rel A",
      originalTitle: "관계 테스트",
      source: "/lib",
    });
    await seedGame(db, {
      path: "/games/rel-b",
      title: "Rel B",
      originalTitle: "관계 테스트",
      source: "/lib",
    });

    await seedGameMaker(db, "/games/rel-a", "Circle X");
    await seedGameCategory(db, "/games/rel-a", "RPG");
    await seedGameTag(db, "/games/rel-a", "pixel-art");

    const result = await findDuplicatesHandler({} as any, undefined as any);

    expect(result.groups).toHaveLength(1);

    const gameA = result.groups[0].games.find((g) => g.path === "/games/rel-a");
    expect(gameA).toBeDefined();
    expect(gameA!.makers).toContain("Circle X");
    expect(gameA!.categories).toContain("RPG");
    expect(gameA!.tags).toContain("pixel-art");

    // 관계 데이터가 없는 게임은 빈 배열
    const gameB = result.groups[0].games.find((g) => g.path === "/games/rel-b");
    expect(gameB).toBeDefined();
    expect(gameB!.makers).toEqual([]);
    expect(gameB!.categories).toEqual([]);
    expect(gameB!.tags).toEqual([]);
  });
});

// ============================================
// deleteGamesHandler — 게임 삭제
// ============================================
describe("deleteGamesHandler — 게임 삭제", () => {
  it("DB에서 게임 및 관계 데이터가 삭제되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/del-target",
      title: "Delete Target",
      originalTitle: "삭제 대상",
      source: "/lib",
      thumbnail: "thumb123.webp",
    });

    // 관계 데이터 삽입
    await seedGameMaker(db, "/games/del-target", "Maker A");
    await seedGameCategory(db, "/games/del-target", "Action");
    await seedGameTag(db, "/games/del-target", "3d");
    await seedGameImage(db, "/games/del-target", "img001.webp", 0);

    const result = await deleteGamesHandler({} as any, {
      paths: ["/games/del-target"],
    });

    expect(result.deletedCount).toBe(1);

    // games 테이블에서 삭제 확인
    const game = await db("games").where("path", "/games/del-target").first();
    expect(game).toBeUndefined();

    // 관계 테이블에서 삭제 확인
    const makers = await db("gameMakers")
      .where("gamePath", "/games/del-target")
      .select();
    expect(makers).toHaveLength(0);

    const categories = await db("gameCategories")
      .where("gamePath", "/games/del-target")
      .select();
    expect(categories).toHaveLength(0);

    const tags = await db("gameTags")
      .where("gamePath", "/games/del-target")
      .select();
    expect(tags).toHaveLength(0);

    const images = await db("gameImages")
      .where("gamePath", "/games/del-target")
      .select();
    expect(images).toHaveLength(0);
  });

  it("썸네일 및 이미지 파일 삭제가 호출되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/del-media",
      title: "Delete Media",
      originalTitle: "미디어 삭제",
      source: "/lib",
      thumbnail: "thumb-media.webp",
    });
    await seedGameImage(db, "/games/del-media", "carousel-1.webp", 0);
    await seedGameImage(db, "/games/del-media", "carousel-2.webp", 1);

    await deleteGamesHandler({} as any, {
      paths: ["/games/del-media"],
    });

    // deleteImage가 썸네일 + 이미지 파일에 대해 호출되었는지 확인
    // 썸네일 1개 + 이미지 2개 = 총 3회
    expect(deleteImage).toHaveBeenCalledTimes(3);
    expect(deleteImage).toHaveBeenCalledWith("/absolute/thumb-media.webp");
    expect(deleteImage).toHaveBeenCalledWith("/absolute/carousel-1.webp");
    expect(deleteImage).toHaveBeenCalledWith("/absolute/carousel-2.webp");
  });

  it("여러 게임을 한번에 삭제할 수 있어야 한다", async () => {
    await seedGame(db, {
      path: "/games/multi-1",
      title: "Multi 1",
      originalTitle: "멀티 1",
      source: "/lib",
    });
    await seedGame(db, {
      path: "/games/multi-2",
      title: "Multi 2",
      originalTitle: "멀티 2",
      source: "/lib",
    });

    const result = await deleteGamesHandler({} as any, {
      paths: ["/games/multi-1", "/games/multi-2"],
    });

    expect(result.deletedCount).toBe(2);

    const remaining = await db("games").select();
    expect(remaining).toHaveLength(0);
  });
});

// ============================================
// deleteGamesHandler — 빈 paths
// ============================================
describe("deleteGamesHandler — 빈 paths", () => {
  it("빈 배열을 전달하면 deletedCount: 0을 반환해야 한다", async () => {
    await seedGame(db, {
      path: "/games/should-remain",
      title: "Should Remain",
      originalTitle: "남아있어야 함",
      source: "/lib",
    });

    const result = await deleteGamesHandler({} as any, { paths: [] });

    expect(result.deletedCount).toBe(0);

    // 기존 게임은 삭제되지 않아야 함
    const game = await db("games")
      .where("path", "/games/should-remain")
      .first();
    expect(game).toBeDefined();
  });
});

// ============================================
// deleteGamesHandler — shell.trashItem 호출
// ============================================
describe("deleteGamesHandler — 파일 시스템 삭제", () => {
  it("existsSync가 true인 경로에 대해 shell.trashItem이 호출되어야 한다", async () => {
    const { existsSync } = await import("fs");
    vi.mocked(existsSync).mockReturnValue(true);

    await seedGame(db, {
      path: "/games/trash-target",
      title: "Trash Target",
      originalTitle: "휴지통 이동 대상",
      source: "/lib",
    });

    await deleteGamesHandler({} as any, {
      paths: ["/games/trash-target"],
    });

    expect(shell.trashItem).toHaveBeenCalledWith("/games/trash-target");
  });

  it("existsSync가 false인 경로에 대해 shell.trashItem이 호출되지 않아야 한다", async () => {
    const { existsSync } = await import("fs");
    vi.mocked(existsSync).mockReturnValue(false);

    await seedGame(db, {
      path: "/games/missing-file",
      title: "Missing File",
      originalTitle: "파일 없음",
      source: "/lib",
    });

    await deleteGamesHandler({} as any, {
      paths: ["/games/missing-file"],
    });

    expect(shell.trashItem).not.toHaveBeenCalled();
  });
});
