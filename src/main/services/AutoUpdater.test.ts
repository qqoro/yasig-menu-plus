import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(),
  checkForUpdates: vi.fn(),
  fetchReleasesAfterVersion: vi.fn(),
}));

vi.mock("electron", () => ({
  app: { isPackaged: true, getVersion: () => "1.24.0" },
  BrowserWindow: class {},
  shell: { openExternal: mocks.openExternal },
}));

vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: {
      autoDownload: true,
      on: vi.fn(),
      checkForUpdates: mocks.checkForUpdates,
      downloadUpdate: vi.fn(),
      quitAndInstall: vi.fn(),
    },
  },
}));

vi.mock("../utils/logger.js", () => {
  const log = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  return { createLogger: () => log, logger: log };
});

vi.mock("./ChangelogService.js", () => ({
  changelogService: {
    fetchReleasesAfterVersion: mocks.fetchReleasesAfterVersion,
  },
}));

const { AutoUpdater } = await import("./AutoUpdater.js");

/**
 * 렌더러로 보낸 이벤트를 기록하는 가짜 메인 윈도우
 */
function createWindow() {
  const send = vi.fn();
  const window = {
    isDestroyed: () => false,
    webContents: { send },
  } as unknown as BrowserWindow;
  return { window, send };
}

function makeRelease(version: string) {
  return {
    version,
    name: version,
    body: "",
    publishedAt: "2026-10-25T00:00:00Z",
    htmlUrl: `https://github.com/qqoro/yasig-menu-plus/releases/tag/${version}`,
  };
}

describe("AutoUpdater", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.PORTABLE_EXECUTABLE_DIR;
  });

  describe("포터블 버전", () => {
    function createPortableUpdater() {
      process.env.PORTABLE_EXECUTABLE_DIR = "C:\\portable";
      const updater = new AutoUpdater();
      const { window, send } = createWindow();
      updater.setMainWindow(window);
      return { updater, send };
    }

    it("electron-updater 대신 GitHub 릴리즈로 새 버전을 확인한다", async () => {
      mocks.fetchReleasesAfterVersion.mockResolvedValue([
        makeRelease("v1.25.0"),
        makeRelease("v1.24.1"),
      ]);
      const { updater, send } = createPortableUpdater();

      await updater.checkForUpdates();

      expect(mocks.checkForUpdates).not.toHaveBeenCalled();
      expect(mocks.fetchReleasesAfterVersion).toHaveBeenCalledWith("1.24.0");
      expect(send).toHaveBeenCalledWith("updateChecking", undefined);
      expect(send).toHaveBeenCalledWith("updateAvailable", {
        version: "1.25.0",
        releaseDate: "2026-10-25T00:00:00Z",
        isPortable: true,
      });
    });

    it("새 릴리즈가 없으면 최신 버전으로 알린다", async () => {
      mocks.fetchReleasesAfterVersion.mockResolvedValue([]);
      const { updater, send } = createPortableUpdater();

      await updater.checkForUpdates();

      expect(send).toHaveBeenCalledWith("updateNotAvailable", undefined);
    });

    it("조회에 실패하면 최신 버전이 아니라 오류로 알린다", async () => {
      mocks.fetchReleasesAfterVersion.mockRejectedValue(
        new TypeError("fetch failed"),
      );
      const { updater, send } = createPortableUpdater();

      await updater.checkForUpdates();

      expect(send).toHaveBeenCalledWith("updateError", {
        error: "fetch failed",
      });
      expect(send).not.toHaveBeenCalledWith("updateNotAvailable", undefined);
    });

    it("다운로드 시 확인된 새 버전의 릴리즈 페이지를 연다", async () => {
      mocks.fetchReleasesAfterVersion.mockResolvedValue([
        makeRelease("v1.25.0"),
      ]);
      const { updater } = createPortableUpdater();

      await updater.checkForUpdates();
      await updater.downloadUpdate();

      expect(mocks.openExternal).toHaveBeenCalledWith(
        "https://github.com/qqoro/yasig-menu-plus/releases/tag/v1.25.0",
      );
    });

    it("확인된 버전이 없으면 릴리즈 목록 페이지를 연다", async () => {
      const { updater } = createPortableUpdater();

      await updater.downloadUpdate();

      expect(mocks.openExternal).toHaveBeenCalledWith(
        "https://github.com/qqoro/yasig-menu-plus/releases",
      );
    });
  });

  describe("설치 버전", () => {
    it("electron-updater로 업데이트를 확인한다", async () => {
      const updater = new AutoUpdater();

      await updater.checkForUpdates();

      expect(mocks.checkForUpdates).toHaveBeenCalled();
      expect(mocks.fetchReleasesAfterVersion).not.toHaveBeenCalled();
    });
  });
});
