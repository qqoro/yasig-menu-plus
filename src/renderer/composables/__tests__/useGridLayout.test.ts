import { describe, it, expect, beforeEach, vi } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useUIStore } from "../../stores/uiStore";
import { useGridLayout } from "../useGridLayout";

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

describe("useGridLayout", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock.clear();
  });

  describe("gridColsClass", () => {
    const expectedClasses: Record<number, string> = {
      1: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3",
      2: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
      3: "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5",
      4: "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5",
      5: "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6",
      6: "grid-cols-5 sm:grid-cols-6 lg:grid-cols-7",
      7: "grid-cols-6 sm:grid-cols-7 lg:grid-cols-8",
      8: "grid-cols-7 sm:grid-cols-8 lg:grid-cols-9",
      9: "grid-cols-8 sm:grid-cols-9 lg:grid-cols-10",
      10: "grid-cols-9 sm:grid-cols-10 lg:grid-cols-11",
    };

    // 각 줌 레벨별 gridColsClass 검증
    for (const [level, expected] of Object.entries(expectedClasses)) {
      it(`줌 레벨 ${level}일 때 올바른 클래스를 반환한다`, () => {
        const uiStore = useUIStore();
        uiStore.zoomLevel = Number(level);

        const { gridColsClass } = useGridLayout();
        expect(gridColsClass.value).toBe(expected);
      });
    }

    it("범위를 벗어난 줌 레벨(0)에서 기본값을 반환한다", () => {
      const uiStore = useUIStore();
      uiStore.zoomLevel = 0;

      const { gridColsClass } = useGridLayout();
      expect(gridColsClass.value).toBe(
        "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5",
      );
    });
  });

  describe("handleIncreaseZoom", () => {
    it("zoomLevel을 증가시킨다", () => {
      const uiStore = useUIStore();
      uiStore.zoomLevel = 3;

      const { handleIncreaseZoom } = useGridLayout();
      handleIncreaseZoom();

      expect(uiStore.zoomLevel).toBe(4);
    });

    it("최대 줌 레벨(10)에서는 증가하지 않는다", () => {
      const uiStore = useUIStore();
      uiStore.zoomLevel = 10;

      const { handleIncreaseZoom } = useGridLayout();
      handleIncreaseZoom();

      expect(uiStore.zoomLevel).toBe(10);
    });
  });

  describe("handleDecreaseZoom", () => {
    it("zoomLevel을 감소시킨다", () => {
      const uiStore = useUIStore();
      uiStore.zoomLevel = 5;

      const { handleDecreaseZoom } = useGridLayout();
      handleDecreaseZoom();

      expect(uiStore.zoomLevel).toBe(4);
    });

    it("최소 줌 레벨(1)에서는 감소하지 않는다", () => {
      const uiStore = useUIStore();
      uiStore.zoomLevel = 1;

      const { handleDecreaseZoom } = useGridLayout();
      handleDecreaseZoom();

      expect(uiStore.zoomLevel).toBe(1);
    });
  });
});
