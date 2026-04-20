/**
 * electron-store 설정 관리 모듈
 *
 * 애플리케이션 설정을 JSON 파일로 저장
 * 파일 위치: app.getPath('userData')/settings.json
 */

import { app } from "electron";
import ElectronStore from "electron-store";
import { normalizePath } from "./lib/normalize-path.js";

/**
 * 라이브러리 스캔 정보
 */
export interface LibraryScanInfo {
  lastScannedAt: string; // 마지막 스캔 시간 (ISO 8601 형식)
  lastGameCount: number; // 마지막 스캔 시 게임 수
}

/**
 * 자동 업데이트 설정
 */
export interface AutoUpdateSettings {
  checkOnStartup: boolean; // 앱 시작 시 자동 업데이트 확인
}

/**
 * 제목 표시 우선순위 타입
 * 배열 순서대로 표시할 제목을 결정 (앞쪽이 우선)
 * - original: 원본 (폴더명)
 * - collected: 원문 (정보 수집 제목)
 * - translated: 번역
 */
export type TitleDisplayMode = "original" | "collected" | "translated";

/**
 * 기본 제목 표시 우선순위 (번역 > 원문 > 원본)
 */
export const DEFAULT_TITLE_DISPLAY_PRIORITY: TitleDisplayMode[] = [
  "translated",
  "collected",
  "original",
];

/**
 * 설정 스토어 타입 정의
 */
export interface StoreSchema {
  excludedExecutables: string[];
  googleCookie?: string; // Google NID 쿠키 (세이프서치 해제용)
  googleCollectorIgnoreUntil?: string; // Google 컬렉터 봇 차단 일시 무시 만료 시간 (ISO 8601)
  libraryPaths: string[]; // 라이브러리 경로 목록
  translationSettings: {
    showTranslated: boolean; // 번역 제목 표시 여부 (하위 호환성 유지)
    autoTranslate: boolean; // 자동 번역 여부
    titleDisplayPriority?: TitleDisplayMode[]; // 제목 표시 우선순위
  };
  thumbnailSettings: {
    blurEnabled: boolean; // 썸네일 블러 활성화 여부
  };
  lastRefreshedAt?: string; // 마지막 게임 목록 갱신 시간 (ISO 8601 형식)
  autoScanOnStartup?: boolean; // 앱 시작 시 자동 스캔 여부
  libraryScanHistory?: Record<string, LibraryScanInfo>; // 경로별 스캔 기록
  colorTheme?: string; // 컬러 테마 (예: "default", "catppuccin", "cyberpunk")
  autoUpdateSettings?: AutoUpdateSettings; // 자동 업데이트 설정
  disabledLibraryPaths?: string[]; // 비활성화된 라이브러리 경로 목록
  offlineLibraryPaths?: string[]; // 오프라인 라이브러리 경로 목록 (자동 스캔 제외, 항상 목록에 표시)
  scanDepth?: number; // 재귀 스캔 최대 깊이 (기본값: 5)
  enableNonGameContent?: boolean; // 비게임 콘텐츠 인식 활성화 여부
  enableGoogleCollector?: boolean; // Google 콜렉터 활성화 여부 (기본값: true)
  mediaPlayerSettings?: {
    audioPlayerPath: string | null; // 오디오 플레이어 경로
    videoPlayerPath: string | null; // 비디오 플레이어 경로
  };
  viewedHelpCards?: string[]; // 사용자가 본 도움말 카드 ID 목록
}

/**
 * 전역 스토어 인스턴스 타입 (get, set, delete 메서드 추가)
 */
interface StoreInstance {
  get<K extends keyof StoreSchema>(key: K): StoreSchema[K];
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void;
  delete<K extends keyof StoreSchema>(key: K): void;
}

/**
 * 기본 설정 값
 */
