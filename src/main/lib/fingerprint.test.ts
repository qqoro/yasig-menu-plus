import { createHash } from "crypto";
import { Dirent } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { computeFingerprint } from "./fingerprint.js";

/**
 * fingerprint 유틸리티 테스트
 * 실행: pnpm test
 */

// fs/promises 모듈 모킹 (crypto는 실제 SHA-256 사용)
vi.mock("fs/promises", () => ({
  access: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

// fs/promises 모킹 함수 가져오기
import { access, readdir, readFile, stat } from "fs/promises";
const mockAccess = vi.mocked(access);
const mockStat = vi.mocked(stat);
const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);

/**
 * SHA-256 해시를 계산하는 헬퍼 함수
 * 테스트에서 기대값을 직접 계산할 때 사용
 */
function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * stat 반환값을 생성하는 헬퍼 함수 (단일 파일용)
 */
function createFileStat(size: number) {
  return Promise.resolve({
    isDirectory: () => false,
    isFile: () => true,
    size,
  });
}

/**
 * stat 반환값을 생성하는 헬퍼 함수 (디렉터리용)
 */
function createDirStat() {
  return Promise.resolve({
    isDirectory: () => true,
    isFile: () => false,
    size: 0,
  });
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
  // 기본값: access는 존재하지 않음(거부)
  mockAccess.mockRejectedValue(new Error("ENOENT"));
});

// ============================================
// 단일 파일 (isCompressFile: true)
// ============================================
describe("단일 파일 (isCompressFile: true)", () => {
  it("압축파일 → SHA-256 해시 반환 (64자리 hex)", async () => {
    mockStat.mockReturnValue(createFileStat(1024));

    const result = await computeFingerprint("/games/game.zip", true);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("같은 파일명+크기 → 동일 해시 (일관성)", async () => {
    mockStat.mockReturnValue(createFileStat(2048));

    const result1 = await computeFingerprint("/path/game.zip", true);

    vi.resetAllMocks();
    mockStat.mockReturnValue(createFileStat(2048));

    const result2 = await computeFingerprint("/path/game.zip", true);

    expect(result1).toBe(result2);
  });

  it("다른 파일명 → 다른 해시", async () => {
    mockStat.mockReturnValue(createFileStat(1024));
    const result1 = await computeFingerprint("/games/gameA.zip", true);

    vi.resetAllMocks();
    mockStat.mockReturnValue(createFileStat(1024));
    const result2 = await computeFingerprint("/games/gameB.zip", true);

    expect(result1).not.toBe(result2);
  });

  it("다른 크기 → 다른 해시", async () => {
    mockStat.mockReturnValue(createFileStat(1024));
    const result1 = await computeFingerprint("/games/game.zip", true);

    vi.resetAllMocks();
    mockStat.mockReturnValue(createFileStat(2048));
    const result2 = await computeFingerprint("/games/game.zip", true);

    expect(result1).not.toBe(result2);
  });

  it("Windows 경로 (backslash) → 파일명 정확히 추출", async () => {
    const size = 5000;
    mockStat.mockReturnValue(createFileStat(size));

    const result = await computeFingerprint(
      "C:\\Games\\MyGame\\game.zip",
      true,
    );

    // 파일명 "game.zip"과 크기 5000으로 해시 계산
    const expected = sha256(`game.zip:${size}`);
    expect(result).toBe(expected);
  });

  it("해시 값이 정확히 일치하는지 검증", async () => {
    const size = 3000;
    mockStat.mockReturnValue(createFileStat(size));

    const result = await computeFingerprint("/downloads/archive.7z", true);

    const expected = sha256(`archive.7z:${size}`);
    expect(result).toBe(expected);
  });
});

// ============================================
// 폴더 (isCompressFile: false, isDirectory: true)
// ============================================
describe("폴더 (isCompressFile: false, isDirectory: true)", () => {
  it("exe 파일 1개 → SHA-256 해시 반환", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("game.exe")) return createFileStat(4096);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("game.exe", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/mygame", false);

    const expected = sha256("game.exe:4096");
    expect(result).toBe(expected);
  });

  it("exe 파일 여러 개 → 정렬 후 '|' 결합하여 해시", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("b_game.exe")) return createFileStat(2000);
      if (pathStr.endsWith("a_game.exe")) return createFileStat(1000);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("b_game.exe", { isFile: true }),
      createDirent("a_game.exe", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/mygame", false);

    // 정렬 후: a_game.exe:1000|b_game.exe:2000
    const expected = sha256("a_game.exe:1000|b_game.exe:2000");
    expect(result).toBe(expected);
  });

  it("exe 파일 없어도 비exe 파일로 해시 반환", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("readme.txt")) return createFileStat(100);
      if (pathStr.endsWith("data.json")) return createFileStat(200);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("readme.txt", { isFile: true }),
      createDirent("data.json", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/mygame", false);

    const expected = sha256("data.json:200|readme.txt:100");
    expect(result).toBe(expected);
  });

  it("exe + 비exe 혼합 → 전체 파일 포함", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("game.exe")) return createFileStat(8192);
      return createFileStat(100);
    });
    mockReaddir.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") {
        return Promise.resolve([
          createDirent("readme.txt", { isFile: true }),
          createDirent("game.exe", { isFile: true }),
          createDirent("config.ini", { isFile: true }),
          createDirent("subfolder", { isDirectory: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      return Promise.resolve(
        [] as unknown as Awaited<ReturnType<typeof readdir>>,
      );
    });

    const result = await computeFingerprint("/games/mygame", false);

    const expected = sha256("config.ini:100|game.exe:8192|readme.txt:100");
    expect(result).toBe(expected);
  });

  it("대소문자 무시 (.EXE, .Exe) → exe로 인식", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("GAME.EXE")) return createFileStat(3000);
      if (pathStr.endsWith("Setup.Exe")) return createFileStat(5000);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("GAME.EXE", { isFile: true }),
      createDirent("Setup.Exe", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/mygame", false);

    // 정렬: GAME.EXE < Setup.Exe (대문자 G < S)
    const expected = sha256("GAME.EXE:3000|Setup.Exe:5000");
    expect(result).toBe(expected);
    expect(result).not.toBeNull();
  });

  it("exe 파일 순서 무관 → 정렬되므로 항상 같은 해시", async () => {
    // 순서 1: z_game.exe, a_game.exe
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("z_game.exe")) return createFileStat(1000);
      if (pathStr.endsWith("a_game.exe")) return createFileStat(2000);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("z_game.exe", { isFile: true }),
      createDirent("a_game.exe", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result1 = await computeFingerprint("/games/mygame", false);

    vi.resetAllMocks();

    // 순서 2: a_game.exe, z_game.exe (반대 순서)
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("z_game.exe")) return createFileStat(1000);
      if (pathStr.endsWith("a_game.exe")) return createFileStat(2000);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("a_game.exe", { isFile: true }),
      createDirent("z_game.exe", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result2 = await computeFingerprint("/games/mygame", false);

    expect(result1).toBe(result2);
  });
});

