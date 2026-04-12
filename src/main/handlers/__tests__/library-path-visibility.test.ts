import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * libraryPathVisibility 핸들러 유닛 테스트
 * 실행: pnpm test -- src/main/handlers/__tests__/library-path-visibility.test.ts
 *
 * DB를 사용하지 않고 store만 사용하므로 DB 모킹이 필요 없습니다.
 */

// ========== 모듈 모킹 ==========

// electron 모듈 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

// normalizePath를 identity 함수로 모킹 (경로: test → libraryPathVisibility → lib)
vi.mock("../../lib/normalize-path.js", () => ({
  normalizePath: (p: string) => p,
}));

// store 모킹 — 인라인 팩토리로 호이스팅 문제 해결
vi.mock("../../store.js", () => ({
  getDisabledLibraryPaths: vi.fn(() => []),
  toggleLibraryPathDisabled: vi.fn(() => false),
}));

// 모킹 후 import (vi.mock 호이스팅)
import * as store from "../../store.js";
import {
  getDisabledLibraryPathsHandler,
  toggleLibraryPathVisibilityHandler,
} from "../libraryPathVisibility.js";

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================
// getDisabledLibraryPathsHandler
// ============================================
describe("getDisabledLibraryPathsHandler", () => {
  it("store에서 비활성화된 경로 목록을 반환해야 한다", async () => {
    const disabledPaths = ["/games/path-a", "/games/path-b"];
    vi.mocked(store.getDisabledLibraryPaths).mockReturnValue(disabledPaths);

    const result = await getDisabledLibraryPathsHandler({} as any);

    expect(store.getDisabledLibraryPaths).toHaveBeenCalledOnce();
    expect(result.paths).toEqual(disabledPaths);
  });

  it("빈 배열도 정상 반환해야 한다", async () => {
    vi.mocked(store.getDisabledLibraryPaths).mockReturnValue([]);

    const result = await getDisabledLibraryPathsHandler({} as any);

    expect(store.getDisabledLibraryPaths).toHaveBeenCalledOnce();
    expect(result.paths).toEqual([]);
  });
});

// ============================================
// toggleLibraryPathVisibilityHandler
// ============================================
describe("toggleLibraryPathVisibilityHandler", () => {
  it("경로를 normalizePath로 정규화하여 store에 전달해야 한다", async () => {
    const inputPath = "/games/test-path";
    vi.mocked(store.toggleLibraryPathDisabled).mockReturnValue(true);

    await toggleLibraryPathVisibilityHandler({} as any, { path: inputPath });

    // normalizePath가 identity 모킹이므로 원본 경로 그대로 전달됨
    expect(store.toggleLibraryPathDisabled).toHaveBeenCalledWith(inputPath);
  });

  it("toggleLibraryPathDisabled의 반환값을 isDisabled로 반환해야 한다", async () => {
    vi.mocked(store.toggleLibraryPathDisabled).mockReturnValue(true);

    const result = await toggleLibraryPathVisibilityHandler({} as any, {
      path: "/games/test-path",
    });

    expect(result.isDisabled).toBe(true);
  });

  it("결과에 정규화된 경로가 포함되어야 한다", async () => {
    const inputPath = "/games/test-path";
    vi.mocked(store.toggleLibraryPathDisabled).mockReturnValue(false);

    const result = await toggleLibraryPathVisibilityHandler({} as any, {
      path: inputPath,
    });

    // normalizePath가 identity 모킹이므로 입력 경로와 동일
    expect(result.path).toBe(inputPath);
    expect(result.isDisabled).toBe(false);
  });
});
