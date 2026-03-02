/**
 * 설정 관리 Composable
 * electron-store를 사용하여 라이브러리 경로를 관리
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { queryKeys } from "../queryKeys";

/**
 * 라이브러리 경로 목록 조회
 */
export function useLibraryPaths() {
  return useQuery({
    queryKey: queryKeys.libraryPaths.all,
    queryFn: async () => {
      const result = await window.api.invoke("getLibraryPaths");
      return result.paths;
    },
  });
}

/**
 * 라이브러리 경로 추가
 */
export function useAddLibraryPath() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      return await window.api.invoke("addLibraryPath", { path });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraryPaths.all });
    },
  });
}

/**
 * 라이브러리 경로 제거
 */
export function useRemoveLibraryPath() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      return await window.api.invoke("removeLibraryPath", { path });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.libraryPaths.all });
    },
  });
}
