/**
 * IPC 이벤트 타입 정의
 *
 * Main Process ↔ Renderer Process 간 통신을 위한 타입 안전성 제공
 */

// StoreSchema 타입 import (순환 참조 방지를 위해 type import 사용)
import type {
  LibraryScanInfo,
  StoreSchema,
  TitleDisplayMode,
} from "./store.js";

// ========== Renderer → Main 이벤트 ==========
export const enum IpcRendererSend {
  // 게임 목록 관련
  RefreshList = "refreshList", // 폴더 재스캔

  // 게임 실행 관련
  PlayGame = "playGame",
  OpenFolder = "openFolder",

  // 치트 플러그인 관련
  DetectRpgMaker = "detectRpgMaker", // RPG Maker 게임 감지
  PlayGameWithCheat = "playGameWithCheat", // 치트 모드로 게임 실행

  // 윈도우 제어
  MinimizeWindow = "minimizeWindow",
  MaximizeWindow = "maximizeWindow",
  CloseWindow = "closeWindow",

  // 다이얼로그
  SelectFolder = "selectFolder",
  SelectFile = "selectFile",
  SelectProgram = "selectProgram", // 프로그램(실행 파일) 선택 다이얼로그

  // 컬렉터 관련
  RunCollector = "runCollector", // 단일 게임 컬렉터 실행
  RunAllCollectors = "runAllCollectors", // 전체 게임 컬렉터 실행
  GetNewCookie = "getNewCookie", // Google 세이프서치 해제 쿠키 획득
  ResolveBotBlock = "resolveBotBlock", // 봇 차단 해결 완료/취소

  // 썸네일 관련
  DownloadThumbnail = "downloadThumbnail", // 썸네일 다운로드
  DeleteThumbnail = "deleteThumbnail", // 썸네일 삭제
  CleanUnusedThumbnails = "cleanUnusedThumbnails", // 사용하지 않는 썸네일 삭제
  GetGameImages = "getGameImages", // 게임 이미지 목록 조회

  // 검색 및 필터링 관련
  SearchGames = "searchGames", // 게임 검색
  GetRandomGame = "getRandomGame", // 랜덤 게임 조회
  ToggleFavorite = "toggleFavorite", // 즐겨찾기 토글
  ToggleHidden = "toggleHidden", // 숨김 토글
  ToggleClear = "toggleClear", // 클리어 토글
  GetAutocompleteSuggestions = "getAutocompleteSuggestions", // 자동완성 제안

  // 게임 상세 정보 관련
  GetGameDetail = "getGameDetail", // 게임 상세 정보 조회
  OpenOriginalSite = "openOriginalSite", // 원본 사이트 열기

  // 메타데이터 수정
  UpdateGameMetadata = "updateGameMetadata", // 메타데이터 수정
  UpdateRating = "updateRating", // 별점 수정

  // 관계 데이터 관리
  AddMaker = "addMaker", // 제작사 추가
  RemoveMaker = "removeMaker", // 제작사 제거
  AddCategory = "addCategory", // 카테고리 추가
  RemoveCategory = "removeCategory", // 카테고리 제거
  AddTag = "addTag", // 태그 추가
  RemoveTag = "removeTag", // 태그 제거

  // 썸네일 관리
  SetThumbnailFromUrl = "setThumbnailFromUrl", // URL에서 썸네일 설정
  SetThumbnailFromFile = "setThumbnailFromFile", // 로컬 파일에서 썸네일 설정
  HideThumbnail = "hideThumbnail", // 썸네일 숨김

  // 실행 파일 관리
  SetExecutablePath = "setExecutablePath", // 실행 파일 경로 직접 지정
  SelectExecutableFile = "selectExecutableFile", // 실행 파일 선택 다이얼로그

  // 실행 제외 목록 관리
  GetExcludedExecutables = "getExcludedExecutables", // 실행 제외 목록 조회
  AddExcludedExecutable = "addExcludedExecutable", // 실행 제외 목록에 추가
  RemoveExcludedExecutable = "removeExcludedExecutable", // 실행 제외 목록에서 제거

  // 라이브러리 경로 관리
  GetLibraryPaths = "getLibraryPaths", // 라이브러리 경로 목록 조회
  AddLibraryPath = "addLibraryPath", // 라이브러리 경로 추가
  RemoveLibraryPath = "removeLibraryPath", // 라이브러리 경로 제거

  // 라이브러리 경로 표시 토글
  ToggleLibraryPathVisibility = "toggleLibraryPathVisibility",
  GetDisabledLibraryPaths = "getDisabledLibraryPaths",

  // 라이브러리 경로 오프라인 토글
  ToggleLibraryPathOffline = "toggleLibraryPathOffline",
  GetOfflineLibraryPaths = "getOfflineLibraryPaths",

  // 번역 관련
  TranslateTitle = "translateTitle", // 단일 게임 제목 번역
  TranslateAllTitles = "translateAllTitles", // 전체 게임 제목 번역
  GetTranslationSettings = "getTranslationSettings", // 번역 설정 조회
  SetTranslationSettings = "setTranslationSettings", // 번역 설정 저장

  // 마지막 갱신 시간 관련
  LastRefreshedSet = "lastRefreshedSet", // 마지막 갱신 시간 저장
  LastRefreshedGet = "lastRefreshedGet", // 마지막 갱신 시간 조회

  // 라이브러리 스캔 기록 관련
  GetLibraryScanHistory = "getLibraryScanHistory", // 라이브러리 스캔 기록 조회
  GetAllLibraryScanHistory = "getAllLibraryScanHistory", // 모든 라이브러리 스캔 기록 조회

  // 통합 설정 관리
  GetAllSettings = "getAllSettings", // 전체 설정 조회
  UpdateSettings = "updateSettings", // 부분 설정 업데이트 (deep merge)

  // 플레이 타임 관련
  GetPlayTime = "getPlayTime", // 게임 플레이 타임 조회
  GetPlaySessions = "getPlaySessions", // 플레이 세션 목록 조회

  // 자동 업데이트 관련
  CheckForUpdate = "checkForUpdate", // 업데이트 확인
  DownloadUpdate = "downloadUpdate", // 업데이트 다운로드
  InstallUpdate = "installUpdate", // 업데이트 설치
  GetAutoUpdateSettings = "getAutoUpdateSettings", // 자동 업데이트 설정 조회
  SetAutoUpdateSettings = "setAutoUpdateSettings", // 자동 업데이트 설정 저장

  // 중복 게임 관리
  FindDuplicates = "findDuplicates", // 중복 게임 그룹 조회
  DeleteGames = "deleteGames", // 게임 삭제 (DB + 파일)

  // 다중 선택 일괄 조작
  BatchToggleGames = "batchToggleGames",

  // 체인지로그 관련
  GetChangelog = "getChangelog", // 체인지로그 조회

  // 썸네일 마이그레이션
  MigrateThumbnails = "migrateThumbnails", // 이전 버전 썸네일 마이그레이션

  // 데이터 폴더 열기
  OpenDataFolder = "openDataFolder", // 데이터 저장 폴더 열기

  // 이미지 일괄 변환
  ConvertImagesToWebp = "convertImagesToWebp", // 기존 이미지 WebP로 일괄 변환

  // 대시보드 통계
  GetDashboardStats = "getDashboardStats",
  GetLibraryStorageSize = "getLibraryStorageSize",

  // 디버그 데이터 내보내기
  ExportDebugData = "exportDebugData",

  // GitHub 이슈 열기
  OpenGitHubIssue = "openGitHubIssue",

  // 도움말 조회 이력 관련
  GetViewedHelpCards = "getViewedHelpCards",
  MarkHelpCardsViewed = "markHelpCardsViewed",
}

