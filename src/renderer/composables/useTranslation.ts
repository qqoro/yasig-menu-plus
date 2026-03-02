/**
 * 번역 컴포저블
 *
 * @tanstack/vue-query를 사용한 번역 기능
 */

import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, onMounted, ref } from "vue";
import { toast } from "vue-sonner";
import { queryKeys } from "../queryKeys";

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

// 전체 게임 번역 뮤테이션
export function useTranslateAllTitlesMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { force?: boolean }) => {
      return await window.api.invoke("translateAllTitles", params);
    },
    onSuccess: (data: any) => {
      toast.success("전체 번역 완료", {
        description: `성공: ${data.success}, 실패: ${data.failed}`,
      });
      // 전체 번역으로 games 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
    },
    onError: (error) => {
      toast.error("전체 번역에 실패했습니다.", {
        description: error instanceof Error ? error.message : "알 수 없는 오류",
      });
    },
  });
}

// 번역 진행률 상태 (SettingsView에서 UI 표시용)
// 실제 이벤트 리스너는 App.vue에서 전역으로 처리됨
export function useTranslationProgress() {
  const current = ref(0);
  const total = ref(0);
  const gameTitle = ref("");
  const isInProgress = computed(
    () => current.value > 0 && current.value <= total.value,
  );

  onMounted(() => {
    window.api.on(
      "translationProgress",
      (data: { current: number; total: number; gameTitle: string }) => {
        current.value = data.current;
        total.value = data.total;
        gameTitle.value = data.gameTitle;
      },
    );

    window.api.on("allTranslationsDone", () => {
      current.value = 0;
      total.value = 0;
      gameTitle.value = "";
    });
  });

  return {
    current,
    total,
    gameTitle,
    isInProgress,
  };
}