// ============================================
// 에러 처리
// ============================================
describe("에러 처리", () => {
  it("존재하지 않는 경로 (stat 에러) → null", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT: no such file or directory"));

    const result = await computeFingerprint("/nonexistent/path", false);

    expect(result).toBeNull();
  });

  it("읽기 권한 없음 (readdir 에러) → null", async () => {
    mockStat.mockReturnValue(createDirStat());
    mockReaddir.mockRejectedValue(new Error("EACCES: permission denied"));

    const result = await computeFingerprint("/no-permission/folder", false);

    expect(result).toBeNull();
  });

  it("압축파일에서 stat 에러 → null", async () => {
    mockStat.mockRejectedValue(new Error("ENOENT: no such file or directory"));

    const result = await computeFingerprint("/nonexistent/game.zip", true);

    expect(result).toBeNull();
  });
});

// ============================================
// 단일 파일 (isCompressFile: false, isDirectory: false)
// ============================================
describe("단일 파일 (isCompressFile: false, isDirectory: false)", () => {
  it("파일 경로인데 isCompressFile=false → 디렉터리가 아님을 감지 → 단일 파일로 처리", async () => {
    const size = 7777;
    mockStat.mockReturnValue(createFileStat(size));

    const result = await computeFingerprint("/games/standalone.dat", false);

    // isDirectory()가 false를 반환하므로 단일 파일 로직으로 처리
    const expected = sha256(`standalone.dat:${size}`);
    expect(result).toBe(expected);
  });
});

