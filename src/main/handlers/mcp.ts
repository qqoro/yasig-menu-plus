/**
 * AI 연동(MCP 서버) 상태 조회 핸들러
 */

import type { IpcMainInvokeEvent } from "electron";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import { getMcpStatus } from "../mcp/server.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";

export const getMcpStatusHandler = wrapIpcHandler(
  "getMcpStatus",
  async (
    _event: IpcMainInvokeEvent,
    _payload: IpcRendererEventMap["getMcpStatus"],
  ): Promise<IpcMainEventMap["mcpStatus"]> => {
    return getMcpStatus();
  },
);
