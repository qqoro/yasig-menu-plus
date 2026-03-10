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
 * getGameDetail() 통합 테스트
 * 실행: pnpm test -- src/main/handlers/gameDetail.test.ts
 */

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
}));

// toAbsolutePath를 패스스루로 모킹 (테스트에서는 변환 불필요)
vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
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
import { getGameDetail } from "./gameDetail.js";

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
// 게임 상세 조회 — 기본 필드 반환 확인
// ============================================
describe("getGameDetail — 기본 필드", () => {
  it("게임 기본 정보가 올바르게 반환되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/my-game",
      title: "My Game",
      originalTitle: "my-game-original",
      source: "/library/source",
      executablePath: "/games/my-game/game.exe",
      provider: "dlsite",
      externalId: "RJ123456",
      memo: "좋은 게임",
    });

    const result = await getGameDetail("/games/my-game");

    expect(result).not.toBeNull();
    expect(result!.path).toBe("/games/my-game");
    expect(result!.title).toBe("My Game");
    expect(result!.originalTitle).toBe("my-game-original");
    expect(result!.source).toBe("/library/source");
    expect(result!.executablePath).toBe("/games/my-game/game.exe");
    expect(result!.provider).toBe("dlsite");
    expect(result!.externalId).toBe("RJ123456");
    expect(result!.memo).toBe("좋은 게임");
  });

  it("translatedTitle과 translationSource가 포함되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/translated",
      translatedTitle: "번역된 제목",
      translationSource: "google",
    });

    const result = await getGameDetail("/games/translated");

    expect(result).not.toBeNull();
    expect(result!.translatedTitle).toBe("번역된 제목");
    expect(result!.translationSource).toBe("google");
  });
});

// ============================================
// userGameData LEFT JOIN — fingerprint 연결
// ============================================
describe("getGameDetail — userGameData LEFT JOIN", () => {
  it("fingerprint로 연결된 유저 데이터가 포함되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/with-data",
      fingerprint: "fp-abc123",
    });
    await seedUserGameData(db, "/games/with-data", {
      rating: 4,
      totalPlayTime: 7200,
      isFavorite: true,
      isClear: true,
      lastPlayedAt: 1700000000000,
    });

    const result = await getGameDetail("/games/with-data");

    expect(result).not.toBeNull();
    expect(result!.rating).toBe(4);
    expect(result!.totalPlayTime).toBe(7200);
    expect(result!.isFavorite).toBe(true);
    expect(result!.isClear).toBe(true);
    expect(result!.lastPlayedAt).toBeInstanceOf(Date);
    expect(result!.lastPlayedAt!.getTime()).toBe(1700000000000);
  });
});

// ============================================
// userGameData 없는 게임 — null 값
// ============================================
describe("getGameDetail — userGameData 없는 경우", () => {
  it("rating, totalPlayTime 등이 null이어야 한다", async () => {
    await seedGame(db, {
      path: "/games/no-user-data",
    });

    const result = await getGameDetail("/games/no-user-data");

    expect(result).not.toBeNull();
    expect(result!.rating).toBeNull();
    expect(result!.totalPlayTime).toBeNull();
    expect(result!.isFavorite).toBe(false); // Boolean(null) = false
    expect(result!.isClear).toBe(false); // Boolean(null) = false
    expect(result!.lastPlayedAt).toBeNull();
  });
});

// ============================================
// 관계 데이터 — makers, categories, tags
// ============================================
describe("getGameDetail — 관계 데이터", () => {
  it("makers, categories, tags가 배열로 반환되어야 한다", async () => {
    await seedGame(db, { path: "/games/with-relations" });

    await seedGameMaker(db, "/games/with-relations", "Circle A");
    await seedGameMaker(db, "/games/with-relations", "Circle B");
    await seedGameCategory(db, "/games/with-relations", "RPG");
    await seedGameCategory(db, "/games/with-relations", "Adventure");
    await seedGameTag(db, "/games/with-relations", "pixel-art");
    await seedGameTag(db, "/games/with-relations", "fantasy");
    await seedGameTag(db, "/games/with-relations", "indie");

    const result = await getGameDetail("/games/with-relations");

    expect(result).not.toBeNull();
    expect(result!.makers).toHaveLength(2);
    expect(result!.makers).toContain("Circle A");
    expect(result!.makers).toContain("Circle B");

    expect(result!.categories).toHaveLength(2);
    expect(result!.categories).toContain("RPG");
    expect(result!.categories).toContain("Adventure");

    expect(result!.tags).toHaveLength(3);
    expect(result!.tags).toContain("pixel-art");
    expect(result!.tags).toContain("fantasy");
    expect(result!.tags).toContain("indie");
  });

  it("관계 데이터가 없으면 빈 배열이어야 한다", async () => {
    await seedGame(db, { path: "/games/no-relations" });

    const result = await getGameDetail("/games/no-relations");

    expect(result).not.toBeNull();
    expect(result!.makers).toEqual([]);
    expect(result!.categories).toEqual([]);
    expect(result!.tags).toEqual([]);
  });
});

