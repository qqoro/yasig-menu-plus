/**
 * 썸네일 정리 관련 Composable
 * Vue Query 기반 사용하지 않는 썸네일 파일 삭제
 */

import { useMutation } from "@tanstack/vue-query";

/**
 * 썸네일 정리 결과 타입
 */
export interface CleanupResult {
  deletedCount: number;
  freedSpace: number;
}

/**
 * 사용하지 않는 썸네일 삭제 Mutation
 */
export function useCleanThumbnails() {
  return useMutation<CleanupResult, Error, void>({
    mutationFn: async () => {
      const result = await window.api.invoke("cleanUnusedThumbnails");
      return result;
    },
  });
}
