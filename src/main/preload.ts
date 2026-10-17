/**
 * Preload 스크립트
 *
 * Main Process와 Renderer Process 간의 안전한 통신 제공
 * Electron 보안 베스트 프랙티스: contextIsolation 활성화, preload 스크립트 사용
 */

import { contextBridge, ipcRenderer, webUtils } from "electron";
import type {
  IpcMainEventMap,
  IpcMainSend,
  IpcRendererEventMap,
} from "./events.js";

type IpcListener = (
  event: Electron.IpcRendererEvent,
  ...args: unknown[]
) => void;
// 콜백은 함수 참조를 키로만 쓰므로 시그니처는 보지 않는다
type AnyCallback = object;

/**
 * 렌더러 콜백 → ipcRenderer에 실제 등록된 래퍼 목록 (채널별)
 *
 * removeListener가 원본 콜백만 받으므로, 래퍼를 기억해 두지 않으면 아무것도
 * 제거되지 않아 리스너가 누적된다. 같은 콜백을 같은 채널에 여러 번 등록한
 * 경우를 위해 배열로 보관하고, 제거는 가장 최근 것부터 뗀다.
 */
const listenerRegistry = new WeakMap<AnyCallback, Map<string, IpcListener[]>>();

function rememberListener(
  channel: string,
  callback: AnyCallback,
  listener: IpcListener,
): void {
  let byChannel = listenerRegistry.get(callback);
  if (!byChannel) {
    byChannel = new Map();
    listenerRegistry.set(callback, byChannel);
  }
  const list = byChannel.get(channel) ?? [];
  list.push(listener);
  byChannel.set(channel, list);
}

function takeListener(
  channel: string,
  callback: AnyCallback,
): IpcListener | undefined {
  const list = listenerRegistry.get(callback)?.get(channel);
  if (!list || list.length === 0) return undefined;
  return list.pop();
}

function forgetListener(
  channel: string,
  callback: AnyCallback,
  listener: IpcListener,
): void {
  const list = listenerRegistry.get(callback)?.get(channel);
  if (!list) return;
  const index = list.indexOf(listener);
  if (index !== -1) list.splice(index, 1);
}

/**
 * IPC 통신 API
 *
 * contextBridge를 통해 Renderer Process에 노출
 * 타입 안전성을 제공하기 위해 제네릭 타입 사용
 */
/**
 * 핸들러 반환 타입 매핑
 * invoke 호출 시 반환되는 타입 정의
 */