// ============================================
// RPG Maker MV/MZ (www/data/System.json) - 최우선
// ============================================
describe("RPG Maker MV/MZ (www/data/System.json)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("www/data/System.json → gameTitle로 해시 (최우선)", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/rpg-mv-nwjs") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(1604096);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
      createDirent("package.json", { isFile: true }),
      createDirent("Game.rgss3a", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    // www/data/System.json 존재 (슬래시/백슬래시 모두 매칭)
    mockAccess.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (
        /[\\/]www[\\/]data[\\/]System\.json$/.test(pathStr) ||
        pathStr.endsWith("package.json")
      ) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    mockReadFile.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.endsWith("package.json")) {
        return Promise.resolve(
          JSON.stringify({ window: { title: "다른 타이틀" } }),
        );
      }
      if (pathStr.endsWith("System.json")) {
        return Promise.resolve(JSON.stringify({ gameTitle: "테레사의 모험" }));
      }
      return Promise.resolve("");
    });

    const result = await computeFingerprint("/games/rpg-mv-nwjs", false);

    // www/data/System.json이 최우선
    const expected = sha256("테레사의 모험:1604096");
    expect(result).toBe(expected);
  });

  it("data/System.json → gameTitle로 해시 (직접 배포)", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/rpg-mv-direct") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(2000000);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    // data/System.json만 존재 (www 없음)
    mockAccess.mockImplementation((path: any) => {
      const pathStr = String(path);
      // www가 없는 data/System.json만 매칭
      if (
        /[\\/]data[\\/]System\.json$/.test(pathStr) &&
        !pathStr.includes("www")
      ) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    mockReadFile.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.endsWith("System.json")) {
        return Promise.resolve(JSON.stringify({ gameTitle: "치녀 놀이" }));
      }
      return Promise.resolve("");
    });

    const result = await computeFingerprint("/games/rpg-mv-direct", false);

    // data/System.json 사용
    const expected = sha256("치녀 놀이:2000000");
    expect(result).toBe(expected);
  });

  it("www/data/System.json이 data/System.json보다 우선", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/both") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(3000000);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    // 둘 다 존재
    mockAccess.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (
        /[\\/]www[\\/]data[\\/]System\.json$/.test(pathStr) ||
        /[\\/]data[\\/]System\.json$/.test(pathStr)
      ) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    mockReadFile.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (/[\\/]www[\\/]data[\\/]System\.json$/.test(pathStr)) {
        return Promise.resolve(JSON.stringify({ gameTitle: "WWW 버전" }));
      }
      if (/[\\/]data[\\/]System\.json$/.test(pathStr)) {
        return Promise.resolve(JSON.stringify({ gameTitle: "DATA 버전" }));
      }
      return Promise.resolve("");
    });

    const result = await computeFingerprint("/games/both", false);

    // www/data가 우선
    const expected = sha256("WWW 버전:3000000");
    expect(result).toBe(expected);
  });

  it("System.json 파싱 실패 → RGSS 또는 exe 로직 사용", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/broken-json") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(1604096);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    mockAccess.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (
        /[\\/]data[\\/]System\.json$/.test(pathStr) &&
        !pathStr.includes("www")
      ) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    mockReadFile.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.endsWith("System.json")) {
        return Promise.resolve("invalid json {{{");
      }
      return Promise.resolve("");
    });

    const result = await computeFingerprint("/games/broken-json", false);

    // 파싱 실패 시 exe 목록 로직
    const expected = sha256("Game.exe:1604096");
    expect(result).toBe(expected);
  });

  it("System.json에 gameTitle 없음 → RGSS 또는 exe 로직 사용", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/no-title") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(1604096);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    mockAccess.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (
        /[\\/]data[\\/]System\.json$/.test(pathStr) &&
        !pathStr.includes("www")
      ) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    mockReadFile.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.endsWith("System.json")) {
        return Promise.resolve(JSON.stringify({ gameTitle: "" })); // 빈 제목
      }
      return Promise.resolve("");
    });

    const result = await computeFingerprint("/games/no-title", false);

    // gameTitle이 빈 문자열이면 exe 목록 로직
    const expected = sha256("Game.exe:1604096");
    expect(result).toBe(expected);
  });
});

