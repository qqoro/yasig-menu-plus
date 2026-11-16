import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "crypto";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  validateExecutableInGame,
  validatePath,
  ValidationError as RealValidationError,
} from "./validator.js";

/**
 * Validator 유틸리티 테스트
 * 실행: pnpm test
 */

// ============================================
// URL 검증 로직
// ============================================
class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

function validateUrl(url: string): void {
  if (typeof url !== "string" || url.trim() === "") {
    throw new ValidationError("URL이 비어있습니다.");
  }

  // data URL 허용
  if (url.startsWith("data:")) {
    return;
  }

  try {
    const parsed = new URL(url);

    // HTTP/HTTPS만 허용
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new ValidationError("허용되지 않은 프로토콜입니다.");
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError("유효하지 않은 URL 형식입니다.");
  }
}

// ============================================
// 검색어 검증 로직
// ============================================
function validateSearchQuery(query: string): void {
  if (typeof query !== "string") {
    throw new ValidationError("검색어는 문자열이어야 합니다.");
  }

  if (query.length > 500) {
    throw new ValidationError("검색어가 너무 깁니다.");
  }
}

// ============================================
// SQL LIKE 패턴 이스케이프 로직
// ============================================
function escapeLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, "\\$&");
}

// ============================================
// 썸네일 파일명 생성 로직
// ============================================
function generateThumbnailFilename(
  gamePath: string,
  index: number = 0,
): string {
  const hash = createHash("md5").update(gamePath).digest("hex");
  const suffix = index === 0 ? "" : `_${index}`;
  return `${hash}${suffix}.jpg`;
}

// ============================================
// 경로 검증 테스트
// ============================================
describe("validatePath", () => {
  let root: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "ymp-validate-path-"));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("빈 문자열은 거부해야 한다", async () => {
    await expect(validatePath("  ")).rejects.toThrow("경로가 비어있습니다.");
  });

  // 이슈 #16: 폴더명에 점이 연속되면 상위 폴더 접근으로 오인해 거부하던 문제
  it("폴더명에 점이 연속된 실제 폴더는 통과해야 한다", async () => {
    // Windows는 끝의 마침표를 잘라내므로 마침표로 끝나지 않는 이름을 쓴다
    const dir = join(root, "제목...。...끝");
    await mkdir(dir);
    await expect(
      validatePath(dir, { mustExist: true }),
    ).resolves.toBeUndefined();
  });

  it("mustExist면 없는 경로는 거부해야 한다", async () => {
    await expect(
      validatePath(join(root, "missing"), { mustExist: true }),
    ).rejects.toThrow("존재하지 않는 경로입니다.");
  });
});

// ============================================
// URL 검증 테스트
// ============================================
describe("validateUrl", () => {
  describe("유효한 URL", () => {
    const validUrls = [
      ["https://example.com", "HTTPS URL"],
      ["http://example.com", "HTTP URL"],
      [
        "https://www.dlsite.com/maniax/work/=/product_id/RJ123456.html",
        "DLSite URL",
      ],
      ["https://store.steampowered.com/app/123456/", "Steam URL"],
      ["https://www.getchu.com/soft.phtml?id=123456", "Getchu URL"],
      ["https://ci-en.net/creator/12345/article/67890", "Cien URL"],
      ["https://example.com/path?query=value&foo=bar", "쿼리 파라미터"],
      ["https://example.com/path#anchor", "앵커"],
      ["https://subdomain.example.com", "서브도메인"],
      ["https://example.com:8080/path", "포트 포함"],
      ["data:image/png;base64,iVBORw0KGgo=", "data URL (PNG)"],
      ["data:image/jpeg;base64,/9j/4AAQSkZJ=", "data URL (JPEG)"],
    ];

    it.each(validUrls)("%s (%s) → 통과", (url, _desc) => {
      expect(() => validateUrl(url)).not.toThrow();
    });
  });

  describe("유효하지 않은 URL", () => {
    const invalidUrls: [string, string, string][] = [
      ["", "URL이 비어있습니다.", "빈 문자열"],
      ["   ", "URL이 비어있습니다.", "공백만"],
      ["ftp://example.com", "허용되지 않은 프로토콜입니다.", "FTP 프로토콜"],
      [
        "file:///C:/Games/file.txt",
        "허용되지 않은 프로토콜입니다.",
        "file 프로토콜",
      ],
      [
        "javascript:alert(1)",
        "허용되지 않은 프로토콜입니다.",
        "javascript 프로토콜",
      ],
      ["not-a-url", "유효하지 않은 URL 형식입니다.", "URL 형식 아님"],
      ["http://", "유효하지 않은 URL 형식입니다.", "프로토콜만 있음"],
      ["://example.com", "유효하지 않은 URL 형식입니다.", "프로토콜 없음"],
    ];

    it.each(invalidUrls)("%s → %s (%s)", (url, expectedError, _desc) => {
      expect(() => validateUrl(url)).toThrow(expectedError);
    });
  });
});

