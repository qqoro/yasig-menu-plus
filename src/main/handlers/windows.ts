/**
 * 윈도우 제어 핸들러
 *
 * Phase 1 MVP:
 * - 최소화
 * - 최대화/복원
 * - 닫기
 */

import type { IpcMainInvokeEvent } from "electron";
import { BrowserWindow } from "electron";
import type { IpcRendererEventMap } from "../events.js";

function getMainWindow() {
  const windows = BrowserWindow.getAllWindows();
  return windows[0];
}

/**
 * 윈도우 최소화
 */
export async function minimizeWindowHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["minimizeWindow"],
): Promise<void> {
  const window = getMainWindow();
  window?.minimize();
}

/**
 * 윈도우 최대화/복원 토글
 */
export async function maximizeWindowHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["maximizeWindow"],
): Promise<void> {
  const window = getMainWindow();
  if (!window) {
    throw new Error("윈도우를 찾을 수 없습니다.");
  }

  if (window.isMaximized()) {
    window.unmaximize();
  } else {
    window.maximize();
  }
}

/**
 * 윈도우 닫기
 */
export async function closeWindowHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["closeWindow"],
): Promise<void> {
  const window = getMainWindow();
  window?.close();
}
