import type { IpcMainInvokeEvent } from "electron";
import { normalizePath } from "../lib/normalize-path.js";
import {
  getDisabledLibraryPaths,
  setAllLibraryPathsDisabled,
  toggleLibraryPathDisabled,
} from "../store.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";

/**
 * 비활성화된 라이브러리 경로 목록 조회
 */
export async function getDisabledLibraryPathsHandler(
  _event: IpcMainInvokeEvent,
): Promise<{ paths: string[] }> {
  const paths = getDisabledLibraryPaths();
  return { paths };
}

/**
 * 라이브러리 경로 표시 토글
 */
export async function toggleLibraryPathVisibilityHandler(
  _event: IpcMainInvokeEvent,
  { path }: { path: string },
): Promise<{ path: string; isDisabled: boolean }> {
  const normalizedPath = normalizePath(path);
  const isDisabled = toggleLibraryPathDisabled(normalizedPath);
  return { path: normalizedPath, isDisabled };
}

/**
 * 모든 라이브러리 경로 일괄 활성화/비활성화
 * - enabled === true  → 모든 라이브러리 활성화
 * - enabled === false → 모든 라이브러리 비활성화
 */
export async function setAllLibraryPathsDisabledHandler(
  _event: IpcMainInvokeEvent,
  { enabled }: IpcRendererEventMap["setAllLibraryPathsDisabled"],
): Promise<IpcMainEventMap["allLibraryPathsDisabledSet"]> {
  const disabledPaths = setAllLibraryPathsDisabled(enabled);
  return { enabled, disabledPaths };
}
