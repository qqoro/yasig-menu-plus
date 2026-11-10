/**
 * 번역 컴포저블
 *
 * @tanstack/vue-query를 사용한 번역 기능
 */

import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { queryKeys } from "../queryKeys";
import { JOB_BUSY_MESSAGE } from "./useAllInOneRefresh";

// 단일 게임 번역 뮤테이션
export function useTranslateTitleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { path: string; force?: boolean }) => {
      return await window.api.invoke("translateTitle", params);
    },
    onSuccess: (_, variables) => {
      // 제목 번역으로 games와 gameDetail 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
    onError: (error) => {
      toast.error("번역에 실패했습니다.", {
        description: error instanceof Error ? error.message : "알 수 없는 오류",
      });
    },
  });
}

// 전체 게임 번역 시작 뮤테이션
// 메인이 번역을 진행하고 바로 응답한다. 진행 상태는 useJobStatus,
// 완료 알림과 캐시 무효화는 useJobEvents가 맡는다.
export function useTranslateAllTitlesMutation() {
  return useMutation({
    mutationFn: async (params: { force?: boolean }) => {
      const result = await window.api.invoke("translateAllTitles", {
        force: params.force,
      });
      if (!result.started) toast.warning(JOB_BUSY_MESSAGE);
      return result;
    },
    onError: (error) => {
      toast.error("전체 번역에 실패했습니다.", {
        description: error instanceof Error ? error.message : "알 수 없는 오류",
      });
    },
  });
}