// ========== Main → Renderer 이벤트 ==========
export const enum IpcMainSend {
  // 게임 목록 응답
  ListRefreshed = "listRefreshed",

  // 알림 메시지
  Message = "message",

  // 윈도우 상태 변경
  WindowMaximized = "windowMaximized",
  WindowUnmaximized = "windowUnmaximized",

  // 다이얼로그
  SelectFolder = "selectFolder",
  SelectFile = "selectFile",
  SelectProgram = "selectProgram",

  // 컬렉터 관련
  CollectorProgress = "collectorProgress", // { current, total, gameTitle }
  CollectorDone = "collectorDone", // { gamePath, success, error? }
  AllCollectorsDone = "allCollectorsDone", // { total, success, failed }
  BotBlockDetected = "botBlockDetected", // 봇 차단 감지 (CAPTCHA)

  // 썸네일
  ThumbnailDone = "thumbnailDone", // { gamePath, thumbnailPath }
  UnusedThumbnailsCleaned = "unusedThumbnailsCleaned", // { deletedCount, freedSpace }
  GameImagesLoaded = "gameImagesLoaded", // { images: GameImageItem[] }

  // 검색 및 필터링 관련
  SearchedGames = "searchedGames", // 검색 결과
  GameToggled = "gameToggled", // 토글 완료
  AutocompleteSuggestions = "autocompleteSuggestions", // 자동완성 제안

  // 게임 상세 정보 관련
  GameDetail = "gameDetail", // 게임 상세 정보
  GameMetadataUpdated = "gameMetadataUpdated", // 메타데이터 수정 완료
  RatingUpdated = "ratingUpdated", // 별점 수정 완료

  // 관계 데이터 관리
  MakerAdded = "makerAdded", // 제작사 추가 완료
  MakerRemoved = "makerRemoved", // 제작사 제거 완료
  CategoryAdded = "categoryAdded", // 카테고리 추가 완료
  CategoryRemoved = "categoryRemoved", // 카테고리 제거 완료
  TagAdded = "tagAdded", // 태그 추가 완료
  TagRemoved = "tagRemoved", // 태그 제거 완료

  // 썸네일 관리
  ThumbnailSet = "thumbnailSet", // 썸네일 설정 완료
  ThumbnailHidden = "thumbnailHidden", // 썸네일 숨김 완료

  // 번역 관련
  TranslationProgress = "translationProgress", // 번역 진행률
  TranslationDone = "translationDone", // 번역 완료 (단일)
  AllTranslationsDone = "allTranslationsDone", // 전체 번역 완료

  // 마지막 갱신 시간 관련
  LastRefreshedLoaded = "lastRefreshedLoaded", // 마지막 갱신 시간 로드 완료

  // 라이브러리 스캔 기록 관련
  LibraryScanHistory = "libraryScanHistory", // 라이브러리 스캔 기록
  AllLibraryScanHistory = "allLibraryScanHistory", // 모든 라이브러리 스캔 기록

  // 자동 스캔 완료
  AutoScanDone = "autoScanDone", // 자동 스캔 완료 (포커스/시작 시)

  // 통합 설정 관리
  AllSettings = "allSettings", // 전체 설정 반환
  SettingsUpdated = "settingsUpdated", // 설정 업데이트 완료

  // 플레이 타임 관련
  PlayTimeLoaded = "playTimeLoaded", // 플레이 타임 로드 완료
  PlaySessionsLoaded = "playSessionsLoaded", // 플레이 세션 로드 완료
  GameSessionEnded = "gameSessionEnded", // 게임 세션 종료
  CheatInjectionRestored = "cheatInjectionRestored", // 치트 주입 복원 완료

  // 자동 업데이트 관련
  UpdateChecking = "updateChecking", // 업데이트 확인 중
  UpdateAvailable = "updateAvailable", // 업데이트 있음
  UpdateNotAvailable = "updateNotAvailable", // 업데이트 없음
  UpdateDownloadProgress = "updateDownloadProgress", // 다운로드 진행률
  UpdateDownloaded = "updateDownloaded", // 다운로드 완료
  UpdateError = "updateError", // 업데이트 오류

  // 중복 게임 관리
  DuplicatesFound = "duplicatesFound", // 중복 게임 그룹 조회 결과
  GamesDeleted = "gamesDeleted", // 게임 삭제 완료

  // 체인지로그 관련
  ChangelogResult = "changelogResult", // 체인지로그 조회 결과

  // 썸네일 마이그레이션
  ThumbnailsMigrated = "thumbnailsMigrated", // 썸네일 마이그레이션 완료

  // 이미지 일괄 변환
  ImagesConvertedToWebp = "imagesConvertedToWebp", // 기존 이미지 WebP 변환 완료
}

