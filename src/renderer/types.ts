/**
 * 렌더러 공용 타입 정의
 */

// Main 프로세스의 타입 재내보내기
export type {
  LibraryScanInfo,
  StoreSchema,
  TitleDisplayMode,
  AutoUpdateSettings,
} from "../main/store.js";

export interface GameItem {
  path: string;
  title: string;
  originalTitle: string;
  source: string;
  thumbnail: string | null;
  isCompressFile: boolean;
  hasExecutable?: boolean;
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
  updatedAt?: Date | null; // 수정일 (썸네일 캐시 무효화용)
  executablePath?: string | null;
  translatedTitle?: string | null; // 번역된 제목
  translationSource?: string | null; // 번역 출처 (ollama, google)
  rating?: number | null; // 별점 (1-5)
  totalPlayTime?: number; // 총 플레이 시간 (초)
  fileCreatedAt?: Date | null; // 파일 생성일 (파일 시스템)
  fileModifiedAt?: Date | null; // 파일 수정일 (파일 시스템)
  isOffline?: boolean; // 오프라인 경로의 게임 여부 (드라이브 연결 안 됨)
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

/**
 * 중복 게임 그룹
 */
export interface DuplicateGroup {
  id: string; // 그룹 식별자 (externalId, fingerprint 또는 originalTitle)
  type: "externalId" | "fingerprint" | "originalTitle"; // 중복 기준
  provider?: string | null; // externalId 타입인 경우 제공자
  games: GameItem[]; // 그룹 내 게임 목록
}
