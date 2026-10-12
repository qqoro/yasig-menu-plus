/**
 * McpServer 인스턴스 생성 + 모든 툴 등록
 *
 * stateless 모드에서는 요청마다 새 인스턴스를 만든다(SDK 권장).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { app } from "electron";
import { registerGamesReadTools } from "./tools/games-read.js";
import { registerGamesWriteTools } from "./tools/games-write.js";
import { registerLibraryTools } from "./tools/library.js";
import { registerThumbnailTools } from "./tools/thumbnail.js";

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "yasig-menu-plus",
    version: app.getVersion(),
  });
  registerGamesReadTools(server);
  registerGamesWriteTools(server);
  registerThumbnailTools(server);
  registerLibraryTools(server);
  return server;
}
