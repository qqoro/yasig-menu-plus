/**
 * 썸네일 툴 테스트 (인메모리 SQLite)
 */

import { mkdtemp, rm, writeFile } from "fs/promises";
import type { Knex } from "knex";
import { tmpdir } from "os";
import { join } from "path";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestDb, seedGame, truncateAll } from "../../db/test-utils.js";

// ========== 모킹 ==========

// setThumbnailFromUrl이 userData/thumbnails에 실제로 mkdir하므로 임시 디렉터리를 쓴다
const tmp = vi.hoisted(() => ({ userData: "" }));
vi.mock("electron", () => ({
  app: { getPath: () => tmp.userData, isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("../../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => p,
  toRelativePath: (p: string | null) => p,
}));

vi.mock("../../utils/validator.js", () => ({
  validatePath: vi.fn(),
  validateUrl: vi.fn(),
  validateDirectoryPath: vi.fn(),
  validateSearchQuery: vi.fn(),
}));

vi.mock("../../utils/downloader.js", () => ({
  downloadImage: vi.fn(async () => "thumbs/abc.jpg"),
  deleteImage: vi.fn(),
  deleteThumbnail: vi.fn(),
}));

vi.mock("../notify.js", () => ({
  notifyGameChanged: vi.fn(),
  notifyExternalChange: vi.fn(),
  broadcast: vi.fn(),
}));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: {
    getKnex: () => dbRef.current!,
  },
}));

// ========== 테스트 대상 임포트 ==========

import { notifyGameChanged } from "../notify.js";
import {
  removeThumbnailTool,
  setThumbnailFromFileTool,
  setThumbnailFromUrlTool,
} from "./thumbnail.js";

describe("thumbnail tools", () => {
  beforeAll(async () => {
    tmp.userData = await mkdtemp(join(tmpdir(), "mcp-thumb-"));
    dbRef.current = await createTestDb();
  });

  afterAll(async () => {
    await dbRef.current?.destroy();
    await rm(tmp.userData, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await truncateAll(dbRef.current!);
    vi.clearAllMocks();
  });

  it("URL 썸네일 설정 후 thumbnail=true 요약을 돌려줘야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a" });
    const result = await setThumbnailFromUrlTool({
      path: "/games/a",
      url: "https://example.com/a.jpg",
    });
    expect(result.game.thumbnail).toBe(true);
    expect(notifyGameChanged).toHaveBeenCalledWith("/games/a");
  });

  it("없는 로컬 파일은 거부해야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a" });
    await expect(
      setThumbnailFromFileTool({ path: "/games/a", filePath: "/no/such.jpg" }),
    ).rejects.toThrow("이미지 파일이 존재하지 않습니다.");
  });

  it("이미지가 아닌 파일은 거부해야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a" });
    const file = join(tmp.userData, "readme.txt");
    await writeFile(file, "hello");
    await expect(
      setThumbnailFromFileTool({ path: "/games/a", filePath: file }),
    ).rejects.toThrow("이미지 파일만 설정할 수 있습니다.");
  });

  it("썸네일 제거 후 thumbnail=false여야 한다", async () => {
    await seedGame(dbRef.current!, {
      path: "/games/a",
      thumbnail: "thumbs/x.jpg",
    });
    const result = await removeThumbnailTool({ path: "/games/a" });
    expect(result.game.thumbnail).toBe(false);
  });
});
