/**
 * 통합 설정 관리 Composable
 * Vue Query 기반 전체 설정 조회 및 부분 업데이트
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { queryKeys } from "../queryKeys";
import type { StoreSchema } from "../types";

/**
 * 전체 설정 조회
 */
export function useAllSettings() {
  return useQuery({
    queryKey: queryKeys.settings.all,
    queryFn: async (): Promise<StoreSchema> => {
      const result = await window.api.invoke("getAllSettings");
      if (!result || typeof result !== "object" || !("settings" in result)) {
        throw new Error("Invalid settings response");
      }
      return result.settings;
    },
    staleTime: 1000 * 60 * 5, // 5분간 fresh 상태 유지
  });
}

/**
 * 부분 설정 업데이트 (deep merge)
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: Partial<StoreSchema>) => {
      return await window.api.invoke("updateSettings", { settings });
    },
    onSuccess: (data: any) => {
      // 업데이트된 설정으로 캐시 갱신
      queryClient.setQueryData(queryKeys.settings.all, data.settings);

      // 관련 쿼리들도 무효화 (이전 composable들과의 호환성)
      queryClient.invalidateQueries({ queryKey: queryKeys.libraryPaths.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.excludedExecutables.all,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all }); // 설정 변경이 게임 목록에 영향을 줄 수 있음
    },
  });
}

/**
 * 데이터 저장 폴더 열기
 */
export function useOpenDataFolder() {
  return useMutation({
    mutationFn: async () => {
      return await window.api.invoke("openDataFolder");
    },
  });
}
