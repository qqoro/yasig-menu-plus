/**
 * 다중 선택 상태 관리 Composable
 *
 * 게임 목록에서 여러 게임을 선택하여 일괄 작업을 수행하기 위한 상태 관리
 * - 개별 토글 선택
 * - Shift 범위 선택
 * - 전체 선택/해제
 * - Escape로 선택 해제
 */

import { computed, ref, watch, type Ref } from "vue";

interface SelectableItem {
  path: string;
}

export function useMultiSelect(items: Ref<SelectableItem[]>) {
  const selectedPaths = ref<Set<string>>(new Set());
  const lastSelectedPath = ref<string | null>(null);

  const selectedCount = computed(() => selectedPaths.value.size);
  const isSelectionMode = computed(() => selectedPaths.value.size > 0);
  const isAllSelected = computed(
    () =>
      items.value.length > 0 && selectedPaths.value.size === items.value.length,
  );

  /** 개별 게임 선택/해제 토글 */
  function toggleSelect(path: string): void {
    const newSet = new Set(selectedPaths.value);
    if (newSet.has(path)) {
      newSet.delete(path);
    } else {
      newSet.add(path);
    }
    selectedPaths.value = newSet;
    lastSelectedPath.value = path;
  }

  /** 특정 게임이 선택되었는지 확인 */
  function isSelected(path: string): boolean {
    return selectedPaths.value.has(path);
  }

  /** Shift 범위 선택 */
  function rangeSelect(path: string): void {
    if (!lastSelectedPath.value) {
      toggleSelect(path);
      return;
    }

    const pathList = items.value.map((item) => item.path);
    const startIdx = pathList.indexOf(lastSelectedPath.value);
    const endIdx = pathList.indexOf(path);

    if (startIdx === -1 || endIdx === -1) {
      toggleSelect(path);
      return;
    }

    const from = Math.min(startIdx, endIdx);
    const to = Math.max(startIdx, endIdx);
    const newSet = new Set(selectedPaths.value);

    for (let i = from; i <= to; i++) {
      newSet.add(pathList[i]);
    }

    selectedPaths.value = newSet;
    lastSelectedPath.value = path;
  }

  /** 전체 선택 */
  function selectAll(): void {
    selectedPaths.value = new Set(items.value.map((item) => item.path));
  }

  /** 선택 해제 */
  function clearSelection(): void {
    selectedPaths.value = new Set();
    lastSelectedPath.value = null;
  }

  /** 선택된 게임 경로 배열 반환 */
  const selectedPathsArray = computed(() => [...selectedPaths.value]);

  // 게임 목록 변경 시 존재하지 않는 선택 정리
  watch(
    () => items.value,
    (newItems) => {
      const validPaths = new Set(newItems.map((item) => item.path));
      const cleaned = new Set(
        [...selectedPaths.value].filter((p) => validPaths.has(p)),
      );
      if (cleaned.size !== selectedPaths.value.size) {
        selectedPaths.value = cleaned;
      }
    },
  );

  return {
    selectedPaths,
    selectedCount,
    isSelectionMode,
    isAllSelected,
    selectedPathsArray,
    toggleSelect,
    isSelected,
    rangeSelect,
    selectAll,
    clearSelection,
  };
}

export type UseMultiSelectReturn = ReturnType<typeof useMultiSelect>;