const DEFAULTS: StoreSchema = {
  excludedExecutables: [
    "notification_helper.exe",
    "unitycrashhandler64.exe",
    "dowser.exe",
  ],
  libraryPaths: [],
  translationSettings: {
    showTranslated: true,
    autoTranslate: false,
    titleDisplayPriority: DEFAULT_TITLE_DISPLAY_PRIORITY,
  },
  thumbnailSettings: {
    blurEnabled: false,
  },
  autoScanOnStartup: false,
  libraryScanHistory: {},
  colorTheme: "default",
  autoUpdateSettings: {
    checkOnStartup: true,
  },
  disabledLibraryPaths: [],
  offlineLibraryPaths: [],
  scanDepth: 5,
  enableNonGameContent: false,
  enableGoogleCollector: true, // 기본적으로 Google 콜렉터 활성화
  mediaPlayerSettings: {
    audioPlayerPath: null,
    videoPlayerPath: null,
  },
  viewedHelpCards: [],
};

/**
 * 전역 스토어 인스턴스
 */
let storeInstance: StoreInstance | null = null;

/**
 * 스토어 인스턴스 가져오기
 */
function getStore(): StoreInstance {
  if (!storeInstance) {
    const store = new ElectronStore<StoreSchema>({
      defaults: DEFAULTS,
      name: "settings",
      cwd: app.getPath("userData"),
    }) as unknown as StoreInstance;
    storeInstance = store;

    // 기존 viewedHelpSections → viewedHelpCards 마이그레이션
    migrateViewedHelpSections(store);
  }
  return storeInstance;
}

/**
 * 기존 섹션 기반 조회 이력을 카드 기반으로 마이그레이션
 * 이미 viewedHelpCards가 있으면 건너뜀
 */
function migrateViewedHelpSections(store: StoreInstance): void {
  const viewedCards = store.get("viewedHelpCards");
  if (viewedCards && viewedCards.length > 0) return;

  const viewedSections = (store as any).get("viewedHelpSections") as
    | string[]
    | undefined;
  if (!viewedSections || viewedSections.length === 0) return;

  // 섹션 ID → 카드 ID 매핑 (레지스트리와 동일)
  const sectionToCards: Record<string, string[]> = {
    "getting-started": [
      "getting-started--library-path",
      "getting-started--first-scan",
      "getting-started--folder-structure",
      "getting-started--auto-collect",
    ],
    "game-management": [
      "game-management--launch",
      "game-management--status-toggle",
      "game-management--multi-select",
      "game-management--sort",
    ],
    collectors: [
      "collectors--auto-rules",
      "collectors--manual-refresh",
      "collectors--collect-results",
    ],
    "search-filter": [
      "search-filter--basic-search",
      "search-filter--special-query",
      "search-filter--autocomplete",
      "search-filter--exclude-search",
      "search-filter--filter-panel",
    ],
    "image-carousel": [
      "image-carousel--open",
      "image-carousel--navigation",
      "image-carousel--add-delete",
    ],
    "game-detail": [
      "game-detail--open",
      "game-detail--metadata-edit",
      "game-detail--tags",
      "game-detail--rating",
      "game-detail--thumbnail",
    ],
    "special-features": [
      "special-features--rpg-cheat",
      "special-features--offline-library",
      "special-features--random-select",
      "special-features--zoom-level",
      "special-features--play-time",
    ],
    dashboard: ["dashboard--overview", "dashboard--duplicates"],
    settings: [
      "settings--theme",
      "settings--translation",
      "settings--excluded-exe",
      "settings--auto-update",
      "settings--debug-export",
    ],
    shortcuts: ["shortcuts--keyboard", "shortcuts--mouse"],
  };

  const cardIds = viewedSections.flatMap(
    (sectionId) => sectionToCards[sectionId] || [],
  );
  store.set("viewedHelpCards", cardIds);
  (store as any).delete("viewedHelpSections");

  console.log(
    `[설정] 도움말 조회 이력 마이그레이션: ${viewedSections.length}개 섹션 → ${cardIds.length}개 카드`,
  );
}

/**
 * 실행 제외 목록 가져오기
 */
