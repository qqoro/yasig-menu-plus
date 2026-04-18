/**
 * 통합 설정 관리 핸들러
 *
 * 전체 설정 조회 및 부분 업데이트를 위한 통합 API
 */

import { app, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import {
  getAllSettings,
  getViewedHelpSections,
  markHelpSectionViewed,
  updateSettings,
} from "../store.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";

/**
 * 전체 설정 조회 핸들러
 */
export const getAllSettingsHandler = wrapIpcHandler(
  "getAllSettings",
  async (
    _event: IpcMainInvokeEvent,
    _payload: IpcRendererEventMap["getAllSettings"],
  ): Promise<IpcMainEventMap["allSettings"]> => {
    const settings = getAllSettings();
    return { settings };
  },
);

/**
 * 부분 설정 업데이트 핸들러 (deep merge)
 */
export const updateSettingsHandler = wrapIpcHandler(
  "updateSettings",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["updateSettings"],
  ): Promise<IpcMainEventMap["settingsUpdated"]> => {
    const { settings } = payload;
    updateSettings(settings);

    // 업데이트된 전체 설정 반환
    const updatedSettings = getAllSettings();
    return { settings: updatedSettings };
  },
);

/**
 * 데이터 저장 폴더 열기 핸들러
 */
export const openDataFolderHandler = wrapIpcHandler(
  "openDataFolder",
  async (
    _event: IpcMainInvokeEvent,
    _payload: IpcRendererEventMap["openDataFolder"],
  ): Promise<IpcMainEventMap["dataFolderOpened"]> => {
    const dataPath = app.getPath("userData");
    const result = await shell.openPath(dataPath);
    if (result) {
      throw new Error(`폴더를 열 수 없습니다: ${result}`);
    }
    return { path: dataPath };
  },
);

/**
 * 읽은 도움말 섹션 목록 조회 핸들러
 */
export const getViewedHelpSectionsHandler = wrapIpcHandler(
  "getViewedHelpSections",
  async (
    _event: IpcMainInvokeEvent,
    _payload: IpcRendererEventMap["getViewedHelpSections"],
  ): Promise<IpcMainEventMap["viewedHelpSections"]> => {
    const sectionIds = getViewedHelpSections();
    return { sectionIds };
  },
);

/**
 * 도움말 섹션 읽음 표시 핸들러
 */
export const markHelpSectionViewedHandler = wrapIpcHandler(
  "markHelpSectionViewed",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["markHelpSectionViewed"],
  ): Promise<IpcMainEventMap["helpSectionViewed"]> => {
    markHelpSectionViewed(payload.sectionId);
    return { sectionId: payload.sectionId };
  },
);
