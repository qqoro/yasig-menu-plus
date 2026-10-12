/**
 * MCP 툴이 기본으로 다루는 라이브러리 경로
 *
 * 렌더러 HomeView와 같은 기준: 등록된 경로 전체에서 비활성(disabled) 경로를 뺀다.
 * 오프라인 경로는 목록에 남는다(검색 핸들러가 존재 검증을 우회해 준다).
 */

import { getDisabledLibraryPaths, getLibraryPaths } from "../store.js";

export function getActiveLibraryPaths(): string[] {
  const disabled = getDisabledLibraryPaths();
  return getLibraryPaths().filter((path) => !disabled.includes(path));
}