export function getExcludedExecutables(): string[] {
  const store = getStore();
  return (store.get("excludedExecutables") as string[]) || [];
}

/**
 * 실행 제외 목록 설정
 */
export function setExcludedExecutables(executables: string[]): void {
  const store = getStore();
  store.set("excludedExecutables", executables);
}

/**
 * 실행 제외 목록에 추가
 */
export function addExcludedExecutable(executable: string): void {
  const current = getExcludedExecutables();
  if (!current.some((e) => e.toLowerCase() === executable.toLowerCase())) {
    setExcludedExecutables([...current, executable]);
  }
}

/**
 * 실행 제외 목록에서 제거
 */
export function removeExcludedExecutable(executable: string): void {
  const current = getExcludedExecutables();
  const filtered = current.filter(
    (e) => e.toLowerCase() !== executable.toLowerCase(),
  );
  setExcludedExecutables(filtered);
}

/**
 * Google 쿠키 가져오기
 */
export function getGoogleCookie(): string | undefined {
  const store = getStore();
  return store.get("googleCookie");
}

/**
 * Google 쿠키 설정
 */
export function setGoogleCookie(cookie: string): void {
  const store = getStore();
  store.set("googleCookie", cookie);
}

/**
 * Google 컬렉터 무시 만료 시간 가져오기
 */
export function getGoogleCollectorIgnoreUntil(): string | undefined {
  const store = getStore();
  return store.get("googleCollectorIgnoreUntil");
}

/**
 * Google 컬렉터 무시 만료 시간 설정
 */
export function setGoogleCollectorIgnoreUntil(
  timestamp: string | undefined,
): void {
  const store = getStore();
  if (timestamp === undefined) {
    store.delete("googleCollectorIgnoreUntil");
  } else {
    store.set("googleCollectorIgnoreUntil", timestamp);
  }
}

/**
 * 라이브러리 경로 목록 가져오기
 */
export function getLibraryPaths(): string[] {
  const store = getStore();
  return (store.get("libraryPaths") as string[]) || [];
}

/**
 * 라이브러리 경로 목록 설정
 */
export function setLibraryPaths(paths: string[]): void {
  const store = getStore();
  store.set("libraryPaths", paths);
}

/**
 * 라이브러리 경로 추가
 * 호출부에서 이미 정규화된 경로를 전달해야 함
 */
export function addLibraryPath(normalizedPath: string): void {
  const current = getLibraryPaths();
  const isDuplicate = current.some(
    (p) => p.toLowerCase() === normalizedPath.toLowerCase(),
  );
  if (!isDuplicate) {
    setLibraryPaths([...current, normalizedPath]);
  }
}

/**
 * 라이브러리 경로 제거
 * 호출부에서 이미 정규화된 경로를 전달해야 함
 */
export function removeLibraryPath(normalizedPath: string): void {
  const current = getLibraryPaths();
  const filtered = current.filter(
    (p) => p.toLowerCase() !== normalizedPath.toLowerCase(),
  );
  setLibraryPaths(filtered);
}

/**
 * 번역 설정 가져오기
 */
export function getTranslationSettings(): StoreSchema["translationSettings"] {
  const store = getStore();
  const settings = store.get("translationSettings");

  // settings가 없거나 빈 객체이면 기본값 반환
  if (!settings || Object.keys(settings).length === 0) {
    return {
      showTranslated: true,
      autoTranslate: false,
      titleDisplayPriority: DEFAULT_TITLE_DISPLAY_PRIORITY,
    };
  }

  // titleDisplayPriority가 없으면 기본값 추가
  if (!settings.titleDisplayPriority) {
    settings.titleDisplayPriority = DEFAULT_TITLE_DISPLAY_PRIORITY;
  }

  return settings;
}

/**
 * 번역 설정 업데이트
 */
export function setTranslationSettings(
  settings: Partial<StoreSchema["translationSettings"]>,
): void {
  const store = getStore();
  const current = getTranslationSettings();
  const newSettings = { ...current, ...settings };
  store.set("translationSettings", newSettings);
}

