import { describe, expect, it, vi, beforeEach } from "vitest";

const storeState = {
  libraryPaths: ["C:\\lib1", "C:\\lib2"],
  disabled: ["C:\\lib2"],
  excluded: ["unins000.exe"],
};
const setLastRefreshedAt = vi.fn();
vi.mock("../../store.js", () => ({
  setLastRefreshedAt: (...args: unknown[]) => setLastRefreshedAt(...args),
  getLibraryPaths: () => storeState.libraryPaths,
  getDisabledLibraryPaths: () => storeState.disabled,
  getExcludedExecutables: () => storeState.excluded,
  addExcludedExecutable: vi.fn((name: string) => {
    if (!storeState.excluded.includes(name)) storeState.excluded.push(name);
  }),
  removeExcludedExecutable: vi.fn((name: string) => {
    storeState.excluded = storeState.excluded.filter((e) => e !== name);
  }),
}));

const scanLibraryPaths = vi.fn(async (..._args: unknown[]) => ({
  addedCount: 2,
  deletedCount: 1,
}));
vi.mock("../../handlers/home-scan.js", () => ({
  scanLibraryPaths: (...args: unknown[]) => scanLibraryPaths(...args),
}));
const registerLibraryPath = vi.fn((...args: unknown[]) => ({
  path: args[0] as string,
}));
vi.mock("../../handlers/home-library.js", () => ({
  registerLibraryPath: (...args: unknown[]) => registerLibraryPath(...args),
}));
vi.mock("../../handlers/home-game-control.js", () => ({
  toExecutableFileName: (e: string) => e.split(/[/\\]/).pop() || e,
}));
const validateDirectoryPath = vi.fn();
vi.mock("../../utils/validator.js", () => ({
  validateDirectoryPath: (...args: unknown[]) => validateDirectoryPath(...args),
}));
const notifyExternalChange = vi.fn();
vi.mock("../notify.js", () => ({
  notifyExternalChange: (...args: unknown[]) => notifyExternalChange(...args),
  notifyGameChanged: vi.fn(),
  broadcast: vi.fn(),
}));
vi.mock("../../utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  addExcludedExecutableTool,
  addLibraryPathTool,
  listExcludedExecutablesTool,
  refreshLibraryTool,
  removeExcludedExecutableTool,
} from "./library.js";

beforeEach(() => {
  vi.clearAllMocks();
  storeState.excluded = ["unins000.exe"];
});

describe("refreshLibraryTool", () => {
  it("paths 생략 시 활성 경로 전체를 스캔하고 games 범위를 알려야 한다", async () => {
    const result = await refreshLibraryTool({});
    expect(scanLibraryPaths).toHaveBeenCalledWith(["C:\\lib1"]);
    expect(result).toEqual({
      addedCount: 2,
      deletedCount: 1,
      scannedPaths: ["C:\\lib1"],
    });
    expect(notifyExternalChange).toHaveBeenCalledWith({ scope: "games" });
    expect(setLastRefreshedAt).toHaveBeenCalledWith(expect.any(String));
  });

  it("등록되지 않은 경로는 거부해야 한다", async () => {
    await expect(refreshLibraryTool({ paths: ["C:\\other"] })).rejects.toThrow(
      "등록되지 않은 라이브러리 경로",
    );
    expect(scanLibraryPaths).not.toHaveBeenCalled();
  });

  it("대소문자가 달라도 등록된 경로로 인정해야 한다", async () => {
    await refreshLibraryTool({ paths: ["c:\\LIB2"] });
    expect(scanLibraryPaths).toHaveBeenCalledWith(["C:\\lib2"]);
  });
});

describe("addLibraryPathTool", () => {
  it("디렉터리 검증 후 등록하고 library 범위를 알려야 한다", async () => {
    const result = await addLibraryPathTool({ path: "C:\\new" });
    expect(validateDirectoryPath).toHaveBeenCalledWith("C:\\new");
    expect(registerLibraryPath).toHaveBeenCalledWith("C:\\new");
    expect(result.ok).toBe(true);
    expect(result.libraryPaths).toEqual(["C:\\lib1", "C:\\lib2"]);
    expect(notifyExternalChange).toHaveBeenCalledWith({ scope: "library" });
  });
});

describe("excluded executables tools", () => {
  it("목록 조회", async () => {
    expect(await listExcludedExecutablesTool()).toEqual(["unins000.exe"]);
  });

  it("추가는 파일명만 저장하고 excludedExecutables 범위를 알려야 한다", async () => {
    const result = await addExcludedExecutableTool({
      executable: "C:\\x\\setup.exe",
    });
    expect(result).toEqual(["unins000.exe", "setup.exe"]);
    expect(notifyExternalChange).toHaveBeenCalledWith({
      scope: "excludedExecutables",
    });
  });

  it("제거", async () => {
    const result = await removeExcludedExecutableTool({
      executable: "unins000.exe",
    });
    expect(result).toEqual([]);
  });
});
