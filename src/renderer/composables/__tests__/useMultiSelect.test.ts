import { describe, it, expect, beforeEach } from "vitest";
import { type Ref, nextTick, ref } from "vue";
import { useMultiSelect } from "../useMultiSelect";

describe("useMultiSelect", () => {
  let games: Ref<{ path: string }[]>;
  let multiSelect: ReturnType<typeof useMultiSelect>;

  beforeEach(() => {
    games = ref([
      { path: "/game/1" },
      { path: "/game/2" },
      { path: "/game/3" },
      { path: "/game/4" },
      { path: "/game/5" },
    ]);
    multiSelect = useMultiSelect(games);
  });

  it("초기 상태에서 선택된 게임이 없어야 한다", () => {
    expect(multiSelect.selectedPaths.value.size).toBe(0);
    expect(multiSelect.isSelectionMode.value).toBe(false);
    expect(multiSelect.selectedCount.value).toBe(0);
  });

  it("게임을 토글 선택할 수 있다", () => {
    multiSelect.toggleSelect("/game/1");
    expect(multiSelect.selectedPaths.value.has("/game/1")).toBe(true);
    expect(multiSelect.selectedCount.value).toBe(1);
    expect(multiSelect.isSelectionMode.value).toBe(true);

    multiSelect.toggleSelect("/game/1");
    expect(multiSelect.selectedPaths.value.has("/game/1")).toBe(false);
    expect(multiSelect.selectedCount.value).toBe(0);
  });

  it("전체 선택/해제가 가능하다", () => {
    multiSelect.selectAll();
    expect(multiSelect.selectedCount.value).toBe(5);
    expect(multiSelect.isAllSelected.value).toBe(true);

    multiSelect.clearSelection();
    expect(multiSelect.selectedCount.value).toBe(0);
    expect(multiSelect.isSelectionMode.value).toBe(false);
  });

  it("isSelected가 올바르게 동작한다", () => {
    multiSelect.toggleSelect("/game/2");
    expect(multiSelect.isSelected("/game/2")).toBe(true);
    expect(multiSelect.isSelected("/game/3")).toBe(false);
  });

  it("Shift 범위 선택이 동작한다", () => {
    multiSelect.toggleSelect("/game/2");
    multiSelect.rangeSelect("/game/4");
    expect(multiSelect.isSelected("/game/2")).toBe(true);
    expect(multiSelect.isSelected("/game/3")).toBe(true);
    expect(multiSelect.isSelected("/game/4")).toBe(true);
    expect(multiSelect.isSelected("/game/1")).toBe(false);
    expect(multiSelect.isSelected("/game/5")).toBe(false);
  });

  it("게임 목록이 변경되면 존재하지 않는 선택이 정리된다", async () => {
    multiSelect.toggleSelect("/game/1");
    multiSelect.toggleSelect("/game/5");
    expect(multiSelect.selectedCount.value).toBe(2);

    games.value = [{ path: "/game/1" }, { path: "/game/2" }];
    await nextTick();
    expect(multiSelect.selectedCount.value).toBe(1);
    expect(multiSelect.isSelected("/game/1")).toBe(true);
    expect(multiSelect.isSelected("/game/5")).toBe(false);
  });
});
