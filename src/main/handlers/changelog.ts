/**
 * 체인지로그 IPC 핸들러
 *
 * GitHub Releases에서 체인지로그 정보를 조회
 */

import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import { IpcRendererSend } from "../events.js";
import { changelogService } from "../services/ChangelogService.js";
import type { IpcMainEventMap } from "../events.js";

/**
 * 체인지로그 조회 핸들러
 *
 * mode:
 * - "afterVersion": 현재 버전 이후 릴리즈 (업데이트 알림용)
 * - "recent": 최근 10개 릴리즈 (업데이트 후 첫 실행용)
 */
export async function getChangelogHandler(
  _event: IpcMainInvokeEvent,
  data: { currentVersion: string; mode: "afterVersion" | "recent" },
): Promise<IpcMainEventMap["changelogResult"]> {
  const releases =
    data.mode === "recent"
      ? await changelogService.getRecentReleases(10, data.currentVersion)
      : await changelogService.getReleasesAfterVersion(data.currentVersion);
  return { releases };
}

/**
 * 체인지로그 핸들러 설정
 */
export function setupChangelogHandler(_mainWindow: BrowserWindow): void {
  ipcMain.handle(IpcRendererSend.GetChangelog, getChangelogHandler);
}
