/**
 * electron-store 설정 관리 모듈
 *
 * 애플리케이션 설정을 JSON 파일로 저장
 * 파일 위치: app.getPath('userData')/settings.json
 */

import { app } from "electron";
import ElectronStore from "electron-store";

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
}

/**
 * 전역 스토어 인스턴스 타입 (get, set 메서드 추가)
 */
interface StoreInstance {
  get<K extends keyof StoreSchema>(key: K): StoreSchema[K];
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void;
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
  }
  return storeInstance;
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
 */
export function addLibraryPath(path: string): void {
  const current = getLibraryPaths();
  if (!current.includes(path)) {
    setLibraryPaths([...current, path]);
  }
}

/**
 * 라이브러리 경로 제거
 */
export function removeLibraryPath(path: string): void {
  const current = getLibraryPaths();
  const filtered = current.filter((p) => p !== path);
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
    libraryPaths: store.get("libraryPaths"),
    translationSettings: store.get("translationSettings"),
    thumbnailSettings: store.get("thumbnailSettings"),
    lastRefreshedAt: store.get("lastRefreshedAt"),
    autoScanOnStartup: store.get("autoScanOnStartup"),
    libraryScanHistory: store.get("libraryScanHistory"),
    colorTheme: store.get("colorTheme"),
    autoUpdateSettings: store.get("autoUpdateSettings"),
    disabledLibraryPaths: store.get("disabledLibraryPaths"),
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
  path: string,
): LibraryScanInfo | undefined {
  const store = getStore();
  const history = store.get("libraryScanHistory") || {};
  return history[path];
}

/**
 * 라이브러리 스캔 기록 업데이트
 */
export function updateLibraryScanHistory(
  path: string,
  gameCount: number,
): void {
  const store = getStore();
  const history = store.get("libraryScanHistory") || {};
  history[path] = {
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
 * 라이브러리 경로 비활성화 토글
 */
export function toggleLibraryPathDisabled(path: string): boolean {
  const current = getDisabledLibraryPaths();
  const index = current.indexOf(path);
  if (index === -1) {
    setDisabledLibraryPaths([...current, path]);
    return true; // 비활성화됨
  } else {
    const filtered = current.filter((p) => p !== path);
    setDisabledLibraryPaths(filtered);
    return false; // 활성화됨
  }
}
