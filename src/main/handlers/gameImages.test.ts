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
} from "../db/test-utils.js";

/**
 * getGameImagesHandler 통합 테스트
 * 실행: pnpm test -- src/main/handlers/gameImages.test.ts
 */

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
}));

// toAbsolutePath 모킹 — 경로에 /absolute/ 접두사 추가
vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));

// validator 모킹
vi.mock("../utils/validator.js", () => ({
  validatePath: vi.fn(),
  validateDirectoryPath: vi.fn(),
  validateSearchQuery: vi.fn(),
  validateUrl: vi.fn(),
}));

// db-manager 모킹 — dbRef를 통해 테스트용 DB 인스턴스 주입
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: {
    getKnex: () => dbRef.current!,
  },
}));

import { getGameImagesHandler } from "./gameImages.js";

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
// getGameImagesHandler 테스트
// ============================================
describe("getGameImagesHandler", () => {
  it("이미지 목록 조회 — sortOrder 순서대로 반환", async () => {
    const game = await seedGame(db, { path: "/games/sort-test" });

    // sortOrder가 역순으로 삽입
    await seedGameImage(db, game.path, "img_b.jpg", 2);
    await seedGameImage(db, game.path, "img_a.jpg", 0);
    await seedGameImage(db, game.path, "img_c.jpg", 1);

    const result = await getGameImagesHandler({} as any, {
      gamePath: game.path,
    });

    expect(result.images).toHaveLength(3);
    // sortOrder 순서: 0, 1, 2
    expect(result.images[0].sortOrder).toBe(0);
    expect(result.images[1].sortOrder).toBe(1);
    expect(result.images[2].sortOrder).toBe(2);
  });

  it("이미지 없는 게임 — 빈 배열 반환", async () => {
    const game = await seedGame(db, { path: "/games/no-images" });

    const result = await getGameImagesHandler({} as any, {
      gamePath: game.path,
    });

    expect(result.images).toEqual([]);
  });

  it("다수 이미지 — 3개 이미지 삽입 후 정렬 확인", async () => {
    const game = await seedGame(db, { path: "/games/multi-images" });

    await seedGameImage(db, game.path, "screenshot_1.png", 0);
    await seedGameImage(db, game.path, "screenshot_2.png", 1);
    await seedGameImage(db, game.path, "screenshot_3.png", 2);

    const result = await getGameImagesHandler({} as any, {
      gamePath: game.path,
    });

    expect(result.images).toHaveLength(3);
    expect(result.images[0].sortOrder).toBe(0);
    expect(result.images[1].sortOrder).toBe(1);
    expect(result.images[2].sortOrder).toBe(2);
    // 각 이미지의 경로 확인
    expect(result.images[0].path).toContain("screenshot_1.png");
    expect(result.images[1].path).toContain("screenshot_2.png");
    expect(result.images[2].path).toContain("screenshot_3.png");
  });

  it("경로 변환 — toAbsolutePath 적용 확인", async () => {
    const game = await seedGame(db, { path: "/games/path-convert" });

    await seedGameImage(db, game.path, "thumbnails/img.webp", 0);
    await seedGameImage(db, game.path, "thumbnails/img2.webp", 1);

    const result = await getGameImagesHandler({} as any, {
      gamePath: game.path,
    });

    expect(result.images).toHaveLength(2);
    // toAbsolutePath 모킹에 의해 /absolute/ 접두사가 붙어야 함
    expect(result.images[0].path).toBe("/absolute/thumbnails/img.webp");
    expect(result.images[1].path).toBe("/absolute/thumbnails/img2.webp");
  });

  it("다른 게임의 이미지는 포함되지 않아야 한다", async () => {
    const game1 = await seedGame(db, { path: "/games/game-1" });
    const game2 = await seedGame(db, { path: "/games/game-2" });

    await seedGameImage(db, game1.path, "game1_img.jpg", 0);
    await seedGameImage(db, game2.path, "game2_img.jpg", 0);

    const result = await getGameImagesHandler({} as any, {
      gamePath: game1.path,
    });

    expect(result.images).toHaveLength(1);
    expect(result.images[0].path).toBe("/absolute/game1_img.jpg");
  });
});
