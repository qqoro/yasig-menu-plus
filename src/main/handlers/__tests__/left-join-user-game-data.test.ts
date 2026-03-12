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
 * leftJoinUserGameData 헬퍼 통합 테스트
 * 실행: pnpm test -- src/main/handlers/__tests__/left-join-user-game-data.test.ts
 */

// ========== 모듈 모킹 ==========

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
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

// store 모킹
vi.mock("../../store.js", () => ({
  DEFAULT_TITLE_DISPLAY_PRIORITY: ["translated", "collected", "original"],
}));

// toAbsolutePath 모킹
vi.mock("../../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));

// 모킹 후 import (vi.mock 호이스팅)
import { leftJoinUserGameData } from "../home-utils.js";

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

describe("leftJoinUserGameData", () => {
  it("fingerprint로 매칭한다", async () => {
    await seedGame(db, { path: "/g/1", fingerprint: "fp1" });
    await seedUserGameData(db, "/g/1", {
      fingerprint: "fp1",
      isFavorite: true,
    });

    const result = await leftJoinUserGameData(db("games"))
      .where("games.path", "/g/1")
      .select("games.path", "userGameData.isFavorite")
      .first();

    expect(result.isFavorite).toBe(1);
  });

  it("externalKey로 매칭한다 (fingerprint NULL — 마이그레이션 후)", async () => {
    await seedGame(db, {
      path: "/g/2",
      fingerprint: "fp2",
      provider: "dlsite",
      externalId: "RJ111",
    });
    await seedUserGameData(db, "/g/2", {
      externalKey: "dlsite:RJ111",
      fingerprint: null,
      isFavorite: true,
    });

    const result = await leftJoinUserGameData(db("games"))
      .where("games.path", "/g/2")
      .select("games.path", "userGameData.isFavorite")
      .first();

    expect(result.isFavorite).toBe(1);
  });

  it("externalKey가 fingerprint보다 우선한다", async () => {
    await seedGame(db, {
      path: "/g/3",
      fingerprint: "fp3",
      provider: "dlsite",
      externalId: "RJ222",
    });
    // externalKey 매칭 레코드 (favorite)
    await db("userGameData").insert({
      externalKey: "dlsite:RJ222",
      fingerprint: null,
      isFavorite: true,
      isClear: false,
      totalPlayTime: 0,
    });
    // fingerprint 매칭 레코드 (not favorite)
    await db("userGameData").insert({
      externalKey: null,
      fingerprint: "fp3",
      isFavorite: false,
      isClear: false,
      totalPlayTime: 0,
    });

    const result = await leftJoinUserGameData(db("games"))
      .where("games.path", "/g/3")
      .select("games.path", "userGameData.isFavorite")
      .first();

    expect(result.isFavorite).toBe(1); // externalKey 레코드의 값
  });

  it("매칭되는 user_game_data가 없으면 NULL을 반환한다", async () => {
    await seedGame(db, { path: "/g/4", fingerprint: "fp4" });

    const result = await leftJoinUserGameData(db("games"))
      .where("games.path", "/g/4")
      .select("games.path", "userGameData.isFavorite")
      .first();

    expect(result.isFavorite).toBeNull();
  });
});
