/**
 * 썸네일 마이그레이션 관련 Composable
 * Vue Query 기반 이전 버전 썸네일 가져오기
 */

import { useMutation } from "@tanstack/vue-query";

/**
 * 마이그레이션 결과 타입
 */
export interface MigrationResult {
  successCount: number;
  skipCount: number;
  failCount: number;
}

/**
 * 썸네일 마이그레이션 Mutation
 */
export function useMigrateThumbnails() {
  return useMutation<MigrationResult, Error, string>({
    mutationFn: async (sourceFolder: string) => {
      const result = await window.api.invoke("migrateThumbnails", {
        sourceFolder,
      });
      return result;
    },
  });
}