/**
 * 마지막 갱신 시간 가져오기
 */
export function getLastRefreshedAt(): string | undefined {
  const store = getStore();
  return store.get("lastRefreshedAt");
}

/**
 * 마지막 갱신 시간 설정
 */
export function setLastRefreshedAt(timestamp: string): void {
  const store = getStore();
  store.set("lastRefreshedAt", timestamp);
}

/**
 * 전체 설정 스키마 가져오기
 */
export function getAllSettings(): StoreSchema {
  const store = getStore();
  return {
    excludedExecutables: store.get("excludedExecutables"),
    googleCookie: store.get("googleCookie"),
    googleCollectorIgnoreUntil: store.get("googleCollectorIgnoreUntil"),
    libraryPaths: store.get("libraryPaths"),
    translationSettings: store.get("translationSettings"),
    thumbnailSettings: store.get("thumbnailSettings"),
    lastRefreshedAt: store.get("lastRefreshedAt"),
    autoScanOnStartup: store.get("autoScanOnStartup"),
    libraryScanHistory: store.get("libraryScanHistory"),
    colorTheme: store.get("colorTheme"),
    autoUpdateSettings: store.get("autoUpdateSettings"),
    disabledLibraryPaths: store.get("disabledLibraryPaths"),
    offlineLibraryPaths: store.get("offlineLibraryPaths"),
    scanDepth: store.get("scanDepth"),
    enableNonGameContent: store.get("enableNonGameContent"),
    enableGoogleCollector: store.get("enableGoogleCollector"),
    mediaPlayerSettings: store.get("mediaPlayerSettings"),
    viewedHelpCards: store.get("viewedHelpCards"),
  };
}

/**
 * Deep merge 유틸리티 함수
 */
function deepMerge<T extends Record<string, any>>(
  target: T,
  source: Partial<T>,
): T {
  const result = { ...target };
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = result[key];
      if (
        sourceValue &&
        typeof sourceValue === "object" &&
        !Array.isArray(sourceValue) &&
        targetValue &&
        typeof targetValue === "object" &&
        !Array.isArray(targetValue)
      ) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else if (sourceValue !== undefined) {
        (result as any)[key] = sourceValue;
      }
    }
  }
  return result;
}

/**
 * 부분 업데이트 (deep merge)
 */
export function updateSettings(settings: Partial<StoreSchema>): void {
  const store = getStore();
  const current = getAllSettings();
  const merged = deepMerge(current, settings);

  // 개별 키별로 저장 (electron-store는 개별 키만 업데이트 가능)
  for (const key of Object.keys(settings) as Array<keyof StoreSchema>) {
    store.set(key, merged[key]);
  }
}

/**
 * 앱 시작 시 자동 스캔 여부 가져오기
 */
export function getAutoScanOnStartup(): boolean {
  const store = getStore();
  return store.get("autoScanOnStartup") ?? false;
}

/**
 * 앱 시작 시 자동 스캔 여부 설정
 */
export function setAutoScanOnStartup(value: boolean): void {
  const store = getStore();
  store.set("autoScanOnStartup", value);
}

/**
 * 라이브러리 스캔 기록 조회
 */
export function getLibraryScanHistory(
  inputPath: string,
): LibraryScanInfo | undefined {
  const store = getStore();
  const normalized = normalizePath(inputPath);
  const history = store.get("libraryScanHistory") || {};
  return history[normalized];
}

/**
 * 라이브러리 스캔 기록 업데이트
 */
export function updateLibraryScanHistory(
  inputPath: string,
  gameCount: number,
): void {
  const store = getStore();
  const normalized = normalizePath(inputPath);
  const history = store.get("libraryScanHistory") || {};
  history[normalized] = {
    lastScannedAt: new Date().toISOString(),
    lastGameCount: gameCount,
  };
  store.set("libraryScanHistory", history);
}

/**
 * 모든 라이브러리 스캔 기록 조회
 */
