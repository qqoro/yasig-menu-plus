/**
 * 이미지 WebP 변환 관련 Composable
 * Vue Query 기반 기존 이미지 일괄 변환
 */

import { useMutation } from "@tanstack/vue-query";

/**
 * 변환 결과 타입
 */
export interface ConvertResult {
  total: number;
  converted: number;
  failed: number;
  freedBytes: number;
}

/**
 * 기존 이미지 WebP 변환 Mutation
 */
export function useConvertImagesToWebp() {
  return useMutation<ConvertResult, Error, void>({
    mutationFn: async () => {
      const result = await window.api.invoke("convertImagesToWebp");
      return result;
    },
  });
}