// ============================================
// 검색어 검증 테스트
// ============================================
describe("validateSearchQuery", () => {
  describe("유효한 검색어", () => {
    const validQueries = [
      ["게임", "한글 검색어"],
      ["Game Name", "영문 검색어"],
      ["ゲーム名", "일본어 검색어"],
      ["Final Fantasy VII (파이널 판타지 7)", "혼합 검색어"],
      ["a", "1글자"],
      [" ".repeat(500), "500글자 공백 (경계값)"],
      ["게임 [RJ123456]", "대괄호 포함"],
      ["게임 (Ver.2)", "괄호 포함"],
      ["게임~이름!", "특수문자 포함"],
    ];

    it.each(validQueries)("%s (%s) → 통과", (query, _desc) => {
      expect(() => validateSearchQuery(query)).not.toThrow();
    });
  });

  describe("유효하지 않은 검색어", () => {
    const invalidQueries: [string, string, string][] = [
      ["a".repeat(501), "검색어가 너무 깁니다.", "501글자 (경계값 초과)"],
    ];

    it.each(invalidQueries)(
      "%s글자 → %s (%s)",
      (query, expectedError, _desc) => {
        expect(() => validateSearchQuery(query)).toThrow(expectedError);
      },
    );

    it("문자열이 아님 → 에러", () => {
      expect(() => validateSearchQuery(123 as unknown as string)).toThrow(
        "검색어는 문자열이어야 합니다.",
      );
    });
  });
});

// ============================================
// SQL LIKE 패턴 이스케이프 테스트
// ============================================
describe("escapeLikePattern", () => {
  const testCases: [string, string, string][] = [
    ["game", "game", "특수문자 없음"],
    ["game%name", "game\\%name", "% 이스케이프"],
    ["game_name", "game\\_name", "_ 이스케이프"],
    ["game\\name", "game\\\\name", "\\ 이스케이프"],
    ["game%_name\\test", "game\\%\\_name\\\\test", "모든 특수문자"],
    ["100%", "100\\%", "퍼센트만"],
    ["a_b%c\\d", "a\\_b\\%c\\\\d", "복합"],
    ["", "", "빈 문자열"],
    ["게임이름", "게임이름", "한글 (변화 없음)"],
    ["ゲーム名", "ゲーム名", "일본어 (변화 없음)"],
  ];

  it.each(testCases)("%s → %s (%s)", (input, expected, _desc) => {
    expect(escapeLikePattern(input)).toBe(expected);
  });
});

