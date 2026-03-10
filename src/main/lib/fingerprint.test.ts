import { createHash } from "crypto";
import { Dirent } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeFingerprint } from "./fingerprint.js";

/**
 * fingerprint 유틸리티 테스트
 * 실행: pnpm test
 */

// fs 모듈 모킹 (crypto는 실제 SHA-256 사용)
vi.mock("fs", () => ({
  readdirSync: vi.fn(),
  statSync: vi.fn(),
}));

// fs 모킹 함수 가져오기
import { readdirSync, statSync } from "fs";
const mockReaddirSync = vi.mocked(readdirSync);
const mockStatSync = vi.mocked(statSync);

/**
 * SHA-256 해시를 계산하는 헬퍼 함수
 * 테스트에서 기대값을 직접 계산할 때 사용
 */
function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * statSync 반환값을 생성하는 헬퍼 함수 (단일 파일용)
 */
function createFileStat(size: number) {
  return {
    isDirectory: () => false,
    isFile: () => true,
    size,
  } as unknown as ReturnType<typeof statSync>;
}

/**
 * statSync 반환값을 생성하는 헬퍼 함수 (디렉터리용)
 */
function createDirStat() {
  return {
    isDirectory: () => true,
    isFile: () => false,
    size: 0,
  } as unknown as ReturnType<typeof statSync>;
}

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

beforeEach(() => {
  vi.resetAllMocks();
});

// ============================================
// 단일 파일 (isCompressFile: true)
// ============================================
describe("단일 파일 (isCompressFile: true)", () => {
  it("압축파일 → SHA-256 해시 반환 (64자리 hex)", () => {
    mockStatSync.mockReturnValue(createFileStat(1024));

    const result = computeFingerprint("/games/game.zip", true);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("같은 파일명+크기 → 동일 해시 (일관성)", () => {
    mockStatSync.mockReturnValue(createFileStat(2048));

    const result1 = computeFingerprint("/path/game.zip", true);

    vi.resetAllMocks();
    mockStatSync.mockReturnValue(createFileStat(2048));

    const result2 = computeFingerprint("/path/game.zip", true);

    expect(result1).toBe(result2);
  });

  it("다른 파일명 → 다른 해시", () => {
    mockStatSync.mockReturnValue(createFileStat(1024));
    const result1 = computeFingerprint("/games/gameA.zip", true);

    vi.resetAllMocks();
    mockStatSync.mockReturnValue(createFileStat(1024));
    const result2 = computeFingerprint("/games/gameB.zip", true);

    expect(result1).not.toBe(result2);
  });

  it("다른 크기 → 다른 해시", () => {
    mockStatSync.mockReturnValue(createFileStat(1024));
    const result1 = computeFingerprint("/games/game.zip", true);

    vi.resetAllMocks();
    mockStatSync.mockReturnValue(createFileStat(2048));
    const result2 = computeFingerprint("/games/game.zip", true);

    expect(result1).not.toBe(result2);
  });

  it("Windows 경로 (backslash) → 파일명 정확히 추출", () => {
    const size = 5000;
    mockStatSync.mockReturnValue(createFileStat(size));

    const result = computeFingerprint("C:\\Games\\MyGame\\game.zip", true);

    // 파일명 "game.zip"과 크기 5000으로 해시 계산
    const expected = sha256(`game.zip:${size}`);
    expect(result).toBe(expected);
  });

  it("해시 값이 정확히 일치하는지 검증", () => {
    const size = 3000;
    mockStatSync.mockReturnValue(createFileStat(size));

    const result = computeFingerprint("/downloads/archive.7z", true);

    const expected = sha256(`archive.7z:${size}`);
    expect(result).toBe(expected);
  });
});

// ============================================
// 폴더 (isCompressFile: false, isDirectory: true)
// ============================================
describe("폴더 (isCompressFile: false, isDirectory: true)", () => {
  it("exe 파일 1개 → SHA-256 해시 반환", () => {
    mockStatSync.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("game.exe")) return createFileStat(4096);
      return createFileStat(0);
    });
    mockReaddirSync.mockReturnValue([
      createDirent("game.exe", { isFile: true }),
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = computeFingerprint("/games/mygame", false);

    const expected = sha256("game.exe:4096");
    expect(result).toBe(expected);
  });

  it("exe 파일 여러 개 → 정렬 후 '|' 결합하여 해시", () => {
    mockStatSync.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("b_game.exe")) return createFileStat(2000);
      if (pathStr.endsWith("a_game.exe")) return createFileStat(1000);
      return createFileStat(0);
    });
    mockReaddirSync.mockReturnValue([
      createDirent("b_game.exe", { isFile: true }),
      createDirent("a_game.exe", { isFile: true }),
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = computeFingerprint("/games/mygame", false);

    // 정렬 후: a_game.exe:1000|b_game.exe:2000
    const expected = sha256("a_game.exe:1000|b_game.exe:2000");
    expect(result).toBe(expected);
  });

  it("exe 파일 없음 → null", () => {
    mockStatSync.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      return createFileStat(0);
    });
    mockReaddirSync.mockReturnValue([
      createDirent("readme.txt", { isFile: true }),
      createDirent("data.json", { isFile: true }),
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = computeFingerprint("/games/mygame", false);

    expect(result).toBeNull();
  });

  it("exe + 비exe 혼합 → exe만 사용", () => {
    mockStatSync.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("game.exe")) return createFileStat(8192);
      return createFileStat(100);
    });
    mockReaddirSync.mockReturnValue([
      createDirent("readme.txt", { isFile: true }),
      createDirent("game.exe", { isFile: true }),
      createDirent("config.ini", { isFile: true }),
      createDirent("subfolder", { isDirectory: true }),
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = computeFingerprint("/games/mygame", false);

    // exe 파일만 사용
    const expected = sha256("game.exe:8192");
    expect(result).toBe(expected);
  });

  it("대소문자 무시 (.EXE, .Exe) → exe로 인식", () => {
    mockStatSync.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("GAME.EXE")) return createFileStat(3000);
      if (pathStr.endsWith("Setup.Exe")) return createFileStat(5000);
      return createFileStat(0);
    });
    mockReaddirSync.mockReturnValue([
      createDirent("GAME.EXE", { isFile: true }),
      createDirent("Setup.Exe", { isFile: true }),
    ] as unknown as ReturnType<typeof readdirSync>);

    const result = computeFingerprint("/games/mygame", false);

    // 정렬: GAME.EXE < Setup.Exe (대문자 G < S)
    const expected = sha256("GAME.EXE:3000|Setup.Exe:5000");
    expect(result).toBe(expected);
    expect(result).not.toBeNull();
  });

  it("exe 파일 순서 무관 → 정렬되므로 항상 같은 해시", () => {
    // 순서 1: z_game.exe, a_game.exe
    mockStatSync.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("z_game.exe")) return createFileStat(1000);
      if (pathStr.endsWith("a_game.exe")) return createFileStat(2000);
      return createFileStat(0);
    });
    mockReaddirSync.mockReturnValue([
      createDirent("z_game.exe", { isFile: true }),
      createDirent("a_game.exe", { isFile: true }),
    ] as unknown as ReturnType<typeof readdirSync>);

    const result1 = computeFingerprint("/games/mygame", false);

    vi.resetAllMocks();

    // 순서 2: a_game.exe, z_game.exe (반대 순서)
    mockStatSync.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("z_game.exe")) return createFileStat(1000);
      if (pathStr.endsWith("a_game.exe")) return createFileStat(2000);
      return createFileStat(0);
    });
    mockReaddirSync.mockReturnValue([
      createDirent("a_game.exe", { isFile: true }),
      createDirent("z_game.exe", { isFile: true }),
    ] as unknown as ReturnType<typeof readdirSync>);

    const result2 = computeFingerprint("/games/mygame", false);

    expect(result1).toBe(result2);
  });
});

