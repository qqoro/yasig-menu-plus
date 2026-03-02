/**
 * 플레이 타임 관리 컴포저블
 * Vue Query 기반 데이터 fetching
 */

import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { onMounted, onUnmounted, type Ref } from "vue";
import { queryKeys } from "../queryKeys";
import type { PlaySession } from "../types";

/**
 * 플레이 타임 조회
 */
export function usePlayTime(path: string | Ref<string>) {
  return useQuery({
    queryKey: queryKeys.playTime(path),
    queryFn: async () => {
      const pathValue = typeof path === "string" ? path : path.value;
      const result = await window.api.invoke("getPlayTime", {
        path: pathValue,
      });
      return result as { path: string; totalPlayTime: number };
    },
    enabled: typeof path === "string" ? !!path : () => !!path.value,
    staleTime: 1000 * 30, // 30초
  });
}

/**
 * 플레이 세션 목록 조회
 */
export function usePlaySessions(
  path: string | Ref<string>,
  limit: number = 10,
) {
  return useQuery({
    queryKey: queryKeys.playSessions(path, limit),
    queryFn: async () => {
      const pathValue = typeof path === "string" ? path : path.value;
      const result = await window.api.invoke("getPlaySessions", {
        path: pathValue,
        limit,
      });
      return result as { sessions: PlaySession[] };
    },
    enabled: typeof path === "string" ? !!path : () => !!path.value,
  });
}

/**
 * 플레이 타임 이벤트 리스너
 * 게임 세션 종료 시 쿼리 무효화
 */
export function usePlayTimeListener(path: Ref<string>) {
  const queryClient = useQueryClient();

  function onGameSessionEnded(data: {
    path: string;
    durationSeconds: number;
    totalPlayTime: number;
  }) {
    if (data.path === path.value) {
      queryClient.invalidateQueries({ queryKey: queryKeys.playTime(path) });
      queryClient.invalidateQueries({ queryKey: queryKeys.playSessions(path) });
    }
  }

  onMounted(() => {
    window.api.on("gameSessionEnded", onGameSessionEnded);
  });

  onUnmounted(() => {
    window.api.removeListener("gameSessionEnded", onGameSessionEnded);
  });
}

/**
 * 시간 포맷팅 (간단 버전)
 * 예: "2시간 30분", "45분", "30초"
 */
export function formatPlayTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}초`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}분`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (minutes === 0) {
      return `${hours}시간`;
    }
    return `${hours}시간 ${minutes}분`;
  }
}

/**
 * 시간 포맷팅 (상세 버전)
 * 예: "2시간 30분 15초"
 */
export function formatPlayTimeDetailed(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  if (secs > 0 && hours === 0) parts.push(`${secs}초`);

  return parts.join(" ") || "0초";
}
