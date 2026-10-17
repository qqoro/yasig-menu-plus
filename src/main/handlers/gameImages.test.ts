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

// downloader 모킹 — 파일 저장 없이 저장 경로만 돌려줌
vi.mock("../utils/downloader.js", () => ({
  downloadImage: vi.fn(),
  copyImage: vi.fn(),
  deleteImage: vi.fn(),
}));

import { copyImage, deleteImage, downloadImage } from "../utils/downloader.js";
import {
  addGameImageFromUrl,
  addGameImagesFromFiles,
  deleteGameImage,
  deleteImageFileIfUnused,
  getGameImagesHandler,
  setThumbnailFromImage,
} from "./gameImages.js";

const mockCopyImage = vi.mocked(copyImage);
const mockDownloadImage = vi.mocked(downloadImage);
const mockDeleteImage = vi.mocked(deleteImage);

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

/** 게임 이미지 경로를 순서대로 조회 */
async function imagePaths(gamePath: string): Promise<string[]> {
  const rows = await db("gameImages")
    .where("gamePath", gamePath)
    .orderBy("sortOrder");
  return rows.map((row: { path: string }) => row.path);
}

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

// ============================================
// 이미지 추가
// ============================================
describe("addGameImagesFromFiles", () => {
  it("보고 있던 이미지 바로 뒤에 순서대로 끼워 넣는다", async () => {
    const game = await seedGame(db, { path: "/games/insert" });
    await seedGameImage(db, game.path, "a.webp", 0);
    await seedGameImage(db, game.path, "b.webp", 1);
    await seedGameImage(db, game.path, "c.webp", 2);
    mockCopyImage
      .mockResolvedValueOnce("new1.webp")
      .mockResolvedValueOnce("new2.webp");

    const result = await addGameImagesFromFiles(
      game.path,
      ["C:/x/1.png", "C:/x/2.png"],
      "/absolute/a.webp",
    );

    expect(await imagePaths(game.path)).toEqual([
      "a.webp",
      "new1.webp",
      "new2.webp",
      "b.webp",
      "c.webp",
    ]);
    expect(result).toEqual({
      paths: ["/absolute/new1.webp", "/absolute/new2.webp"],
      failed: 0,
    });
    expect(mockCopyImage).toHaveBeenCalledWith(
      "C:/x/1.png",
      game.path,
      "unique",
    );
  });

  it("afterPath가 없으면 맨 뒤에 추가한다", async () => {
    const game = await seedGame(db, { path: "/games/append" });
    await seedGameImage(db, game.path, "a.webp", 0);
    mockCopyImage.mockResolvedValueOnce("new.webp");

    await addGameImagesFromFiles(game.path, ["C:/x/1.png"], null);

    expect(await imagePaths(game.path)).toEqual(["a.webp", "new.webp"]);
  });

  it("이미지 없이 썸네일만 있던 게임은 썸네일을 먼저 목록에 올린다", async () => {
    const game = await seedGame(db, {
      path: "/games/thumb-only",
      thumbnail: "thumb.webp",
    });
    mockCopyImage.mockResolvedValueOnce("new.webp");

    await addGameImagesFromFiles(
      game.path,
      ["C:/x/1.png"],
      "/absolute/thumb.webp",
    );

    expect(await imagePaths(game.path)).toEqual(["thumb.webp", "new.webp"]);
  });

  it("수정 표시(isLoadedInfo)를 켠다", async () => {
    const game = await seedGame(db, { path: "/games/flag" });
    mockCopyImage.mockResolvedValueOnce("new.webp");

    await addGameImagesFromFiles(game.path, ["C:/x/1.png"], null);

    const row = await db("games").where("path", game.path).first();
    expect(Boolean(row?.isLoadedInfo)).toBe(true);
  });

  it("일부 파일이 실패해도 나머지는 추가하고 실패 수를 돌려준다", async () => {
    const game = await seedGame(db, { path: "/games/partial" });
    mockCopyImage
      .mockRejectedValueOnce(new Error("not an image"))
      .mockResolvedValueOnce("ok.webp");

    const result = await addGameImagesFromFiles(
      game.path,
      ["C:/x/bad.txt", "C:/x/ok.png"],
      null,
    );

    expect(result.failed).toBe(1);
    expect(await imagePaths(game.path)).toEqual(["ok.webp"]);
  });

  it("모든 파일이 실패하면 오류를 던지고 아무것도 추가하지 않는다", async () => {
    const game = await seedGame(db, { path: "/games/all-fail" });
    mockCopyImage.mockRejectedValue(new Error("not an image"));

    await expect(
      addGameImagesFromFiles(game.path, ["C:/x/bad.txt"], null),
    ).rejects.toThrow("이미지를 추가하지 못했습니다.");
    expect(await imagePaths(game.path)).toEqual([]);
  });
});