export function getAllLibraryScanHistory(): Record<string, LibraryScanInfo> {
  const store = getStore();
  return store.get("libraryScanHistory") || {};
}

/**
 * 모든 라이브러리 스캔 기록 일괄 설정
 */
export function setAllLibraryScanHistory(
  history: Record<string, LibraryScanInfo>,
): void {
  const store = getStore();
  store.set("libraryScanHistory", history);
}

/**
 * 라이브러리 스캔 기록 삭제
 */
export function removeLibraryScanHistory(inputPath: string): void {
  const store = getStore();
  const normalized = normalizePath(inputPath);
  const history = store.get("libraryScanHistory") || {};
  delete history[normalized];
  store.set("libraryScanHistory", history);
}

/**
 * 자동 업데이트 설정 가져오기
 */
export function getAutoUpdateSettings(): AutoUpdateSettings {
  const store = getStore();
  const settings = store.get("autoUpdateSettings");
  if (!settings) {
    return { checkOnStartup: true };
  }
  return settings;
}

/**
 * 자동 업데이트 설정 업데이트
 */
export function setAutoUpdateSettings(
  settings: Partial<AutoUpdateSettings>,
): void {
  const store = getStore();
  const current = getAutoUpdateSettings();
  const newSettings = { ...current, ...settings };
  store.set("autoUpdateSettings", newSettings);
}

/**
 * 비활성화된 라이브러리 경로 목록 가져오기
 */
export function getDisabledLibraryPaths(): string[] {
  const store = getStore();
  return store.get("disabledLibraryPaths") || [];
}

/**
 * 비활성화된 라이브러리 경로 목록 설정
 */
export function setDisabledLibraryPaths(paths: string[]): void {
  const store = getStore();
  store.set("disabledLibraryPaths", paths);
}

/**
 * 오프라인 라이브러리 경로 목록 가져오기
 */
export function getOfflineLibraryPaths(): string[] {
  const store = getStore();
  return store.get("offlineLibraryPaths") || [];
}

/**
 * 오프라인 라이브러리 경로 목록 설정
 */
export function setOfflineLibraryPaths(paths: string[]): void {
  const store = getStore();
  store.set("offlineLibraryPaths", paths);
}

/**
 * 라이브러리 경로 오프라인 토글
 * @returns 토글 후 오프라인 여부 (true=오프라인)
 */
export function toggleLibraryPathOffline(inputPath: string): boolean {
  const normalized = normalizePath(inputPath);
  const current = getOfflineLibraryPaths();
  const index = current.findIndex(
    (p) => normalizePath(p).toLowerCase() === normalized.toLowerCase(),
  );
  if (index === -1) {
    setOfflineLibraryPaths([...current, normalized]);
    return true; // 오프라인 설정됨
  } else {
    const filtered = current.filter((_, i) => i !== index);
    setOfflineLibraryPaths(filtered);
    return false; // 온라인 복원됨
  }
}

/**
 * 스캔 깊이 가져오기
 */
export function getScanDepth(): number {
  const store = getStore();
  return store.get("scanDepth") ?? 5;
}

/**
 * 비게임 콘텐츠 인식 활성화 여부 가져오기
 */
export function getEnableNonGameContent(): boolean {
  const store = getStore();
  return store.get("enableNonGameContent") ?? DEFAULTS.enableNonGameContent!;
}

/**
 * 비게임 콘텐츠 인식 활성화 여부 설정
 */
export function setEnableNonGameContent(enabled: boolean): void {
  const store = getStore();
  store.set("enableNonGameContent", enabled);
}

/**
 * 미디어 플레이어 설정 가져오기
 */
export function getMediaPlayerSettings(): NonNullable<
  StoreSchema["mediaPlayerSettings"]
> {
  const store = getStore();
  return store.get("mediaPlayerSettings") ?? DEFAULTS.mediaPlayerSettings!;
}

/**
 * 미디어 플레이어 설정 저장
 */
export function setMediaPlayerSettings(
  settings: NonNullable<StoreSchema["mediaPlayerSettings"]>,
): void {
  const store = getStore();
  store.set("mediaPlayerSettings", settings);
}

