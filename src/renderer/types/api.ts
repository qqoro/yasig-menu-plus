/**
 * IPC 통신 타입 정의
 *
 * main/events.ts에서 재정의
 * Renderer Process에서 타입 안전성을 위해 사용
 */

// Main 프로세스의 events.ts 타입 재내보내기
// 상대 경로로 main 프로세스의 타입 import
import type {
  IpcMainEventMap,
  IpcMainSend,
  IpcMainSendChannel,
  IpcRendererEventMap,
  IpcRendererSend,
} from "../../main/events.js";

// StoreSchema 타입 import
import type { LibraryScanInfo, StoreSchema } from "../../main/store.js";

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
  cleanUnusedThumbnails: IpcMainEventMap["unusedThumbnailsCleaned"];
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

  // 체인지로그 관련
  getChangelog: IpcMainEventMap["changelogResult"];
};

/**
 * IPC 통신 API 타입
 * preload.ts에서 노출하는 API와 동일한 타입
 */
export interface ElectronApi {
  /**
   * Main으로 이벤트 송신 후 응답 대기
   * @template K - 이벤트 채널 타입 (IpcRendererSend enum)
   * @param channel - 이벤트 채널
   * @param args - 이벤트 페이로드 (없을 경우 생략 가능)
   * @returns Promise<IpcInvokeReturn[K]>
   */
  invoke: <K extends keyof IpcRendererEventMap>(
    channel: K,
    ...args: IpcRendererEventMap[K] extends undefined
      ? []
      : [IpcRendererEventMap[K]]
  ) => Promise<IpcInvokeReturn[K]>;

  /**
   * Main에서 오는 이벤트 리스닝
   * @param channel - 이벤트 채널 (enum 값 리터럴)
   * @param callback - 이벤트 핸들러
   */
  on: <K extends IpcMainSendChannel>(
    channel: K,
    callback: (
      ...args: IpcMainEventMap[K] extends undefined ? [] : [IpcMainEventMap[K]]
    ) => void,
  ) => void;

  /**
   * Main에서 오는 일회성 이벤트 리스닝
   * @param channel - 이벤트 채널 (enum 값 리터럴)
   * @param callback - 이벤트 핸들러
   */
  once: <K extends IpcMainSendChannel>(
    channel: K,
    callback: (
      ...args: IpcMainEventMap[K] extends undefined ? [] : [IpcMainEventMap[K]]
    ) => void,
  ) => void;

  /**
   * 이벤트 리스너 제거
   * @param channel - 이벤트 채널 (enum 값 리터럴)
   * @param callback - 제거할 이벤트 핸들러
   */
  removeListener: <K extends IpcMainSendChannel>(
    channel: K,
    callback: (
      ...args: IpcMainEventMap[K] extends undefined ? [] : [IpcMainEventMap[K]]
    ) => void,
  ) => void;

  /**
   * 모든 리스너 제거
   * @param channel - 이벤트 채널 (enum 값 리터럴)
   */
  removeAllListeners: (channel: IpcMainSendChannel) => void;
}

// events.ts 타입 재내보내기
export type {
  IpcMainEventMap,
  IpcMainSend,
  IpcRendererEventMap,
  IpcRendererSend,
};

// Store 타입 재내보내기
export type { LibraryScanInfo, StoreSchema };