/**
 * IpcMainSend enum 값 타입 (문자열 리터럴 유니온)
 * on/once/removeListener 메서드의 channel 파라미터 타입으로 사용
 *
 * enum 멤버 타입(IpcMainSend.Message)과 리터럴 타입("message")은 TypeScript에서 다르게 처리됨
 * 이 타입을 사용하여 리터럴 타입 안전성 제공
 */
export type IpcMainSendChannel =
  | "listRefreshed"
  | "message"
  | "windowMaximized"
  | "windowUnmaximized"
  | "selectFolder"
  | "selectFile"
  | "selectProgram"
  | "collectorProgress"
  | "collectorDone"
  | "allCollectorsDone"
  | "botBlockDetected"
  | "thumbnailDone"
  | "searchedGames"
  | "gameToggled"
  | "autocompleteSuggestions"
  | "gameDetail"
  | "gameMetadataUpdated"
  | "ratingUpdated"
  | "makerAdded"
  | "makerRemoved"
  | "categoryAdded"
  | "categoryRemoved"
  | "tagAdded"
  | "tagRemoved"
  | "thumbnailSet"
  | "thumbnailHidden"
  | "unusedThumbnailsCleaned"
  | "gameImagesLoaded"
  | "translationProgress"
  | "translationDone"
  | "allTranslationsDone"
  | "lastRefreshedLoaded"
  | "libraryScanHistory"
  | "allLibraryScanHistory"
  | "autoScanDone"
  | "allSettings"
  | "settingsUpdated"
  | "playTimeLoaded"
  | "playSessionsLoaded"
  | "gameSessionEnded"
  | "cheatInjectionRestored"
  | "updateChecking"
  | "updateAvailable"
  | "updateNotAvailable"
  | "updateDownloadProgress"
  | "updateDownloaded"
  | "updateError"
  | "duplicatesFound"
  | "gamesDeleted"
  | "changelogResult"
  | "libraryPathVisibilityToggled"
  | "disabledLibraryPaths"
  | "libraryPathOfflineToggled"
  | "offlineLibraryPaths"
  | "thumbnailsMigrated"
  | "imagesConvertedToWebp"
  | "viewedHelpCards"
  | "helpCardsViewed";

