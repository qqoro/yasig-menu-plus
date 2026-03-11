import type { Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDb,
  seedCategory,
  seedGame,
  seedGameCategory,
  seedGameImage,
  seedGameMaker,
  seedGameTag,
  seedMaker,
  seedTag,
  seedUserGameData,
  truncateAll,
} from "./test-utils.js";

/**
 * 테스트 인프라 (test-utils) 검증
 * 실행: pnpm test -- src/main/db/test-utils.test.ts
 */

// electron 모듈 모킹 — 마이그레이션에서 import { app } from "electron" 사용
vi.mock("electron", () => ({
  app: {
    getPath: () => "/mock/userData",
    isPackaged: false,
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
}));

let db: Knex;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  if (db) {
    await db.destroy();
  }
});

// ============================================
// createTestDb — DB 생성 및 테이블 확인
// ============================================
describe("createTestDb", () => {
  it("모든 테이블이 생성되어야 한다", async () => {
    // SQLite에서 테이블 목록 조회
    const tables = await db.raw(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'knex_%' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );

    const tableNames = tables.map((t: any) => t.name);

    expect(tableNames).toContain("games");
    expect(tableNames).toContain("makers");
    expect(tableNames).toContain("categories");
    expect(tableNames).toContain("tags");
    expect(tableNames).toContain("game_makers");
    expect(tableNames).toContain("game_categories");
    expect(tableNames).toContain("game_tags");
    expect(tableNames).toContain("game_images");
    expect(tableNames).toContain("play_sessions");
    expect(tableNames).toContain("user_game_data");
  });

  it("외래키가 활성화되어야 한다", async () => {
    const result = await db.raw("PRAGMA foreign_keys");
    // postProcessResponse가 snake_case → camelCase 변환하므로 foreignKeys
    expect(result[0].foreignKeys).toBe(1);
  });
});

// ============================================
// postProcessResponse / wrapIdentifier
// ============================================
describe("snake_case ↔ camelCase 변환", () => {
  it("조회 결과가 camelCase로 변환되어야 한다 (postProcessResponse)", async () => {
    await seedGame(db);
    const game = await db("games").first();

    // snake_case 컬럼이 camelCase로 변환됨
    expect(game).toHaveProperty("originalTitle");
    expect(game).toHaveProperty("isLoadedInfo");
    expect(game).toHaveProperty("isHidden");
    expect(game).toHaveProperty("isCompressFile");
    expect(game).toHaveProperty("executablePath");
    // snake_case 키는 없어야 한다
    expect(game).not.toHaveProperty("original_title");
    expect(game).not.toHaveProperty("is_loaded_info");
  });

  it("camelCase 컬럼명으로 where 조건을 사용할 수 있어야 한다 (wrapIdentifier)", async () => {
    await seedGame(db, {
      path: "/test/game1",
      originalTitle: "folder-name",
    });

    const game = await db("games")
      .where("originalTitle", "folder-name")
      .first();

    expect(game).toBeDefined();
    expect(game!.path).toBe("/test/game1");
  });

  it("camelCase 컬럼명으로 orderBy를 사용할 수 있어야 한다", async () => {
    await seedGame(db, { path: "/b", title: "B Game" });
    await seedGame(db, { path: "/a", title: "A Game" });

    const games = await db("games").orderBy("title", "asc");

    expect(games).toHaveLength(2);
    expect(games[0].title).toBe("A Game");
    expect(games[1].title).toBe("B Game");
  });
});

