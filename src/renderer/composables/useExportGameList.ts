/**
 * 게임 목록 내보내기 Composable
 * Vue Query 기반 미리보기 조회 + TSV 내보내기 Mutation
 */

import { useMutation, useQuery } from "@tanstack/vue-query";
import type { Ref } from "vue";
import type { ExportColumnId } from "@main/lib/export-columns";

/**
 * 미리보기 게임 목록 조회 (제목순 상위 5개)
 * 다이얼로그 열려 있는 동안만 활성화
 */
export function useGameExportPreview(enabled: Ref<boolean>) {
  return useQuery({
    queryKey: ["gameExportPreview"],
    queryFn: () => window.api.invoke("getGameExportPreview"),
    enabled,
  });
}

/**
 * 게임 목록 TSV 내보내기 Mutation
 * 저장 다이얼로그 취소 시 null 반환 (성공 아님)
 */
export function useExportGameList() {
  return useMutation({
    mutationFn: (payload: {
      columns: ExportColumnId[];
      includeHeader: boolean;
    }) =>
      // 반응형 프록시 배열은 structured clone이 불가하므로 평범한 배열로 정화 (CLAUDE.md IPC 규칙)
      window.api.invoke("exportGameList", {
        columns: [...payload.columns],
        includeHeader: payload.includeHeader,
      }),
  });
}
