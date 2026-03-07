/**
 * 중복 게임 관리 Composable
 *
 * - 중복 게임 그룹 조회
 * - 선택한 게임 삭제
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import type { DuplicateGroup } from "../types";
import { queryKeys } from "../queryKeys";

/**
 * 중복 게임 그룹 조회 Query
 */
export function useDuplicates() {
  return useQuery({
    queryKey: queryKeys.duplicates.all,
    queryFn: async (): Promise<DuplicateGroup[]> => {
      const result = await window.api.invoke("findDuplicates");
      return (result as { groups: DuplicateGroup[] }).groups;
    },
    staleTime: 1000 * 60 * 5, // 5분
  });
}

/**
 * 게임 삭제 Mutation
 */
export function useDeleteGames() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (paths: string[]) => {
      const result = await window.api.invoke("deleteGames", { paths });
      return result as { deletedCount: number };
    },
    onSuccess: (data) => {
      // 게임 목록 및 중복 목록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.duplicates.all });
      toast.success(`${data.deletedCount}개의 게임이 삭제되었습니다.`);
    },
    onError: (error) => {
      toast.error(`게임 삭제 실패: ${error}`);
    },
  });
}
