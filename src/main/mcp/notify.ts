/**
 * MCP → 렌더러 알림
 *
 * MCP 툴이 데이터를 바꾸면 모든 창에 externalDataChanged를 보내 vue-query
 * 캐시를 무효화한다. 토스트는 띄우지 않는다(연속 수정 시 알림 폭주 방지).
 */

import { IpcMainSend, type ExternalDataChangedPayload } from "../events.js";
import { broadcast } from "../utils/broadcast.js";

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
