/**
 * 라이브러리 경로 오프라인 토글 핸들러
 */

import type { IpcMainInvokeEvent } from "electron";
import { normalizePath } from "../lib/normalize-path.js";
import { getOfflineLibraryPaths, toggleLibraryPathOffline } from "../store.js";

/**
 * 오프라인 라이브러리 경로 목록 조회 핸들러
 */
export async function getOfflineLibraryPathsHandler(
  _event: IpcMainInvokeEvent,
): Promise<{ paths: string[] }> {
  const paths = getOfflineLibraryPaths();
  return { paths };
}

/**
 * 라이브러리 경로 오프라인 토글 핸들러
 */
export async function toggleLibraryPathOfflineHandler(
  _event: IpcMainInvokeEvent,
  { path }: { path: string },
): Promise<{ path: string; isOffline: boolean }> {
  const normalizedPath = normalizePath(path);
  const isOffline = toggleLibraryPathOffline(normalizedPath);
  return { path: normalizedPath, isOffline };
}