// ============================================
// RPG Maker VX/Ace/XP (.rgss3a, .rgss2a, .rgssad)
// ============================================
describe("RPG Maker VX/Ace/XP (RGSS 파일)", () => {
  it("RPG Maker VX Ace (.rgss3a) → RGSS 파일명:크기로 해시", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/rpg-vxace") return createDirStat();
      if (pathStr.endsWith("Game.rgss3a")) return createFileStat(16373949);
      if (pathStr.endsWith("Game.exe")) return createFileStat(141312);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
      createDirent("Game.rgss3a", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/rpg-vxace", false);

    // RGSS 파일명:크기로 해시
    const expected = sha256("Game.rgss3a:16373949");
    expect(result).toBe(expected);
  });

  it("RPG Maker VX (.rgss2a) → RGSS 파일명:크기로 해시", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/rpg-vx") return createDirStat();
      if (pathStr.endsWith("Game.rgss2a")) return createFileStat(21258272);
      if (pathStr.endsWith("Game.exe")) return createFileStat(135168);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
      createDirent("Game.rgss2a", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/rpg-vx", false);

    const expected = sha256("Game.rgss2a:21258272");
    expect(result).toBe(expected);
  });

  it("RPG Maker XP (.rgssad) → RGSS 파일명:크기로 해시", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/rpg-xp") return createDirStat();
      if (pathStr.endsWith("Game.rgssad")) return createFileStat(2571402);
      if (pathStr.endsWith("Game.exe")) return createFileStat(69632);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
      createDirent("Game.rgssad", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/rpg-xp", false);

    const expected = sha256("Game.rgssad:2571402");
    expect(result).toBe(expected);
  });

  it("RGSS 파일 없음 → exe 목록 로직 사용", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/normal") return createDirStat();
      if (pathStr.endsWith("game.exe")) return createFileStat(8192);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("game.exe", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/normal", false);

    // RGSS 없으면 기존 로직
    const expected = sha256("game.exe:8192");
    expect(result).toBe(expected);
  });
});

// ============================================
// 우선순위 테스트
// ============================================
describe("우선순위 테스트", () => {
  it("System.json > RGSS (System.json이 있으면 RGSS 무시)", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/priority-test") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(1000000);
      if (pathStr.endsWith("Game.rgss3a")) return createFileStat(50000000);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
      createDirent("Game.rgss3a", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    // data/System.json 존재 (슬래시/백슬래시 모두 매칭)
    mockAccess.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (
        /[\\/]data[\\/]System\.json$/.test(pathStr) &&
        !pathStr.includes("www")
      ) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    mockReadFile.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr.endsWith("System.json")) {
        return Promise.resolve(
          JSON.stringify({ gameTitle: "우선순위 테스트" }),
        );
      }
      return Promise.resolve("");
    });

    const result = await computeFingerprint("/games/priority-test", false);

    // System.json이 RGSS보다 우선
    const expected = sha256("우선순위 테스트:1000000");
    expect(result).toBe(expected);
  });

  it("RGSS > fallback (RGSS가 있으면 fallback 무시)", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/rgss-vs-fallback") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(1000000);
      if (pathStr.endsWith("Game.rgss3a")) return createFileStat(50000000);
      if (pathStr.endsWith("data.pak")) return createFileStat(9999);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
      createDirent("Game.rgss3a", { isFile: true }),
      createDirent("data.pak", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/rgss-vs-fallback", false);

    const expected = sha256("Game.rgss3a:50000000");
    expect(result).toBe(expected);
  });
});

