/**
 * MCP → 렌더러 알림
 *
 * MCP 툴이 데이터를 바꾸면 모든 창에 externalDataChanged를 보내 vue-query
 * 캐시를 무효화한다. 토스트는 띄우지 않는다(연속 수정 시 알림 폭주 방지).
 */

import { BrowserWindow } from "electron";
import {
  IpcMainSend,
  type ExternalDataChangedPayload,
  type IpcMainEventMap,
  type IpcMainSendChannel,
} from "../events.js";

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

export function notifyExternalChange(
  payload: ExternalDataChangedPayload,
): void {
  broadcast(IpcMainSend.ExternalDataChanged, payload);
}

/**
 * 게임 1개가 바뀌었을 때
 */
export function notifyGameChanged(path: string): void {
  notifyExternalChange({ scope: "games", paths: [path] });
}