// ============================================
// 에러 처리
// ============================================
describe("에러 처리", () => {
  it("존재하지 않는 경로 (statSync 에러) → null", () => {
    mockStatSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    const result = computeFingerprint("/nonexistent/path", false);

    expect(result).toBeNull();
  });

  it("읽기 권한 없음 (readdirSync 에러) → null", () => {
    mockStatSync.mockReturnValue(createDirStat());
    mockReaddirSync.mockImplementation(() => {
      throw new Error("EACCES: permission denied");
    });

    const result = computeFingerprint("/no-permission/folder", false);

    expect(result).toBeNull();
  });

  it("압축파일에서 statSync 에러 → null", () => {
    mockStatSync.mockImplementation(() => {
      throw new Error("ENOENT: no such file or directory");
    });

    const result = computeFingerprint("/nonexistent/game.zip", true);

    expect(result).toBeNull();
  });
});

// ============================================
// 단일 파일 (isCompressFile: false, isDirectory: false)
// ============================================
describe("단일 파일 (isCompressFile: false, isDirectory: false)", () => {
  it("파일 경로인데 isCompressFile=false → 디렉터리가 아님을 감지 → 단일 파일로 처리", () => {
    const size = 7777;
    mockStatSync.mockReturnValue(createFileStat(size));

    const result = computeFingerprint("/games/standalone.dat", false);

    // isDirectory()가 false를 반환하므로 단일 파일 로직으로 처리
    const expected = sha256(`standalone.dat:${size}`);
    expect(result).toBe(expected);
  });
});