// ============================================
// Fallback (블랙리스트 기반 전체 파일 목록)
// ============================================
describe("Fallback (블랙리스트 기반 전체 파일 목록)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("루트 파일 전체 수집 (exe + 비exe 포함)", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(4096);
      if (pathStr.endsWith("data.pak")) return createFileStat(50000);
      if (pathStr.endsWith("config.ini")) return createFileStat(200);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
      createDirent("data.pak", { isFile: true }),
      createDirent("config.ini", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/mygame", false);

    const expected = sha256("Game.exe:4096|config.ini:200|data.pak:50000");
    expect(result).toBe(expected);
  });

  it("1단계 하위 디렉토리 파일 포함", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(4096);
      if (pathStr.endsWith("Actors.json")) return createFileStat(1000);
      return createFileStat(0);
    });
    mockReaddir.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") {
        return Promise.resolve([
          createDirent("Game.exe", { isFile: true }),
          createDirent("data", { isDirectory: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      if (pathStr.endsWith("data")) {
        return Promise.resolve([
          createDirent("Actors.json", { isFile: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      return Promise.resolve(
        [] as unknown as Awaited<ReturnType<typeof readdir>>,
      );
    });

    const result = await computeFingerprint("/games/mygame", false);

    const expected = sha256("Game.exe:4096|data/Actors.json:1000");
    expect(result).toBe(expected);
  });

  it("2단계 이상 하위 디렉토리는 무시", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(4096);
      if (pathStr.endsWith("Map001.json")) return createFileStat(500);
      return createFileStat(0);
    });
    mockReaddir.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") {
        return Promise.resolve([
          createDirent("Game.exe", { isFile: true }),
          createDirent("data", { isDirectory: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      if (pathStr.endsWith("data")) {
        // data 안에 maps 디렉토리가 있지만, 파일로 인식되지 않으므로 무시됨
        return Promise.resolve([
          createDirent("maps", { isDirectory: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      // maps 안의 파일은 collectFileEntries가 호출되지 않아야 함
      if (pathStr.endsWith("maps")) {
        return Promise.resolve([
          createDirent("Map001.json", { isFile: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      return Promise.resolve(
        [] as unknown as Awaited<ReturnType<typeof readdir>>,
      );
    });

    const result = await computeFingerprint("/games/mygame", false);

    // 2단계 하위(data/maps/)는 탐색하지 않으므로 Game.exe만 포함
    const expected = sha256("Game.exe:4096");
    expect(result).toBe(expected);
  });

  it("블랙리스트 디렉토리 제외 (save, logs 등)", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(4096);
      if (pathStr.endsWith("save1.dat")) return createFileStat(500);
      return createFileStat(0);
    });
    mockReaddir.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") {
        return Promise.resolve([
          createDirent("Game.exe", { isFile: true }),
          createDirent("save", { isDirectory: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      if (pathStr.endsWith("save")) {
        return Promise.resolve([
          createDirent("save1.dat", { isFile: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      return Promise.resolve(
        [] as unknown as Awaited<ReturnType<typeof readdir>>,
      );
    });

    const result = await computeFingerprint("/games/mygame", false);

    const expected = sha256("Game.exe:4096");
    expect(result).toBe(expected);
  });

  it("블랙리스트 파일 패턴 제외 (*.sav, *.log 등)", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(4096);
      if (pathStr.endsWith("game.sav")) return createFileStat(300);
      if (pathStr.endsWith("error.log")) return createFileStat(100);
      if (pathStr.endsWith("Thumbs.db")) return createFileStat(50);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
      createDirent("game.sav", { isFile: true }),
      createDirent("error.log", { isFile: true }),
      createDirent("Thumbs.db", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/mygame", false);

    const expected = sha256("Game.exe:4096");
    expect(result).toBe(expected);
  });

  it("블랙리스트 파일 확장자 case-insensitive (*.SAV, *.Log)", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(4096);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
      createDirent("SAVE.SAV", { isFile: true }),
      createDirent("Error.Log", { isFile: true }),
      createDirent("backup.BAK", { isFile: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/mygame", false);

    const expected = sha256("Game.exe:4096");
    expect(result).toBe(expected);
  });

  it("숨김 파일/폴더 제외 (.으로 시작)", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(4096);
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("Game.exe", { isFile: true }),
      createDirent(".hidden", { isFile: true }),
      createDirent(".git", { isDirectory: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/mygame", false);

    const expected = sha256("Game.exe:4096");
    expect(result).toBe(expected);
  });

  it("디렉토리당 100개 상한 적용", async () => {
    const entries: Dirent[] = [];
    const statMap: Record<string, number> = {};
    for (let i = 0; i < 120; i++) {
      const name = `file_${String(i).padStart(3, "0")}.dat`;
      entries.push(createDirent(name, { isFile: true }));
      statMap[name] = 1000 + i;
    }
    entries.push(createDirent("Game.exe", { isFile: true }));
    statMap["Game.exe"] = 4096;

    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      for (const [name, size] of Object.entries(statMap)) {
        if (pathStr.endsWith(name)) return createFileStat(size);
      }
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue(
      entries as unknown as Awaited<ReturnType<typeof readdir>>,
    );

    const result = await computeFingerprint("/games/mygame", false);

    // 정렬 후 100개만 선택 (Game.exe, file_000~file_098)
    const sortedEntries = entries
      .map((e) => `${e.name}:${statMap[e.name]}`)
      .sort()
      .slice(0, 100);
    const expected = sha256(sortedEntries.join("|"));
    expect(result).toBe(expected);
  });

  it("블랙리스트 디렉토리명 case-insensitive", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(4096);
      return createFileStat(0);
    });
    mockReaddir.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") {
        return Promise.resolve([
          createDirent("Game.exe", { isFile: true }),
          createDirent("Save", { isDirectory: true }),
          createDirent("LOGS", { isDirectory: true }),
          createDirent("Cache", { isDirectory: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      return Promise.resolve(
        [] as unknown as Awaited<ReturnType<typeof readdir>>,
      );
    });

    const result = await computeFingerprint("/games/mygame", false);

    const expected = sha256("Game.exe:4096");
    expect(result).toBe(expected);
  });

  it("하위 디렉토리 접근 실패 시 다른 디렉토리는 정상 수집", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(4096);
      if (pathStr.endsWith("Actors.json")) return createFileStat(1000);
      return createFileStat(0);
    });
    mockReaddir.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") {
        return Promise.resolve([
          createDirent("Game.exe", { isFile: true }),
          createDirent("broken", { isDirectory: true }),
          createDirent("data", { isDirectory: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      if (pathStr.endsWith("broken")) {
        return Promise.reject(new Error("EACCES: permission denied"));
      }
      if (pathStr.endsWith("data")) {
        return Promise.resolve([
          createDirent("Actors.json", { isFile: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      return Promise.resolve(
        [] as unknown as Awaited<ReturnType<typeof readdir>>,
      );
    });

    const result = await computeFingerprint("/games/mygame", false);

    // broken 실패해도 data는 정상 수집
    const expected = sha256("Game.exe:4096|data/Actors.json:1000");
    expect(result).toBe(expected);
  });

  it("여러 하위 디렉토리 파일의 전체 정렬", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      if (pathStr.endsWith("Game.exe")) return createFileStat(4096);
      if (pathStr.endsWith("b.txt")) return createFileStat(100);
      if (pathStr.endsWith("a.txt")) return createFileStat(200);
      return createFileStat(0);
    });
    mockReaddir.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") {
        return Promise.resolve([
          createDirent("Game.exe", { isFile: true }),
          createDirent("zzz", { isDirectory: true }),
          createDirent("aaa", { isDirectory: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      if (pathStr.endsWith("zzz")) {
        return Promise.resolve([
          createDirent("b.txt", { isFile: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      if (pathStr.endsWith("aaa")) {
        return Promise.resolve([
          createDirent("a.txt", { isFile: true }),
        ] as unknown as Awaited<ReturnType<typeof readdir>>);
      }
      return Promise.resolve(
        [] as unknown as Awaited<ReturnType<typeof readdir>>,
      );
    });

    const result = await computeFingerprint("/games/mygame", false);

    // 전체 정렬: Game.exe < aaa/a.txt < zzz/b.txt
    const expected = sha256("Game.exe:4096|aaa/a.txt:200|zzz/b.txt:100");
    expect(result).toBe(expected);
  });

  it("수집 파일 0개 → null 반환", async () => {
    mockStat.mockImplementation((path: any) => {
      const pathStr = String(path);
      if (pathStr === "/games/mygame") return createDirStat();
      return createFileStat(0);
    });
    mockReaddir.mockResolvedValue([
      createDirent("save", { isDirectory: true }),
    ] as unknown as Awaited<ReturnType<typeof readdir>>);

    const result = await computeFingerprint("/games/mygame", false);

    expect(result).toBeNull();
  });
});