/**
 * Google 콜렉터 활성화 여부 가져오기
 */
export function getEnableGoogleCollector(): boolean {
  const store = getStore();
  return store.get("enableGoogleCollector") ?? DEFAULTS.enableGoogleCollector!;
}

/**
 * Google 콜렉터 활성화 여부 설정
 */
export function setEnableGoogleCollector(enabled: boolean): void {
  const store = getStore();
  store.set("enableGoogleCollector", enabled);
}

/**
 * 라이브러리 경로 비활성화 토글
 */
export function toggleLibraryPathDisabled(inputPath: string): boolean {
  const normalized = normalizePath(inputPath);
  const current = getDisabledLibraryPaths();
  const index = current.findIndex(
    (p) => normalizePath(p).toLowerCase() === normalized.toLowerCase(),
  );
  if (index === -1) {
    setDisabledLibraryPaths([...current, normalized]);
    return true; // 비활성화됨
  } else {
    const filtered = current.filter((_, i) => i !== index);
    setDisabledLibraryPaths(filtered);
    return false; // 활성화됨
  }
}

/**
 * 정규화 + 중복 제거 헬퍼
 */
function deduplicateNormalized(paths: string[]): string[] {
  const seen = new Map<string, string>();
  for (const p of paths) {
    const normalized = normalizePath(p);
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }
  return [...seen.values()];
}

const LIBRARY_PATHS_NORMALIZED_KEY = "libraryPathsNormalizedAt";

/**
 * 라이브러리 경로 정규화 실행 (앱 시작 시 1회만 실행)
 * - libraryPaths 정규화
 * - disabledLibraryPaths 정규화
 * - libraryScanHistory 키 정규화
 */
export function runLibraryPathsNormalization(): void {
  const store = getStore();

  // 이미 실행했으면 스킵
  if (store.get(LIBRARY_PATHS_NORMALIZED_KEY as any)) {
    return;
  }

  // libraryPaths 정규화
  const paths = store.get("libraryPaths") || [];
  store.set("libraryPaths", deduplicateNormalized(paths));

  // disabledLibraryPaths 정규화
  const disabled = store.get("disabledLibraryPaths") || [];
  store.set("disabledLibraryPaths", deduplicateNormalized(disabled));

  // offlineLibraryPaths 정규화
  const offline = store.get("offlineLibraryPaths") || [];
  store.set("offlineLibraryPaths", deduplicateNormalized(offline));

  // libraryScanHistory 키 정규화
  const history = store.get("libraryScanHistory") || {};
  const newHistory: Record<string, LibraryScanInfo> = {};
  for (const [key, value] of Object.entries(history)) {
    const normalizedKey = normalizePath(key);
    // 중복 키가 생기면 최신 스캔 기록 유지
    if (
      !newHistory[normalizedKey] ||
      (value as LibraryScanInfo).lastScannedAt >
        newHistory[normalizedKey].lastScannedAt
    ) {
      newHistory[normalizedKey] = value as LibraryScanInfo;
    }
  }
  store.set("libraryScanHistory", newHistory);

  // 실행 완료 표시
  (store as any).set(LIBRARY_PATHS_NORMALIZED_KEY, new Date().toISOString());

  console.log(
    `[설정] 라이브러리 경로 정규화 완료: libraryPaths ${paths.length}개, disabledPaths ${disabled.length}개, scanHistory ${Object.keys(history).length}개`,
  );
}

/**
 * 본 도움말 카드 ID 목록 조회
 */
export function getViewedHelpCards(): string[] {
  const store = getStore();
  return store.get("viewedHelpCards") || [];
}

/**
 * 도움말 카드 일괄 읽음 표시
 */
export function markHelpCardsViewed(cardIds: string[]): void {
  const store = getStore();
  const viewed = getViewedHelpCards();
  const newViewed = [...new Set([...viewed, ...cardIds])];
  store.set("viewedHelpCards", newViewed);
}
