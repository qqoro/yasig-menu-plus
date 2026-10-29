/**
 * Vue Query 캐시 키 상수
 * 쿼리 키를 중앙 집중식 관리하여 오타 방지와 캐시 무효화 용이성 확보
 */

import type { Ref } from "vue";
import type { DuplicateSearchOptions, SearchQuery } from "./types";

export const queryKeys = {
  /**
   * 게임 관련 쿼리 키
   */
  games: {
    /**
     * 모든 게임 관련 쿼리의 루트 키
     */
    all: ["games"] as const,

    /**
     * 검색 결과 쿼리 키
     */
    search: (
      searchQueryObj: SearchQuery,
      sourcePaths: string[] | (() => string[]),
    ) => ["games", "search", searchQueryObj, sourcePaths] as const,
  },

  /**
   * 게임 상세 정보 쿼리 키
   */
  gameDetail: (path: string | Ref<string>) => ["gameDetail", path] as const,

  /**
   * 게임 이미지 쿼리 키
   */
  gameImages: (path: string | Ref<string>) => ["gameImages", path] as const,

  /**
   * 게임 상세/이미지 루트 키 (경로를 모를 때 통째로 무효화)
   */
  gameDetailAll: ["gameDetail"] as const,
  gameImagesAll: ["gameImages"] as const,

  /**
   * 실행 제외 목록 쿼리 키
   */
  excludedExecutables: {
    /**
     * 모든 실행 제외 목록 관련 쿼리의 루트 키
     */
    all: ["excludedExecutables"] as const,
  },

  /**
   * 라이브러리 경로 쿼리 키
   */
  libraryPaths: {
    /**
     * 모든 라이브러리 경로 관련 쿼리의 루트 키
     */
    all: ["libraryPaths"] as const,
  },

  /**
   * 비활성화된 라이브러리 경로 쿼리 키
   */
  disabledLibraryPaths: {
    all: ["disabledLibraryPaths"] as const,
  },

  /**
   * 오프라인 라이브러리 경로 쿼리 키
   */
  offlineLibraryPaths: {
    all: ["offlineLibraryPaths"] as const,
  },

  /**
   * 통합 설정 쿼리 키
   */
  settings: {
    /**
     * 모든 설정 관련 쿼리의 루트 키
     */
    all: ["settings"] as const,
  },

  /**
   * 원본 사이트 쿼리 키
   */
  openOriginalSite: {
    all: ["openOriginalSite"] as const,
  },

  /**
   * 마지막 새로고침 시간 쿼리 키
   */
  lastRefreshed: {
    all: ["lastRefreshed"] as const,
  },

  /**
   * 라이브러리 스캔 기록 쿼리 키
   */
  libraryScanHistory: {
    all: ["libraryScanHistory"] as const,
  },

  /**
   * 번역 설정 쿼리 키
   */
  translationSettings: {
    all: ["translationSettings"] as const,
  },

  /**
   * 자동완성 제안 쿼리 키
   */
  autocomplete: {
    all: ["autocomplete"] as const,
    /** 태그 숨기기 설정의 태그 후보 (검색창 자동완성과 데이터 모양이 달라 키 분리) */
    hiddenTagSuggestions: (query: string | Ref<string>) =>
      ["autocomplete", "hiddenTagSuggestions", query] as const,
  },

  /**
   * 랜덤 게임 쿼리 키
   */
  randomGame: {
    all: ["randomGame"] as const,
  },

  /**
   * 테마 설정 쿼리 키
   */
  themeSettings: {
    all: ["themeSettings"] as const,
  },

  /**
   * 플레이 타임 쿼리 키
   */
  playTime: (path: string | Ref<string>) => ["playTime", path] as const,

  /**
   * 플레이 세션 쿼리 키
   */
  playSessions: (path: string | Ref<string>, limit?: number) =>
    ["playSessions", path, limit] as const,

  /**
   * 중복 게임 쿼리 키
   */
  duplicates: {
    all: ["duplicates"] as const,
    search: (options: DuplicateSearchOptions | Ref<DuplicateSearchOptions>) =>
      ["duplicates", options] as const,
  },

  /**
   * 대시보드 통계 쿼리 키
   */
  dashboard: {
    all: ["dashboard"] as const,
    stats: ["dashboard", "stats"] as const,
    storageSize: ["dashboard", "storageSize"] as const,
  },

  /**
   * AI 연동(MCP 서버) 상태 쿼리 키
   */
  mcpStatus: {
    all: ["mcpStatus"] as const,
  },

  /**
   * 체인지로그 쿼리 키
   */
  changelog: (currentVersion: string, mode: "afterVersion" | "recent") =>
    ["changelog", currentVersion, mode] as const,

  /**
   * 도움말 조회 이력 쿼리 키
   */
  helpRedDot: {
    all: ["helpRedDot"] as const,
  },

  /**
   * RPG Maker 치트 관련 쿼리 키
   */
  cheat: {
    /** RPG Maker 게임 감지 */
    detection: (path: string | Ref<string>) =>
      ["cheat", "detection", path] as const,
  },

  /**
   * 파일명 관리 쿼리 키
   */
  rename: {
    all: ["rename"] as const,
    preview: ["rename", "preview"] as const,
  },

  /**
   * 목록 대조 쿼리 키
   */
  listCheck: {
    /** 미보유 작품 미리보기 (대표 이미지 + 샘플 이미지 목록 + 정보) */
    preview: (provider: string, externalId: string) =>
      ["listCheck", "preview", provider, externalId] as const,
    /** 미보유 작품 샘플 이미지 한 장 */
    image: (url: string | Ref<string | null>) =>
      ["listCheck", "image", url] as const,
  },
} as const;
