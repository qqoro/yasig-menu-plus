/**
 * 렌더러 공용 타입 정의
 */

/**
 * 라이브러리 스캔 정보
 */
export interface LibraryScanInfo {
  lastScannedAt: string;
  lastGameCount: number;
}

/**
 * 통합 설정 스키마 (electron-store)
 */
export interface StoreSchema {
  excludedExecutables: string[];
  googleCookie?: string;
  libraryPaths: string[];
  translationSettings: {
    showTranslated: boolean;
    autoTranslate: boolean;
  };
  thumbnailSettings: {
    blurEnabled: boolean;
  };
  lastRefreshedAt?: string;
  autoScanOnStartup?: boolean;
  libraryScanHistory?: Record<string, LibraryScanInfo>;
}

export interface GameItem {
  path: string;
  title: string;
  originalTitle: string;
  source: string;
  thumbnail: string | null;
  isCompressFile: boolean;
  publishDate: Date | null;
  makers: string[];
  categories: string[];
  tags: string[];
  isFavorite?: boolean;
  isHidden?: boolean;
  isClear?: boolean;
  provider?: string | null;
  externalId?: string | null;
  lastPlayedAt?: Date | null;
  createdAt?: Date | null;
  executablePath?: string | null;
  translatedTitle?: string | null; // 번역된 제목
  translationSource?: string | null; // 번역 출처 (ollama, google)
  rating?: number | null; // 별점 (1-5)
}

/**
 * 게임 상세 정보 (메모 포함)
 */
export interface GameDetailItem extends GameItem {
  memo: string | null;
}

/**
 * 게임 이미지
 */
export interface GameImageItem {
  path: string;
  sortOrder: number;
}

/**
 * 플레이 세션
 */
export interface PlaySession {
  id: number;
  gamePath: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number;
}

/**
 * 검색 쿼리 인터페이스
 */
export interface SearchQuery {
  query?: string;
  filters: {
    showHidden?: boolean;
    showFavorites?: boolean;
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
    | "playTime";
  sortOrder?: "asc" | "desc";
  // 페이지네이션 파라미터
  offset?: number;
  limit?: number;
}
