/**
 * 도움말 레드닷 Composable
 * 도움말 섹션 조회 이력을 관리하고 읽지 않은 섹션을 추적
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { queryKeys } from "../queryKeys";

/**
 * 읽은 도움말 섹션 목록 조회
 */
export function useViewedHelpSections() {
  return useQuery({
    queryKey: queryKeys.helpRedDot.all,
    queryFn: async () => {
      const result = await window.api.invoke("getViewedHelpSections");
      return result.sectionIds as string[];
    },
  });
}

/**
 * 도움말 섹션 읽음 표시
 */
export function useMarkHelpSectionViewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sectionId: string) => {
      return await window.api.invoke("markHelpSectionViewed", { sectionId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.helpRedDot.all });
    },
  });
}
