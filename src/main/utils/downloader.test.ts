import { createHash } from "crypto";
import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * downloader.ts 유틸리티 함수 테스트
 *
 * electron, sharp, fs/promises, http/https, validator, image-path 모듈을 모킹하여
 * 순수 로직만 검증합니다.
 */

// ============================================
// vi.hoisted로 모킹 변수 호이스팅 (vi.mock 팩토리에서 참조 가능)
// ============================================

const MOCK_THUMBNAIL_DIR =
  "C:/Users/TestUser/AppData/Roaming/yasig-menu-plus/thumbnails";

const {
  mockSharp,
  mockResize,
  mockWebp,
  mockToBuffer,
  mockMkdir,
  mockWriteFile,
  mockUnlink,
  mockReadFile,
  mockAccess,
  mockValidateUrl,
} = vi.hoisted(() => {
  const mockToBuffer = vi
    .fn()
    .mockResolvedValue(Buffer.from("optimized-webp-data"));
  const mockWebp = vi.fn().mockReturnValue({ toBuffer: mockToBuffer });
  const mockResize = vi.fn().mockReturnValue({ webp: mockWebp });
  const mockSharp = vi.fn().mockReturnValue({ resize: mockResize });

  const mockMkdir = vi.fn().mockResolvedValue(undefined);
  const mockWriteFile = vi.fn().mockResolvedValue(undefined);
  const mockUnlink = vi.fn().mockResolvedValue(undefined);
  const mockReadFile = vi
    .fn()
    .mockResolvedValue(Buffer.from("source-image-data"));
  const mockAccess = vi.fn().mockResolvedValue(undefined);

  const mockValidateUrl = vi.fn();

  return {
    mockSharp,
    mockResize,
    mockWebp,
    mockToBuffer,
    mockMkdir,
    mockWriteFile,
    mockUnlink,
    mockReadFile,
    mockAccess,
    mockValidateUrl,
  };
});

// ============================================
// 모듈 모킹
// ============================================

// electron 모킹
vi.mock("electron", () => ({
  app: {
    getPath: (_name: string) =>
      "C:/Users/TestUser/AppData/Roaming/yasig-menu-plus",
  },
}));

// sharp 체이너블 모킹
vi.mock("sharp", () => ({
  default: mockSharp,
}));

// fs/promises 모킹
vi.mock("fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  unlink: (...args: unknown[]) => mockUnlink(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  access: (...args: unknown[]) => mockAccess(...args),
  constants: { R_OK: 4 },
}));

// validator 모킹
vi.mock("./validator.js", () => ({
  validateUrl: (...args: unknown[]) => mockValidateUrl(...args),
}));

// image-path 모킹 — toRelativePath는 파일명만 반환하도록
vi.mock("./image-path.js", () => ({
  toRelativePath: (absolutePath: string | null) => {
    if (!absolutePath) return null;
    const normalizedPath = absolutePath.replace(/\\/g, "/");
    const normalizedDir = MOCK_THUMBNAIL_DIR.replace(/\\/g, "/");
    if (normalizedPath.startsWith(normalizedDir + "/")) {
      return normalizedPath.slice(normalizedDir.length + 1);
    }
    return absolutePath;
  },
}));

import {
  generateThumbnailFilename,
  getThumbnailDir,
  optimizeImage,
  downloadImage,
  deleteImage,
  deleteThumbnail,
  copyImage,
} from "./downloader.js";

// ============================================
// getThumbnailDir 테스트
// ============================================
describe("getThumbnailDir", () => {
  it("userData 경로 하위 thumbnails 디렉토리를 반환", () => {
    const result = getThumbnailDir();
    // path.join은 OS에 따라 구분자가 다를 수 있지만 thumbnails가 포함되어야 함
    expect(result).toContain("thumbnails");
    expect(result).toContain("yasig-menu-plus");
  });
});

