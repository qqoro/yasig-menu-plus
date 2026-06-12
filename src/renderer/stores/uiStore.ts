import { defineStore } from "pinia";

const THEME_STORAGE_KEY = "theme-preference";
const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";
const ZOOM_LEVEL_STORAGE_KEY = "zoom-level";
const VIEW_MODE_STORAGE_KEY = "view-mode";

export type ViewMode = "card" | "image";

interface UIState {
  gameCount: number;
  isDark: boolean;
  sidebarCollapsed: boolean;
  zoomLevel: number;
  viewMode: ViewMode;
}

function getInitialTheme(): boolean {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored !== null) {
    return stored === "dark";
  }
  // 시스템 테마 확인
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getInitialSidebarCollapsed(): boolean {
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (stored !== null) {
    return stored === "true";
  }
  return false;
}

function getInitialZoomLevel(): number {
  const stored = localStorage.getItem(ZOOM_LEVEL_STORAGE_KEY);
  if (stored !== null) {
    const level = parseInt(stored, 10);
    if (level >= 1 && level <= 10) return level;
  }
  return 3;
}

function getInitialViewMode(): ViewMode {
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  if (stored === "card" || stored === "image") {
    return stored;
  }
  return "card";
}

export const useUIStore = defineStore("ui", {
  state: (): UIState => ({
    gameCount: 0,
    isDark: getInitialTheme(),
    sidebarCollapsed: getInitialSidebarCollapsed(),
    zoomLevel: getInitialZoomLevel(),
    viewMode: getInitialViewMode(),
  }),
  actions: {
    setGameCount(count: number) {
      this.gameCount = count;
    },
    toggleTheme() {
      this.isDark = !this.isDark;
      localStorage.setItem(THEME_STORAGE_KEY, this.isDark ? "dark" : "light");
      applyTheme(this.isDark);
    },
    initializeTheme() {
      applyTheme(this.isDark);
    },
    toggleSidebar() {
      this.sidebarCollapsed = !this.sidebarCollapsed;
      localStorage.setItem(
        SIDEBAR_STORAGE_KEY,
        this.sidebarCollapsed.toString(),
      );
    },
    setSidebarCollapsed(collapsed: boolean) {
      this.sidebarCollapsed = collapsed;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed.toString());
    },
    setZoomLevel(level: number) {
      if (level >= 1 && level <= 10) {
        this.zoomLevel = level;
        localStorage.setItem(ZOOM_LEVEL_STORAGE_KEY, level.toString());
      }
    },
    increaseZoom() {
      if (this.zoomLevel < 10) {
        this.zoomLevel++;
        localStorage.setItem(ZOOM_LEVEL_STORAGE_KEY, this.zoomLevel.toString());
      }
    },
    decreaseZoom() {
      if (this.zoomLevel > 1) {
        this.zoomLevel--;
        localStorage.setItem(ZOOM_LEVEL_STORAGE_KEY, this.zoomLevel.toString());
      }
    },
    toggleViewMode() {
      this.viewMode = this.viewMode === "card" ? "image" : "card";
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, this.viewMode);
    },
  },
});

function applyTheme(isDark: boolean) {
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}
