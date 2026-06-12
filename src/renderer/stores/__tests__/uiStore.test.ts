import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useUIStore } from "../uiStore";

// window 전역 모킹 (uiStore에서 window.matchMedia 사용)
vi.stubGlobal("window", globalThis);

// localStorage 모킹 (uiStore 초기화 시 사용)
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
vi.stubGlobal("localStorage", localStorageMock);

// window.matchMedia 모킹 (uiStore 테마 초기화 시 사용)
vi.stubGlobal(
  "matchMedia",
  vi.fn(() => ({ matches: false })),
);

// document 모킹 (uiStore applyTheme에서 사용)
vi.stubGlobal("document", {
  documentElement: { classList: { add: vi.fn(), remove: vi.fn() } },
});

describe("uiStore - viewMode", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock.clear();
  });

  describe("초기값", () => {
    it("저장된 값이 없으면 기본값 card를 사용한다", () => {
      const uiStore = useUIStore();
      expect(uiStore.viewMode).toBe("card");
    });

    it("localStorage에 image가 저장되어 있으면 image로 초기화된다", () => {
      localStorageMock.setItem("view-mode", "image");
      const uiStore = useUIStore();
      expect(uiStore.viewMode).toBe("image");
    });

    it("localStorage에 잘못된 값이 있으면 기본값 card를 사용한다", () => {
      localStorageMock.setItem("view-mode", "invalid");
      const uiStore = useUIStore();
      expect(uiStore.viewMode).toBe("card");
    });
  });

  describe("toggleViewMode", () => {
    it("card에서 image로 전환한다", () => {
      const uiStore = useUIStore();
      uiStore.viewMode = "card";

      uiStore.toggleViewMode();

      expect(uiStore.viewMode).toBe("image");
    });

    it("image에서 card로 전환한다", () => {
      const uiStore = useUIStore();
      uiStore.viewMode = "image";

      uiStore.toggleViewMode();

      expect(uiStore.viewMode).toBe("card");
    });

    it("전환 시 localStorage에 저장한다", () => {
      const uiStore = useUIStore();
      uiStore.viewMode = "card";

      uiStore.toggleViewMode();

      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        "view-mode",
        "image",
      );
    });
  });
});
