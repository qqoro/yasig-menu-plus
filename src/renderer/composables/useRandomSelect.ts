import { type ComputedRef, type Ref } from "vue";
import { toast } from "vue-sonner";
import { useRandomGameMutation } from "./useGames";
import type { SearchQuery } from "../types";

interface UseRandomSelectOptions {
  activeLibraryPaths: ComputedRef<string[]>;
  searchQuery: Ref<string>;
  filters: ComputedRef<Required<SearchQuery["filters"]>>;
  sortBy: ComputedRef<SearchQuery["sortBy"]>;
  sortOrder: ComputedRef<SearchQuery["sortOrder"]>;
}

export function useRandomSelect({
  activeLibraryPaths,
  searchQuery,
  filters,
  sortBy,
  sortOrder,
}: UseRandomSelectOptions) {
  const randomGameMutation = useRandomGameMutation();

  /**
   * 랜덤 선택 핸들러
   */
  async function handleRandomSelect(): Promise<void> {
    if (!activeLibraryPaths.value || activeLibraryPaths.value.length === 0) {
      toast.warning("라이브러리 경로가 없습니다.");
      return;
    }

    try {
      // 현재 검색어에서 특별 검색어(tag:, circle:, category:, provider:, id:)만 추출
      const currentQuery = searchQuery.value;
      const specialFilters: string[] = [];

      const patterns = [
        /provider:\S+/g,
        /id:\S+/g,
        /circle:\S+/g,
        /tag:\S+/g,
        /category:\S+/g,
      ];

      for (const pattern of patterns) {
        const matches = currentQuery.match(pattern);
        if (matches) {
          specialFilters.push(...matches);
        }
      }

      // 특별 검색어만 포함된 검색어로 DB 조회 (텍스트 검색어 제외)
      const randomQuery =
        specialFilters.length > 0 ? specialFilters.join(" ") : "";

      const result = await randomGameMutation.mutateAsync({
        sourcePaths: activeLibraryPaths.value,
        searchQuery: {
          query: randomQuery || undefined,
          filters: filters.value,
          sortBy: sortBy.value,
          sortOrder: sortOrder.value,
        },
      });

      if (!result.game) {
        toast.warning("랜덤 선택할 게임이 없습니다.");
        return;
      }

      const randomGame = result.game;

      // 번역제목 > 제목 > 원본이름 순서로 검색어 구성
      const newTitle = (
        randomGame.translatedTitle ||
        randomGame.title ||
        randomGame.originalTitle
      ).trim();
      if (specialFilters.length > 0) {
        searchQuery.value = `${specialFilters.join(" ")} ${newTitle}`;
      } else {
        searchQuery.value = newTitle;
      }

      toast.success(`${randomGame.title}을(를) 선택했습니다.`);
    } catch (err) {
      console.error("랜덤 선택 오류:", err);
      toast.error("랜덤 선택에 실패했습니다.");
    }
  }

  return {
    handleRandomSelect,
  };
}
