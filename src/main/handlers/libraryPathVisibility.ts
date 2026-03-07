import type { IpcMainInvokeEvent } from "electron";
import {
  getDisabledLibraryPaths,
  toggleLibraryPathDisabled,
} from "../store.js";

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
  const isDisabled = toggleLibraryPathDisabled(path);
  return { path, isDisabled };
}
