/**
 * 치트 플러그인 관련 Composable
 *
 * - RPG Maker 게임 감지 (MV/MZ)
 * - 치트 모드로 게임 실행
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { toast } from "vue-sonner";
import { queryKeys } from "../queryKeys";

interface RpgMakerDetection {
  isRpgMaker: boolean;
  version: "mv" | "mz" | null;
}

/**
 * RPG Maker 게임 감지 Query
 */
export function useDetectRpgMaker(gamePath: Ref<string>) {
  return useQuery({
    queryKey: computed(() => [...queryKeys.cheat.detection(gamePath.value)]),
    queryFn: async (): Promise<RpgMakerDetection> => {
      return await window.api.invoke("detectRpgMaker", {
        path: gamePath.value,
      });
    },
    enabled: computed(() => !!gamePath.value),
    staleTime: 0,
  });
}

/**
 * 치트 모드로 게임 실행 Mutation
 */
export function usePlayGameWithCheat() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (path: string): Promise<{ executablePath: string }> => {
      return await window.api.invoke("playGameWithCheat", { path });
    },
    onSuccess: () => {
      toast.success("치트 모드로 게임을 실행했습니다.");
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
    },
    onError: (error: Error) => {
      toast.error(error.message || "치트 모드 실행에 실패했습니다.");
    },
  });
}
