import type { Knex } from "knex";
import {
  afterAll,
  afterEach,
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

// fs/promises 모킹 — 프로덕션 코드가 fs/promises를 사용
vi.mock("fs/promises", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    access: vi.fn(() => Promise.resolve()),
    rm: vi.fn(() => Promise.resolve()),
    stat: vi.fn(() =>
      Promise.resolve({
        birthtime: new Date(),
        mtime: new Date(),
        isDirectory: () => true,
        size: 100,
      }),
    ),
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
// findDuplicatesHandler — 검사 범위·기준 옵션
// ============================================
describe("findDuplicatesHandler — 검사 옵션", () => {
  it("excludedSources의 라이브러리 게임은 비교 대상에서 빠진다", async () => {
    await seedGame(db, {
      path: "/lib-a/x",
      title: "X",
      originalTitle: "같은 폴더명",
      source: "/lib-a",
    });
    await seedGame(db, {
      path: "/lib-b/x",
      title: "X",
      originalTitle: "같은 폴더명",
      source: "/lib-b",
    });

    const all = await findDuplicatesHandler({} as any, {});
    expect(all.groups).toHaveLength(1);

    const scoped = await findDuplicatesHandler({} as any, {
      excludedSources: ["/lib-b"],
    });
    expect(scoped.groups).toHaveLength(0);
  });

  it("서로 다른 라이브러리끼리도 중복으로 묶인다", async () => {
    await seedGame(db, {
      path: "/lib-a/y",
      title: "Y",
      originalTitle: "Y",
      source: "/lib-a",
      fingerprint: "fp-same",
    });
    await seedGame(db, {
      path: "/lib-b/y-copy",
      title: "Y copy",
      originalTitle: "Y 사본",
      source: "/lib-b",
      fingerprint: "fp-same",
    });

    const result = await findDuplicatesHandler({} as any, {
      excludedSources: ["/lib-c"],
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].type).toBe("fingerprint");
  });

  it("criteria에 없는 기준으로는 묶지 않는다", async () => {
    await seedGame(db, {
      path: "/games/p",
      title: "P",
      originalTitle: "P",
      source: "/lib",
      provider: "dlsite",
      externalId: "RJ000001",
    });
    await seedGame(db, {
      path: "/games/q",
      title: "Q",
      originalTitle: "Q",
      source: "/lib",
      provider: "dlsite",
      externalId: "RJ000001",
    });

    const result = await findDuplicatesHandler({} as any, {
      criteria: ["fingerprint", "originalTitle"],
    });

    expect(result.groups).toHaveLength(0);
  });

  it("앞 기준을 끄면 그 게임들이 다음 기준으로 검사된다", async () => {
    // 코드도 같고 폴더명도 같은 두 게임: 기본은 코드 그룹, 코드를 끄면 폴더명 그룹
    for (const path of ["/games/r1", "/games/r2"]) {
      await seedGame(db, {
        path,
        title: "R",
        originalTitle: "같은 이름",
        source: "/lib",
        provider: "dlsite",
        externalId: "RJ000002",
      });
    }

    const byDefault = await findDuplicatesHandler({} as any, {});
    expect(byDefault.groups.map((g) => g.type)).toEqual(["externalId"]);

    const withoutCode = await findDuplicatesHandler({} as any, {
      criteria: ["originalTitle"],
    });
    expect(withoutCode.groups.map((g) => g.type)).toEqual(["originalTitle"]);
  });

  it("기준을 모두 끄면 빈 결과", async () => {
    await seedGame(db, {
      path: "/games/s1",
      title: "S",
      originalTitle: "S",
      source: "/lib",
    });
    await seedGame(db, {
      path: "/games/s2",
      title: "S",
      originalTitle: "S",
      source: "/lib",
    });

    const result = await findDuplicatesHandler({} as any, { criteria: [] });

    expect(result.groups).toHaveLength(0);
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
  it("pathExists가 true인 경로에 대해 shell.trashItem이 호출되어야 한다", async () => {
    // fs/promises의 access는 기본적으로 resolve() (경로 존재)
    const { access } = await import("fs/promises");
    vi.mocked(access).mockResolvedValue(undefined);

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

  it("pathExists가 false인 경로에 대해 shell.trashItem이 호출되지 않아야 한다", async () => {
    // access가 reject되면 pathExists가 false를 반환
    const { access } = await import("fs/promises");
    vi.mocked(access).mockRejectedValue(new Error("ENOENT"));

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

  it("경로가 없으면 휴지통 이동 없이 DB에서만 삭제한다", async () => {
    const { access } = await import("fs/promises");
    vi.mocked(access).mockRejectedValue(new Error("ENOENT"));

    await seedGame(db, {
      path: "/games/gone",
      title: "Gone",
      originalTitle: "사라진 게임",
      source: "/lib",
    });

    const result = await deleteGamesHandler({} as any, {
      paths: ["/games/gone"],
    });

    expect(result).toEqual({ deletedCount: 1, failed: [] });
    expect(await db("games").where("path", "/games/gone").first()).toBe(
      undefined,
    );
  });
});

// ============================================
// deleteGamesHandler — 휴지통 이동 실패
// ============================================
describe("deleteGamesHandler — 휴지통 이동 실패", () => {
  beforeEach(async () => {
    const { access } = await import("fs/promises");
    vi.mocked(access).mockResolvedValue(undefined);
  });

  afterEach(() => {
    // clearAllMocks는 구현을 지우지 않으므로 다른 테스트로 새지 않게 초기화
    vi.mocked(shell.trashItem).mockReset();
  });

  it("휴지통 이동에 실패한 게임은 DB와 썸네일을 남기고 실패 목록으로 알린다", async () => {
    vi.mocked(shell.trashItem).mockRejectedValueOnce(
      new Error("Failed to perform delete operation"),
    );
    await seedGame(db, {
      path: "/games/locked",
      title: "Locked",
      originalTitle: "잠긴 게임",
      source: "/lib",
      thumbnail: "thumb-locked.webp",
    });
    await seedGameTag(db, "/games/locked", "rpg");
    await seedGameImage(db, "/games/locked", "locked-1.webp", 0);

    const result = await deleteGamesHandler({} as any, {
      paths: ["/games/locked"],
    });

    expect(result).toEqual({
      deletedCount: 0,
      failed: [
        {
          path: "/games/locked",
          title: "Locked",
          message: "Failed to perform delete operation",
        },
      ],
    });
    expect(await db("games").where("path", "/games/locked").first()).toEqual(
      expect.objectContaining({ path: "/games/locked" }),
    );
    expect(
      await db("gameTags").where("gamePath", "/games/locked").select(),
    ).toHaveLength(1);
    expect(
      await db("gameImages").where("gamePath", "/games/locked").select(),
    ).toHaveLength(1);
    expect(deleteImage).not.toHaveBeenCalled();
  });

  it("일부만 실패하면 성공한 게임만 삭제한다", async () => {
    vi.mocked(shell.trashItem).mockImplementation(async (path: string) => {
      if (path === "/games/fail") {
        throw new Error("Failed to perform delete operation");
      }
    });
    await seedGame(db, {
      path: "/games/ok",
      title: "OK",
      originalTitle: "성공",
      source: "/lib",
      thumbnail: "thumb-ok.webp",
    });
    await seedGame(db, {
      path: "/games/fail",
      title: "Fail",
      originalTitle: "실패",
      source: "/lib",
      thumbnail: "thumb-fail.webp",
    });

    const result = await deleteGamesHandler({} as any, {
      paths: ["/games/ok", "/games/fail"],
    });

    expect(result.deletedCount).toBe(1);
    expect(result.failed.map((f) => f.path)).toEqual(["/games/fail"]);
    const remaining = await db("games").pluck("path");
    expect(remaining).toEqual(["/games/fail"]);
    expect(deleteImage).toHaveBeenCalledWith("/absolute/thumb-ok.webp");
    expect(deleteImage).not.toHaveBeenCalledWith("/absolute/thumb-fail.webp");
  });
});

// ============================================
// deleteGamesHandler — 영구 삭제 (휴지통 없는 네트워크 드라이브용)
// ============================================
describe("deleteGamesHandler — 영구 삭제", () => {
  beforeEach(async () => {
    const { access, rm } = await import("fs/promises");
    vi.mocked(access).mockResolvedValue(undefined);
    vi.mocked(rm).mockReset();
    vi.mocked(rm).mockResolvedValue(undefined);
  });

  it("permanent면 휴지통 대신 폴더를 직접 지우고 DB에서도 삭제한다", async () => {
    const { rm } = await import("fs/promises");
    await seedGame(db, {
      path: "//nas/games/remote",
      title: "Remote",
      originalTitle: "원격 게임",
      source: "//nas/games",
    });

    const result = await deleteGamesHandler({} as any, {
      paths: ["//nas/games/remote"],
      permanent: true,
    });

    expect(rm).toHaveBeenCalledWith("//nas/games/remote", { recursive: true });
    expect(shell.trashItem).not.toHaveBeenCalled();
    expect(result).toEqual({ deletedCount: 1, failed: [] });
    expect(await db("games").where("path", "//nas/games/remote").first()).toBe(
      undefined,
    );
  });

  it("영구 삭제에 실패하면 DB를 남기고 실패 목록으로 알린다", async () => {
    const { rm } = await import("fs/promises");
    vi.mocked(rm).mockRejectedValueOnce(new Error("EBUSY: resource busy"));
    await seedGame(db, {
      path: "//nas/games/busy",
      title: "Busy",
      originalTitle: "사용 중",
      source: "//nas/games",
    });

    const result = await deleteGamesHandler({} as any, {
      paths: ["//nas/games/busy"],
      permanent: true,
    });

    expect(result).toEqual({
      deletedCount: 0,
      failed: [
        {
          path: "//nas/games/busy",
          title: "Busy",
          message: "EBUSY: resource busy",
        },
      ],
    });
    expect(await db("games").where("path", "//nas/games/busy").first()).toEqual(
      expect.objectContaining({ path: "//nas/games/busy" }),
    );
  });
});
