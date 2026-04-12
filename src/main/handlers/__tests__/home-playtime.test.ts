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
 * getPlayTimeHandler / getPlaySessionsHandler 통합 테스트
 * 실행: pnpm test -- src/main/handlers/__tests__/home-playtime.test.ts
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

// store 모킹 (home-utils.js가 DEFAULT_TITLE_DISPLAY_PRIORITY를 import)
vi.mock("../../store.js", () => ({
  getTranslationSettings: () => ({
    titleDisplayPriority: ["translated", "collected", "original"],
  }),
  getExcludedExecutables: () => [],
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
import {
  getPlayTimeHandler,
  getPlaySessionsHandler,
} from "../home-playtime.js";

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
// getPlayTimeHandler 테스트
// ============================================
describe("getPlayTimeHandler", () => {
  it("userGameData가 있는 게임의 플레이 타임을 반환해야 한다", async () => {
    await seedGame(db, {
      path: "/games/playtime-game",
      title: "Playtime Game",
      source: "/library/path",
      fingerprint: "fp-playtime",
    });
    await seedUserGameData(db, "/games/playtime-game", {
      totalPlayTime: 7200,
    });

    const result = await getPlayTimeHandler({} as any, {
      path: "/games/playtime-game",
    });

    expect(result.path).toBe("/games/playtime-game");
    expect(result.totalPlayTime).toBe(7200);
  });

  it("userGameData가 없으면 totalPlayTime = 0을 반환해야 한다", async () => {
    await seedGame(db, {
      path: "/games/no-userdata",
      title: "No UserData",
      source: "/library/path",
      fingerprint: "fp-no-userdata",
    });

    const result = await getPlayTimeHandler({} as any, {
      path: "/games/no-userdata",
    });

    expect(result.path).toBe("/games/no-userdata");
    expect(result.totalPlayTime).toBe(0);
  });

  it("게임이 존재하지 않아도 totalPlayTime = 0을 반환해야 한다", async () => {
    const result = await getPlayTimeHandler({} as any, {
      path: "/games/nonexistent",
    });

    expect(result.path).toBe("/games/nonexistent");
    expect(result.totalPlayTime).toBe(0);
  });
});

// ============================================
// getPlaySessionsHandler 테스트
// ============================================
describe("getPlaySessionsHandler", () => {
  it("externalKey로 userGameData를 찾아 세션을 조회해야 한다", async () => {
    // provider + externalId가 있는 게임
    await seedGame(db, {
      path: "/games/external-key-game",
      title: "External Key Game",
      source: "/library/path",
      provider: "steam",
      externalId: "12345",
      fingerprint: "fp-external",
    });
    // externalKey로 userGameData 생성
    const userData = await seedUserGameData(db, "/games/external-key-game", {
      externalKey: "steam:12345",
    });

    // 플레이 세션 삽입
    await db("playSessions").insert({
      userGameDataId: userData.id,
      startedAt: "2024-01-01T10:00:00.000Z",
      endedAt: "2024-01-01T11:00:00.000Z",
      durationSeconds: 3600,
    });

    const result = await getPlaySessionsHandler({} as any, {
      path: "/games/external-key-game",
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].durationSeconds).toBe(3600);
  });

  it("fingerprint로 userGameData를 찾아 세션을 조회해야 한다 (externalKey 없을 때)", async () => {
    // provider/externalId가 없는 게임
    await seedGame(db, {
      path: "/games/fingerprint-game",
      title: "Fingerprint Game",
      source: "/library/path",
      fingerprint: "fp-session-test",
    });
    const userData = await seedUserGameData(db, "/games/fingerprint-game", {
      totalPlayTime: 1800,
    });

    // 플레이 세션 삽입
    await db("playSessions").insert({
      userGameDataId: userData.id,
      startedAt: "2024-02-01T14:00:00.000Z",
      endedAt: "2024-02-01T14:30:00.000Z",
      durationSeconds: 1800,
    });

    const result = await getPlaySessionsHandler({} as any, {
      path: "/games/fingerprint-game",
    });

    expect(result.sessions).toHaveLength(1);
    expect(result.sessions[0].durationSeconds).toBe(1800);
  });

  it("userGameData가 없으면 빈 배열을 반환해야 한다", async () => {
    await seedGame(db, {
      path: "/games/no-userdata-sessions",
      title: "No UserData Sessions",
      source: "/library/path",
      fingerprint: "fp-no-ud-session",
    });
    // userGameData를 생성하지 않음

    const result = await getPlaySessionsHandler({} as any, {
      path: "/games/no-userdata-sessions",
    });

    expect(result.sessions).toEqual([]);
  });

  it("게임이 없으면 빈 배열을 반환해야 한다", async () => {
    const result = await getPlaySessionsHandler({} as any, {
      path: "/games/nonexistent",
    });

    expect(result.sessions).toEqual([]);
  });

  it("limit 파라미터가 세션 수를 제한해야 한다", async () => {
    await seedGame(db, {
      path: "/games/limit-game",
      title: "Limit Game",
      source: "/library/path",
      fingerprint: "fp-limit",
    });
    const userData = await seedUserGameData(db, "/games/limit-game");

    // 세션 5개 삽입
    for (let i = 0; i < 5; i++) {
      await db("playSessions").insert({
        userGameDataId: userData.id,
        startedAt: new Date(Date.now() - i * 3600000).toISOString(),
        endedAt: new Date(Date.now() - i * 3600000 + 1800000).toISOString(),
        durationSeconds: 1800,
      });
    }

    // limit=3으로 조회
    const result = await getPlaySessionsHandler({} as any, {
      path: "/games/limit-game",
      limit: 3,
    });

    expect(result.sessions).toHaveLength(3);
  });

  it("세션이 startedAt 내림차순으로 정렬되어야 한다", async () => {
    await seedGame(db, {
      path: "/games/sorted-game",
      title: "Sorted Game",
      source: "/library/path",
      fingerprint: "fp-sorted",
    });
    const userData = await seedUserGameData(db, "/games/sorted-game");

    // 순서 섞어서 세션 삽입
    await db("playSessions").insert({
      userGameDataId: userData.id,
      startedAt: "2024-01-03T10:00:00.000Z",
      endedAt: "2024-01-03T11:00:00.000Z",
      durationSeconds: 3600,
    });
    await db("playSessions").insert({
      userGameDataId: userData.id,
      startedAt: "2024-01-01T10:00:00.000Z",
      endedAt: "2024-01-01T11:00:00.000Z",
      durationSeconds: 3600,
    });
    await db("playSessions").insert({
      userGameDataId: userData.id,
      startedAt: "2024-01-05T10:00:00.000Z",
      endedAt: "2024-01-05T11:00:00.000Z",
      durationSeconds: 3600,
    });

    const result = await getPlaySessionsHandler({} as any, {
      path: "/games/sorted-game",
    });

    expect(result.sessions).toHaveLength(3);
    // 내림차순: 최신 세션이 먼저
    const startedAtList = result.sessions.map((s: any) =>
      new Date(s.startedAt).getTime(),
    );
    for (let i = 1; i < startedAtList.length; i++) {
      expect(startedAtList[i - 1]).toBeGreaterThan(startedAtList[i]);
    }
  });
});
