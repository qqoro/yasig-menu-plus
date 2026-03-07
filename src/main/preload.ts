/**
 * Preload 스크립트
 *
 * Main Process와 Renderer Process 간의 안전한 통신 제공
 * Electron 보안 베스트 프랙티스: contextIsolation 활성화, preload 스크립트 사용
 */

import { contextBridge, ipcRenderer } from "electron";
import type {
  IpcMainEventMap,
  IpcMainSend,
  IpcRendererEventMap,
} from "./events.js";

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
  loadList: IpcMainEventMap["loadedList"];
  refreshList: IpcMainEventMap["listRefreshed"];
  playGame: IpcMainEventMap["gamePlayed"];
  openFolder: void;
  minimizeWindow: void;
  maximizeWindow: void;
  closeWindow: void;
  selectFolder: IpcMainEventMap["selectFolder"];
  selectFile: IpcMainEventMap["selectFile"];
  runCollector: IpcMainEventMap["collectorDone"];
  runAllCollectors: IpcMainEventMap["allCollectorsDone"];
  getNewCookie: string | undefined;
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
  getPlayTime: IpcMainEventMap["playTimeLoaded"];
  getPlaySessions: IpcMainEventMap["playSessionsLoaded"];

  // 자동 업데이트 관련
  checkForUpdate: { isPortable: boolean };
  downloadUpdate: void;
  installUpdate: void;
  getAutoUpdateSettings: { settings: { checkOnStartup: boolean } };
  setAutoUpdateSettings: { settings: { checkOnStartup: boolean } };

  // 중복 게임 관리
  findDuplicates: IpcMainEventMap["duplicatesFound"];
  deleteGames: IpcMainEventMap["gamesDeleted"];
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
    const listener = (
      _event: Electron.IpcRendererEvent,
      ...args: unknown[]
    ) => {
      callback(
        ...(args as IpcMainEventMap[K] extends undefined
          ? []
          : [IpcMainEventMap[K]]),
      );
    };
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
    const listener = (
      _event: Electron.IpcRendererEvent,
      ...args: unknown[]
    ) => {
      callback(
        ...(args as IpcMainEventMap[K] extends undefined
          ? []
          : [IpcMainEventMap[K]]),
      );
    };
    ipcRenderer.once(channel, listener);
  },

  /**
   * 이벤트 리스너 제거
   */
  removeListener: <K extends IpcMainSend>(
    channel: K,
    callback: (
      ...args: IpcMainEventMap[K] extends undefined ? [] : [IpcMainEventMap[K]]
    ) => void,
  ): void => {
    ipcRenderer.removeListener(
      channel,
      callback as (...args: unknown[]) => void,
    );
  },

  /**
   * 모든 리스너 제거
   */
  removeAllListeners: (channel: IpcMainSend): void => {
    ipcRenderer.removeAllListeners(channel);
  },
};

// contextBridge를 통해 Renderer Process에 API 노출
contextBridge.exposeInMainWorld("api", api);

export type ApiType = typeof api;
