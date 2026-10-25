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

  const mutation = useMutation({
    // 기본은 휴지통 이동. 영구 삭제는 휴지통 이동 실패 안내의 버튼으로만 실행
    mutationFn: async (
      vars: string[] | { paths: string[]; permanent: true },
    ) => {
      const payload = Array.isArray(vars) ? { paths: vars } : vars;
      return await window.api.invoke("deleteGames", payload);
    },
    onSuccess: (data, vars) => {
      const permanent = !Array.isArray(vars);
      // 게임 목록 및 중복 목록 캐시 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.duplicates.all });
      if (data.deletedCount > 0) {
        toast.success(`${data.deletedCount}개의 게임이 삭제되었습니다.`);
      }
      if (data.failed.length === 0) return;

      if (permanent) {
        toast.error(`${data.failed.length}개는 삭제하지 못했습니다.`, {
          description: `게임 폴더가 사용 중인지 확인해 주세요. (${data.failed[0].message})`,
        });
        return;
      }

      // 휴지통 이동에 실패한 게임은 목록에 그대로 남는다.
      // 네트워크 드라이브(NAS)는 휴지통이 없어 항상 여기로 온다
      const failedPaths = data.failed.map((f) => f.path);
      toast.warning(
        `${data.failed.length}개는 휴지통으로 옮기지 못해 삭제하지 않았습니다.`,
        {
          description:
            "네트워크 드라이브처럼 휴지통이 없는 위치이거나 폴더가 사용 중일 수 있습니다. " +
            `영구 삭제하면 복구할 수 없습니다. (${data.failed[0].message})`,
          duration: Infinity,
          action: {
            label: "영구 삭제",
            onClick: () => {
              mutation.mutate({ paths: failedPaths, permanent: true });
            },
          },
        },
      );
    },
    onError: (error) => {
      toast.error(`게임 삭제 실패: ${error}`);
    },
  });

  return mutation;
}