// ========== 이벤트 페이로드 타입 ==========

// 게임 아이템 (Phase 1: 최소 필드만)
export interface GameItem {
  path: string;
  title: string;
  originalTitle: string;
  source: string;
  thumbnail: string | null;
  executablePath: string | null; // 직접 지정한 실행 파일 경로
  isCompressFile: boolean;
  hasExecutable: boolean;
  publishDate: Date | null;
  isFavorite?: boolean;
  isHidden?: boolean;
  isClear?: boolean;
  provider?: string | null;
  externalId?: string | null;
  lastPlayedAt?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null; // 수정일 (썸네일 캐시 무효화용)
  translatedTitle?: string | null; // 번역된 제목
  translationSource?: string | null; // 번역 출처 (ollama, google)
  rating?: number | null; // 별점 (1-5)
  totalPlayTime?: number; // 총 플레이 시간 (초)
  sessionStartAt?: Date | null; // 현재 세션 시작 시간
  fileCreatedAt?: Date | null; // 파일 생성일 (파일 시스템)
  fileModifiedAt?: Date | null; // 파일 수정일 (파일 시스템)
  isOffline?: boolean; // 오프라인 경로의 게임 여부 (드라이브 연결 안 됨)
  makers: string[];
  categories: string[];
  tags: string[];
}

// 게임 상세 정보
export interface GameDetailItem extends GameItem {
  memo: string | null; // 메모
}

// 게임 이미지
export interface GameImageItem {
  path: string;
  sortOrder: number;
}

// 중복 게임 그룹
export interface DuplicateGroup {
  id: string; // 그룹 식별자 (externalId, fingerprint 또는 originalTitle)
  type: "externalId" | "fingerprint" | "originalTitle"; // 중복 기준
  provider?: string | null; // externalId 타입인 경우 제공자
  games: GameItem[]; // 그룹 내 게임 목록
}

// 플레이 세션
export interface PlaySession {
  id: number;
  gamePath: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number;
}

// 검색 쿼리 인터페이스
export interface SearchQuery {
  query?: string;
  filters: {
    showHidden?: boolean;
    showFavorites?: boolean;
    showNotFavorites?: boolean;
    showCleared?: boolean;
    showNotCleared?: boolean;
    showCompressed?: boolean;
    showNotCompressed?: boolean;
    showWithExternalId?: boolean;
    showWithoutExternalId?: boolean;
  };
  sortBy?:
    | "title"
    | "publishDate"
    | "lastPlayedAt"
    | "createdAt"
    | "rating"
    | "playTime"
    | "maker";
  sortOrder?: "asc" | "desc";
  // 페이지네이션 파라미터
  offset?: number;
  limit?: number;
}

