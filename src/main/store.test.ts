import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * store 모듈 단위 테스트
 * 실행: pnpm test -- src/main/store.test.ts
 *
 * electron-store, electron app, logger, normalizePath를 모킹하여
 * 인메모리 상태로 store 로직을 검증한다.
 */

// 인메모리 electron-store 모킹 (defaults 옵션 지원)
vi.mock("electron-store", () => {
  return {
    default: class {
      private data: Record<string, unknown> = {};
      constructor(opts?: { defaults?: Record<string, unknown> }) {
        this.data = { ...(opts?.defaults ?? {}) };
      }
      get(key: string) {
        return this.data[key];
      }
      set(key: string, value: unknown) {
        this.data[key] = value;
      }
    },
  };
});

// electron app 모킹
vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData" },
}));

// logger 모킹
vi.mock("./utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// normalizePath를 identity 함수로 모킹
vi.mock("./lib/normalize-path.js", () => ({
  normalizePath: (p: string) => p,
}));

let store: typeof import("./store.js");

beforeEach(async () => {
  // 매 테스트마다 store 모듈(및 lazy storeInstance)을 초기화
  vi.resetModules();
  store = await import("./store.js");
});

// ============================================
// removeLibraryPath — 고아 엔트리 정리
// ============================================
describe("removeLibraryPath — 고아 엔트리 정리", () => {
  it("라이브러리 경로와 함께 disabledLibraryPaths에서도 해당 경로를 제거한다", () => {
    store.addLibraryPath("/games/a");
    store.addLibraryPath("/games/b");
    store.setDisabledLibraryPaths(["/games/a", "/games/b"]);

    store.removeLibraryPath("/games/b");

    expect(store.getLibraryPaths()).toEqual(["/games/a"]);
    expect(store.getDisabledLibraryPaths()).toEqual(["/games/a"]);
  });

  it("offlineLibraryPaths에서도 해당 경로를 제거한다", () => {
    store.addLibraryPath("/games/a");
    store.addLibraryPath("/games/b");
    store.setOfflineLibraryPaths(["/games/b"]);

    store.removeLibraryPath("/games/b");

    expect(store.getLibraryPaths()).toEqual(["/games/a"]);
    expect(store.getOfflineLibraryPaths()).toEqual([]);
  });

  it("삭제 대상이 아닌 disabled/offline 경로는 유지한다", () => {
    store.addLibraryPath("/games/a");
    store.addLibraryPath("/games/b");
    store.setDisabledLibraryPaths(["/games/a"]);
    store.setOfflineLibraryPaths(["/games/a"]);

    store.removeLibraryPath("/games/b");

    expect(store.getDisabledLibraryPaths()).toEqual(["/games/a"]);
    expect(store.getOfflineLibraryPaths()).toEqual(["/games/a"]);
  });

  it("존재하지 않는 경로를 삭제해도 나머지 상태는 보존된다", () => {
    store.addLibraryPath("/games/a");
    store.setDisabledLibraryPaths(["/games/a"]);

    store.removeLibraryPath("/games/unknown");

    expect(store.getLibraryPaths()).toEqual(["/games/a"]);
    expect(store.getDisabledLibraryPaths()).toEqual(["/games/a"]);
  });

  it("리포트 시나리오: 둘 다 off인 상태에서 하나를 삭제하면 고아 엔트리가 남지 않는다", () => {
    // 경로 a, b 모두 비활성화
    store.addLibraryPath("/games/a");
    store.addLibraryPath("/games/b");
    store.setDisabledLibraryPaths(["/games/a", "/games/b"]);

    // b 삭제
    store.removeLibraryPath("/games/b");

    // a는 여전히 존재하며 disabled 상태 유지 (UI에서 복구 가능해야 함)
    expect(store.getLibraryPaths()).toEqual(["/games/a"]);
    expect(store.getDisabledLibraryPaths()).toEqual(["/games/a"]);
    // b는 고아 엔트리로 남지 않음
    expect(store.getDisabledLibraryPaths()).not.toContain("/games/b");
  });
});

// ============================================
// setAllLibraryPathsDisabled — 일괄 활성화/비활성화
// ============================================
describe("setAllLibraryPathsDisabled — 일괄 활성화/비활성화", () => {
  it("enabled=true면 disabledLibraryPaths를 비운다", () => {
    store.addLibraryPath("/games/a");
    store.addLibraryPath("/games/b");
    store.setDisabledLibraryPaths(["/games/a"]);

    const result = store.setAllLibraryPathsDisabled(true);

    expect(store.getDisabledLibraryPaths()).toEqual([]);
    expect(result).toEqual([]);
  });

  it("enabled=false면 모든 libraryPaths를 disabledLibraryPaths로 설정한다", () => {
    store.addLibraryPath("/games/a");
    store.addLibraryPath("/games/b");
    store.setDisabledLibraryPaths(["/games/a"]);

    const result = store.setAllLibraryPathsDisabled(false);

    expect(store.getDisabledLibraryPaths()).toEqual(["/games/a", "/games/b"]);
    expect(result).toEqual(["/games/a", "/games/b"]);
  });

  it("enabled=false일 때 libraryPaths가 비어 있으면 빈 배열을 반환한다", () => {
    const result = store.setAllLibraryPathsDisabled(false);

    expect(store.getDisabledLibraryPaths()).toEqual([]);
    expect(result).toEqual([]);
  });

  it("enabled=false로 전환 후 다시 true로 전환하면 모두 활성화된다", () => {
    store.addLibraryPath("/games/a");
    store.addLibraryPath("/games/b");

    store.setAllLibraryPathsDisabled(false);
    expect(store.getDisabledLibraryPaths()).toHaveLength(2);

    store.setAllLibraryPathsDisabled(true);
    expect(store.getDisabledLibraryPaths()).toEqual([]);
  });
});