// ============================================
// 존재하지 않는 게임 — null 반환
// ============================================
describe("getGameDetail — 존재하지 않는 게임", () => {
  it("존재하지 않는 경로로 조회하면 null을 반환해야 한다", async () => {
    const result = await getGameDetail("/games/nonexistent");

    expect(result).toBeNull();
  });

  it("DB가 비어있어도 null을 반환해야 한다", async () => {
    // truncateAll이 beforeEach에서 실행되므로 DB는 이미 비어있음
    const result = await getGameDetail("/any/path");

    expect(result).toBeNull();
  });
});

// ============================================
// thumbnail → toAbsolutePath 변환 확인
// ============================================
describe("getGameDetail — thumbnail 경로 변환", () => {
  it("thumbnail이 toAbsolutePath를 통해 변환되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/with-thumb",
      thumbnail: "abc123.webp",
    });

    const result = await getGameDetail("/games/with-thumb");

    expect(result).not.toBeNull();
    // 모킹된 toAbsolutePath: (p) => `/absolute/${p}`
    expect(result!.thumbnail).toBe("/absolute/abc123.webp");
  });

  it("thumbnail이 null이면 null을 반환해야 한다", async () => {
    await seedGame(db, {
      path: "/games/no-thumb",
      thumbnail: null,
    });

    const result = await getGameDetail("/games/no-thumb");

    expect(result).not.toBeNull();
    expect(result!.thumbnail).toBeNull();
  });
});

// ============================================
// Boolean 변환 — isCompressFile, isFavorite, isHidden, isClear
// ============================================
describe("getGameDetail — Boolean 변환", () => {
  it("SQLite 정수값이 Boolean으로 변환되어야 한다 (true 케이스)", async () => {
    await seedGame(db, {
      path: "/games/bool-true",
      isCompressFile: true,
      isHidden: true,
      fingerprint: "fp-bool-true",
    });
    await seedUserGameData(db, "/games/bool-true", {
      isFavorite: true,
      isClear: true,
    });

    const result = await getGameDetail("/games/bool-true");

    expect(result).not.toBeNull();
    expect(result!.isCompressFile).toBe(true);
    expect(result!.isHidden).toBe(true);
    expect(result!.isFavorite).toBe(true);
    expect(result!.isClear).toBe(true);

    // typeof 검증 — 정수(0/1)가 아니라 boolean이어야 한다
    expect(typeof result!.isCompressFile).toBe("boolean");
    expect(typeof result!.isHidden).toBe("boolean");
    expect(typeof result!.isFavorite).toBe("boolean");
    expect(typeof result!.isClear).toBe("boolean");
  });

  it("SQLite 정수값이 Boolean으로 변환되어야 한다 (false 케이스)", async () => {
    await seedGame(db, {
      path: "/games/bool-false",
      isCompressFile: false,
      isHidden: false,
      fingerprint: "fp-bool-false",
    });
    await seedUserGameData(db, "/games/bool-false", {
      isFavorite: false,
      isClear: false,
    });

    const result = await getGameDetail("/games/bool-false");

    expect(result).not.toBeNull();
    expect(result!.isCompressFile).toBe(false);
    expect(result!.isHidden).toBe(false);
    expect(result!.isFavorite).toBe(false);
    expect(result!.isClear).toBe(false);

    expect(typeof result!.isCompressFile).toBe("boolean");
    expect(typeof result!.isHidden).toBe("boolean");
    expect(typeof result!.isFavorite).toBe("boolean");
    expect(typeof result!.isClear).toBe("boolean");
  });
});