// ============================================
// 썸네일 파일명 생성 테스트
// ============================================
describe("generateThumbnailFilename", () => {
  it("게임 경로에 대해 일관된 해시 파일명 생성", () => {
    const gamePath = "C:/Games/[RJ123456] 게임이름";
    const filename = generateThumbnailFilename(gamePath, 0);

    // MD5 해시는 32자리 16진수
    expect(filename).toMatch(/^[a-f0-9]{32}\.jpg$/);
  });

  it("같은 경로는 항상 같은 파일명 생성", () => {
    const gamePath = "C:/Games/[RJ123456] 게임이름";
    const filename1 = generateThumbnailFilename(gamePath, 0);
    const filename2 = generateThumbnailFilename(gamePath, 0);

    expect(filename1).toBe(filename2);
  });

  it("다른 경로는 다른 파일명 생성", () => {
    const path1 = "C:/Games/Game1";
    const path2 = "C:/Games/Game2";
    const filename1 = generateThumbnailFilename(path1, 0);
    const filename2 = generateThumbnailFilename(path2, 0);

    expect(filename1).not.toBe(filename2);
  });

  it("인덱스에 따라 접미사 추가", () => {
    const gamePath = "C:/Games/[RJ123456] 게임이름";
    const hash = createHash("md5").update(gamePath).digest("hex");

    expect(generateThumbnailFilename(gamePath, 0)).toBe(`${hash}.jpg`);
    expect(generateThumbnailFilename(gamePath, 1)).toBe(`${hash}_1.jpg`);
    expect(generateThumbnailFilename(gamePath, 2)).toBe(`${hash}_2.jpg`);
    expect(generateThumbnailFilename(gamePath, 10)).toBe(`${hash}_10.jpg`);
  });

  it("다양한 경로 형식 처리", () => {
    const paths = [
      "C:/Games/게임이름",
      "C:\\Games\\게임이름",
      "/home/user/games/게임이름",
      "게임이름",
      "[RJ123456] 게임이름",
    ];

    paths.forEach((path) => {
      const filename = generateThumbnailFilename(path, 0);
      expect(filename).toMatch(/^[a-f0-9]{32}\.jpg$/);
    });
  });
});

/**
 * validateExecutableInGame — 실행 파일이 게임 폴더 안의 실제 파일인지 검증
 */
describe("validateExecutableInGame", () => {
  let root: string;
  let gameDir: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "ymp-validator-"));
    gameDir = join(root, "game");
    await mkdir(join(gameDir, "sub"), { recursive: true });
    await writeFile(join(gameDir, "game.exe"), "x");
    await writeFile(join(gameDir, "sub", "inner.exe"), "x");
    await writeFile(join(root, "outside.exe"), "x");
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("게임 폴더 바로 아래 파일은 통과해야 한다", async () => {
    await expect(
      validateExecutableInGame(gameDir, join(gameDir, "game.exe")),
    ).resolves.toBeUndefined();
  });

  it("하위 폴더의 파일도 통과해야 한다", async () => {
    await expect(
      validateExecutableInGame(gameDir, join(gameDir, "sub", "inner.exe")),
    ).resolves.toBeUndefined();
  });

  it("게임 폴더 밖의 파일은 거부해야 한다", async () => {
    await expect(
      validateExecutableInGame(gameDir, join(root, "outside.exe")),
    ).rejects.toBeInstanceOf(RealValidationError);
  });

  it("..로 탈출하는 경로는 거부해야 한다", async () => {
    await expect(
      validateExecutableInGame(gameDir, join(gameDir, "..", "outside.exe")),
    ).rejects.toBeInstanceOf(RealValidationError);
  });

  it("존재하지 않는 파일은 거부해야 한다", async () => {
    await expect(
      validateExecutableInGame(gameDir, join(gameDir, "missing.exe")),
    ).rejects.toThrow("실행 파일이 존재하지 않습니다.");
  });

  it("디렉터리는 거부해야 한다", async () => {
    await expect(
      validateExecutableInGame(gameDir, join(gameDir, "sub")),
    ).rejects.toThrow("실행 파일 경로가 파일이 아닙니다.");
  });

  it("빈 문자열은 거부해야 한다", async () => {
    await expect(validateExecutableInGame(gameDir, "  ")).rejects.toThrow(
      "실행 파일 경로가 비어있습니다.",
    );
  });
});
