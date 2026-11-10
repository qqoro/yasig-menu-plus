/**
 * 일괄 새로고침 Composable
 *
 * 전체 동기화(폴더 스캔 → 정보 수집 → 번역)는 메인 프로세스가 진행한다.
 * 여기서는 시작만 요청하고, 진행 상태는 useJobStatus, 완료 알림은
 * useJobEvents가 맡는다.
 */

import { useMutation, useQuery } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { queryKeys } from "../queryKeys";

export const JOB_BUSY_MESSAGE = "이미 다른 작업이 진행 중입니다.";

/**
 * 전체 동기화 시작 Mutation (스캔 → 수집 → 번역)
 */
export function useAllInOneRefreshMutation() {
  return useMutation({
    mutationFn: async (libraryPaths: string[]) => {
      const result = await window.api.invoke("runFullSync", {
        sourcePaths: [...libraryPaths],
      });
      if (!result.started) toast.warning(JOB_BUSY_MESSAGE);
      return result;
    },
    onError: (err) => {
      toast.error("동기화를 시작하지 못했습니다.", {
        description: err instanceof Error ? err.message : "알 수 없는 오류",
      });
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
    mutationFn: async (multiple: boolean = false) => {
      const result = await window.api.invoke("selectFile", { multiple });
      return result.filePaths;
    },
  });
}
