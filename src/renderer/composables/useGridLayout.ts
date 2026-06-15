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
   *
   * 열 개수는 "줌 레벨 + 그리드 컨테이너 폭"으로 결정되고,
   * 각 열의 카드는 1fr이라 가용 폭에 맞춰 함께 늘었다 줄었다 한다(fluid).
   *
   * 브레이크포인트 기준이 뷰포트(sm/lg)가 아니라 컨테이너(@3xl/@6xl)이므로,
   * 필터 패널을 여닫아 콘텐츠 폭만 바뀌어도 열 수가 알맞게 재조정된다.
   * (@container는 GameGridSection 스크롤 영역에 지정)
   */
  const gridColsClass = computed(() => {
    const level = uiStore.zoomLevel;
    switch (level) {
      case 1:
        return "grid-cols-2 @3xl:grid-cols-3";
      case 2:
        return "grid-cols-2 @3xl:grid-cols-3 @6xl:grid-cols-4";
      case 3:
        return "grid-cols-3 @3xl:grid-cols-4 @6xl:grid-cols-5";
      case 4:
        return "grid-cols-3 @3xl:grid-cols-4 @6xl:grid-cols-5";
      case 5:
        return "grid-cols-4 @3xl:grid-cols-5 @6xl:grid-cols-6";
      case 6:
        return "grid-cols-5 @3xl:grid-cols-6 @6xl:grid-cols-7";
      case 7:
        return "grid-cols-6 @3xl:grid-cols-7 @6xl:grid-cols-8";
      case 8:
        return "grid-cols-7 @3xl:grid-cols-8 @6xl:grid-cols-9";
      case 9:
        return "grid-cols-8 @3xl:grid-cols-9 @6xl:grid-cols-10";
      case 10:
        return "grid-cols-9 @3xl:grid-cols-10 @6xl:grid-cols-11";
      default:
        return "grid-cols-3 @3xl:grid-cols-4 @6xl:grid-cols-5";
    }
  });

  /**
   * 그리드 간격 클래스 계산
   *
   * 카드가 작아질수록(줌 레벨이 높을수록) 카드 사이 간격이
   * 상대적으로 과해 보이므로 갭도 함께 줄인다.
   */
  const gridGapClass = computed(() => {
    const level = uiStore.zoomLevel;
    if (level <= 3) return "gap-4";
    if (level <= 5) return "gap-3";
    if (level <= 7) return "gap-2";
    return "gap-1.5";
  });

  return {
    gridColsClass,
    gridGapClass,
    handleIncreaseZoom,
    handleDecreaseZoom,
  };
}
