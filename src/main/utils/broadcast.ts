/**
 * 메인 → 모든 렌더러 창 이벤트 전송
 *
 * event.sender에 묶지 않아 렌더러가 새로고침돼도(같은 webContents) 계속 받는다.
 */

import { BrowserWindow } from "electron";
import type { IpcMainEventMap, IpcMainSendChannel } from "../events.js";

/**
 * 살아 있는 모든 창에 이벤트 전송
 */
export function broadcast<K extends IpcMainSendChannel>(
  channel: K,
  payload: IpcMainEventMap[K],
): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}
