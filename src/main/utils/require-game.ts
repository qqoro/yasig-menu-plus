/**
 * 게임 경로를 받는 핸들러의 공통 입구 검사
 *
 * 게임 경로는 DB 키로 쓰이므로, 문자열 모양이 아니라 "등록된 게임인가"로 판정한다.
 * 등록되지 않은 경로는 조용히 0건 갱신되거나 외래키 오류로 끝나는 대신
 * 같은 메시지로 거부된다. MCP처럼 임의 문자열이 들어오는 경로에서 실패를 알리기 위함.
 */

import { db } from "../db/db-manager.js";

/**
 * 등록된 게임인지 확인
 * @throws {Error} 경로가 비었거나 DB에 없는 경우
 */
export async function requireGame(path: string): Promise<void> {
  if (typeof path !== "string" || path.trim() === "") {
    throw new Error("경로가 비어있습니다.");
  }

  const game = await db("games").where("path", path).first("path");
  if (!game) {
    throw new Error("게임을 찾을 수 없습니다.");
  }
}