// Renderer → Main 페이로드
export interface IpcRendererEventMap {
  refreshList: { sourcePaths: string[] };
  playGame: { path: string };
  detectRpgMaker: { path: string };
  playGameWithCheat: { path: string };
  openFolder: { path: string };
  minimizeWindow: undefined;
  maximizeWindow: undefined;
  closeWindow: undefined;
  selectFolder: undefined;
  selectFile: undefined;
  selectProgram: undefined;

  // 컬렉터 관련
  runCollector: { gamePath: string; force?: boolean };
  runAllCollectors: { force?: boolean };
  getNewCookie: undefined; // 반환값: string | undefined (쿠키 값)
  resolveBotBlock: { resolved: boolean; ignoreMinutes?: number }; // 봇 차단 해결 완료/취소 (ignoreMinutes: 무시 시간)

  // 썸네일 관련
  downloadThumbnail: { gamePath: string; url: string };
  deleteThumbnail: { gamePath: string };
  cleanUnusedThumbnails: undefined;
  getGameImages: { gamePath: string };

  // 검색 및 필터링 관련
  searchGames: { sourcePaths: string[]; searchQuery: SearchQuery };
  getRandomGame: { sourcePaths: string[]; searchQuery: SearchQuery };
  toggleFavorite: { path: string };
  toggleHidden: { path: string };
  toggleClear: { path: string };
  getAutocompleteSuggestions: {
    prefix:
      | ""
      | "tag"
      | "circle"
      | "category"
      | "provider"
      | "id"
      | "태그"
      | "서클"
      | "카테고리"
      | "제공자"
      | "아이디";
    query: string;
  };

  // 게임 상세 정보 관련
  getGameDetail: { path: string };
  openOriginalSite: { path: string };

  // 메타데이터 수정
  updateGameMetadata: {
    path: string;
    metadata: Partial<
      Pick<
        GameItem,
        "title" | "originalTitle" | "translatedTitle" | "publishDate"
      > & { memo: string | null }
    >;
  };
  updateRating: { path: string; rating: number | null };

  // 관계 데이터 관리
  addMaker: { path: string; name: string };
  removeMaker: { path: string; name: string };
  addCategory: { path: string; name: string };
  removeCategory: { path: string; name: string };
  addTag: { path: string; name: string };
  removeTag: { path: string; name: string };

  // 썸네일 관리
  setThumbnailFromUrl: { path: string; url: string };
  setThumbnailFromFile: { path: string; filePath: string };
  hideThumbnail: { path: string };

  // 실행 파일 관리
  setExecutablePath: { path: string; executablePath: string };
  selectExecutableFile: { gamePath: string };

  // 실행 제외 목록 관리
  getExcludedExecutables: undefined;
  addExcludedExecutable: { executable: string };
  removeExcludedExecutable: { executable: string };

  // 라이브러리 경로 관리
  getLibraryPaths: undefined;
  addLibraryPath: { path: string };
  removeLibraryPath: { path: string };

  // 라이브러리 경로 표시 토글
  toggleLibraryPathVisibility: { path: string };
  getDisabledLibraryPaths: undefined;

  // 라이브러리 경로 오프라인 토글
  toggleLibraryPathOffline: { path: string };
  getOfflineLibraryPaths: undefined;

  // 번역 관련
  translateTitle: { path: string; force?: boolean };
  translateAllTitles: { force?: boolean };
  getTranslationSettings: undefined;
  setTranslationSettings: {
    settings: {
      showTranslated: boolean;
      autoTranslate: boolean;
      titleDisplayPriority?: TitleDisplayMode[];
    };
  };

  // 마지막 갱신 시간 관련
  lastRefreshedSet: { timestamp: string };
  lastRefreshedGet: undefined;

  // 라이브러리 스캔 기록 관련
  getLibraryScanHistory: { path: string };
  getAllLibraryScanHistory: undefined;

  // 통합 설정 관리
  getAllSettings: undefined;
  updateSettings: { settings: Partial<StoreSchema> };

  // 플레이 타임 관련
  getPlayTime: { path: string };
  getPlaySessions: { path: string; limit?: number };

  // 자동 업데이트 관련
  checkForUpdate: undefined;
  downloadUpdate: undefined;
  installUpdate: undefined;
  getAutoUpdateSettings: undefined;
  setAutoUpdateSettings: { settings: { checkOnStartup: boolean } };

  // 중복 게임 관리
  findDuplicates: undefined;
  deleteGames: { paths: string[] };

