/**
 * 실행 중인 게임 목록
 *
 * 원본은 메인 프로세스의 ProcessMonitor다. 화면이 뜰 때 스냅샷을 받아오고,
 * 이후로는 useRunningGamesListener가 runningGamesChanged로 캐시를 덮어쓴다.
 * 그래서 새로고침이나 화면 이동 뒤에도 실행 중 표시가 유지된다.
 *
 * 플레이 타임을 추적하는 .exe 실행만 잡힌다. 바로가기·압축파일·미디어 재생은
 * 종료를 알 수 없어 표시되지 않는다.
 */

import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, onMounted, onUnmounted } from "vue";
import type { RunningGame } from "../../main/events.js";
import { queryKeys } from "../queryKeys";

export function useRunningGames() {
  const query = useQuery({
    queryKey: queryKeys.runningGames.all,
    queryFn: () => window.api.invoke("getRunningGames"),
    // 이벤트로 갱신되므로 다시 가져올 필요가 없다
    staleTime: Infinity,
  });

  const runningPaths = computed(
    () => new Set((query.data.value ?? []).map((game) => game.path)),
  );

  function isRunning(path: string): boolean {
    return runningPaths.value.has(path);
  }

  return { runningPaths, isRunning };
}

/**
 * runningGamesChanged 구독 (App.vue에서 한 번만 마운트)
 */
export function useRunningGamesListener() {
  const queryClient = useQueryClient();

  function onRunningGamesChanged(games: RunningGame[]) {
    queryClient.setQueryData(queryKeys.runningGames.all, games);
  }

  onMounted(() => {
    window.api.on("runningGamesChanged", onRunningGamesChanged);
  });

  onUnmounted(() => {
    window.api.removeListener("runningGamesChanged", onRunningGamesChanged);
  });
}
