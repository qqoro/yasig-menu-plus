import { Dirent } from "fs";
import { join } from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  EXECUTABLE_EXTENSIONS,
  EXCLUDED_FOLDER_NAMES,
  hasExecutableFile,
  scanFolderRecursive,
  scanSingleFolder,
} from "./scan-logic.js";

/**
 * scan-logic 유틸리티 테스트
 * 실행: pnpm test
 */

// fs 모듈 모킹
vi.mock("fs", () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

// fs 모킹 함수 가져오기
import { existsSync, readdirSync } from "fs";
const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);

/**
 * Dirent 객체를 생성하는 헬퍼 함수
 */
function createDirent(
  name: string,
  options: { isFile?: boolean; isDirectory?: boolean } = {},
): Dirent {
  return {
    name,
    isFile: () => options.isFile ?? false,
    isDirectory: () => options.isDirectory ?? false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    path: "",
    parentPath: "",
  } as Dirent;
}

/**
 * mockReaddirSync의 반환값을 설정하는 헬퍼 함수
 * 반복되는 `as unknown as ReturnType<typeof readdirSync>` 캐스팅을 제거
 */
function mockReaddirReturn(dirents: ReturnType<typeof createDirent>[]) {
  mockReaddirSync.mockReturnValue(
    dirents as unknown as ReturnType<typeof readdirSync>,
  );
}

/**
 * Dirent 배열을 readdirSync 반환 타입으로 캐스팅하는 헬퍼 함수
 * mockImplementation 내부에서 사용
 */
