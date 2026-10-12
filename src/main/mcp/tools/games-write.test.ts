/**
 * 메타데이터 수정 툴 통합 테스트 (인메모리 SQLite)
 */

import type { Knex } from "knex";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { z } from "zod";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestDb, truncateAll, seedGame } from "../../db/test-utils.js";

// ========== 모킹 ==========

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("../../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => p,
  toRelativePath: (p: string | null) => p,
}));

vi.mock("../../utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock("../../utils/validator.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/validator.js")>();
  return {
    ...actual,
    validatePath: vi.fn(),
    validateDirectoryPath: vi.fn(),
    validateSearchQuery: vi.fn(),
    validateUrl: vi.fn(),
  };
});

vi.mock("../../utils/downloader.js", () => ({
  downloadImage: vi.fn(),
  deleteImage: vi.fn(),
  deleteThumbnail: vi.fn(),
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

const notifyGameChanged = vi.fn();
vi.mock("../notify.js", () => ({
  notifyGameChanged: (...args: unknown[]) => notifyGameChanged(...args),
  notifyExternalChange: vi.fn(),
  broadcast: vi.fn(),
}));

import {
  addTagsTool,
  removeTagsTool,
  addMakersTool,
  addCategoriesTool,
  namesInput,
  setExecutablePathTool,
  setRatingTool,
  updateGameTool,
} from "./games-write.js";
import { getGameDetail } from "../../handlers/gameDetail.js";

beforeAll(async () => {
  dbRef.current = await createTestDb();
});
afterAll(async () => {
  await dbRef.current?.destroy();
});
beforeEach(async () => {
  await truncateAll(dbRef.current!);
  notifyGameChanged.mockClear();
});

describe("updateGameTool", () => {
  it("넘긴 필드만 수정하고 수정 후 요약을 돌려줘야 한다", async () => {
    await seedGame(dbRef.current!, {
      path: "/games/a",
      title: "Old",
      memo: "keep",
    });
    const result = await updateGameTool({ path: "/games/a", title: "New" });
    expect(result.ok).toBe(true);
    expect(result.game.title).toBe("New");
    expect(result.game.memo).toBe("keep");
    expect(notifyGameChanged).toHaveBeenCalledWith("/games/a");
  });

  it("ISO 발매일을 저장하고 재조회 시 같은 날짜가 나와야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a" });
    const result = await updateGameTool({
      path: "/games/a",
      publishDate: "2024-03-01",
    });
    expect(result.game.publishDate).toBe("2024-03-01T00:00:00.000Z");
    const detail = await getGameDetail("/games/a");
    expect(detail?.publishDate?.toISOString()).toBe("2024-03-01T00:00:00.000Z");
  });

  it("비 ISO 발매일은 저장 없이 거부해야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a", title: "Old" });
    await expect(
      updateGameTool({
        path: "/games/a",
        title: "New",
        publishDate: "2024/03/01",
      }),
    ).rejects.toThrow("발매일 형식이 올바르지 않습니다");
    const detail = await getGameDetail("/games/a");
    expect(detail?.title).toBe("Old");
    expect(notifyGameChanged).not.toHaveBeenCalled();
  });

  it("없는 게임이면 오류", async () => {
    await expect(updateGameTool({ path: "/none", title: "x" })).rejects.toThrow(
      "게임을 찾을 수 없습니다.",
    );
  });
});

describe("setRatingTool", () => {
  it("별점을 저장하고 null로 해제할 수 있어야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a", fingerprint: "fp-a" });
    expect(
      (await setRatingTool({ path: "/games/a", rating: 4 })).game.rating,
    ).toBe(4);
    expect(
      (await setRatingTool({ path: "/games/a", rating: null })).game.rating,
    ).toBeNull();
  });
});

describe("addTagsTool / removeTagsTool", () => {
  it("여러 태그를 한 번에 추가하고 중복은 무시해야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a" });
    const result = await addTagsTool({
      path: "/games/a",
      names: ["a", "b", "a"],
    });
    expect(result.game.tags.sort()).toEqual(["a", "b"]);
    expect(result.failed).toBeUndefined();
  });

  it("제거는 없는 태그를 조용히 무시해야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a" });
    await addTagsTool({ path: "/games/a", names: ["a", "b"] });
    const result = await removeTagsTool({
      path: "/games/a",
      names: ["a", "zzz"],
    });
    expect(result.game.tags).toEqual(["b"]);
  });

  it("제작사/카테고리도 같은 방식으로 추가돼야 한다", async () => {
    await seedGame(dbRef.current!, { path: "/games/a" });
    expect(
      (await addMakersTool({ path: "/games/a", names: ["c1"] })).game.makers,
    ).toEqual(["c1"]);
    expect(
      (await addCategoriesTool({ path: "/games/a", names: ["RPG"] })).game
        .categories,
    ).toEqual(["RPG"]);
  });

  it("입력 스키마는 빈 문자열·공백 이름과 빈 배열을 거부해야 한다", () => {
    const schema = z.object(namesInput);
    expect(schema.safeParse({ path: "/games/a", names: ["  "] }).success).toBe(
      false,
    );
    expect(schema.safeParse({ path: "/games/a", names: [] }).success).toBe(
      false,
    );
    const ok = schema.safeParse({ path: "/games/a", names: [" a ", "a", "b"] });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.names).toEqual(["a", "b"]);
  });
});

describe("setExecutablePathTool", () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "ymp-mcp-exe-"));
    await mkdir(join(root, "game"));
    await writeFile(join(root, "game", "run.exe"), "x");
    await writeFile(join(root, "outside.exe"), "x");
  });
  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("게임 폴더 안의 실제 파일이면 저장해야 한다", async () => {
    const gamePath = join(root, "game");
    await seedGame(dbRef.current!, { path: gamePath });
    const result = await setExecutablePathTool({
      path: gamePath,
      executablePath: join(gamePath, "run.exe"),
    });
    expect(result.game.executablePath).toBe(join(gamePath, "run.exe"));
  });

  it("게임 폴더 밖·없는 파일·디렉터리는 거부해야 한다", async () => {
    const gamePath = join(root, "game");
    await seedGame(dbRef.current!, { path: gamePath });
    await expect(
      setExecutablePathTool({
        path: gamePath,
        executablePath: join(root, "outside.exe"),
      }),
    ).rejects.toThrow("게임 폴더 안에");
    await expect(
      setExecutablePathTool({
        path: gamePath,
        executablePath: join(gamePath, "no.exe"),
      }),
    ).rejects.toThrow("존재하지 않습니다");
    await expect(
      setExecutablePathTool({ path: gamePath, executablePath: gamePath }),
    ).rejects.toThrow("게임 폴더 안에");
  });
});
