import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import { app, BrowserWindow, ipcMain, session, shell } from "electron";
import log from "electron-log";
import windowStateKeeper from "electron-window-state";
import { join } from "path";
import { dbManager } from "./db/db-manager.js";
import { IpcMainSend, IpcRendererSend } from "./events.js";

// 핸들러 임포트
import * as AutoUpdateHandlers from "./handlers/autoUpdate.js";
import * as CollectorHandlers from "./handlers/collector.js";
import {
  selectExecutableFileHandler,
  selectFileHandler,
  selectFolderHandler,
} from "./handlers/dialog.js";
import { registerHandlers as registerGameDetailHandlers } from "./handlers/gameDetail.js";
import * as GameImagesHandlers from "./handlers/gameImages.js";
import { registerHandlers as registerGameUpdateHandlers } from "./handlers/gameUpdate.js";
import {
  addExcludedExecutableHandler,
  addLibraryPathHandler,
  autoScanLibraries,
  batchToggleGamesHandler,
  getAllLibraryScanHistoryHandler,
  getAutocompleteSuggestionsHandler,
  getExcludedExecutablesHandler,
  getLastRefreshedHandler,
  getLibraryPathsHandler,
  getLibraryScanHistoryHandler,
  getPlaySessionsHandler,
  getPlayTimeHandler,
  getRandomGameHandler,
  openFolderHandler,
  openOriginalSiteHandler,
  playGameHandler,
  refreshListHandler,
  removeExcludedExecutableHandler,
  removeLibraryPathHandler,
  searchGamesHandler,
  setExecutablePathHandler,
  setLastRefreshedHandler,
  toggleGameHandler,
} from "./handlers/home.js";
import {
  getAllSettingsHandler,
  openDataFolderHandler,
  updateSettingsHandler,
} from "./handlers/setting.js";
import * as ThumbnailHandlers from "./handlers/thumbnail.js";
import * as TranslationHandlers from "./handlers/translation.js";
import * as DuplicatesHandlers from "./handlers/duplicates.js";
import {
  getDashboardStatsHandler,
  getLibraryStorageSizeHandler,
} from "./handlers/dashboard.js";
import { setupChangelogHandler } from "./handlers/changelog.js";
import {
  closeWindowHandler,
  maximizeWindowHandler,
  minimizeWindowHandler,
} from "./handlers/windows.js";
import {
  getDisabledLibraryPathsHandler,
  toggleLibraryPathVisibilityHandler,
} from "./handlers/libraryPathVisibility.js";
import { processMonitor } from "./services/ProcessMonitor.js";
import { autoUpdaterService } from "./services/AutoUpdater.js";
import { getAutoScanOnStartup, getAutoUpdateSettings } from "./store.js";

log.initialize();
export const console = log;
dayjs.extend(customParseFormat);

let mainWindow: BrowserWindow;
let list: string[];