  // 체인지로그 관련
  getChangelog: {
    currentVersion: string;
    mode: "afterVersion" | "recent";
  };

  // 썸네일 마이그레이션
  migrateThumbnails: { sourceFolder: string };

  // 데이터 폴더 열기
  openDataFolder: undefined;

  // 이미지 일괄 변환
  convertImagesToWebp: undefined;

  // 대시보드 통계
  getDashboardStats: undefined;
  getLibraryStorageSize: undefined;

  // 다중 선택 일괄 조작
  batchToggleGames: {
    paths: string[];
    field: "is_favorite" | "is_hidden" | "is_clear";
    value: boolean;
  };

  // 디버그 데이터 내보내기
  exportDebugData: { includeDb: boolean };

  // GitHub 이슈 열기
  openGitHubIssue: undefined;

  // 도움말 조회 이력 관련
  getViewedHelpCards: undefined;
  markHelpCardsViewed: { cardIds: string[] };
}

// Main → Renderer 페이로드
export interface IpcMainEventMap {
  listRefreshed: {
    games: GameItem[];
    addedCount: number;
    deletedCount: number;
  };
  message: { type: "info" | "success" | "error" | "warning"; message: string };
  windowMaximized: undefined;
  windowUnmaximized: undefined;

  // 컬렉터 관련
  collectorProgress: { current: number; total: number; gameTitle: string };
  collectorDone: {
    gamePath: string;
    success: boolean;
    error?: string;
    alreadyCollected?: boolean;
  };
  allCollectorsDone: { total: number; success: number; failed: number };
  botBlockDetected: { gamePath: string; gameTitle: string }; // 봇 차단 감지

  // 썸네일 관련
  thumbnailDone: { gamePath: string; thumbnailPath: string };

  // 검색 및 필터링 관련
  searchedGames: { games: GameItem[]; totalCount: number; hasMore: boolean };
  randomGame: { game: GameItem | null };
  gameToggled: {
    path: string;
    field: "is_favorite" | "is_hidden" | "is_clear";
    value: boolean;
  };
  autocompleteSuggestions: {
    prefix: string;
    query: string;
    suggestions: string[];
  };

  // 다이얼로그
  selectFolder: { filePaths: string[] | undefined };
  selectFile: { filePaths: string[] | undefined };
  selectProgram: { filePaths: string[] | undefined };

  // 게임 상세 정보 관련
  gameDetail: { game: GameDetailItem | null };

  // 원본 사이트 열기
  openOriginalSite: void;

  // 메타데이터 수정
  gameMetadataUpdated: { path: string };
  ratingUpdated: { path: string; rating: number | null };

  // 관계 데이터 관리
  makerAdded: { path: string; name: string };
  makerRemoved: { path: string; name: string };
  categoryAdded: { path: string; name: string };
  categoryRemoved: { path: string; name: string };
  tagAdded: { path: string; name: string };
  tagRemoved: { path: string; name: string };

  // 게임 실행
  gamePlayed: { executablePath: string };
  gamePlayedWithCheat: { executablePath: string };
  cheatInjectionRestored: { path: string; success: boolean };

  // 썸네일 관리
  thumbnailSet: { path: string; thumbnailPath: string };
  thumbnailHidden: { path: string };
  unusedThumbnailsCleaned: { deletedCount: number; freedSpace: number };
  gameImagesLoaded: { images: GameImageItem[] };

  // 실행 파일 관리
  executablePathSet: { path: string; executablePath: string };
  executableFileSelected: { filePaths: string[] | undefined };

  // 실행 제외 목록 관리
  excludedExecutables: { executables: string[] };
  excludedExecutableAdded: { executable: string };
  excludedExecutableRemoved: { executable: string };

  // 라이브러리 경로 관리
  libraryPaths: { paths: string[] };
  libraryPathAdded: { path: string };
  libraryPathRemoved: { path: string; deletedGameCount: number };

  // 라이브러리 경로 표시 토글
  libraryPathVisibilityToggled: { path: string; isDisabled: boolean };
  disabledLibraryPaths: { paths: string[] };

  // 라이브러리 경로 오프라인 토글
  libraryPathOfflineToggled: { path: string; isOffline: boolean };
  offlineLibraryPaths: { paths: string[] };

  // 번역 관련
  translationProgress: { current: number; total: number; gameTitle: string };
  translationDone: { path: string; translatedTitle: string; source: string };
  allTranslationsDone: { total: number; success: number; failed: number };
  translationSettings: {
    settings: {
      showTranslated: boolean;
      autoTranslate: boolean;
      titleDisplayPriority?: TitleDisplayMode[];
    };
  };