type IpcInvokeReturn = {
  refreshList: IpcMainEventMap["listRefreshed"];
  countUnmeasuredSize: IpcMainEventMap["unmeasuredSizeCount"];
  playGame: IpcMainEventMap["gamePlayed"];
  openFolder: void;
  minimizeWindow: void;
  maximizeWindow: void;
  closeWindow: void;
  selectFolder: IpcMainEventMap["selectFolder"];
  selectFile: IpcMainEventMap["selectFile"];
  selectProgram: IpcMainEventMap["selectProgram"];
  runCollector: IpcMainEventMap["collectorDone"];
  runAllCollectors: IpcMainEventMap["allCollectorsDone"];
  getNewCookie: string | undefined;
  resolveBotBlock: void; // 봇 차단 해결 완료/취소
  downloadThumbnail: IpcMainEventMap["thumbnailDone"];
  deleteThumbnail: void;
  searchGames: IpcMainEventMap["searchedGames"];
  getRandomGame: IpcMainEventMap["randomGame"];
  toggleFavorite: IpcMainEventMap["gameToggled"];
  toggleHidden: IpcMainEventMap["gameToggled"];
  toggleClear: IpcMainEventMap["gameToggled"];
  getAutocompleteSuggestions: IpcMainEventMap["autocompleteSuggestions"];
  getGameDetail: IpcMainEventMap["gameDetail"];
  openOriginalSite: void;
  updateGameMetadata: IpcMainEventMap["gameMetadataUpdated"];
  updateRating: IpcMainEventMap["ratingUpdated"];
  addMaker: IpcMainEventMap["makerAdded"];
  removeMaker: IpcMainEventMap["makerRemoved"];
  addCategory: IpcMainEventMap["categoryAdded"];
  removeCategory: IpcMainEventMap["categoryRemoved"];
  addTag: IpcMainEventMap["tagAdded"];
  removeTag: IpcMainEventMap["tagRemoved"];
  setThumbnailFromUrl: IpcMainEventMap["thumbnailSet"];
  setThumbnailFromFile: IpcMainEventMap["thumbnailSet"];
  hideThumbnail: IpcMainEventMap["thumbnailHidden"];
  setExecutablePath: IpcMainEventMap["executablePathSet"];
  selectExecutableFile: IpcMainEventMap["executableFileSelected"];
  getExcludedExecutables: IpcMainEventMap["excludedExecutables"];
  addExcludedExecutable: IpcMainEventMap["excludedExecutableAdded"];
  removeExcludedExecutable: IpcMainEventMap["excludedExecutableRemoved"];
  getLibraryPaths: IpcMainEventMap["libraryPaths"];
  addLibraryPath: IpcMainEventMap["libraryPathAdded"];
  removeLibraryPath: IpcMainEventMap["libraryPathRemoved"];
  toggleLibraryPathVisibility: IpcMainEventMap["libraryPathVisibilityToggled"];
  getDisabledLibraryPaths: IpcMainEventMap["disabledLibraryPaths"];
  setAllLibraryPathsDisabled: IpcMainEventMap["allLibraryPathsDisabledSet"];
  toggleLibraryPathOffline: IpcMainEventMap["libraryPathOfflineToggled"];
  getOfflineLibraryPaths: IpcMainEventMap["offlineLibraryPaths"];
  translateTitle: IpcMainEventMap["translationDone"];
  translateAllTitles: IpcMainEventMap["allTranslationsDone"];
  getTranslationSettings: IpcMainEventMap["translationSettings"];
  setTranslationSettings: void;
  lastRefreshedSet: void;
  lastRefreshedGet: IpcMainEventMap["lastRefreshedLoaded"];
  getLibraryScanHistory: IpcMainEventMap["libraryScanHistory"];
  getAllLibraryScanHistory: IpcMainEventMap["allLibraryScanHistory"];
  autoScanDone: IpcMainEventMap["autoScanDone"];
  getAllSettings: IpcMainEventMap["allSettings"];
  updateSettings: IpcMainEventMap["settingsUpdated"];
  cleanUnusedThumbnails: IpcMainEventMap["unusedThumbnailsCleaned"];
  getGameImages: IpcMainEventMap["gameImagesLoaded"];
  addGameImageFromUrl: IpcMainEventMap["gameImagesAdded"];
  addGameImagesFromFiles: IpcMainEventMap["gameImagesAdded"];
  deleteGameImage: void;
  setThumbnailFromImage: void;
  migrateThumbnails: IpcMainEventMap["thumbnailsMigrated"];
  convertImagesToWebp: IpcMainEventMap["imagesConvertedToWebp"];
  getPlayTime: IpcMainEventMap["playTimeLoaded"];
  getPlaySessions: IpcMainEventMap["playSessionsLoaded"];

  // 자동 업데이트 관련
  checkForUpdate: { isPortable: boolean };
  downloadUpdate: void;
  installUpdate: void;
  getAutoUpdateSettings: { settings: { checkOnStartup: boolean } };
  setAutoUpdateSettings: { settings: { checkOnStartup: boolean } };

  // 다중 선택 일괄 조작
  batchToggleGames: IpcMainEventMap["batchToggled"];

  // 중복 게임 관리
  findDuplicates: IpcMainEventMap["duplicatesFound"];
  deleteGames: IpcMainEventMap["gamesDeleted"];

  // 파일명 관리
  previewRename: IpcMainEventMap["renamePreviewed"];
  executeRename: IpcMainEventMap["renameExecuted"];

  // AI 연동(MCP 서버)
  getMcpStatus: IpcMainEventMap["mcpStatus"];

  // 치트 플러그인 관련
  detectRpgMaker: { isRpgMaker: boolean; version: "mv" | "mz" | null };
  playGameWithCheat: IpcMainEventMap["gamePlayedWithCheat"];

  // 체인지로그 관련
  getChangelog: IpcMainEventMap["changelogResult"];

  // 데이터 폴더 열기
  openDataFolder: IpcMainEventMap["dataFolderOpened"];

  // 대시보드 통계
  getDashboardStats: IpcMainEventMap["dashboardStats"];
  getLibraryStorageSize: IpcMainEventMap["libraryStorageSize"];

  // 디버그 데이터 내보내기
  exportDebugData: IpcMainEventMap["debugDataExported"];

  // 게임 목록 내보내기
  exportGameList: IpcMainEventMap["gameListExported"];
  getGameExportPreview: IpcMainEventMap["exportPreviewLoaded"];

  // 목록 대조
  checkGameList: IpcMainEventMap["gameListChecked"];
  fetchListCheckPreview: IpcMainEventMap["listCheckPreviewFetched"];
  fetchListCheckImage: IpcMainEventMap["listCheckImageFetched"];

  // GitHub 이슈 열기
  openGitHubIssue: IpcMainEventMap["gitHubIssueOpened"];

  // 도움말 조회 이력 관련
  getViewedHelpCards: IpcMainEventMap["viewedHelpCards"];
  markHelpCardsViewed: IpcMainEventMap["helpCardsViewed"];
};