describe("addGameImageFromUrl", () => {
  it("고유 이름으로 받아 지정 위치 뒤에 추가한다", async () => {
    const game = await seedGame(db, { path: "/games/url" });
    await seedGameImage(db, game.path, "a.webp", 0);
    await seedGameImage(db, game.path, "b.webp", 1);
    mockDownloadImage.mockResolvedValueOnce("url.webp");

    const paths = await addGameImageFromUrl(
      game.path,
      "https://example.com/x.jpg",
      "/absolute/a.webp",
    );

    expect(paths).toEqual(["/absolute/url.webp"]);
    expect(mockDownloadImage).toHaveBeenCalledWith(
      "https://example.com/x.jpg",
      game.path,
      "unique",
    );
    expect(await imagePaths(game.path)).toEqual([
      "a.webp",
      "url.webp",
      "b.webp",
    ]);
  });
});

// ============================================
// 이미지 삭제
// ============================================
describe("deleteGameImage", () => {
  it("이미지 행과 파일을 지운다", async () => {
    const game = await seedGame(db, { path: "/games/del" });
    await seedGameImage(db, game.path, "a.webp", 0);
    await seedGameImage(db, game.path, "b.webp", 1);

    await deleteGameImage(game.path, "/absolute/b.webp");

    expect(await imagePaths(game.path)).toEqual(["a.webp"]);
    expect(mockDeleteImage).toHaveBeenCalledWith("/absolute/b.webp");
  });

  it("썸네일로 쓰이던 이미지면 썸네일도 비운다", async () => {
    const game = await seedGame(db, {
      path: "/games/del-thumb",
      thumbnail: "a.webp",
    });
    await seedGameImage(db, game.path, "a.webp", 0);
    await seedGameImage(db, game.path, "b.webp", 1);

    await deleteGameImage(game.path, "/absolute/a.webp");

    const row = await db("games").where("path", game.path).first();
    expect(row?.thumbnail).toBeNull();
    expect(await imagePaths(game.path)).toEqual(["b.webp"]);
    expect(mockDeleteImage).toHaveBeenCalledWith("/absolute/a.webp");
  });

  it("목록 없이 썸네일로만 보이던 이미지도 지울 수 있다", async () => {
    const game = await seedGame(db, {
      path: "/games/del-fallback",
      thumbnail: "t.webp",
    });

    await deleteGameImage(game.path, "/absolute/t.webp");

    const row = await db("games").where("path", game.path).first();
    expect(row?.thumbnail).toBeNull();
    expect(mockDeleteImage).toHaveBeenCalledWith("/absolute/t.webp");
  });

  it("없는 이미지는 오류를 던진다", async () => {
    const game = await seedGame(db, { path: "/games/del-missing" });

    await expect(
      deleteGameImage(game.path, "/absolute/none.webp"),
    ).rejects.toThrow("이미지를 찾을 수 없습니다.");
  });
});

// ============================================
// 썸네일 지정
// ============================================
describe("setThumbnailFromImage", () => {
  it("이미지 경로를 썸네일로 지정하고 쓰이지 않는 이전 썸네일 파일을 지운다", async () => {
    const game = await seedGame(db, {
      path: "/games/set-thumb",
      thumbnail: "old_manual.webp",
    });
    await seedGameImage(db, game.path, "a.webp", 0);
    await seedGameImage(db, game.path, "b.webp", 1);

    await setThumbnailFromImage(game.path, "/absolute/b.webp");

    const row = await db("games").where("path", game.path).first();
    expect(row?.thumbnail).toBe("b.webp");
    expect(Boolean(row?.isLoadedInfo)).toBe(true);
    expect(mockDeleteImage).toHaveBeenCalledWith("/absolute/old_manual.webp");
  });

  it("이전 썸네일이 캐러셀 이미지면 파일을 남긴다", async () => {
    const game = await seedGame(db, {
      path: "/games/set-thumb-shared",
      thumbnail: "a.webp",
    });
    await seedGameImage(db, game.path, "a.webp", 0);
    await seedGameImage(db, game.path, "b.webp", 1);

    await setThumbnailFromImage(game.path, "/absolute/b.webp");

    expect(mockDeleteImage).not.toHaveBeenCalled();
  });

  it("목록에 없는 이미지는 오류를 던진다", async () => {
    const game = await seedGame(db, { path: "/games/set-thumb-missing" });

    await expect(
      setThumbnailFromImage(game.path, "/absolute/none.webp"),
    ).rejects.toThrow("이미지를 찾을 수 없습니다.");
  });
});

describe("deleteImageFileIfUnused", () => {
  it("다른 곳에서 참조 중인 파일은 지우지 않는다", async () => {
    const game = await seedGame(db, { path: "/games/ref" });
    await seedGameImage(db, game.path, "shared.webp", 0);

    await deleteImageFileIfUnused("shared.webp");

    expect(mockDeleteImage).not.toHaveBeenCalled();
  });

  it("참조가 없으면 지운다", async () => {
    await deleteImageFileIfUnused("orphan.webp");

    expect(mockDeleteImage).toHaveBeenCalledWith("/absolute/orphan.webp");
  });
});
