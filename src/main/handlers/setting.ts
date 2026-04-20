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
  getViewedHelpCards,
  markHelpCardsViewed,
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
 * 본 도움말 카드 목록 조회 핸들러
 */
export const getViewedHelpCardsHandler = wrapIpcHandler(
  "getViewedHelpCards",
  async (
    _event: IpcMainInvokeEvent,
    _payload: IpcRendererEventMap["getViewedHelpCards"],
  ): Promise<IpcMainEventMap["viewedHelpCards"]> => {
    const cardIds = getViewedHelpCards();
    return { cardIds };
  },
);

/**
 * 도움말 카드 일괄 읽음 표시 핸들러
 */
export const markHelpCardsViewedHandler = wrapIpcHandler(
  "markHelpCardsViewed",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["markHelpCardsViewed"],
  ): Promise<IpcMainEventMap["helpCardsViewed"]> => {
    markHelpCardsViewed(payload.cardIds);
    return { cardIds: payload.cardIds };
  },
);