const api = {
  /**
   * Main으로 이벤트 송신 후 응답 대기
   */
  invoke: <K extends keyof IpcRendererEventMap>(
    channel: K,
    ...args: IpcRendererEventMap[K] extends undefined
      ? []
      : [IpcRendererEventMap[K]]
  ): Promise<IpcInvokeReturn[K]> => {
    return ipcRenderer.invoke(channel, ...args) as Promise<IpcInvokeReturn[K]>;
  },

  /**
   * Main에서 오는 이벤트 리스닝
   */
  on: <K extends IpcMainSend>(
    channel: K,
    callback: (
      ...args: IpcMainEventMap[K] extends undefined ? [] : [IpcMainEventMap[K]]
    ) => void,
  ): void => {
    const listener: IpcListener = (_event, ...args) => {
      callback(
        ...(args as IpcMainEventMap[K] extends undefined
          ? []
          : [IpcMainEventMap[K]]),
      );
    };
    rememberListener(channel, callback, listener);
    ipcRenderer.on(channel, listener);
  },

  /**
   * Main에서 오는 일회성 이벤트 리스닝
   */
  once: <K extends IpcMainSend>(
    channel: K,
    callback: (
      ...args: IpcMainEventMap[K] extends undefined ? [] : [IpcMainEventMap[K]]
    ) => void,
  ): void => {
    const listener: IpcListener = (_event, ...args) => {
      // 한 번 실행되면 ipcRenderer에서 빠지므로 기억도 같이 지운다
      forgetListener(channel, callback, listener);
      callback(
        ...(args as IpcMainEventMap[K] extends undefined
          ? []
          : [IpcMainEventMap[K]]),
      );
    };
    rememberListener(channel, callback, listener);
    ipcRenderer.once(channel, listener);
  },

  /**
   * 이벤트 리스너 제거
   *
   * on/once는 콜백을 래퍼로 감싸 등록하므로 기억해 둔 래퍼를 찾아 뗀다.
   */
  removeListener: <K extends IpcMainSend>(
    channel: K,
    callback: (
      ...args: IpcMainEventMap[K] extends undefined ? [] : [IpcMainEventMap[K]]
    ) => void,
  ): void => {
    const listener = takeListener(channel, callback);
    if (listener) {
      ipcRenderer.removeListener(channel, listener);
    }
  },

  /**
   * 모든 리스너 제거
   */
  removeAllListeners: (channel: IpcMainSend): void => {
    ipcRenderer.removeAllListeners(channel);
  },

  /**
   * File 객체에서 파일 경로 가져오기 (드래그 앤 드롭용)
   */
  getPathForFile: (file: File): string => {
    return webUtils.getPathForFile(file);
  },
};

// contextBridge를 통해 Renderer Process에 API 노출
contextBridge.exposeInMainWorld("api", api);

export type ApiType = typeof api;
