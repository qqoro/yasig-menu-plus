/**
 * 컬렉터 관련 Composable
 * Vue Query 기반 썸네일 & 메타데이터 자동 수집
 */

import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { queryKeys } from "../queryKeys";
import { JOB_BUSY_MESSAGE } from "./useAllInOneRefresh";

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
 * 전체 게임 컬렉터 시작 Mutation
 *
 * 메인이 수집을 진행하고 바로 응답한다. 진행 상태는 useJobStatus,
 * 완료 알림과 캐시 무효화는 useJobEvents가 맡는다.
 */
export function useRunAllCollectors() {
  return useMutation({
    mutationFn: async (force: boolean = false) => {
      const result = await window.api.invoke("runAllCollectors", { force });
      if (!result.started) toast.warning(JOB_BUSY_MESSAGE);
      return result;
    },
  });
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
