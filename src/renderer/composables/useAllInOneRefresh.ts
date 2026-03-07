/**
 * 일괄 새로고침 Composable
 * Vue Query 기반 폴더 스캔 → 정보 수집 → 번역 순차 실행
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import { queryKeys } from "../queryKeys";

type RefreshStep = "scan" | "collect" | "translate" | "done";

// 진행 상태 (전역 공유)
const currentStep = ref<RefreshStep | null>(null);
const collectorProgress = ref({ current: 0, total: 0, gameTitle: "" });
const translationProgress = ref({ current: 0, total: 0, gameTitle: "" });

export function useAllInOneRefresh() {
  const stepLabel = computed(() => {
    switch (currentStep.value) {
      case "scan":
        return "폴더 스캔 중";
      case "collect":
        return "정보 수집 중";
      case "translate":
        return "번역 중";
      default:
        return "";
    }
  });

  return {
    currentStep,
    stepLabel,
    collectorProgress,
    translationProgress,
  };
}

/**
 * 전체 동기화 Mutation (스캔 → 수집 → 번역)
 */
export function useAllInOneRefreshMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (libraryPaths: string[]) => {
      const results = {
        scan: { success: false, deletedCount: 0 },
        collect: { success: 0, failed: 0 },
        translate: { success: 0, failed: 0 },
      };

      // 1단계: 폴더 스캔
      currentStep.value = "scan";
      try {
        const paths = [...libraryPaths];
        const scanResult = await window.api.invoke("refreshList", {
          sourcePaths: paths,
        });

        const now = new Date();
        await window.api.invoke("lastRefreshedSet", {
          timestamp: now.toISOString(),
        });

        // 캐시 무효화로 lastRefreshed 쿼리 갱신
        queryClient.invalidateQueries({
          queryKey: queryKeys.lastRefreshed.all,
        });

        results.scan.success = true;
        results.scan.deletedCount =
          (scanResult as { deletedCount: number }).deletedCount ?? 0;

        if (results.scan.deletedCount > 0) {
          toast.info(`${results.scan.deletedCount}개의 게임이 삭제되었습니다.`);
        }
      } catch (err) {
        console.error(err);
        toast.error("폴더 스캔 실패", {
          description: err instanceof Error ? err.message : "알 수 없는 오류",
        });
      }

      // 2단계: 정보 수집
      currentStep.value = "collect";
      const progressListener = (data: {
        current: number;
        total: number;
        gameTitle: string;
      }) => {
        collectorProgress.value = data;
      };
      window.api.on("collectorProgress", progressListener);
      try {
        const collectResult = await window.api.invoke("runAllCollectors", {
          force: false,
        });
        results.collect = collectResult as { success: number; failed: number };
      } catch (err) {
        toast.error("정보 수집 실패", {
          description: err instanceof Error ? err.message : "알 수 없는 오류",
        });
      } finally {
        window.api.removeListener("collectorProgress", progressListener);
      }

      // 3단계: 번역
      currentStep.value = "translate";
      const translateListener = (data: {
        current: number;
        total: number;
        gameTitle: string;
      }) => {
        translationProgress.value = data;
      };
      window.api.on("translationProgress", translateListener);
      try {
        const translateResult = await window.api.invoke("translateAllTitles", {
          force: false,
        });
        results.translate = translateResult as {
          success: number;
          failed: number;
        };
      } catch (err) {
        toast.error("번역 실패", {
          description: err instanceof Error ? err.message : "알 수 없는 오류",
        });
      } finally {
        window.api.removeListener("translationProgress", translateListener);
      }

      // 결과 요약
      const parts: string[] = [];
      if (results.collect.success > 0 || results.collect.failed > 0) {
        parts.push(
          `수집: ${results.collect.success}/${results.collect.success + results.collect.failed}`,
        );
      }
      if (results.translate.success > 0 || results.translate.failed > 0) {
        parts.push(
          `번역: ${results.translate.success}/${results.translate.success + results.translate.failed}`,
        );
      }
      if (parts.length > 0) {
        toast.success("전체 동기화 완료", { description: parts.join(", ") });
      }

      return results;
    },
    onSuccess: () => {
      // 전체 동기화 완료 후 모든 캐시 무효화
      queryClient.invalidateQueries();
    },
    onSettled: () => {
      currentStep.value = null;
    },
  });
}

/**
 * 마지막 새로고침 시간 조회 Query
 */
export function useLastRefreshed() {
  return useQuery({
    queryKey: queryKeys.lastRefreshed.all,
    queryFn: async () => {
      const result = await window.api.invoke("lastRefreshedGet");
      const timestamp = result.timestamp;
      return timestamp ? new Date(timestamp) : null;
    },
    staleTime: 1000 * 60 * 5, // 5분
  });
}

/**
 * 마지막 새로고침 시간 설정 Mutation
 */
export function useSetLastRefreshed() {
  return useMutation({
    mutationFn: async (timestamp: string) => {
      await window.api.invoke("lastRefreshedSet", { timestamp });
    },
  });
}

/**
 * 라이브러리 스캔 기록 조회 Query
 */
export function useLibraryScanHistory() {
  return useQuery({
    queryKey: queryKeys.libraryScanHistory.all,
    queryFn: async () => {
      const result = await window.api.invoke("getAllLibraryScanHistory");
      return result.history;
    },
    staleTime: 1000 * 60 * 5, // 5분
  });
}

/**
 * 폴더 선택 다이얼로그 Mutation
 */
export function useSelectFolder() {
  return useMutation({
    mutationFn: async () => {
      const result = await window.api.invoke("selectFolder");
      return result.filePaths;
    },
  });
}

/**
 * 파일 선택 다이얼로그 Mutation
 */
export function useSelectFile() {
  return useMutation({
    mutationFn: async () => {
      const result = await window.api.invoke("selectFile");
      return result.filePaths;
    },
  });
}