function asReaddirReturn(dirents: ReturnType<typeof createDirent>[]) {
  return dirents as unknown as ReturnType<typeof readdirSync>;
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ============================================
// 상수 테스트
// ============================================
describe("상수", () => {
  it("EXECUTABLE_EXTENSIONS가 정확히 [.exe, .lnk, .url] 포함", () => {
    expect(EXECUTABLE_EXTENSIONS).toEqual([".exe", ".lnk", ".url"]);
  });

  it("EXCLUDED_FOLDER_NAMES가 주요 항목을 포함", () => {
    const expectedItems = [
      "$recycle.bin",
      "system volume information",
      "node_modules",
      "__pycache__",
      "_commonredist",
      "directx",
      "redist",
      "temp",
      "tmp",
      "cache",
      "logs",
    ];

    for (const item of expectedItems) {
      expect(EXCLUDED_FOLDER_NAMES.has(item)).toBe(true);
    }
    expect(EXCLUDED_FOLDER_NAMES.size).toBe(expectedItems.length);
  });
});

// ============================================
// hasExecutableFile 테스트
// ============================================
describe("hasExecutableFile", () => {
  it("exe 파일이 있는 폴더 → true", () => {
    mockReaddirReturn([createDirent("game.exe", { isFile: true })]);

    expect(hasExecutableFile("/games/mygame")).toBe(true);
  });

  it("lnk 파일이 있는 폴더 → true", () => {
    mockReaddirReturn([createDirent("shortcut.lnk", { isFile: true })]);

    expect(hasExecutableFile("/games/mygame")).toBe(true);
  });

  it("url 파일이 있는 폴더 → true", () => {
    mockReaddirReturn([createDirent("website.url", { isFile: true })]);

    expect(hasExecutableFile("/games/mygame")).toBe(true);
  });

  it("exe 파일이 없는 폴더 (txt만) → false", () => {
    mockReaddirReturn([
      createDirent("readme.txt", { isFile: true }),
      createDirent("notes.txt", { isFile: true }),
    ]);

    expect(hasExecutableFile("/games/mygame")).toBe(false);
  });

  it("빈 폴더 → false", () => {
    mockReaddirReturn([]);

    expect(hasExecutableFile("/games/mygame")).toBe(false);
  });

  it("읽기 오류 (존재하지 않는 폴더) → false", () => {
    mockReaddirSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    expect(hasExecutableFile("/nonexistent/path")).toBe(false);
  });

  it("대소문자 무시 (.EXE) → true", () => {
    mockReaddirReturn([createDirent("GAME.EXE", { isFile: true })]);

    expect(hasExecutableFile("/games/mygame")).toBe(true);
  });

  it("디렉터리는 실행파일로 취급하지 않음", () => {
    mockReaddirReturn([createDirent("folder.exe", { isDirectory: true })]);

    expect(hasExecutableFile("/games/mygame")).toBe(false);
  });
});

// ============================================
// scanSingleFolder 테스트
// ============================================
describe("scanSingleFolder", () => {
  it("존재하지 않는 폴더 → 빈 결과", () => {
    mockExistsSync.mockReturnValue(false);

    const result = scanSingleFolder("/nonexistent");

    expect(result.candidates).toEqual([]);
    expect(result.subFolders).toEqual([]);
  });

  it("exe가 있는 하위 폴더 → candidates에 추가", () => {
    mockExistsSync.mockReturnValue(true);

    // 상위 폴더 readdir: 하위 폴더 "GameFolder" 반환
    mockReaddirSync.mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : String(path);
      if (pathStr === "/library") {
        return asReaddirReturn([
          createDirent("GameFolder", { isDirectory: true }),
        ]);
      }
      // 하위 폴더 readdir: exe 파일 존재 (hasExecutableFile 호출)
      if (pathStr === join("/library", "GameFolder")) {
        return asReaddirReturn([createDirent("game.exe", { isFile: true })]);
      }
      return asReaddirReturn([]);
    });

    const result = scanSingleFolder("/library");

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual({
      path: join("/library", "GameFolder"),
      name: "GameFolder",
      isCompressFile: false,
    });
    expect(result.subFolders).toHaveLength(0);
  });

  it("exe가 없는 하위 폴더 → subFolders에 추가", () => {
    mockExistsSync.mockReturnValue(true);

    mockReaddirSync.mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : String(path);
      if (pathStr === "/library") {
        return asReaddirReturn([
          createDirent("EmptyFolder", { isDirectory: true }),
        ]);
      }
      // 하위 폴더에 exe 없음
      if (pathStr === join("/library", "EmptyFolder")) {
        return asReaddirReturn([createDirent("readme.txt", { isFile: true })]);
      }
      return asReaddirReturn([]);
    });

    const result = scanSingleFolder("/library");

    expect(result.candidates).toHaveLength(0);
    expect(result.subFolders).toHaveLength(1);
    expect(result.subFolders[0]).toBe(join("/library", "EmptyFolder"));
  });

  it("압축파일 (.zip) → candidates에 추가 (isCompressFile: true)", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirReturn([createDirent("game.zip", { isFile: true })]);

    const result = scanSingleFolder("/library");

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual({
      path: join("/library", "game.zip"),
      name: "game.zip",
      isCompressFile: true,
    });
  });

  it.each([
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
    ".tgz",
    ".bz2",
    ".alz",
    ".egg",
  ])("압축파일 확장자 %s → isCompressFile: true", (ext) => {
    mockExistsSync.mockReturnValue(true);
    const fileName = `archive${ext}`;
    mockReaddirReturn([createDirent(fileName, { isFile: true })]);

    const result = scanSingleFolder("/library");

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].isCompressFile).toBe(true);
  });

  it("실행파일 직접 (.exe) → candidates에 추가", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirReturn([createDirent("launcher.exe", { isFile: true })]);

    const result = scanSingleFolder("/library");

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toEqual({
      path: join("/library", "launcher.exe"),
      name: "launcher.exe",
      isCompressFile: false,
    });
  });

  it("숨김 파일/폴더 (. 접두사) → 제외", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirReturn([
      createDirent(".hidden_folder", { isDirectory: true }),
      createDirent(".hidden_file.exe", { isFile: true }),
    ]);

    const result = scanSingleFolder("/library");

    expect(result.candidates).toHaveLength(0);
    expect(result.subFolders).toHaveLength(0);
  });

  it.each([
    "node_modules",
    "__pycache__",
    "$RECYCLE.BIN",
    "Temp",
    "Cache",
    "_CommonRedist",
  ])("제외 폴더 (%s) → 제외", (folderName) => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirReturn([createDirent(folderName, { isDirectory: true })]);

    const result = scanSingleFolder("/library");

    expect(result.candidates).toHaveLength(0);
    expect(result.subFolders).toHaveLength(0);
  });

  it("혼합 시나리오: 여러 종류가 섞인 폴더", () => {
    mockExistsSync.mockReturnValue(true);

    mockReaddirSync.mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : String(path);
      if (pathStr === "/library") {
        return asReaddirReturn([
          createDirent("GameWithExe", { isDirectory: true }), // exe 있는 폴더
          createDirent("EmptySubFolder", { isDirectory: true }), // exe 없는 폴더
          createDirent("node_modules", { isDirectory: true }), // 제외 폴더
          createDirent(".hidden", { isDirectory: true }), // 숨김 폴더
          createDirent("archive.zip", { isFile: true }), // 압축파일
          createDirent("launcher.exe", { isFile: true }), // 실행파일
          createDirent("readme.txt", { isFile: true }), // 일반 파일 (무시)
        ]);
      }
      if (pathStr === join("/library", "GameWithExe")) {
        return asReaddirReturn([createDirent("game.exe", { isFile: true })]);
      }
      if (pathStr === join("/library", "EmptySubFolder")) {
        return asReaddirReturn([createDirent("data.txt", { isFile: true })]);
      }
      return asReaddirReturn([]);
    });

    const result = scanSingleFolder("/library");

    // candidates: GameWithExe(폴더+exe), archive.zip(압축), launcher.exe(실행파일)
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        {
          path: join("/library", "GameWithExe"),
          name: "GameWithExe",
          isCompressFile: false,
        },
        {
          path: join("/library", "archive.zip"),
          name: "archive.zip",
          isCompressFile: true,
        },
        {
          path: join("/library", "launcher.exe"),
          name: "launcher.exe",
          isCompressFile: false,
        },
      ]),
    );

    // subFolders: EmptySubFolder만 (node_modules, .hidden 제외)
    expect(result.subFolders).toHaveLength(1);
    expect(result.subFolders[0]).toBe(join("/library", "EmptySubFolder"));
  });

  it("readdirSync 오류 시 빈 결과 반환", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const result = scanSingleFolder("/no-permission");

    expect(result.candidates).toEqual([]);
    expect(result.subFolders).toEqual([]);
  });
});

