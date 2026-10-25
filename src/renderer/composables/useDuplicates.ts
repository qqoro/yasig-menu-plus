/**
 * 중복 게임 관리 Composable
 *
 * - 중복 게임 그룹 조회
 * - 선택한 게임 삭제
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import type { Ref } from "vue";
import { toast } from "vue-sonner";
import type { DuplicateGroup, DuplicateSearchOptions } from "../types";
import { queryKeys } from "../queryKeys";
import { useDeleteFailureStore } from "../stores/deleteFailureStore";

/**
 * 중복 게임 그룹 조회 Query
 */
export function useDuplicates(options: Ref<DuplicateSearchOptions>) {
  return useQuery({
    queryKey: queryKeys.duplicates.search(options),
    queryFn: async (): Promise<DuplicateGroup[]> => {
      // reactive 프록시는 IPC로 복제되지 않으므로 평범한 객체로 풀어서 보냄
      const result = await window.api.invoke("findDuplicates", {
        excludedSources: [...(options.value.excludedSources ?? [])],
        criteria: [...(options.value.criteria ?? [])],
      });
      return (result as { groups: DuplicateGroup[] }).groups;
    },
    staleTime: 1000 * 60 * 5, // 5분
    // 옵션을 바꾸는 동안 이전 결과를 유지해 화면이 로딩으로 깜빡이지 않게 함
    placeholderData: keepPreviousData,
  });
}

/**
 * 게임 삭제 Mutation
 */
export function useDeleteGames() {
  const queryClient = useQueryClient();
  const deleteFailure = useDeleteFailureStore();

  return useMutation({
    // permanent: 휴지통을 거치지 않고 영구 삭제 (삭제 확인창의 체크박스 또는 실패 모달)
    mutationFn: async (vars: { paths: string[]; permanent: boolean }) => {
      return await window.api.invoke("deleteGames", vars);
    },
    onSuccess: (data, vars) => {
      // 게임 목록 및 중복 목록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.duplicates.all });

      // 실패한 게임은 목록에 그대로 남고, 모달로 모아 보여준다.
      // 네트워크 드라이브(NAS)는 휴지통이 없어 휴지통 이동이 항상 실패한다
      if (data.failed.length > 0) {
        deleteFailure.show(data, vars.permanent);
        return;
      }
      toast.success(
        vars.permanent
          ? `${data.deletedCount}개의 게임을 영구 삭제했습니다.`
          : `${data.deletedCount}개의 게임이 삭제되었습니다.`,
      );
    },
    onError: (error) => {
      toast.error(`게임 삭제 실패: ${error}`);
    },
  });
}