// ============================================
// truncateAll
// ============================================
describe("truncateAll", () => {
  it("모든 테이블의 데이터가 삭제되어야 한다", async () => {
    // 데이터 삽입
    const game = await seedGame(db);
    await seedGameMaker(db, game.path, "TestMaker");
    await seedGameCategory(db, game.path, "TestCategory");
    await seedGameTag(db, game.path, "TestTag");
    await seedGameImage(db, game.path, "thumb.jpg", 0);
    await seedUserGameData(db, game.path);

    // 삭제
    await truncateAll(db);

    // 모든 테이블이 비어있는지 확인
    const games = await db("games");
    const makers = await db("makers");
    const categories = await db("categories");
    const tags = await db("tags");
    const userGameData = await db("userGameData");

    expect(games).toHaveLength(0);
    expect(makers).toHaveLength(0);
    expect(categories).toHaveLength(0);
    expect(tags).toHaveLength(0);
    expect(userGameData).toHaveLength(0);
  });
});

// ============================================
// 시드 헬퍼 — seedGame
// ============================================
describe("seedGame", () => {
  it("기본값으로 게임을 삽입하고 반환해야 한다", async () => {
    const game = await seedGame(db);

    expect(game).toBeDefined();
    expect(game.path).toBe("/games/test-game");
    expect(game.title).toBe("Test Game");
    expect(game.originalTitle).toBe("test-game");
    expect(game.source).toBe("/library/path");
    expect(game.isHidden).toBe(0); // SQLite boolean → 0/1
  });

  it("오버라이드 값을 적용해야 한다", async () => {
    const game = await seedGame(db, {
      path: "/custom/game",
      title: "Custom Title",
      provider: "dlsite",
      externalId: "RJ123456",
    });

    expect(game.path).toBe("/custom/game");
    expect(game.title).toBe("Custom Title");
    expect(game.provider).toBe("dlsite");
    expect(game.externalId).toBe("RJ123456");
  });
});

// ============================================
// 시드 헬퍼 — seedUserGameData
// ============================================
describe("seedUserGameData", () => {
  it("게임의 fingerprint로 유저 게임 데이터를 연결해야 한다", async () => {
    const game = await seedGame(db, { fingerprint: "abc123hash" });
    const data = await seedUserGameData(db, game.path);

    expect(data).toBeDefined();
    expect(data.id).toBeGreaterThan(0);
    expect(data.totalPlayTime).toBe(0);
    expect(data.isFavorite).toBe(0);
    expect(data.isClear).toBe(0);

    // fingerprint 기반 연결 확인 (user_game_data.fingerprint = games.fingerprint)
    expect(data.fingerprint).toBe("abc123hash");
  });

  it("게임에 fingerprint가 없으면 null로 삽입해야 한다", async () => {
    const game = await seedGame(db);
    const data = await seedUserGameData(db, game.path);

    expect(data.fingerprint).toBeNull();
  });

  it("오버라이드 값을 적용해야 한다", async () => {
    const game = await seedGame(db, { fingerprint: "fp-override" });
    const data = await seedUserGameData(db, game.path, {
      externalKey: "dlsite:RJ123456",
      rating: 5,
      totalPlayTime: 3600,
      isFavorite: true,
    });

    expect(data.externalKey).toBe("dlsite:RJ123456");
    expect(data.rating).toBe(5);
    expect(data.totalPlayTime).toBe(3600);
    expect(data.isFavorite).toBe(1); // SQLite boolean
  });
});

// ============================================
// 시드 헬퍼 — seedMaker, seedCategory, seedTag
// ============================================
describe("seedMaker", () => {
  it("제작사를 삽입하고 id와 함께 반환해야 한다", async () => {
    const maker = await seedMaker(db, "TestCircle");

    expect(maker).toBeDefined();
    expect(maker.id).toBeGreaterThan(0);
    expect(maker.name).toBe("TestCircle");
  });
});

describe("seedCategory", () => {
  it("카테고리를 삽입하고 id와 함께 반환해야 한다", async () => {
    const category = await seedCategory(db, "RPG");

    expect(category).toBeDefined();
    expect(category.id).toBeGreaterThan(0);
    expect(category.name).toBe("RPG");
    expect(category.sortOrder).toBe(0);
  });
});