// ============================================
// generateThumbnailFilename 테스트
// ============================================
describe("generateThumbnailFilename", () => {
  it("동일 경로는 동일 해시 파일명 생성", () => {
    const gamePath = "C:/Games/[RJ123456] TestGame";
    const filename1 = generateThumbnailFilename(gamePath, 0);
    const filename2 = generateThumbnailFilename(gamePath, 0);

    expect(filename1).toBe(filename2);
  });

  it("MD5 해시 32자리 + .jpg 확장자 형식", () => {
    const gamePath = "C:/Games/SomeGame";
    const filename = generateThumbnailFilename(gamePath, 0);

    expect(filename).toMatch(/^[a-f0-9]{32}\.jpg$/);
  });

  it("index=0이면 접미사 없이 .jpg", () => {
    const gamePath = "C:/Games/TestGame";
    const hash = createHash("md5").update(gamePath).digest("hex");

    expect(generateThumbnailFilename(gamePath, 0)).toBe(`${hash}.jpg`);
  });

  it("index=1이면 _1 접미사", () => {
    const gamePath = "C:/Games/TestGame";
    const hash = createHash("md5").update(gamePath).digest("hex");

    expect(generateThumbnailFilename(gamePath, 1)).toBe(`${hash}_1.jpg`);
  });

  it("index=5이면 _5 접미사", () => {
    const gamePath = "C:/Games/TestGame";
    const hash = createHash("md5").update(gamePath).digest("hex");

    expect(generateThumbnailFilename(gamePath, 5)).toBe(`${hash}_5.jpg`);
  });

  it("기본 인덱스는 0 (접미사 없음)", () => {
    const gamePath = "C:/Games/TestGame";
    const hash = createHash("md5").update(gamePath).digest("hex");

    expect(generateThumbnailFilename(gamePath)).toBe(`${hash}.jpg`);
  });

  it("다른 경로는 다른 해시 파일명 생성", () => {
    const filename1 = generateThumbnailFilename("C:/Games/Game1", 0);
    const filename2 = generateThumbnailFilename("C:/Games/Game2", 0);

    expect(filename1).not.toBe(filename2);
  });
});

// ============================================
// optimizeImage 테스트
// ============================================
describe("optimizeImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 모킹 체인 재설정
    mockToBuffer.mockResolvedValue(Buffer.from("optimized-webp-data"));
    mockWebp.mockReturnValue({ toBuffer: mockToBuffer });
    mockResize.mockReturnValue({ webp: mockWebp });
    mockSharp.mockReturnValue({ resize: mockResize });
  });

  it("sharp(buffer).resize().webp().toBuffer() 체인 호출", async () => {
    const inputBuffer = Buffer.from("test-image-data");
    const result = await optimizeImage(inputBuffer);

    // sharp가 입력 버퍼로 호출됨
    expect(mockSharp).toHaveBeenCalledWith(inputBuffer);

    // resize가 올바른 옵션으로 호출됨
    expect(mockResize).toHaveBeenCalledWith(1280, undefined, {
      fit: "inside",
      withoutEnlargement: true,
    });

    // webp가 품질 설정으로 호출됨
    expect(mockWebp).toHaveBeenCalledWith({ quality: 80 });

    // toBuffer가 호출됨
    expect(mockToBuffer).toHaveBeenCalled();

    // 결과가 최적화된 버퍼
    expect(result).toEqual(Buffer.from("optimized-webp-data"));
  });
});

