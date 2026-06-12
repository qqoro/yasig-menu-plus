/**
 * 파일명 리네임 Composable
 *
 * - 리네임 미리보기 Mutation
 * - 리네임 실행 Mutation
 */

import { useMutation, useQueryClient } from "@tanstack/vue-query";
import { toast } from "vue-sonner";
import { queryKeys } from "../queryKeys";

/**
 * 리네임 미리보기 아이템
 */
export interface RenamePreviewItem {
  path: string;
  currentName: string;
  newName: string;
  thumbnail: string | null;
  source: string;
  isCompressFile: boolean;
  status: "ok" | "conflict" | "noChange" | "invalid";
}

/**
 * 리네임 실행 아이템
 */
export interface RenameExecuteItem {
  path: string;
  newName: string;
}

/**
 * 리네임 미리보기 Mutation
 * (useQuery 대신 useMutation — 템플릿 입력 후 수동 실행)
 */
export function usePreviewRename() {
  return useMutation({
    mutationFn: async (template: string): Promise<RenamePreviewItem[]> => {
      const result = await window.api.invoke("previewRename", { template });
      return (result as { items: RenamePreviewItem[] }).items;
    },
  });
}

/**
 * 리네임 실행 Mutation
 */
export function useExecuteRename() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: RenameExecuteItem[]) => {
      return await window.api.invoke("executeRename", { items });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.rename.all });
      const { successCount, failCount } = data as {
        successCount: number;
        failCount: number;
        failedPaths: string[];
        errors: string[];
      };
      if (failCount > 0) {
        toast.warning(`${successCount}개 성공, ${failCount}개 실패`);
      } else {
        toast.success(`${successCount}개 파일명 변경 완료`);
      }
    },
    onError: (error) => {
      toast.error(`파일명 변경 실패: ${error}`);
    },
  });
}
