/**
 * gameUpdate 핸들러 통합 테스트
 * 인메모리 SQLite를 이용하여 메타데이터 수정, 관계 CRUD를 검증한다.
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
import { createTestDb, truncateAll, seedGame } from "../db/test-utils.js";

// ========== 모킹 ==========

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
}));

vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => p,
  toRelativePath: (p: string | null) => p,
}));

vi.mock("../utils/validator.js", () => ({
  validatePath: vi.fn(),
  validateUrl: vi.fn(),
  validateDirectoryPath: vi.fn(),
  validateSearchQuery: vi.fn(),
}));

// downloader 모킹 (썸네일 함수에서 사용, 테스트 대상 아님)
vi.mock("../utils/downloader.js", () => ({
  downloadImage: vi.fn(),
  deleteImage: vi.fn(),
  deleteThumbnail: vi.fn(),
}));

// DB 모킹: getter를 통해 테스트 DB 인스턴스를 주입
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: {
    getKnex: () => dbRef.current!,
  },
}));

// ========== 테스트 대상 함수 임포트 ==========

import {
  updateGameMetadata,
  updateRating,
  addMaker,
  removeMaker,
  addCategory,
  removeCategory,
  addTag,
  removeTag,
} from "./gameUpdate.js";

// ========== 테스트 DB 초기화 ==========

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

// ========== updateGameMetadata ==========

describe("updateGameMetadata", () => {
  it("단일 필드(title)를 업데이트한다", async () => {
    await seedGame(db, { path: "/games/a", title: "Old Title" });

    await updateGameMetadata("/games/a", { title: "New Title" });

    const game = await db("games").where("path", "/games/a").first();
    expect(game!.title).toBe("New Title");
  });

  it("복수 필드(title + memo)를 동시에 업데이트한다", async () => {
    await seedGame(db, { path: "/games/b", title: "T", memo: null });

    await updateGameMetadata("/games/b", {
      title: "Updated",
      memo: "메모 텍스트",
    });

    const game = await db("games").where("path", "/games/b").first();
    expect(game!.title).toBe("Updated");
    expect(game!.memo).toBe("메모 텍스트");
  });

  it("빈 객체를 전달하면 DB가 변경되지 않는다", async () => {
    await seedGame(db, { path: "/games/c", title: "Unchanged" });

    await updateGameMetadata("/games/c", {});

    const game = await db("games").where("path", "/games/c").first();
    expect(game!.title).toBe("Unchanged");
    // 빈 객체이므로 isLoadedInfo도 변경되지 않아야 함
    expect(game!.isLoadedInfo).toBeFalsy();
  });

  it("업데이트 시 isLoadedInfo가 true로 설정된다", async () => {
    await seedGame(db, {
      path: "/games/d",
      title: "T",
      isLoadedInfo: false,
    });

    await updateGameMetadata("/games/d", { title: "Changed" });

    const game = await db("games").where("path", "/games/d").first();
    expect(game!.isLoadedInfo).toBeTruthy();
  });
});

// ========== updateRating ==========

describe("updateRating", () => {
  it("정상 범위 별점(3)을 설정하면 user_game_data가 생성되고 rating이 저장된다", async () => {
    // fingerprint를 설정해야 getOrCreateUserGameData가 user_game_data를 생성할 수 있음
    await seedGame(db, { path: "/games/r1", fingerprint: "fp-r1" });

    await updateRating("/games/r1", 3);

    const ugd = await db("userGameData").where("fingerprint", "fp-r1").first();
    expect(ugd).toBeDefined();
    expect(ugd.rating).toBe(3);
  });

  it("null 별점을 설정하면 rating이 null로 변경된다", async () => {
    await seedGame(db, { path: "/games/r2", fingerprint: "fp-r2" });

    // 먼저 별점을 설정
    await updateRating("/games/r2", 5);

    // null로 변경
    await updateRating("/games/r2", null);

    const ugd = await db("userGameData").where("fingerprint", "fp-r2").first();
    expect(ugd.rating).toBeNull();
  });

  it("범위를 초과(6)하면 에러가 발생한다", async () => {
    await seedGame(db, { path: "/games/r3", fingerprint: "fp-r3" });

    await expect(updateRating("/games/r3", 6)).rejects.toThrow(
      "rating은 1-5 사이의 정수 또는 null이어야 합니다.",
    );
  });
});

// ========== addMaker / removeMaker ==========

describe("addMaker / removeMaker", () => {
  it("새 제작사를 추가하면 makers와 game_makers 레코드가 생성된다", async () => {
    await seedGame(db, { path: "/games/m1" });

    await addMaker("/games/m1", "TestStudio");

    const maker = await db("makers").where("name", "TestStudio").first();
    expect(maker).toBeDefined();

    const relation = await db("game_makers")
      .where("gamePath", "/games/m1")
      .where("makerId", maker!.id)
      .first();
    expect(relation).toBeDefined();
  });

  it("기존 제작사를 재사용한다 (makers 레코드 1개만 존재)", async () => {
    await seedGame(db, { path: "/games/m2a" });
    await seedGame(db, { path: "/games/m2b" });

    await addMaker("/games/m2a", "SharedStudio");
    await addMaker("/games/m2b", "SharedStudio");

    const makers = await db("makers").where("name", "SharedStudio");
    expect(makers.length).toBe(1);

    const relations = await db("game_makers").where("makerId", makers[0].id);
    expect(relations.length).toBe(2);
  });

  it("같은 제작사를 두 번 추가해도 관계는 1개만 존재한다", async () => {
    await seedGame(db, { path: "/games/m3" });

    await addMaker("/games/m3", "DuplicateStudio");
    await addMaker("/games/m3", "DuplicateStudio");

    const maker = await db("makers").where("name", "DuplicateStudio").first();
    const relations = await db("game_makers")
      .where("gamePath", "/games/m3")
      .where("makerId", maker!.id);
    expect(relations.length).toBe(1);
  });

  it("제작사를 제거하면 game_makers 관계가 삭제된다", async () => {
    await seedGame(db, { path: "/games/m4" });
    await addMaker("/games/m4", "RemoveStudio");

    await removeMaker("/games/m4", "RemoveStudio");

    const maker = await db("makers").where("name", "RemoveStudio").first();
    // 제작사 자체는 남아있어야 함
    expect(maker).toBeDefined();

    const relation = await db("game_makers")
      .where("gamePath", "/games/m4")
      .where("makerId", maker!.id)
      .first();
    expect(relation).toBeUndefined();
  });
});

// ========== addCategory / removeCategory ==========

describe("addCategory / removeCategory", () => {
  it("카테고리를 추가하면 categories와 game_categories 레코드가 생성된다", async () => {
    await seedGame(db, { path: "/games/c1" });

    await addCategory("/games/c1", "RPG");

    const category = await db("categories").where("name", "RPG").first();
    expect(category).toBeDefined();

    const relation = await db("game_categories")
      .where("gamePath", "/games/c1")
      .where("categoryId", category!.id)
      .first();
    expect(relation).toBeDefined();
  });

  it("카테고리를 제거하면 game_categories 관계가 삭제된다", async () => {
    await seedGame(db, { path: "/games/c2" });
    await addCategory("/games/c2", "Action");

    await removeCategory("/games/c2", "Action");

    const category = await db("categories").where("name", "Action").first();
    // 카테고리 자체는 남아있어야 함
    expect(category).toBeDefined();

    const relation = await db("game_categories")
      .where("gamePath", "/games/c2")
      .where("categoryId", category!.id)
      .first();
    expect(relation).toBeUndefined();
  });

  it("같은 카테고리를 중복 추가해도 관계는 1개만 존재한다", async () => {
    await seedGame(db, { path: "/games/c3" });

    await addCategory("/games/c3", "Puzzle");
    await addCategory("/games/c3", "Puzzle");

    const category = await db("categories").where("name", "Puzzle").first();
    const relations = await db("game_categories")
      .where("gamePath", "/games/c3")
      .where("categoryId", category!.id);
    expect(relations.length).toBe(1);
  });
});

// ========== addTag / removeTag ==========

describe("addTag / removeTag", () => {
  it("태그를 추가하면 tags와 game_tags 레코드가 생성된다", async () => {
    await seedGame(db, { path: "/games/t1" });

    await addTag("/games/t1", "pixel");

    const tag = await db("tags").where("name", "pixel").first();
    expect(tag).toBeDefined();

    const relation = await db("game_tags")
      .where("gamePath", "/games/t1")
      .where("tagId", tag!.id)
      .first();
    expect(relation).toBeDefined();
  });

  it("태그를 제거하면 game_tags 관계가 삭제된다", async () => {
    await seedGame(db, { path: "/games/t2" });
    await addTag("/games/t2", "retro");

    await removeTag("/games/t2", "retro");

    const tag = await db("tags").where("name", "retro").first();
    // 태그 자체는 남아있어야 함
    expect(tag).toBeDefined();

    const relation = await db("game_tags")
      .where("gamePath", "/games/t2")
      .where("tagId", tag!.id)
      .first();
    expect(relation).toBeUndefined();
  });

  it("같은 태그를 중복 추가해도 관계는 1개만 존재한다", async () => {
    await seedGame(db, { path: "/games/t3" });

    await addTag("/games/t3", "2d");
    await addTag("/games/t3", "2d");

    const tag = await db("tags").where("name", "2d").first();
    const relations = await db("game_tags")
      .where("gamePath", "/games/t3")
      .where("tagId", tag!.id);
    expect(relations.length).toBe(1);
  });
});