// ============================================
// scanFolderRecursive 테스트
// ============================================
describe("scanFolderRecursive", () => {
  it("깊이 0에서 게임 후보 수집", () => {
    mockExistsSync.mockReturnValue(true);

    mockReaddirSync.mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : String(path);
      if (pathStr === "/root") {
        return asReaddirReturn([
          createDirent("game.zip", { isFile: true }),
          createDirent("launcher.exe", { isFile: true }),
        ]);
      }
      return asReaddirReturn([]);
    });

    const result = scanFolderRecursive("/root", 5);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        {
          path: join("/root", "game.zip"),
          name: "game.zip",
          isCompressFile: true,
        },
        {
          path: join("/root", "launcher.exe"),
          name: "launcher.exe",
          isCompressFile: false,
        },
      ]),
    );
  });

  it("maxDepth 초과 시 스캔 중단", () => {
    mockExistsSync.mockReturnValue(true);

    // depth 0: /root -> subFolder "level1" (exe 없음, 하위 폴더만 있음)
    // depth 1: /root/level1 -> level2에 exe가 있으므로 level2는 candidate로 추가됨
    // level2 내부로의 재귀는 발생하지 않음 (이미 candidate로 처리됨)
    mockReaddirSync.mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : String(path);
      if (pathStr === "/root") {
        return asReaddirReturn([createDirent("level1", { isDirectory: true })]);
      }
      if (pathStr === join("/root", "level1")) {
        return asReaddirReturn([createDirent("level2", { isDirectory: true })]);
      }
      if (pathStr === join("/root", "level1", "level2")) {
        return asReaddirReturn([
          createDirent("deep_game.exe", { isFile: true }),
        ]);
      }
      return asReaddirReturn([]);
    });

    // maxDepth=1: depth 0(root), depth 1(level1)까지 스캔
    // level1 스캔 시 level2에 exe가 있으므로 level2가 candidates에 추가됨
    // (hasExecutableFile가 level2에서 true를 반환)
    const result = scanFolderRecursive("/root", 1);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: join("/root", "level1", "level2"),
      name: "level2",
      isCompressFile: false,
    });
  });

  it("중첩된 하위 폴더 재귀 스캔", () => {
    mockExistsSync.mockReturnValue(true);

    mockReaddirSync.mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : String(path);
      // depth 0: /root → exe파일 + subFolder
      if (pathStr === "/root") {
        return asReaddirReturn([
          createDirent("game1.exe", { isFile: true }),
          createDirent("subfolder", { isDirectory: true }),
        ]);
      }
      // hasExecutableFile 체크: subfolder에 exe 없음
      if (pathStr === join("/root", "subfolder")) {
        return asReaddirReturn([
          createDirent("innerGame", { isDirectory: true }),
        ]);
      }
      // hasExecutableFile 체크: innerGame에 exe 있음
      if (pathStr === join("/root", "subfolder", "innerGame")) {
        return asReaddirReturn([createDirent("game2.exe", { isFile: true })]);
      }
      return asReaddirReturn([]);
    });

    const result = scanFolderRecursive("/root", 5);

    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        {
          path: join("/root", "game1.exe"),
          name: "game1.exe",
          isCompressFile: false,
        },
        {
          path: join("/root", "subfolder", "innerGame"),
          name: "innerGame",
          isCompressFile: false,
        },
      ]),
    );
  });

  it("maxDepth 0일 때 시작 경로만 스캔", () => {
    mockExistsSync.mockReturnValue(true);

    mockReaddirSync.mockImplementation((path: any) => {
      const pathStr = typeof path === "string" ? path : String(path);
      if (pathStr === "/root") {
        return asReaddirReturn([
          createDirent("game.exe", { isFile: true }),
          createDirent("subfolder", { isDirectory: true }),
        ]);
      }
      // subfolder에 exe 없음 → subFolder로 추가되지만 depth 초과
      if (pathStr === join("/root", "subfolder")) {
        return asReaddirReturn([createDirent("readme.txt", { isFile: true })]);
      }
      return asReaddirReturn([]);
    });

    const result = scanFolderRecursive("/root", 0);

    // depth 0에서 game.exe는 candidates로, subfolder는 subFolders로
    // subfolder는 depth 1이므로 maxDepth=0 초과 → 스캔 안 됨
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: join("/root", "game.exe"),
      name: "game.exe",
      isCompressFile: false,
    });
  });
});
