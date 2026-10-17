/**
 * 목록 대조 Composable
 * 붙여넣은 작품 목록 대조 Mutation + 미보유 작품 미리보기/샘플 이미지 Query
 */

import { useMutation, useQuery } from "@tanstack/vue-query";
import type { Ref } from "vue";
import { queryKeys } from "../queryKeys";

/**
 * 붙여넣은 목록을 라이브러리와 대조
 */
export function useCheckGameList() {
  return useMutation({
    mutationFn: (text: string) => window.api.invoke("checkGameList", { text }),
  });
}

/**
 * 미보유 작품 미리보기 (대표 이미지 + 샘플 이미지 목록 + 평점 등)
 * 화면에 보일 때만 요청하고, 화면을 떠난 뒤 잠시 후 캐시에서 사라짐
 */
export function useListCheckPreview(
  provider: string,
  externalId: string,
  enabled: Ref<boolean>,
) {
  return useQuery({
    queryKey: queryKeys.listCheck.preview(provider, externalId),
    queryFn: () =>
      window.api.invoke("fetchListCheckPreview", { provider, externalId }),
    enabled,
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * 미보유 작품 샘플 이미지 한 장 (미리보기에서 넘겨볼 때 받아옴)
 */
export function useListCheckImage(url: Ref<string | null>) {
  return useQuery({
    queryKey: queryKeys.listCheck.image(url),
    queryFn: async () => {
      if (!url.value) return null;
      const result = await window.api.invoke("fetchListCheckImage", {
        url: url.value,
      });
      return result.dataUrl;
    },
    enabled: () => !!url.value,
    staleTime: Infinity,
    retry: false,
  });
}
