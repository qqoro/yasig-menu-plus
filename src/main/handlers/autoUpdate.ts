/**
 * 자동 업데이트 관련 IPC 핸들러
 */

import type { IpcMainInvokeEvent } from "electron";
import { autoUpdaterService } from "../services/AutoUpdater.js";
import { getAutoUpdateSettings, setAutoUpdateSettings } from "../store.js";
import type { AutoUpdateSettings } from "../store.js";

/**
 * 업데이트 확인 핸들러
 */
export async function checkForUpdateHandler(): Promise<{
  isPortable: boolean;
}> {
  await autoUpdaterService.checkForUpdates();
  return {
    isPortable: autoUpdaterService.isPortableVersion(),
  };
}

/**
 * 업데이트 다운로드 핸들러
 */
export async function downloadUpdateHandler(): Promise<void> {
  await autoUpdaterService.downloadUpdate();
}

/**
 * 업데이트 설치 핸들러
 */
export async function installUpdateHandler(): Promise<void> {
  autoUpdaterService.quitAndInstall();
}

/**
 * 자동 업데이트 설정 조회 핸들러
 */
export async function getAutoUpdateSettingsHandler(): Promise<{
  settings: AutoUpdateSettings;
}> {
  return {
    settings: getAutoUpdateSettings(),
  };
}

/**
 * 자동 업데이트 설정 저장 핸들러
 */
export async function setAutoUpdateSettingsHandler(
  _event: IpcMainInvokeEvent,
  payload: { settings: Partial<AutoUpdateSettings> },
): Promise<{ settings: AutoUpdateSettings }> {
  setAutoUpdateSettings(payload.settings);
  return {
    settings: getAutoUpdateSettings(),
  };
}
