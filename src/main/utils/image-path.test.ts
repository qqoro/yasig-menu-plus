import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

const MOCK_THUMBNAIL_DIR =
  "C:/Users/TestUser/AppData/Roaming/yasig-menu-plus/thumbnails";

// downloader 모듈의 getThumbnailDir을 모킹
vi.mock("./downloader.js", () => ({
  getThumbnailDir: () => MOCK_THUMBNAIL_DIR,
}));

import { toAbsolutePath, toRelativePath } from "./image-path.js";

describe("toAbsolutePath", () => {
  it.each([
    { input: null, expected: null, desc: "null이면 null 반환" },
    { input: "", expected: null, desc: "빈 문자열이면 null 반환 (falsy)" },
  ])("$desc", ({ input, expected }) => {
    expect(toAbsolutePath(input)).toBe(expected);
  });

  it.each([
    {
      input: "C:\\Games\\thumbnail.jpg",
      expected: "C:\\Games\\thumbnail.jpg",
      desc: "Windows 절대 경로는 그대로 반환",
    },
    {
      input: "/usr/local/thumbnails/img.jpg",
      expected: "/usr/local/thumbnails/img.jpg",
      desc: "Unix 절대 경로는 그대로 반환",
    },
  ])("$desc", ({ input, expected }) => {
    expect(toAbsolutePath(input)).toBe(expected);
  });

  it("상대 경로 (파일명만) → thumbnailDir + 파일명", () => {
    const result = toAbsolutePath("abc123.jpg");
    // node:path join은 OS에 따라 구분자가 다를 수 있으므로 join으로 기대값 생성
    expect(result).toBe(join(MOCK_THUMBNAIL_DIR, "abc123.jpg"));
  });

  it("상대 경로 (하위 디렉토리 포함) → thumbnailDir + 경로", () => {
    const result = toAbsolutePath("sub/abc123.jpg");
    expect(result).toBe(join(MOCK_THUMBNAIL_DIR, "sub/abc123.jpg"));
  });
});

describe("toRelativePath", () => {
  it("null이면 null 반환", () => {
    expect(toRelativePath(null)).toBeNull();
  });

  it("thumbnails 디렉토리 내 파일 (forward slash) → 파일명만 반환", () => {
    const input = `${MOCK_THUMBNAIL_DIR}/abc123.webp`;
    expect(toRelativePath(input)).toBe("abc123.webp");
  });

  it("thumbnails 디렉토리 내 파일 (backslash) → 파일명만 반환", () => {
    const input = MOCK_THUMBNAIL_DIR.replace(/\//g, "\\") + "\\abc123.webp";
    expect(toRelativePath(input)).toBe("abc123.webp");
  });

  it("외부 경로 → 그대로 반환", () => {
    const input = "D:/Other/images/photo.jpg";
    expect(toRelativePath(input)).toBe(input);
  });

  it("thumbnails 디렉토리 자체 (슬래시 없이) → 그대로 반환", () => {
    // 디렉토리 경로 자체는 뒤에 /가 없으므로 startsWith(dir + "/")에 매칭 안됨
    expect(toRelativePath(MOCK_THUMBNAIL_DIR)).toBe(MOCK_THUMBNAIL_DIR);
  });

  it("유사 경로명 (thumbnails-extra/) → 그대로 반환 (매칭 안됨)", () => {
    const input = MOCK_THUMBNAIL_DIR + "-extra/abc123.webp";
    expect(toRelativePath(input)).toBe(input);
  });
});
