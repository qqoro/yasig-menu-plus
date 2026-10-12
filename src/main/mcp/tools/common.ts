/**
 * 툴 모듈이 공유하는 헬퍼
 */

import type { GameDetailItem } from "../../events.js";
import { getGameDetail } from "../../handlers/gameDetail.js";

/**
 * 게임 상세를 가져오고, 없으면 오류
 *
 * updateGameMetadata 등 기존 함수는 없는 path에도 조용히 0행을 갱신하므로
 * 쓰기 툴은 먼저 이 함수로 존재를 확인한다.
 */
export async function requireGameDetail(path: string): Promise<GameDetailItem> {
  const game = await getGameDetail(path);
  if (!game) {
    throw new Error("게임을 찾을 수 없습니다.");
  }
  return game;
}

/**
 * 배열 입력을 하나씩 처리하고 실패한 항목만 모은다 (부분 실패 허용)
 */
export async function applyEach(
  names: string[],
  fn: (name: string) => Promise<void>,
): Promise<{ name: string; message: string }[]> {
  const failed: { name: string; message: string }[] = [];
  for (const name of names) {
    try {
      await fn(name);
    } catch (error) {
      failed.push({
        name,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return failed;
}
