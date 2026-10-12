/**
 * MCP 툴 응답 헬퍼
 *
 * 툴은 예외를 던지지 않고 isError 응답으로 돌려준다. 메시지는 기존 핸들러가
 * 던지는 Error의 message(한국어)를 그대로 쓰고, 앱 로그에는 warn으로 남긴다.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Mcp");

export function okResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data) }] };
}

export function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text: message }] };
}

/**
 * 툴 본문을 실행하고 결과/오류를 MCP 응답으로 변환
 * @param name 툴 이름 (로그용)
 * @param context path·query 등 로그에 남길 짧은 문맥
 */
export async function runTool(
  name: string,
  context: string,
  fn: () => Promise<unknown>,
): Promise<CallToolResult> {
  log.debug(`툴 호출: ${name} ${context}`);
  try {
    return okResult(await fn());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(`툴 실패: ${name} ${context} — ${message}`);
    return errorResult(message);
  }
}
