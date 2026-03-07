/**
 * 버전 체크 IPC 핸들러
 *
 * 업데이트 후 첫 실행 감지
 */

import type { BrowserWindow, IpcMainInvokeEvent } from "electron";
import { ipcMain } from "electron";
import { IpcRendererSend } from "../events.js";
import type { IpcMainEventMap } from "../events.js";
import { getLastVersion, setLastVersion } from "../store.js";

/**
 * 버전 변경 확인 핸들러
 */
export async function checkVersionChangeHandler(
  _event: IpcMainInvokeEvent,
  data: { currentVersion: string },
): Promise<IpcMainEventMap["versionChangeResult"]> {
  const lastVersion = getLastVersion();
  const isVersionChanged =
    lastVersion !== undefined && lastVersion !== data.currentVersion;

  return {
    isVersionChanged,
  };
}

/**
 * 마지막 버전 설정 핸들러
 */
export async function setLastVersionHandler(
  _event: IpcMainInvokeEvent,
  data: { version: string },
): Promise<IpcMainEventMap["lastVersionSet"]> {
  await setLastVersion(data.version);
  return { version: data.version };
}

/**
 * 버전 체크 핸들러 설정
 */
export function setupVersionCheckHandler(_mainWindow: BrowserWindow): void {
  ipcMain.handle(IpcRendererSend.CheckVersionChange, checkVersionChangeHandler);
  ipcMain.handle(IpcRendererSend.SetLastVersion, setLastVersionHandler);
}