// ============================================
// downloadImage 테스트
// ============================================
describe("downloadImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToBuffer.mockResolvedValue(Buffer.from("optimized-webp-data"));
    mockWebp.mockReturnValue({ toBuffer: mockToBuffer });
    mockResize.mockReturnValue({ webp: mockWebp });
    mockSharp.mockReturnValue({ resize: mockResize });
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
  });

  describe("base64 data URL 처리", () => {
    it("유효한 base64 data URL → 디코딩 + 최적화 + 파일 저장", async () => {
      const base64Data = Buffer.from("fake-png-data").toString("base64");
      const dataUrl = `data:image/png;base64,${base64Data}`;
      const gamePath = "C:/Games/TestGame";

      const result = await downloadImage(dataUrl, gamePath, 0);

      // thumbnails 디렉토리 생성 확인
      expect(mockMkdir).toHaveBeenCalledWith(
        expect.stringContaining("thumbnails"),
        { recursive: true },
      );

      // sharp를 통한 최적화 호출 확인
      expect(mockSharp).toHaveBeenCalledWith(Buffer.from(base64Data, "base64"));

      // 파일 저장 확인 (.webp 확장자)
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringMatching(/\.webp$/),
        Buffer.from("optimized-webp-data"),
      );

      // 상대 경로(파일명)가 반환됨
      expect(result).toMatch(/\.webp$/);
    });

    it("index가 지정되면 파일명에 접미사 포함", async () => {
      const base64Data = Buffer.from("fake-data").toString("base64");
      const dataUrl = `data:image/jpeg;base64,${base64Data}`;
      const gamePath = "C:/Games/TestGame";
      const hash = createHash("md5").update(gamePath).digest("hex");

      const result = await downloadImage(dataUrl, gamePath, 3);

      // 파일명에 _3 접미사가 포함되어야 함
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.stringContaining(`${hash}_3.webp`),
        expect.any(Buffer),
      );

      expect(result).toContain(`${hash}_3.webp`);
    });

    it("잘못된 data URL 형식 → 에러 발생", async () => {
      // data: 접두사는 있지만 형식이 맞지 않는 URL
      const invalidDataUrl = "data:invalid-format";

      await expect(
        downloadImage(invalidDataUrl, "C:/Games/TestGame", 0),
      ).rejects.toThrow("잘못된 data URL 형식");
    });

    it("base64 부분이 없는 data URL → 에러 발생", async () => {
      const invalidDataUrl = "data:image/png;base64,";

      // 빈 base64는 정규식에 매칭되지 않음 (.+ 요구)
      await expect(
        downloadImage(invalidDataUrl, "C:/Games/TestGame", 0),
      ).rejects.toThrow("잘못된 data URL 형식");
    });
  });

  describe("HTTP URL 처리", () => {
    it("HTTP URL이면 validateUrl을 호출", async () => {
      // HTTP 모킹이 복잡하므로 validateUrl 호출 확인만
      // validateUrl에서 에러를 던져 HTTP 요청 전에 중단되도록 함
      mockValidateUrl.mockImplementation(() => {
        throw new Error("test-validation-error");
      });

      await expect(
        downloadImage("https://example.com/image.jpg", "C:/Games/TestGame", 0),
      ).rejects.toThrow("test-validation-error");

      expect(mockValidateUrl).toHaveBeenCalledWith(
        "https://example.com/image.jpg",
      );
    });

    it("data URL이면 validateUrl을 호출하지 않음", async () => {
      const base64Data = Buffer.from("fake-data").toString("base64");
      const dataUrl = `data:image/png;base64,${base64Data}`;

      await downloadImage(dataUrl, "C:/Games/TestGame", 0);

      expect(mockValidateUrl).not.toHaveBeenCalled();
    });
  });
});

// ============================================
// deleteImage 테스트
// ============================================
describe("deleteImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("unlink으로 파일 삭제", async () => {
    mockUnlink.mockResolvedValue(undefined);

    await deleteImage("/path/to/thumbnail.webp");

    expect(mockUnlink).toHaveBeenCalledWith("/path/to/thumbnail.webp");
  });

  it("파일이 없어도 에러 없이 완료", async () => {
    mockUnlink.mockRejectedValue(
      new Error("ENOENT: no such file or directory"),
    );

    // 에러가 발생하지 않아야 함
    await expect(
      deleteImage("/path/to/nonexistent.webp"),
    ).resolves.toBeUndefined();
  });

  it("다른 종류의 에러도 무시", async () => {
    mockUnlink.mockRejectedValue(new Error("EPERM: operation not permitted"));

    await expect(deleteImage("/path/to/locked.webp")).resolves.toBeUndefined();
  });
});

