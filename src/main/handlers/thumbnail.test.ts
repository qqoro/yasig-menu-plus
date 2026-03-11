import type { Knex } from "knex";
import { join } from "node:path";
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
 * thumbnail.ts 핸들러 통합 테스트
 * 실행: pnpm test -- src/main/handlers/thumbnail.test.ts
 *
 * 테스트 대상:
 *  1. cleanUnusedThumbnailsHandler — 고아 파일 탐색/삭제
 *  2. migrateThumbnailsHandler — originalTitle 매칭, 확장자 우선순위
 *  3. convertImagesToWebpHandler — WebP 변환, DB 경로 업데이트
 */

// ========== 모킹 설정 ==========

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
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

// node:fs/promises 모킹
vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  stat: vi.fn(),
  unlink: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// downloader 유틸 모킹
vi.mock("../utils/downloader.js", () => ({
  getThumbnailDir: vi.fn(() => "/mock/thumbnails"),
  downloadImage: vi.fn(),
  deleteImage: vi.fn(),
  deleteThumbnail: vi.fn(),
  copyImage: vi.fn(),
  optimizeImage: vi.fn(),
}));

// image-path 유틸 모킹
vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/mock/thumbnails/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));

// validator 모킹
vi.mock("../utils/validator.js", () => ({
  validatePath: vi.fn(),
  validateDirectoryPath: vi.fn(),
  validateSearchQuery: vi.fn(),
  validateUrl: vi.fn(),
}));

// 모킹된 모듈 import
import { readdir, stat, unlink, readFile, writeFile } from "node:fs/promises";
import { copyImage, optimizeImage } from "../utils/downloader.js";
import {
  cleanUnusedThumbnailsHandler,
  migrateThumbnailsHandler,
  convertImagesToWebpHandler,
} from "./thumbnail.js";

