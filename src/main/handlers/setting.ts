/**
 * 통합 설정 관리 핸들러
 *
 * 전체 설정 조회 및 부분 업데이트를 위한 통합 API
 */

import { app, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import { getAllSettings, updateSettings } from "../store.js";

/**
 * 전체 설정 조회 핸들러
 */
export async function getAllSettingsHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["getAllSettings"],
): Promise<IpcMainEventMap["allSettings"]> {
  const settings = getAllSettings();
  return { settings };
}

/**
 * 부분 설정 업데이트 핸들러 (deep merge)
 */
export async function updateSettingsHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["updateSettings"],
): Promise<IpcMainEventMap["settingsUpdated"]> {
  const { settings } = payload;
  updateSettings(settings);

  // 업데이트된 전체 설정 반환
  const updatedSettings = getAllSettings();
  return { settings: updatedSettings };
}

/**
 * 데이터 저장 폴더 열기 핸들러
 */
export async function openDataFolderHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["openDataFolder"],
): Promise<IpcMainEventMap["dataFolderOpened"]> {
  const dataPath = app.getPath("userData");
  shell.openPath(dataPath);
  return { path: dataPath };
}