// ============================================
// deleteThumbnail 테스트
// ============================================
describe("deleteThumbnail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deleteImage와 동일하게 동작 (unlink 호출)", async () => {
    mockUnlink.mockResolvedValue(undefined);

    await deleteThumbnail("/path/to/thumbnail.webp");

    expect(mockUnlink).toHaveBeenCalledWith("/path/to/thumbnail.webp");
  });
});

// ============================================
// copyImage 테스트
// ============================================
describe("copyImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToBuffer.mockResolvedValue(Buffer.from("optimized-webp-data"));
    mockWebp.mockReturnValue({ toBuffer: mockToBuffer });
    mockResize.mockReturnValue({ webp: mockWebp });
    mockSharp.mockReturnValue({ resize: mockResize });
    mockMkdir.mockResolvedValue(undefined);
    mockReadFile.mockResolvedValue(Buffer.from("source-image-data"));
    mockWriteFile.mockResolvedValue(undefined);
    mockAccess.mockResolvedValue(undefined);
  });

  it("정상 복사: 원본 읽기 + 최적화(WebP) + 저장", async () => {
    const sourcePath = "C:/Downloads/image.png";
    const gamePath = "C:/Games/TestGame";
    const hash = createHash("md5").update(gamePath).digest("hex");

    const result = await copyImage(sourcePath, gamePath, 0);

    // thumbnails 디렉토리 생성
    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining("thumbnails"),
      { recursive: true },
    );

    // 원본 파일 접근 확인
    expect(mockAccess).toHaveBeenCalledWith(sourcePath, 4); // R_OK = 4

    // 원본 파일 읽기
    expect(mockReadFile).toHaveBeenCalledWith(sourcePath);

    // sharp로 최적화
    expect(mockSharp).toHaveBeenCalledWith(Buffer.from("source-image-data"));

    // .webp 확장자로 저장
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(`${hash}.webp`),
      Buffer.from("optimized-webp-data"),
    );

    // 상대 경로(파일명) 반환
    expect(result).toContain(`${hash}.webp`);
  });

  it("index 지정 시 파일명에 접미사 포함", async () => {
    const sourcePath = "C:/Downloads/image.png";
    const gamePath = "C:/Games/TestGame";
    const hash = createHash("md5").update(gamePath).digest("hex");

    const result = await copyImage(sourcePath, gamePath, 2);

    // _2 접미사가 포함된 파일명
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining(`${hash}_2.webp`),
      expect.any(Buffer),
    );
    expect(result).toContain(`${hash}_2.webp`);
  });

  it("원본 파일이 없으면 에러 발생", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const sourcePath = "C:/Downloads/nonexistent.png";

    await expect(copyImage(sourcePath, "C:/Games/TestGame", 0)).rejects.toThrow(
      `원본 파일을 읽을 수 없습니다: ${sourcePath}`,
    );
  });

  it("원본 파일 읽기 권한 없으면 에러 발생", async () => {
    mockAccess.mockRejectedValue(new Error("EACCES"));

    const sourcePath = "C:/Protected/image.png";

    await expect(copyImage(sourcePath, "C:/Games/TestGame", 0)).rejects.toThrow(
      `원본 파일을 읽을 수 없습니다: ${sourcePath}`,
    );
  });

  it("기본 인덱스(0)일 때 접미사 없는 파일명", async () => {
    const gamePath = "C:/Games/TestGame";
    const hash = createHash("md5").update(gamePath).digest("hex");

    const result = await copyImage("C:/Downloads/image.png", gamePath);

    expect(result).toContain(`${hash}.webp`);
    expect(result).not.toContain("_");
  });
});
