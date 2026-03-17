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
      hasExecutable: true,
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
      hasExecutable: true,
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
      hasExecutable: true,
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
          hasExecutable: true,
        },
        {
          path: join("/library", "archive.zip"),
          name: "archive.zip",
          isCompressFile: true,
          hasExecutable: true,
        },
        {
          path: join("/library", "launcher.exe"),
          name: "launcher.exe",
          isCompressFile: false,
          hasExecutable: true,
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
// 비게임 콘텐츠 (RJ코드) 인식 테스트
// ============================================
describe("비게임 콘텐츠 (RJ코드) 인식", () => {
  it("scanSingleFolder: RJ코드 폴더도 하위 스캔 대상으로 추가", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      if (String(path).endsWith("RJ123456_작품명")) {
        return [createDirent("track01.mp3", { isFile: true })] as any;
      }
      return [createDirent("RJ123456_작품명", { isDirectory: true })] as any;
    });

    // enableNonGameContent=true여도 scanSingleFolder는 subFolders에만 추가
    const result = scanSingleFolder("/library", true);
    expect(result.candidates).toHaveLength(0);
    expect(result.subFolders).toContain(join("/library", "RJ123456_작품명"));
  });

  it("scanFolderRecursive: 하위에 게임 없는 RJ코드 폴더를 비게임 콘텐츠로 등록", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p.endsWith("RJ123456_작품명")) {
        return [createDirent("track01.mp3", { isFile: true })] as any;
      }
      return [createDirent("RJ123456_작품명", { isDirectory: true })] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: join("/library", "RJ123456_작품명"),
      name: "RJ123456_작품명",
      isCompressFile: false,
      hasExecutable: false,
    });
  });

  it("enableNonGameContent=false이면 RJ코드 폴더를 비게임 콘텐츠로 등록하지 않음", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      if (String(path).endsWith("RJ123456_작품명")) {
        return [createDirent("track01.mp3", { isFile: true })] as any;
      }
      return [createDirent("RJ123456_작품명", { isDirectory: true })] as any;
    });

    const result = scanFolderRecursive("/library", 5, false);
    expect(result).toHaveLength(0);
  });

  it("VJ/BJ 코드도 인식", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p.endsWith("VJ012345_음성작품") || p.endsWith("BJ098765_도서")) {
        return [createDirent("file.mp3", { isFile: true })] as any;
      }
      return [
        createDirent("VJ012345_음성작품", { isDirectory: true }),
        createDirent("BJ098765_도서", { isDirectory: true }),
      ] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(2);
    expect(result.every((c) => !c.hasExecutable)).toBe(true);
  });

  it("실행파일이 있는 RJ코드 폴더는 hasExecutable=true", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      if (String(path).endsWith("RJ123456_게임")) {
        return [createDirent("game.exe", { isFile: true })] as any;
      }
      return [createDirent("RJ123456_게임", { isDirectory: true })] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(1);
    expect(result[0].hasExecutable).toBe(true);
  });

  it("하위에 게임이 있는 RJ코드 폴더는 비게임 콘텐츠로 등록하지 않음", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p === "/library") {
        return [createDirent("RJ123456_시리즈", { isDirectory: true })] as any;
      }
      if (p.endsWith("RJ123456_시리즈")) {
        return [
          createDirent("Part1", { isDirectory: true }),
          createDirent("Part2", { isDirectory: true }),
        ] as any;
      }
      if (p.endsWith("Part1") || p.endsWith("Part2")) {
        return [createDirent("game.exe", { isFile: true })] as any;
      }
      return [] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(2);
    expect(result.every((c) => c.hasExecutable)).toBe(true);
    expect(result.map((c) => c.name)).toEqual(
      expect.arrayContaining(["Part1", "Part2"]),
    );
  });

  it("RJ코드 대소문자 무시 (rj, Rj 등)", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p.endsWith("rj123456_소문자") || p.endsWith("Rj789012_혼합")) {
        return [createDirent("audio.mp3", { isFile: true })] as any;
      }
      return [
        createDirent("rj123456_소문자", { isDirectory: true }),
        createDirent("Rj789012_혼합", { isDirectory: true }),
      ] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(2);
    expect(result.every((c) => !c.hasExecutable)).toBe(true);
  });

  it("RJ코드 자릿수 (6자리, 8자리 모두 인식)", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p.endsWith("RJ123456_6자리") || p.endsWith("RJ12345678_8자리")) {
        return [createDirent("track.flac", { isFile: true })] as any;
      }
      return [
        createDirent("RJ123456_6자리", { isDirectory: true }),
        createDirent("RJ12345678_8자리", { isDirectory: true }),
      ] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(2);
  });

  it("RJ코드가 아닌 폴더명은 비게임 콘텐츠로 등록하지 않음", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (
        p.endsWith("RJ12345_5자리") ||
        p.endsWith("XJ123456_잘못된코드") ||
        p.endsWith("일반폴더")
      ) {
        return [createDirent("audio.mp3", { isFile: true })] as any;
      }
      return [
        createDirent("RJ12345_5자리", { isDirectory: true }),
        createDirent("XJ123456_잘못된코드", { isDirectory: true }),
        createDirent("일반폴더", { isDirectory: true }),
      ] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(0);
  });

  it("여러 RJ코드 폴더 중 게임 있는 것과 없는 것 혼합", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p === "/library") {
        return [
          createDirent("RJ111111_음성", { isDirectory: true }),
          createDirent("RJ222222_게임시리즈", { isDirectory: true }),
          createDirent("RJ333333_영상", { isDirectory: true }),
        ] as any;
      }
      // RJ111111: 음성 작품 (게임 없음)
      if (p.endsWith("RJ111111_음성")) {
        return [createDirent("track.mp3", { isFile: true })] as any;
      }
      // RJ222222: 하위에 게임 있음
      if (p.endsWith("RJ222222_게임시리즈")) {
        return [createDirent("GameFolder", { isDirectory: true })] as any;
      }
      if (p.endsWith("GameFolder")) {
        return [createDirent("game.exe", { isFile: true })] as any;
      }
      // RJ333333: 영상 작품 (게임 없음)
      if (p.endsWith("RJ333333_영상")) {
        return [createDirent("video.mp4", { isFile: true })] as any;
      }
      return [] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    // RJ111111(비게임) + GameFolder(게임) + RJ333333(비게임) = 3개
    // RJ222222는 하위에 게임이 있으므로 비게임 등록 안 됨
    expect(result).toHaveLength(3);

    const nonGameResults = result.filter((c) => !c.hasExecutable);
    expect(nonGameResults).toHaveLength(2);
    expect(nonGameResults.map((c) => c.name)).toEqual(
      expect.arrayContaining(["RJ111111_음성", "RJ333333_영상"]),
    );

    const gameResults = result.filter((c) => c.hasExecutable);
    expect(gameResults).toHaveLength(1);
    expect(gameResults[0].name).toBe("GameFolder");
  });

  it("RJ코드 폴더 내부에 압축파일만 있는 경우 (하위 게임으로 간주)", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p.endsWith("RJ123456_압축게임")) {
        return [createDirent("game.zip", { isFile: true })] as any;
      }
      return [createDirent("RJ123456_압축게임", { isDirectory: true })] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    // game.zip이 게임 후보로 등록 → RJ코드 폴더는 비게임 콘텐츠 아님
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("game.zip");
    expect(result[0].isCompressFile).toBe(true);
    expect(result[0].hasExecutable).toBe(true);
  });

  it("중첩된 RJ코드 폴더 (RJ폴더 안에 RJ폴더)", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p === "/library") {
        return [
          createDirent("RJ111111_서클모음", { isDirectory: true }),
        ] as any;
      }
      if (p.endsWith("RJ111111_서클모음")) {
        return [
          createDirent("RJ222222_작품A", { isDirectory: true }),
          createDirent("RJ333333_작품B", { isDirectory: true }),
        ] as any;
      }
      if (p.endsWith("RJ222222_작품A") || p.endsWith("RJ333333_작품B")) {
        return [createDirent("audio.mp3", { isFile: true })] as any;
      }
      return [] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    // RJ222222, RJ333333은 비게임 콘텐츠
    // RJ111111은 하위에 비게임 콘텐츠(후보)가 있으므로... 후보도 child candidate로 간주됨
    // → RJ111111도 비게임 콘텐츠로 등록되지 않아야 함
    const names = result.map((c) => c.name);
    expect(names).toContain("RJ222222_작품A");
    expect(names).toContain("RJ333333_작품B");
    // RJ111111_서클모음은 하위에 후보(RJ222222, RJ333333)가 있으므로 등록 안 됨
    expect(names).not.toContain("RJ111111_서클모음");
  });

  it("maxDepth 제한으로 하위 스캔이 안 된 RJ코드 폴더는 비게임 콘텐츠로 등록", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p === "/library") {
        return [createDirent("sub", { isDirectory: true })] as any;
      }
      if (p.endsWith("sub")) {
        return [createDirent("RJ123456_작품", { isDirectory: true })] as any;
      }
      // RJ폴더 내부 (depth 2)
      if (p.endsWith("RJ123456_작품")) {
        return [createDirent("audio.mp3", { isFile: true })] as any;
      }
      return [] as any;
    });

    // maxDepth=1: depth0(/library) → depth1(sub) → depth2(RJ123456) 스캔됨
    // RJ폴더가 depth1에서 subFolders에 추가, depth2에서 내용 스캔
    const result = scanFolderRecursive("/library", 2, true);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("RJ123456_작품");
    expect(result[0].hasExecutable).toBe(false);
  });

  it("빈 RJ코드 폴더도 비게임 콘텐츠로 등록", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p.endsWith("RJ123456_빈폴더")) {
        return [] as any;
      }
      return [createDirent("RJ123456_빈폴더", { isDirectory: true })] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("RJ123456_빈폴더");
    expect(result[0].hasExecutable).toBe(false);
  });

  it("RJ코드만 있는 폴더명 (접미사 없음)", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p.endsWith("RJ123456")) {
        return [createDirent("01.mp3", { isFile: true })] as any;
      }
      return [createDirent("RJ123456", { isDirectory: true })] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("RJ123456");
    expect(result[0].hasExecutable).toBe(false);
  });

  it("폴더명 중간에 RJ코드가 있는 경우 (예: 작품_RJ123456_완전판)", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p.endsWith("작품_RJ123456_완전판")) {
        return [createDirent("track.wav", { isFile: true })] as any;
      }
      return [
        createDirent("작품_RJ123456_완전판", { isDirectory: true }),
      ] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(1);
    expect(result[0].hasExecutable).toBe(false);
  });

  it("RJ코드 폴더 안에 .lnk/.url만 있는 경우 (실행파일로 간주)", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p.endsWith("RJ123456_바로가기")) {
        return [createDirent("game.lnk", { isFile: true })] as any;
      }
      return [createDirent("RJ123456_바로가기", { isDirectory: true })] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    // .lnk는 실행파일 → hasExecutable=true인 게임으로 등록
    expect(result).toHaveLength(1);
    expect(result[0].hasExecutable).toBe(true);
  });

  it("일반폴더 > RJ코드폴더 > 일반폴더 > 게임 (깊은 중첩 게임)", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p === "/library") {
        return [createDirent("RJ123456_모음", { isDirectory: true })] as any;
      }
      if (p.endsWith("RJ123456_모음")) {
        return [createDirent("Disc1", { isDirectory: true })] as any;
      }
      if (p.endsWith("Disc1")) {
        return [createDirent("install", { isDirectory: true })] as any;
      }
      if (p.endsWith("install")) {
        return [createDirent("setup.exe", { isFile: true })] as any;
      }
      return [] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    // install 폴더가 게임 후보 → RJ123456_모음은 비게임 콘텐츠 아님
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("install");
    expect(result[0].hasExecutable).toBe(true);
    expect(result.find((c) => c.name === "RJ123456_모음")).toBeUndefined();
  });

  it("RJ코드 폴더와 일반 게임 폴더가 같은 레벨에 혼재", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p === "/library") {
        return [
          createDirent("RJ111111_음성", { isDirectory: true }),
          createDirent("일반게임", { isDirectory: true }),
          createDirent("RJ222222_영상", { isDirectory: true }),
        ] as any;
      }
      if (p.endsWith("RJ111111_음성")) {
        return [createDirent("audio.flac", { isFile: true })] as any;
      }
      if (p.endsWith("일반게임")) {
        return [createDirent("game.exe", { isFile: true })] as any;
      }
      if (p.endsWith("RJ222222_영상")) {
        return [createDirent("movie.mp4", { isFile: true })] as any;
      }
      return [] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(3);

    const game = result.find((c) => c.name === "일반게임");
    expect(game?.hasExecutable).toBe(true);

    const voice = result.find((c) => c.name === "RJ111111_음성");
    expect(voice?.hasExecutable).toBe(false);

    const video = result.find((c) => c.name === "RJ222222_영상");
    expect(video?.hasExecutable).toBe(false);
  });

  it("RJ코드 폴더 하위에 일부만 게임이 있는 경우 (게임 + 미디어 혼합)", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p === "/library") {
        return [createDirent("RJ123456_혼합", { isDirectory: true })] as any;
      }
      if (p.endsWith("RJ123456_혼합")) {
        return [
          createDirent("GamePart", { isDirectory: true }),
          createDirent("bonus_track.mp3", { isFile: true }),
        ] as any;
      }
      if (p.endsWith("GamePart")) {
        return [createDirent("game.exe", { isFile: true })] as any;
      }
      return [] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    // GamePart가 게임 후보 → RJ123456_혼합은 비게임 콘텐츠로 등록 안 됨
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("GamePart");
    expect(result[0].hasExecutable).toBe(true);
  });

  it("같은 이름의 RJ코드가 다른 경로에 있는 경우", () => {
    mockExistsSync.mockReturnValue(true);
    vi.mocked(readdirSync).mockImplementation((path: any) => {
      const p = String(path);
      if (p === "/library") {
        return [
          createDirent("folderA", { isDirectory: true }),
          createDirent("folderB", { isDirectory: true }),
        ] as any;
      }
      if (p.endsWith("folderA")) {
        return [createDirent("RJ123456", { isDirectory: true })] as any;
      }
      if (p.endsWith("folderB")) {
        return [createDirent("RJ123456", { isDirectory: true })] as any;
      }
      // folderA/RJ123456: 게임
      if (p === join("/library", "folderA", "RJ123456")) {
        return [createDirent("game.exe", { isFile: true })] as any;
      }
      // folderB/RJ123456: 음성
      if (p === join("/library", "folderB", "RJ123456")) {
        return [createDirent("voice.mp3", { isFile: true })] as any;
      }
      return [] as any;
    });

    const result = scanFolderRecursive("/library", 5, true);
    expect(result).toHaveLength(2);

    const gameResult = result.find(
      (c) => c.path === join("/library", "folderA", "RJ123456"),
    );
    expect(gameResult?.hasExecutable).toBe(true);

    const voiceResult = result.find(
      (c) => c.path === join("/library", "folderB", "RJ123456"),
    );
    expect(voiceResult?.hasExecutable).toBe(false);
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
          hasExecutable: true,
        },
        {
          path: join("/root", "launcher.exe"),
          name: "launcher.exe",
          isCompressFile: false,
          hasExecutable: true,
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
      hasExecutable: true,
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
          hasExecutable: true,
        },
        {
          path: join("/root", "subfolder", "innerGame"),
          name: "innerGame",
          isCompressFile: false,
          hasExecutable: true,
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
      hasExecutable: true,
    });
  });
});
