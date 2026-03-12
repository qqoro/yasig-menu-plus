/**
 * 게임 목록 및 실행 핸들러 — 배럴 re-export
 *
 * 분리된 모듈:
 * - home-utils.ts: 공통 유틸리티 (관계 데이터 조회, 정렬 구문, GameItem 변환)
 * - home-scan.ts: 폴더 스캔 및 목록 새로고침
 * - home-search.ts: 검색, 필터링, 랜덤, 자동완성
 * - home-game-control.ts: 게임 실행, 토글, 실행 제외 목록, 원본 사이트
 * - home-library.ts: 라이브러리 경로 관리, 스캔 기록, 자동 스캔
 * - home-playtime.ts: 플레이 타임 조회
 */

// 공통 유틸리티
export {
  buildGameItems,
  buildTitleOrderParts,
  loadRelationsAndGroup,
} from "./home-utils.js";

// 폴더 스캔 및 목록 새로고침
export {
  findExecutables,
  openFolderHandler,
  refreshListHandler,
  scanFolder,
  selectBestExecutable,
} from "./home-scan.js";

// 검색, 필터링, 랜덤, 자동완성
export {
  getAutocompleteSuggestionsHandler,
  getRandomGameHandler,
  parseSearchQuery,
  searchGamesHandler,
} from "./home-search.js";

// 게임 실행, 토글, 실행 제외 목록, 원본 사이트
export {
  addExcludedExecutableHandler,
  batchToggleGamesHandler,
  getExcludedExecutablesHandler,
  openOriginalSiteHandler,
  playGameHandler,
  removeExcludedExecutableHandler,
  setExecutablePathHandler,
  toggleGameHandler,
} from "./home-game-control.js";

// 라이브러리 경로 관리, 스캔 기록, 자동 스캔
export {
  addLibraryPathHandler,
  autoScanLibraries,
  getAllLibraryScanHistoryHandler,
  getLastRefreshedHandler,
  getLibraryPathsHandler,
  getLibraryScanHistoryHandler,
  removeLibraryPathHandler,
  setLastRefreshedHandler,
} from "./home-library.js";

// 플레이 타임
export { getPlaySessionsHandler, getPlayTimeHandler } from "./home-playtime.js";
