/**
 * 삭제 확인 다이얼로그의 "영구 삭제" 체크 상태
 *
 * 모든 삭제 다이얼로그(홈 단일·홈 일괄·중복)가 같은 값을 공유하고,
 * 휴지통이 없는 NAS 사용자가 매번 체크하지 않도록 재시작해도 유지한다
 */

import { useLocalStorage } from "@vueuse/core";

const permanentDelete = useLocalStorage("delete-game-permanent", false);

export function usePermanentDelete() {
  return { permanentDelete };
}
