import { ref } from "vue";
import { toast } from "vue-sonner";
import { useDeleteGames } from "./useDuplicates";
import type { GameItem } from "../types";
import type { SearchState } from "./useSearch";
import type { UseMultiSelectReturn } from "./useMultiSelect";

interface UseHomeBatchActionsOptions {
  searchState: SearchState;
  multiSelect: UseMultiSelectReturn;
}

export function useHomeBatchActions({
  searchState,
  multiSelect,
}: UseHomeBatchActionsOptions) {
  const deleteGamesMutation = useDeleteGames();
  const showBatchDeleteConfirm = ref(false);

  /**
   * 배치 토글 핸들러
   */
  async function handleBatchToggle(
    field: "is_favorite" | "is_hidden" | "is_clear",
    value: boolean,
  ): Promise<void> {
    const paths = multiSelect.selectedPathsArray.value;
    if (paths.length === 0) return;

    try {
      const result = await searchState.batchToggle({ paths, field, value });
      const fieldNames = {
        is_favorite: value ? "즐겨찾기 추가" : "즐겨찾기 해제",
        is_hidden: value ? "숨기기" : "숨김 해제",
        is_clear: value ? "클리어 표시" : "클리어 해제",
      };
      toast.success(
        `${result.updatedCount}개의 게임을 ${fieldNames[field]}했습니다.`,
      );
      multiSelect.clearSelection();
    } catch (err) {
      console.error("배치 토글 실패:", err);
      toast.error(
        err instanceof Error ? err.message : "일괄 작업에 실패했습니다.",
      );
    }
  }

  /**
   * 배치 삭제 요청 핸들러
   */
  function handleBatchDeleteRequest(): void {
    if (multiSelect.selectedCount.value === 0) return;
    showBatchDeleteConfirm.value = true;
  }

  /**
   * 배치 삭제 확정 핸들러
   */
  async function handleBatchDeleteConfirm(): Promise<void> {
    const paths = multiSelect.selectedPathsArray.value;
    if (paths.length === 0) return;

    try {
      await deleteGamesMutation.mutateAsync(paths);
      multiSelect.clearSelection();
    } catch (err) {
      console.error("배치 삭제 실패:", err);
    }
  }

  /**
   * 게임 카드 선택 핸들러
   */
  function handleGameSelect(game: GameItem, event: MouseEvent): void {
    if (event.shiftKey) {
      multiSelect.rangeSelect(game.path);
    } else {
      multiSelect.toggleSelect(game.path);
    }
  }

  /**
   * 전체 선택/해제 토글 핸들러
   */
  function handleToggleSelectAll(): void {
    if (multiSelect.isAllSelected.value) {
      multiSelect.clearSelection();
    } else {
      multiSelect.selectAll();
    }
  }

  return {
    showBatchDeleteConfirm,
    handleBatchToggle,
    handleBatchDeleteRequest,
    handleBatchDeleteConfirm,
    handleGameSelect,
    handleToggleSelectAll,
  };
}
