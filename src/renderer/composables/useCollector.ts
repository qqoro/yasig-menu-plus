/**
 * 컬렉터 관련 Composable
 * Vue Query 기반 썸네일 & 메타데이터 자동 수집
 */

import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { ref } from "vue";
import { queryKeys } from "../queryKeys";

// 컬렉터 실행 상태
export interface CollectorProgress {
  current: number;
  total: number;
  gameTitle: string;
}

const isRunning = ref(false);
const progress = ref<CollectorProgress>({
  current: 0,
  total: 0,
  gameTitle: "",
});
const error = ref<string | null>(null);

/**
 * 단일 게임 컬렉터 실행 Mutation
 */
export function useRunCollector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      gamePath,
      force,
    }: {
      gamePath: string;
      force?: boolean;
    }) => {
      const result = await window.api.invoke("runCollector", {
        gamePath,
        force: force ?? false,
      });
      const collectorResult = result as {
        gamePath: string;
        success: boolean;
        error?: string;
        alreadyCollected?: boolean;
      };

      if (!collectorResult.success) {
        if (collectorResult.alreadyCollected) {
          // 이미 수집된 경우 무시
          return;
        }
        throw new Error(collectorResult.error || "정보 수집 실패");
      }
      return collectorResult;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.gamePath),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameImages(variables.gamePath),
      });
    },
  });
}

/**
 * 전체 게임 컬렉터 실행 Mutation (Vue Query 기반)
 */
export function useRunAllCollectors() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (force: boolean = false) => {
      const result = await window.api.invoke("runAllCollectors", { force });
      return result as { total: number; success: number; failed: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
    },
  });
}

/**
 * 전체 게임 컬렉터 실행 (진행 상태 추적 포함)
 * 리스너를 직접 관리해야 하는 특수한 경우
 */
export async function runAllCollectorsWithProgress(
  force = false,
  onProgress?: (progress: CollectorProgress) => void,
): Promise<{ total: number; success: number; failed: number }> {
  isRunning.value = true;
  error.value = null;
  progress.value = { current: 0, total: 0, gameTitle: "" };

  const progressListener = (data: CollectorProgress) => {
    progress.value = data;
    onProgress?.(data);
  };

  window.api.on("collectorProgress", progressListener);

  try {
    const result = await window.api.invoke("runAllCollectors", { force });
    return result as { total: number; success: number; failed: number };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "알 수 없는 오류";
    error.value = errorMessage;
    console.error("전체 컬렉터 실행 오류:", err);
    throw err;
  } finally {
    window.api.removeListener("collectorProgress", progressListener);
    isRunning.value = false;
  }
}

/**
 * 썸네일 다운로드 Mutation (Vue Query 기반)
 */
export function useDownloadThumbnail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      gamePath,
      url,
    }: {
      gamePath: string;
      url: string;
    }) => {
      const result = await window.api.invoke("downloadThumbnail", {
        gamePath,
        url,
      });
      const thumbnailResult = result as {
        gamePath: string;
        thumbnailPath: string;
      };
      return thumbnailResult.thumbnailPath;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.gamePath),
      });
    },
  });
}

/**
 * 썸네일 삭제 Mutation (Vue Query 기반)
 */
export function useDeleteThumbnail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (gamePath: string) => {
      await window.api.invoke("deleteThumbnail", { gamePath });
    },
    onSuccess: (_, gamePath) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(gamePath),
      });
    },
  });
}

/**
 * Google 쿠키 획득 Mutation
 */
export function useGetNewCookie() {
  return useMutation({
    mutationFn: async () => {
      const result = await window.api.invoke("getNewCookie");
      return result as string | undefined;
    },
  });
}

/**
 * 컬렉터 Composable 반환
 */
export function useCollector() {
  return {
    isRunning,
    progress,
    error,
    runAllCollectorsWithProgress,
  };
}