describe("seedTag", () => {
  it("태그를 삽입하고 id와 함께 반환해야 한다", async () => {
    const tag = await seedTag(db, "pixel-art");

    expect(tag).toBeDefined();
    expect(tag.id).toBeGreaterThan(0);
    expect(tag.name).toBe("pixel-art");
  });
});

// ============================================
// 시드 헬퍼 — 관계 테이블 (이름 기반)
// ============================================
describe("관계 테이블 시드 헬퍼", () => {
  it("seedGameMaker — 이름으로 제작사를 자동 생성하고 관계를 삽입해야 한다", async () => {
    const game = await seedGame(db);

    await seedGameMaker(db, game.path, "Circle A");

    // 관계 확인
    const relations = await db("gameMakers").where("gamePath", game.path);
    expect(relations).toHaveLength(1);

    // 제작사가 자동 생성되었는지 확인
    const maker = await db("makers").where("name", "Circle A").first();
    expect(maker).toBeDefined();
    expect(relations[0].makerId).toBe(maker!.id);
  });

  it("seedGameMaker — 이미 존재하는 제작사를 재사용해야 한다", async () => {
    const game1 = await seedGame(db, { path: "/game1" });
    const game2 = await seedGame(db, { path: "/game2" });

    await seedGameMaker(db, game1.path, "SharedCircle");
    await seedGameMaker(db, game2.path, "SharedCircle");

    // 제작사는 하나만 존재
    const makers = await db("makers").where("name", "SharedCircle");
    expect(makers).toHaveLength(1);

    // 관계는 두 개
    const relations = await db("gameMakers");
    expect(relations).toHaveLength(2);
  });

  it("seedGameCategory — 이름으로 카테고리를 자동 생성하고 관계를 삽입해야 한다", async () => {
    const game = await seedGame(db);

    await seedGameCategory(db, game.path, "RPG");

    const relations = await db("gameCategories").where("gamePath", game.path);
    expect(relations).toHaveLength(1);

    const category = await db("categories").where("name", "RPG").first();
    expect(category).toBeDefined();
    expect(relations[0].categoryId).toBe(category!.id);
  });

  it("seedGameTag — 이름으로 태그를 자동 생성하고 관계를 삽입해야 한다", async () => {
    const game = await seedGame(db);

    await seedGameTag(db, game.path, "fantasy");

    const relations = await db("gameTags").where("gamePath", game.path);
    expect(relations).toHaveLength(1);

    const tag = await db("tags").where("name", "fantasy").first();
    expect(tag).toBeDefined();
    expect(relations[0].tagId).toBe(tag!.id);
  });

  it("seedGameImage — 게임 이미지를 삽입하고 반환해야 한다", async () => {
    const game = await seedGame(db);

    const image1 = await seedGameImage(db, game.path, "image_001.jpg", 0);
    const image2 = await seedGameImage(db, game.path, "image_002.jpg", 1);

    expect(image1).toBeDefined();
    expect(image1.id).toBeGreaterThan(0);
    expect(image1.path).toBe("image_001.jpg");
    expect(image1.sortOrder).toBe(0);

    expect(image2.path).toBe("image_002.jpg");
    expect(image2.sortOrder).toBe(1);
  });
});

// ============================================
// 외래키 CASCADE 동작 확인
// ============================================
describe("외래키 CASCADE", () => {
  it("게임 삭제 시 관계 테이블 데이터도 삭제되어야 한다", async () => {
    const game = await seedGame(db);
    await seedGameMaker(db, game.path, "CascadeTest");
    await seedGameTag(db, game.path, "cascade-tag");
    await seedGameImage(db, game.path, "img.jpg", 0);

    // 게임 삭제
    await db("games").where("path", game.path).del();

    // 관계 데이터도 CASCADE 삭제되어야 한다
    const gameMakers = await db("gameMakers");
    const gameTags = await db("gameTags");
    const gameImages = await db("gameImages");

    expect(gameMakers).toHaveLength(0);
    expect(gameTags).toHaveLength(0);
    expect(gameImages).toHaveLength(0);
  });
});