function createWindow() {
  let mainWindowState = windowStateKeeper({
    defaultWidth: 1000,
    defaultHeight: 800,
  });

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    icon: join(import.meta.dirname, "./static/icon.ico"),
    titleBarStyle: "hidden",
    webPreferences: {
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: true,
      webSecurity: false,
      preload: join(import.meta.dirname, "./preload.js"),
    },
  });
  mainWindow.setMenu(null);
  mainWindowState.manage(mainWindow);

  if (process.env.NODE_ENV === "development") {
    const rendererPort = process.argv[2];
    mainWindow.loadURL(`http://localhost:${rendererPort}`).then(() => {});
    mainWindow.webContents.openDevTools({ mode: "detach" });
    // 개발 환경에서만 상태 저장 수동 (개발의 경우 정상 종료가 아니라 상태 저장이 안됨)
    const handleDevWindowStore = () => {
      mainWindowState.saveState(mainWindow);
    };
    mainWindow
      .addListener("move", handleDevWindowStore)
      .addListener("resize", handleDevWindowStore)
      .addListener("maximize", handleDevWindowStore)
      .addListener("unmaximize", handleDevWindowStore);
  } else {
    mainWindow
      .loadFile(join(app.getAppPath(), "renderer", "index.html"))
      .then(() => {});
  }

  mainWindow.on("enter-full-screen", () => {
    // 전체화면 진입 이벤트 (필요시 구현)
  });

  /**
   * URL이 외부 링크인지 확인 (내부 파일/localhost 제외)
   */
  const isExternalUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol !== "file:";
    } catch {
      return false;
    }
  };

  // target="_blank" 링크 및 window.open() 처리
  mainWindow.webContents.setWindowOpenHandler((details) => {
    if (isExternalUrl(details.url)) {
      shell.openExternal(details.url);
    }
    return { action: "deny" };
  });

  // 일반 <a href> 링크 처리
  mainWindow.webContents.on("will-navigate", (event, url) => {
    // 내부 내비게이션은 허용
    if (url.startsWith("file://") || url.startsWith("http://localhost")) {
      return;
    }
    // 외부 링크는 차단하고 외부 브라우저로 열기
    event.preventDefault();
    shell.openExternal(url);
  });

  // 브라우저 단축키 처리
  mainWindow.webContents.on("before-input-event", (event, input) => {
    const key = input.key.toLowerCase();
    // Ctrl + R: 페이지 새로고침
    if (key === "r" && (input.control || input.meta)) {
      event.preventDefault();
      mainWindow.webContents.reload();
    }
    // Ctrl + W: 현재 창 닫기
    else if (key === "w" && (input.control || input.meta)) {
      event.preventDefault();
      mainWindow.close();
    }
    // F12: 개발자 도구 토글
    else if (input.key === "F12") {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
    // Ctrl + Shift + C: 개발자 도구 토글
    else if (key === "c" && (input.control || input.meta) && input.shift) {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (Array.isArray(list) && list.length > 0) {
      list = [];
    }
  });

  // 윈도우 상태 변경 이벤트 리스너
  mainWindow.on("maximize", () => {
    mainWindow.webContents.send(IpcMainSend.WindowMaximized);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send(IpcMainSend.WindowUnmaximized);
  });

  // ProcessMonitor에 메인 윈도우 설정
  processMonitor.setMainWindow(mainWindow);

  // AutoUpdater에 메인 윈도우 설정
  autoUpdaterService.setMainWindow(mainWindow);
}

/**
 * IPC 핸들러 등록
 */
function registerIpcHandlers() {
  // ========== 게임 목록 관련 ==========
  ipcMain.handle(IpcRendererSend.RefreshList, refreshListHandler);

  // ========== 게임 실행 관련 ==========
  ipcMain.handle(IpcRendererSend.PlayGame, playGameHandler);
  ipcMain.handle(IpcRendererSend.OpenFolder, openFolderHandler);

  // ========== 윈도우 제어 ==========
  ipcMain.handle(IpcRendererSend.MinimizeWindow, minimizeWindowHandler);
  ipcMain.handle(IpcRendererSend.MaximizeWindow, maximizeWindowHandler);
  ipcMain.handle(IpcRendererSend.CloseWindow, closeWindowHandler);

  // ========== 다이얼로그 ==========
  ipcMain.handle(IpcRendererSend.SelectFolder, selectFolderHandler);
  ipcMain.handle(IpcRendererSend.SelectFile, selectFileHandler);
  ipcMain.handle(
    IpcRendererSend.SelectExecutableFile,
    selectExecutableFileHandler,
  );

  // ========== 컬렉터 관련 ==========
  ipcMain.handle(
    IpcRendererSend.RunCollector,
    CollectorHandlers.runCollectorHandler,
  );
  ipcMain.handle(
    IpcRendererSend.RunAllCollectors,
    CollectorHandlers.runAllCollectorsHandler,
  );
  ipcMain.handle(IpcRendererSend.GetNewCookie, CollectorHandlers.getNewCookie);

  // ========== 썸네일 관련 ==========
  ipcMain.handle(
    IpcRendererSend.DownloadThumbnail,
    ThumbnailHandlers.downloadThumbnailHandler,
  );
  ipcMain.handle(
    IpcRendererSend.DeleteThumbnail,
    ThumbnailHandlers.deleteThumbnailHandler,
  );
  ipcMain.handle(
    IpcRendererSend.CleanUnusedThumbnails,
    ThumbnailHandlers.cleanUnusedThumbnailsHandler,
  );
  ipcMain.handle(
    IpcRendererSend.MigrateThumbnails,
    ThumbnailHandlers.migrateThumbnailsHandler,
  );
  ipcMain.handle(
    IpcRendererSend.ConvertImagesToWebp,
    ThumbnailHandlers.convertImagesToWebpHandler,
  );

  // ========== 게임 이미지 관련 ==========
  ipcMain.handle(
    IpcRendererSend.GetGameImages,
    GameImagesHandlers.getGameImagesHandler,
  );

  // ========== 검색 및 필터링 관련 ==========
  ipcMain.handle(IpcRendererSend.SearchGames, searchGamesHandler);
  ipcMain.handle(IpcRendererSend.GetRandomGame, getRandomGameHandler);
  ipcMain.handle(IpcRendererSend.ToggleFavorite, (event, payload) =>
    toggleGameHandler(event, payload, "is_favorite"),
  );
  ipcMain.handle(IpcRendererSend.ToggleHidden, (event, payload) =>
    toggleGameHandler(event, payload, "is_hidden"),
  );
  ipcMain.handle(IpcRendererSend.ToggleClear, (event, payload) =>
    toggleGameHandler(event, payload, "is_clear"),
  );
  ipcMain.handle(IpcRendererSend.BatchToggleGames, batchToggleGamesHandler);
  ipcMain.handle(
    IpcRendererSend.GetAutocompleteSuggestions,
    getAutocompleteSuggestionsHandler,
  );

  // ========== 게임 상세 정보 관련 ==========
  registerGameDetailHandlers();
  registerGameUpdateHandlers();

  // ========== 원본 사이트 열기 ==========
  ipcMain.handle(IpcRendererSend.OpenOriginalSite, openOriginalSiteHandler);

  // ========== 실행 파일 관리 ==========
  ipcMain.handle(IpcRendererSend.SetExecutablePath, setExecutablePathHandler);

  // ========== 실행 제외 목록 관리 ==========
  ipcMain.handle(
    IpcRendererSend.GetExcludedExecutables,
    getExcludedExecutablesHandler,
  );
  ipcMain.handle(
    IpcRendererSend.AddExcludedExecutable,
    addExcludedExecutableHandler,
  );
  ipcMain.handle(
    IpcRendererSend.RemoveExcludedExecutable,
    removeExcludedExecutableHandler,
  );

  // ========== 라이브러리 경로 관리 ==========
  ipcMain.handle(IpcRendererSend.GetLibraryPaths, getLibraryPathsHandler);
  ipcMain.handle(IpcRendererSend.AddLibraryPath, addLibraryPathHandler);
  ipcMain.handle(IpcRendererSend.RemoveLibraryPath, removeLibraryPathHandler);
  ipcMain.handle(
    IpcRendererSend.ToggleLibraryPathVisibility,
    toggleLibraryPathVisibilityHandler,
  );
  ipcMain.handle(
    IpcRendererSend.GetDisabledLibraryPaths,
    getDisabledLibraryPathsHandler,
  );

  // ========== 번역 관련 ==========
  ipcMain.handle(
    IpcRendererSend.TranslateTitle,
    TranslationHandlers.translateTitleHandler,
  );
  ipcMain.handle(
    IpcRendererSend.TranslateAllTitles,
    TranslationHandlers.translateAllTitlesHandler,
  );
  ipcMain.handle(
    IpcRendererSend.GetTranslationSettings,
    TranslationHandlers.getTranslationSettingsHandler,
  );
  ipcMain.handle(
    IpcRendererSend.SetTranslationSettings,
    TranslationHandlers.setTranslationSettingsHandler,
  );

  // ========== 마지막 갱신 시간 관련 ==========
  ipcMain.handle(IpcRendererSend.LastRefreshedSet, setLastRefreshedHandler);
  ipcMain.handle(IpcRendererSend.LastRefreshedGet, getLastRefreshedHandler);

  // ========== 라이브러리 스캔 기록 관련 ==========
  ipcMain.handle(
    IpcRendererSend.GetLibraryScanHistory,
    getLibraryScanHistoryHandler,
  );
  ipcMain.handle(
    IpcRendererSend.GetAllLibraryScanHistory,
    getAllLibraryScanHistoryHandler,
  );

  // ========== 통합 설정 관리 ==========
  ipcMain.handle(IpcRendererSend.GetAllSettings, getAllSettingsHandler);
  ipcMain.handle(IpcRendererSend.UpdateSettings, updateSettingsHandler);
  ipcMain.handle(IpcRendererSend.OpenDataFolder, openDataFolderHandler);

  // ========== 플레이 타임 관련 ==========
  ipcMain.handle(IpcRendererSend.GetPlayTime, getPlayTimeHandler);
  ipcMain.handle(IpcRendererSend.GetPlaySessions, getPlaySessionsHandler);

  // ========== 자동 업데이트 관련 ==========
  ipcMain.handle(
    IpcRendererSend.CheckForUpdate,
    AutoUpdateHandlers.checkForUpdateHandler,
  );
  ipcMain.handle(
    IpcRendererSend.DownloadUpdate,
    AutoUpdateHandlers.downloadUpdateHandler,
  );
  ipcMain.handle(
    IpcRendererSend.InstallUpdate,
    AutoUpdateHandlers.installUpdateHandler,
  );
  ipcMain.handle(
    IpcRendererSend.GetAutoUpdateSettings,
    AutoUpdateHandlers.getAutoUpdateSettingsHandler,
  );
  ipcMain.handle(
    IpcRendererSend.SetAutoUpdateSettings,
    AutoUpdateHandlers.setAutoUpdateSettingsHandler,
  );

  // ========== 중복 게임 관리 ==========
  ipcMain.handle(
    IpcRendererSend.FindDuplicates,
    DuplicatesHandlers.findDuplicatesHandler,
  );
  ipcMain.handle(
    IpcRendererSend.DeleteGames,
    DuplicatesHandlers.deleteGamesHandler,
  );

  // ========== 대시보드 통계 ==========
  ipcMain.handle(IpcRendererSend.GetDashboardStats, getDashboardStatsHandler);
  ipcMain.handle(
    IpcRendererSend.GetLibraryStorageSize,
    getLibraryStorageSizeHandler,
  );

  // ========== 체인지로그 ==========
  setupChangelogHandler(mainWindow);
}

app.whenReady().then(async () => {
  try {
    // 안전한 데이터베이스 초기화 (재시도 포함)
    list = await dbManager.initialize();
  } catch (error) {
    console.error("데이터베이스 초기화 최종 실패:", error);
    // 데이터베이스 초기화 실패 시에도 앱을 시작하도록 하지만 오류 로그 출력
    // 사용자에게 알림을 표시할 수도 있음
  }

  createWindow();
  registerIpcHandlers();

  // 앱 시작 시 자동 스캔 (설정된 경우)
  if (getAutoScanOnStartup()) {
    // 백그라운드에서 스캔 (UI 로딩 방지)
    setTimeout(async () => {
      try {
        const added = await autoScanLibraries();
        if (added > 0) {
          console.log(`자동 스캔 완료: ${added}개의 새 게임 추가`);
        }
        // Renderer에 자동 스캔 완료 알림
        mainWindow.webContents.send(IpcMainSend.AutoScanDone, {
          addedCount: added,
        });
      } catch (error) {
        console.error("자동 스캔 오류:", error);
      }
    }, 1000); // 1초 후 실행
  }

  // 앱 시작 시 자동 업데이트 확인 (설정된 경우)
  const autoUpdateSettings = getAutoUpdateSettings();
  if (autoUpdateSettings.checkOnStartup) {
    setTimeout(async () => {
      try {
        await autoUpdaterService.checkForUpdates();
      } catch (error) {
        console.error("자동 업데이트 확인 오류:", error);
      }
    }, 2000); // 2초 후 실행
  }

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": ["script-src 'self'"],
      },
    });
  });

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 애플리케이션 종료 시 데이터베이스 연결 정리
app.on("before-quit", async () => {
  try {
    // 모든 활성 게임 세션 종료
    await processMonitor.endAllSessions();
    // 데이터베이스 연결 종료
    await dbManager.destroy();
  } catch (error) {
    console.error("종료 처리 실패:", error);
  }
});
