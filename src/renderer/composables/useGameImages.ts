/**
 * 게임 이미지 관리 컴포저블
 * Vue Query 기반 데이터 fetching
 */

import { useQuery } from "@tanstack/vue-query";
import type { Ref } from "vue";
import { queryKeys } from "../queryKeys";

/**
 * 게임 이미지 목록 조회
 */
export function useGameImages(gamePath: string | Ref<string>) {
  return useQuery({
    queryKey: queryKeys.gameImages(gamePath),
    queryFn: async () => {
      const gamePathValue =
        typeof gamePath === "string" ? gamePath : gamePath.value;
      const result = await window.api.invoke("getGameImages", {
        gamePath: gamePathValue,
      });
      return result.images;
    },
    enabled: typeof gamePath === "string" ? !!gamePath : () => !!gamePath.value,
  });
}
