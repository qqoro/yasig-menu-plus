import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  realpathSync: {
    native: vi.fn(),
  },
}));

import { realpathSync } from "fs";
const mockRealpathNative = vi.mocked(realpathSync.native);

import { normalizePath } from "./normalize-path.js";

describe("normalizePath", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("경로가 존재하면 realpathSync.native 결과를 반환한다", () => {
    mockRealpathNative.mockReturnValue("C:\\Games");
    expect(normalizePath("c:/games")).toBe("C:\\Games");
  });

  it("경로가 존재하지 않으면 path.resolve fallback을 사용한다", () => {
    mockRealpathNative.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const result = normalizePath("C:/NonExistent/Path");
    expect(result).toMatch(/^[A-Z]:\\/);
    expect(result).toContain("NonExistent");
    expect(result).toContain("Path");
  });

  it("끝 구분자를 제거한다", () => {
    mockRealpathNative.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const result = normalizePath("C:/Games/");
    expect(result).not.toMatch(/[\\/]$/);
  });

  it("루트 드라이브의 구분자는 유지한다", () => {
    mockRealpathNative.mockReturnValue("C:\\");
    expect(normalizePath("C:/")).toBe("C:\\");
  });
});