  // 마지막 갱신 시간 관련
  lastRefreshedLoaded: { timestamp: string | null };

  // 라이브러리 스캔 기록 관련
  libraryScanHistory: { path: string; history: LibraryScanInfo | null };
  allLibraryScanHistory: { history: Record<string, LibraryScanInfo> };

  // 자동 스캔 완료
  autoScanDone: { addedCount: number };

  // 통합 설정 관리
  allSettings: { settings: StoreSchema };
  settingsUpdated: { settings: StoreSchema };

  // 플레이 타임 관련
  playTimeLoaded: { path: string; totalPlayTime: number };
  playSessionsLoaded: { sessions: PlaySession[] };
  gameSessionEnded: {
    path: string;
    durationSeconds: number;
    totalPlayTime: number;
    wasCheatMode?: boolean;
  };

  // 자동 업데이트 관련
  updateChecking: undefined;
  updateAvailable: {
    version: string;
    releaseDate: string;
    isPortable: boolean;
  };
  updateNotAvailable: undefined;
  updateDownloadProgress: {
    percent: number;
    transferred: number;
    total: number;
  };
  updateDownloaded: { version: string };
  updateError: { error: string };

  // 중복 게임 관리
  duplicatesFound: { groups: DuplicateGroup[] };
  gamesDeleted: { deletedCount: number };

  // 체인지로그 관련
  changelogResult: {
    releases: Array<{
      version: string;
      name: string;
      body: string;
      publishedAt: string;
      htmlUrl: string;
    }>;
  };

  // 썸네일 마이그레이션
  thumbnailsMigrated: {
    successCount: number;
    skipCount: number;
    failCount: number;
  };

  // 데이터 폴더 열기
  dataFolderOpened: { path: string };

  // 이미지 일괄 변환
  imagesConvertedToWebp: {
    total: number;
    converted: number;
    failed: number;
    freedBytes: number;
  };

  // 다중 선택 일괄 조작
  batchToggled: {
    field: "is_favorite" | "is_hidden" | "is_clear";
    updatedCount: number;
  };

  // 대시보드 통계
  dashboardStats: { stats: DashboardStats };
  libraryStorageSize: LibraryStorageInfo;

  // 디버그 데이터 내보내기
  debugDataExported: { path: string } | null;

  // GitHub 이슈 열기
  gitHubIssueOpened: void;

  // 도움말 조회 이력 관련
  viewedHelpCards: { cardIds: string[] };
  helpCardsViewed: { cardIds: string[] };
}

// 대시보드 통계
export interface DashboardStats {
  overview: {
    totalGames: number;
    favoriteCount: number;
    clearedCount: number;
    clearedRate: number; // 0~100
    totalPlayTime: number; // 초
    averageRating: number | null;
    thisWeekPlayTime: number; // 초
    thisMonthPlayTime: number; // 초
  };
  topPlayedGames: Array<{
    path: string;
    title: string;
    thumbnail: string | null;
    totalPlayTime: number;
  }>;
  longestSession: {
    gameTitle: string;
    durationSeconds: number;
    startedAt: string;
  } | null;
  mostNeglectedGames: Array<{
    path: string;
    title: string;
    thumbnail: string | null;
    createdAt: string;
  }>;
  monthlyPlayTime: Array<{
    month: string;
    totalSeconds: number;
    sessionCount: number;
  }>;
  hourlyPattern: Array<{
    hour: number;
    totalSeconds: number;
    sessionCount: number;
  }>;
  weekdayPattern: Array<{
    weekday: number;
    totalSeconds: number;
    sessionCount: number;
  }>;
  ratingDistribution: Array<{
    rating: number;
    count: number;
  }>;
  topMakers: Array<{
    name: string;
    count: number;
  }>;
  categoryDistribution: Array<{
    name: string;
    count: number;
  }>;
  tagDistribution: Array<{
    name: string;
    count: number;
  }>;
  providerDistribution: Array<{
    provider: string;
    count: number;
  }>;
  yearDistribution: Array<{
    year: number;
    count: number;
  }>;
}

export interface LibraryStorageInfo {
  totalSize: number;
  libraries: Array<{
    path: string;
    size: number;
    gameCount: number;
  }>;
}
