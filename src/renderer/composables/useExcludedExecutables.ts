/**
 * 실행 제외 목록 관리 컴포저블
 * Vue Query 기반 데이터 fetching 및 mutations
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { queryKeys } from "../queryKeys";

/**
 * 실행 제외 목록 조회
 */
export function useExcludedExecutables() {
  return useQuery({
    queryKey: queryKeys.excludedExecutables.all,
    queryFn: async () => {
      const result = await window.api.invoke("getExcludedExecutables");
      return result.executables;
    },
  });
}

/**
 * 실행 제외 목록에 추가
 */
export function useAddExcludedExecutable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (executable: string) => {
      return await window.api.invoke("addExcludedExecutable", { executable });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.excludedExecutables.all,
      });
    },
  });
}

/**
 * 실행 제외 목록에서 제거
 */
export function useRemoveExcludedExecutable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (executable: string) => {
      return await window.api.invoke("removeExcludedExecutable", {
        executable,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.excludedExecutables.all,
      });
    },
  });
}