const mockReaddir = vi.mocked(readdir);
const mockStat = vi.mocked(stat);
const mockUnlink = vi.mocked(unlink);
const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockCopyImage = vi.mocked(copyImage);
const mockOptimizeImage = vi.mocked(optimizeImage);

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
// cleanUnusedThumbnailsHandler 테스트
// ============================================
describe("cleanUnusedThumbnailsHandler", () => {
  it("DB에 참조가 없는 고아 파일을 삭제한다", async () => {
    // 게임 1개에 썸네일 설정
    await seedGame(db, { path: "/games/game1", thumbnail: "used.webp" });

    // 썸네일 폴더에 파일 3개 (1개 사용중, 2개 고아)
    mockReaddir.mockResolvedValue([
      "used.webp",
      "orphan1.webp",
      "orphan2.jpg",
    ] as any);

    // 고아 파일들의 stat 반환
    mockStat.mockResolvedValue({ size: 5000 } as any);
    mockUnlink.mockResolvedValue(undefined);

    const result = await cleanUnusedThumbnailsHandler({} as any, undefined);

    expect(result.deletedCount).toBe(2);
    expect(result.freedSpace).toBe(10000); // 5000 * 2
    expect(mockUnlink).toHaveBeenCalledTimes(2);
  });

  it("모든 파일이 사용 중이면 삭제하지 않는다", async () => {
    await seedGame(db, { path: "/games/game1", thumbnail: "thumb1.webp" });
    await seedGame(db, { path: "/games/game2", thumbnail: "thumb2.webp" });

    mockReaddir.mockResolvedValue(["thumb1.webp", "thumb2.webp"] as any);

    const result = await cleanUnusedThumbnailsHandler({} as any, undefined);

    expect(result.deletedCount).toBe(0);
    expect(result.freedSpace).toBe(0);
    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it("gameImages 테이블의 이미지도 사용 중으로 인식한다", async () => {
    const game = await seedGame(db, {
      path: "/games/game1",
      thumbnail: "thumb.webp",
    });
    await seedGameImage(db, game.path, "carousel1.webp", 0);
    await seedGameImage(db, game.path, "carousel2.webp", 1);

    mockReaddir.mockResolvedValue([
      "thumb.webp",
      "carousel1.webp",
      "carousel2.webp",
      "orphan.png",
    ] as any);

    mockStat.mockResolvedValue({ size: 3000 } as any);
    mockUnlink.mockResolvedValue(undefined);

    const result = await cleanUnusedThumbnailsHandler({} as any, undefined);

    // orphan.png만 삭제되어야 함
    expect(result.deletedCount).toBe(1);
    expect(result.freedSpace).toBe(3000);
  });

  it("썸네일 폴더가 비어있으면 0건 반환", async () => {
    mockReaddir.mockResolvedValue([] as any);

    const result = await cleanUnusedThumbnailsHandler({} as any, undefined);

    expect(result.deletedCount).toBe(0);
    expect(result.freedSpace).toBe(0);
  });

  it("DB에 게임이 없으면 모든 파일을 삭제한다", async () => {
    mockReaddir.mockResolvedValue(["file1.webp", "file2.jpg"] as any);
    mockStat.mockResolvedValue({ size: 2000 } as any);
    mockUnlink.mockResolvedValue(undefined);

    const result = await cleanUnusedThumbnailsHandler({} as any, undefined);

    expect(result.deletedCount).toBe(2);
    expect(result.freedSpace).toBe(4000);
  });

  it("삭제된 파일별 크기가 다른 경우 정확한 합계 반환", async () => {
    mockReaddir.mockResolvedValue(["a.webp", "b.webp", "c.webp"] as any);
    mockStat
      .mockResolvedValueOnce({ size: 1000 } as any)
      .mockResolvedValueOnce({ size: 2000 } as any)
      .mockResolvedValueOnce({ size: 3000 } as any);
    mockUnlink.mockResolvedValue(undefined);

    const result = await cleanUnusedThumbnailsHandler({} as any, undefined);

    expect(result.deletedCount).toBe(3);
    expect(result.freedSpace).toBe(6000);
  });
});

// ============================================
// migrateThumbnailsHandler 테스트
// ============================================
describe("migrateThumbnailsHandler", () => {
  it("originalTitle과 파일명이 일치하면 마이그레이션 성공", async () => {
    await seedGame(db, {
      path: "/games/game1",
      originalTitle: "MyGame",
      thumbnail: null,
    });

    // sourceFolder가 디렉토리인지 검증
    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    // 폴더 내 이미지 파일 목록
    mockReaddir.mockResolvedValue(["MyGame.png"] as any);
    // copyImage 성공 반환
    mockCopyImage.mockResolvedValue("copied_thumb.webp");

    const result = await migrateThumbnailsHandler({} as any, {
      sourceFolder: "/source/folder",
    });

    expect(result.successCount).toBe(1);
    expect(result.skipCount).toBe(0);
    expect(result.failCount).toBe(0);

    // DB에 thumbnail 업데이트 확인
    const game = await db("games").where("path", "/games/game1").first();
    expect(game!.thumbnail).toBe("copied_thumb.webp");
  });

  it("대소문자 무시하여 매칭한다", async () => {
    await seedGame(db, {
      path: "/games/game1",
      originalTitle: "MyGame",
      thumbnail: null,
    });

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockReaddir.mockResolvedValue(["mygame.jpg"] as any);
    mockCopyImage.mockResolvedValue("copied.webp");

    const result = await migrateThumbnailsHandler({} as any, {
      sourceFolder: "/source",
    });

    expect(result.successCount).toBe(1);
    expect(result.failCount).toBe(0);
  });

  it("매칭되는 게임이 없으면 failCount 증가", async () => {
    await seedGame(db, {
      path: "/games/game1",
      originalTitle: "DifferentTitle",
      thumbnail: null,
    });

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockReaddir.mockResolvedValue(["NoMatch.png"] as any);

    const result = await migrateThumbnailsHandler({} as any, {
      sourceFolder: "/source",
    });

    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(1);
  });

  it("이미지 확장자 우선순위: .png > .jpg > .jpeg > .webp > .gif > .bmp", async () => {
    await seedGame(db, {
      path: "/games/game1",
      originalTitle: "TestGame",
      thumbnail: null,
    });

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    // 동일 파일명에 여러 확장자 — .png가 우선
    mockReaddir.mockResolvedValue([
      "TestGame.jpg",
      "TestGame.png",
      "TestGame.webp",
    ] as any);
    mockCopyImage.mockResolvedValue("result.webp");

    const result = await migrateThumbnailsHandler({} as any, {
      sourceFolder: "/source",
    });

    expect(result.successCount).toBe(1);
    // copyImage 호출 시 .png 파일이 선택되어야 함
    // join()은 OS별 경로 구분자를 사용하므로 join으로 기대값 생성
    expect(mockCopyImage).toHaveBeenCalledWith(
      join("/source", "TestGame.png"),
      "/games/game1",
    );
  });

  it("이미지가 아닌 파일은 무시된다", async () => {
    await seedGame(db, {
      path: "/games/game1",
      originalTitle: "TestGame",
      thumbnail: null,
    });

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    // 이미지가 아닌 파일들
    mockReaddir.mockResolvedValue([
      "TestGame.txt",
      "TestGame.mp4",
      "readme.md",
    ] as any);

    const result = await migrateThumbnailsHandler({} as any, {
      sourceFolder: "/source",
    });

    // 이미지 파일이 없으므로 매칭 시도 자체가 없음
    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(0);
    expect(result.skipCount).toBe(0);
  });

  it("폴더가 아닌 경로를 지정하면 에러 발생", async () => {
    // stat이 isDirectory() = false 반환하도록 설정
    mockStat.mockResolvedValue({ isDirectory: () => false } as any);

    await expect(
      migrateThumbnailsHandler({} as any, { sourceFolder: "/not-a-folder" }),
    ).rejects.toThrow("폴더에 접근할 수 없습니다.");
  });

  it("stat 에러 발생 시 폴더 접근 실패 에러", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT"));

    await expect(
      migrateThumbnailsHandler({} as any, { sourceFolder: "/nonexistent" }),
    ).rejects.toThrow("폴더에 접근할 수 없습니다.");
  });

  it("copyImage 실패 시 failCount 증가", async () => {
    await seedGame(db, {
      path: "/games/game1",
      originalTitle: "TestGame",
      thumbnail: null,
    });

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockReaddir.mockResolvedValue(["TestGame.png"] as any);
    mockCopyImage.mockRejectedValue(new Error("복사 실패"));

    const result = await migrateThumbnailsHandler({} as any, {
      sourceFolder: "/source",
    });

    expect(result.successCount).toBe(0);
    expect(result.failCount).toBe(1);
  });

  it("여러 게임 동시 마이그레이션 — 성공/실패 혼합", async () => {
    await seedGame(db, {
      path: "/games/game1",
      originalTitle: "Game1",
      thumbnail: null,
    });
    await seedGame(db, {
      path: "/games/game2",
      originalTitle: "Game2",
      thumbnail: null,
    });

    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockReaddir.mockResolvedValue([
      "Game1.png",
      "Game2.jpg",
      "Unknown.png",
    ] as any);

    // Game1 성공, Game2 실패
    mockCopyImage
      .mockResolvedValueOnce("game1_thumb.webp")
      .mockRejectedValueOnce(new Error("디스크 오류"));

    const result = await migrateThumbnailsHandler({} as any, {
      sourceFolder: "/source",
    });

    expect(result.successCount).toBe(1);
    // Unknown.png 매칭 실패 + Game2 복사 실패 = 2
    expect(result.failCount).toBe(2);
  });

  it("DB에 게임이 없으면 모든 이미지가 매칭 실패한다", async () => {
    // 게임 없이 이미지만 있는 경우
    mockStat.mockResolvedValue({ isDirectory: () => true } as any);
    mockReaddir.mockResolvedValue(["SomeGame.png", "AnotherGame.jpg"] as any);

    const result = await migrateThumbnailsHandler({} as any, {
      sourceFolder: "/source",
    });

    // 매칭할 게임이 없으므로 모두 실패
    expect(result.failCount).toBe(2);
    expect(result.successCount).toBe(0);
  });
});

// ============================================
// convertImagesToWebpHandler 테스트
// ============================================
describe("convertImagesToWebpHandler", () => {
  it("jpg/png 파일을 WebP로 변환하고 DB 경로를 업데이트한다", async () => {
    await seedGame(db, {
      path: "/games/game1",
      thumbnail: join("/mock/thumbnails", "thumb.jpg"),
    });

    mockReaddir.mockResolvedValue(["thumb.jpg"] as any);
    mockStat
      // beforeStat (원본 크기)
      .mockResolvedValueOnce({ size: 10000 } as any)
      // afterStat (변환 후 크기)
      .mockResolvedValueOnce({ size: 3000 } as any);
    mockReadFile.mockResolvedValue(Buffer.from("fake-image"));
    mockOptimizeImage.mockResolvedValue(Buffer.from("optimized-webp"));
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);

    const result = await convertImagesToWebpHandler({} as any, undefined);

    expect(result.total).toBe(1);
    expect(result.converted).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.freedBytes).toBe(7000); // 10000 - 3000

    // 원본 파일 삭제 확인 (OS별 경로 구분자 대응)
    expect(mockUnlink).toHaveBeenCalledWith(
      join("/mock/thumbnails", "thumb.jpg"),
    );

    // DB 경로가 .webp로 업데이트되었는지 확인
    // toRelativePath 모킹이 그대로 반환하므로 join()으로 생성된 경로가 저장됨
    const game = await db("games").where("path", "/games/game1").first();
    expect(game!.thumbnail).toBe(join("/mock/thumbnails", "thumb.webp"));
  });

  it("webp/gif 파일은 변환 대상에서 제외된다", async () => {
    mockReaddir.mockResolvedValue(["already.webp", "animated.gif"] as any);

    const result = await convertImagesToWebpHandler({} as any, undefined);

    expect(result.total).toBe(0);
    expect(result.converted).toBe(0);
    expect(mockOptimizeImage).not.toHaveBeenCalled();
  });

  it("여러 확장자 파일을 모두 변환한다 (.jpg, .jpeg, .png, .bmp)", async () => {
    // DB에 각 파일에 대응하는 게임 데이터 설정
    // toRelativePath 모킹이 그대로 반환 → join()으로 생성된 경로가 DB에 저장됨
    await seedGame(db, {
      path: "/games/g1",
      thumbnail: join("/mock/thumbnails", "a.jpg"),
    });
    await seedGame(db, {
      path: "/games/g2",
      thumbnail: join("/mock/thumbnails", "b.jpeg"),
    });
    await seedGame(db, {
      path: "/games/g3",
      thumbnail: join("/mock/thumbnails", "c.png"),
    });
    await seedGame(db, {
      path: "/games/g4",
      thumbnail: join("/mock/thumbnails", "d.bmp"),
    });

    mockReaddir.mockResolvedValue(["a.jpg", "b.jpeg", "c.png", "d.bmp"] as any);

    // 각 파일별 stat 2번씩 (before, after)
    mockStat
      .mockResolvedValueOnce({ size: 8000 } as any) // a.jpg before
      .mockResolvedValueOnce({ size: 2000 } as any) // a.webp after
      .mockResolvedValueOnce({ size: 6000 } as any) // b.jpeg before
      .mockResolvedValueOnce({ size: 1500 } as any) // b.webp after
      .mockResolvedValueOnce({ size: 12000 } as any) // c.png before
      .mockResolvedValueOnce({ size: 4000 } as any) // c.webp after
      .mockResolvedValueOnce({ size: 20000 } as any) // d.bmp before
      .mockResolvedValueOnce({ size: 5000 } as any); // d.webp after

    mockReadFile.mockResolvedValue(Buffer.from("img-data"));
    mockOptimizeImage.mockResolvedValue(Buffer.from("webp-data"));
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);

    const result = await convertImagesToWebpHandler({} as any, undefined);

    expect(result.total).toBe(4);
    expect(result.converted).toBe(4);
    expect(result.failed).toBe(0);
    // (8000-2000) + (6000-1500) + (12000-4000) + (20000-5000) = 6000 + 4500 + 8000 + 15000 = 33500
    expect(result.freedBytes).toBe(33500);
  });

  it("변환 실패 시 failed 카운트 증가, 나머지는 계속 진행", async () => {
    await seedGame(db, {
      path: "/games/g1",
      thumbnail: join("/mock/thumbnails", "ok.jpg"),
    });

    mockReaddir.mockResolvedValue(["fail.png", "ok.jpg"] as any);

    // fail.png: stat 성공 후 readFile에서 에러
    // ok.jpg: stat(before) → readFile → optimizeImage → writeFile → stat(after) 순서
    mockStat
      .mockResolvedValueOnce({ size: 3000 } as any) // fail.png beforeStat
      .mockResolvedValueOnce({ size: 5000 } as any) // ok.jpg beforeStat
      .mockResolvedValueOnce({ size: 1000 } as any); // ok.webp afterStat

    mockReadFile
      .mockRejectedValueOnce(new Error("읽기 실패")) // fail.png
      .mockResolvedValueOnce(Buffer.from("ok-data") as any); // ok.jpg

    mockOptimizeImage.mockResolvedValue(Buffer.from("webp"));
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);

    const result = await convertImagesToWebpHandler({} as any, undefined);

    expect(result.total).toBe(2);
    expect(result.converted).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.freedBytes).toBe(4000); // 5000 - 1000
  });

  it("gameImages 테이블의 경로도 업데이트한다", async () => {
    const game = await seedGame(db, {
      path: "/games/game1",
      thumbnail: null,
    });
    // gameImages에 이미지 경로 설정 — toRelativePath 결과값과 동일한 경로
    const carouselSource = join("/mock/thumbnails", "carousel.png");
    await seedGameImage(db, game.path, carouselSource, 0);

    mockReaddir.mockResolvedValue(["carousel.png"] as any);
    mockStat
      .mockResolvedValueOnce({ size: 8000 } as any)
      .mockResolvedValueOnce({ size: 2000 } as any);
    mockReadFile.mockResolvedValue(Buffer.from("img"));
    mockOptimizeImage.mockResolvedValue(Buffer.from("webp"));
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);

    const result = await convertImagesToWebpHandler({} as any, undefined);

    expect(result.converted).toBe(1);

    // gameImages 테이블의 path가 .webp로 업데이트되었는지 확인
    const images = await db("gameImages").where("gamePath", game.path).select();
    expect(images[0].path).toBe(join("/mock/thumbnails", "carousel.webp"));
  });

  it("변환 대상이 없으면 0건 반환", async () => {
    mockReaddir.mockResolvedValue([] as any);

    const result = await convertImagesToWebpHandler({} as any, undefined);

    expect(result.total).toBe(0);
    expect(result.converted).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.freedBytes).toBe(0);
  });

  it("변환 후 크기가 더 커지면 freedBytes가 음수가 된다", async () => {
    await seedGame(db, {
      path: "/games/g1",
      thumbnail: join("/mock/thumbnails", "small.png"),
    });

    mockReaddir.mockResolvedValue(["small.png"] as any);
    mockStat
      .mockResolvedValueOnce({ size: 1000 } as any) // 원본 작음
      .mockResolvedValueOnce({ size: 5000 } as any); // 변환 후 더 큼
    mockReadFile.mockResolvedValue(Buffer.from("tiny"));
    mockOptimizeImage.mockResolvedValue(Buffer.from("bigger-webp"));
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);

    const result = await convertImagesToWebpHandler({} as any, undefined);

    expect(result.converted).toBe(1);
    expect(result.freedBytes).toBe(-4000); // 1000 - 5000
  });
});
