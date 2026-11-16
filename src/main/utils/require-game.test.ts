/**
 * requireGame — 등록된 게임 경로인지 확인
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
import { createTestDb, seedGame, truncateAll } from "../db/test-utils.js";

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
}));

import { requireGame } from "./require-game.js";

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

describe("requireGame", () => {
  it("등록된 게임은 통과해야 한다", async () => {
    await seedGame(db, { path: "C:\\Games\\Alpha" });
    await expect(requireGame("C:\\Games\\Alpha")).resolves.toBeUndefined();
  });

  // 이슈 #16: 폴더명에 점이 연속되어도 등록된 게임이면 통과
  it("폴더명에 점이 연속된 등록 게임도 통과해야 한다", async () => {
    const path = "C:\\Games\\제목...。...끝...";
    await seedGame(db, { path });
    await expect(requireGame(path)).resolves.toBeUndefined();
  });

  it("등록되지 않은 경로는 거부해야 한다", async () => {
    await seedGame(db, { path: "C:\\Games\\Alpha" });
    await expect(requireGame("C:\\Games\\Alph")).rejects.toThrow(
      "게임을 찾을 수 없습니다.",
    );
  });

  it("..로 다른 곳을 가리키는 경로도 등록되지 않았으면 거부해야 한다", async () => {
    await expect(requireGame("C:\\Games\\..\\Windows")).rejects.toThrow(
      "게임을 찾을 수 없습니다.",
    );
  });

  it("빈 문자열은 거부해야 한다", async () => {
    await expect(requireGame("  ")).rejects.toThrow("경로가 비어있습니다.");
  });
});
