import { onMounted, onUnmounted, type Ref } from "vue";

export function useHomeKeyboard(options: {
  searchBarRef: Ref<{ focus: () => void } | null>;
  multiSelect: {
    selectAll: () => void;
    clearSelection: () => void;
    isSelectionMode: Ref<boolean>;
  };
  toggleSelectAll: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomLevel: Ref<number>;
}) {
  // Ctrl+휠로 줌 조절
  function handleWheel(event: WheelEvent): void {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();

      if (event.deltaY < 0 && options.zoomLevel.value > 1) {
        options.zoomOut(); // 위로 스크롤: 축소 (내용이 더 적게 보임)
      } else if (event.deltaY > 0 && options.zoomLevel.value < 10) {
        options.zoomIn(); // 아래로 스크롤: 확대
      }
    }
  }

  // Ctrl+F로 검색창 포커스, Ctrl+A로 전체 선택, Escape로 선택 해제
  function handleKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === "f") {
      event.preventDefault();
      options.searchBarRef.value?.focus();
    }
    // Ctrl+A: 전체 선택
    if ((event.ctrlKey || event.metaKey) && event.key === "a") {
      if (document.activeElement?.tagName === "INPUT") return;
      event.preventDefault();
      options.toggleSelectAll();
    }
    // Escape: 선택 해제
    if (event.key === "Escape" && options.multiSelect.isSelectionMode.value) {
      event.preventDefault();
      options.multiSelect.clearSelection();
    }
  }

  onMounted(() => {
    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("keydown", handleKeydown);
  });

  onUnmounted(() => {
    window.removeEventListener("wheel", handleWheel);
    window.removeEventListener("keydown", handleKeydown);
  });
}
