import { computed } from "vue";
import { useUIStore } from "../stores/uiStore";

export function useGridLayout() {
  const uiStore = useUIStore();

  /**
   * 줌 레벨 증가 핸들러
   */
  function handleIncreaseZoom(): void {
    uiStore.increaseZoom();
  }

  /**
   * 줌 레벨 감소 핸들러
   */
  function handleDecreaseZoom(): void {
    uiStore.decreaseZoom();
  }

  /**
   * 그리드 컬럼 클래스 계산
   */
  const gridColsClass = computed(() => {
    const level = uiStore.zoomLevel;
    switch (level) {
      case 1:
        return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3";
      case 2:
        return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
      case 3:
        return "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5";
      case 4:
        return "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5";
      case 5:
        return "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6";
      case 6:
        return "grid-cols-5 sm:grid-cols-6 lg:grid-cols-7";
      case 7:
        return "grid-cols-6 sm:grid-cols-7 lg:grid-cols-8";
      case 8:
        return "grid-cols-7 sm:grid-cols-8 lg:grid-cols-9";
      case 9:
        return "grid-cols-8 sm:grid-cols-9 lg:grid-cols-10";
      case 10:
        return "grid-cols-9 sm:grid-cols-10 lg:grid-cols-11";
      default:
        return "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5";
    }
  });

  return {
    gridColsClass,
    handleIncreaseZoom,
    handleDecreaseZoom,
  };
}
