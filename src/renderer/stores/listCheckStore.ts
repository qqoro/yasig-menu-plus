import type { ListCheckResultRow } from "@main/events";
import type { ListCheckStatus } from "@main/lib/list-check";
import { defineStore } from "pinia";
import { ref } from "vue";

export type ListCheckFilter = "all" | ListCheckStatus;

/**
 * 목록 대조 화면 상태
 * 게임 상세를 보거나 다른 화면에 다녀와도 입력·결과가 남도록 앱 실행 중에만 유지한다
 */
export const useListCheckStore = defineStore("listCheck", () => {
  const inputText = ref("");
  const rows = ref<ListCheckResultRow[] | null>(null);
  const filter = ref<ListCheckFilter>("missing");
  // 선택은 rows 배열 인덱스로 관리 (탭을 바꿔도 유지)
  const selected = ref(new Set<number>());
  // 대조할 때마다 증가 — 결과 행 key에 섞어 이전 결과의 썸네일 컴포넌트가 재사용되지 않게 함
  const version = ref(0);

  /** 새 대조 결과 반영 — 미보유 줄을 기본 선택하고 미보유 탭부터 보여줌 */
  function setResult(result: ListCheckResultRow[]): void {
    version.value += 1;
    rows.value = result;
    selected.value = new Set(
      result.flatMap((row, i) => (row.status === "missing" ? [i] : [])),
    );
    filter.value = result.some((r) => r.status === "missing")
      ? "missing"
      : "all";
  }

  return { inputText, rows, filter, selected, version, setResult };
});
