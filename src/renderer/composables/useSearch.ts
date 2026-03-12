/**
 * 검색 상태 관리 Composable
 *
 * Phase 3:
 * - 검색어, 필터, 정렬 상태 관리
 * - Vue Query를 사용한 검색 데이터 가져오기
 * - 디바운스로 과도한 검색 방지
 * - 검색어 파싱 (고급 검색 문법)
 * - 태그/서클/카테고리 토글
 * - 토글 작업 (즐겨찾기/클리어/숨김)
 * - 무한 스크롤 지원
 */

import {
  ENGLISH_PREFIXES,
  KOREAN_PREFIXES,
  normalizeToEnglish,
} from "@/lib/search-prefix";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/vue-query";
import { computed, ref, toRaw, watch, type Ref } from "vue";
import { queryKeys } from "../queryKeys";
import type { GameItem, SearchQuery } from "../types";

/**
 * 고급 검색 파싱 결과
 */
interface ParsedSearchQuery {
  textQuery?: string;
  provider?: string;
  externalId?: string;
  circles: string[];
  tags: string[];
  categories: string[];
}

/**
 * 고급 검색 문법 파싱
 * 한글/영문 prefix 모두 지원
 */
function parseSearchQuery(query: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    circles: [],
    tags: [],
    categories: [],
  };

  // 한글+영문 prefix 패턴 생성
  const allPrefixes = [...ENGLISH_PREFIXES, ...KOREAN_PREFIXES];
  const prefixPattern = allPrefixes.join("|");
  const prefixRegex = new RegExp(String.raw`(${prefixPattern}):(\S+)`, "g");

  let remainingQuery = query;
  let match;

  while ((match = prefixRegex.exec(query)) !== null) {
    const rawPrefix = match[1];
    const value = match[2];
    // 빈 값은 무시
    if (!value) continue;

    // 한글/영문을 영문으로 정규화
    const normalizedPrefix = normalizeToEnglish(rawPrefix);
    if (!normalizedPrefix) continue;

    if (
      normalizedPrefix === "circle" ||
      normalizedPrefix === "tag" ||
      normalizedPrefix === "category"
    ) {
      const field = `${normalizedPrefix}s` as "circles" | "tags" | "categories";
      result[field].push(value);
    } else if (normalizedPrefix === "provider") {
      result.provider = value;
    } else if (normalizedPrefix === "id") {
      result.externalId = value;
    }

    // 매칭된 부분을 제거
    remainingQuery = remainingQuery.replace(match[0], "");
  }

  // 불완전한 prefix: 형태 제거 (값이 없는 경우)
  remainingQuery = remainingQuery
    .replaceAll(new RegExp(String.raw`(?:${prefixPattern}):(\s|$)`, "g"), "")
    .trim();

  // 남은 텍스트 (공백 제거)
  const trimmed = remainingQuery.trim();
  if (trimmed) {
    result.textQuery = trimmed;
  }

  return result;
}

/**
 * 정규식 특수 문자 escape
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 검색어에서 특정 필터를 토글
 */
function toggleSearchFilter(
  currentQuery: string,
  prefix: string,
  value: string,
): string {
  const filterText = `${prefix}:${value}`;
  const escapedValue = escapeRegex(value);
  // capturing group을 사용하여 앞의 공백을 유지
  const filterRegex = new RegExp(
    `(^|\\s)${prefix}:${escapedValue}(?=\\s|$)`,
    "g",
  );

  if (filterRegex.test(currentQuery)) {
    // 필터가 있으면 제거
    return currentQuery.replace(filterRegex, "").replace(/\s+/g, " ").trim();
  } else {
    // 필터가 없으면 추가
    const trimmed = currentQuery.trim();
    if (trimmed) {
      return `${trimmed} ${filterText}`;
    } else {
      return filterText;
    }
  }
}

/**
 * 검색어가 특정 필터를 포함하는지 확인
 */
function hasSearchFilter(
  currentQuery: string,
  prefix: string,
  value: string,
): boolean {
  const escapedValue = escapeRegex(value);
  const filterRegex = new RegExp(`(?:^|\\s)${prefix}:${escapedValue}(?:\\s|$)`);
  return filterRegex.test(currentQuery);
}

// localStorage 키
const STORAGE_KEY = "searchFilter";

/**
 * localStorage에서 필터 상태 로드
 */
function loadFromStorage(): {
  searchQuery: string;
  filters: {
    showHidden: boolean;
    showFavorites: boolean;
    showCleared: boolean;
    showNotCleared: boolean;
    showCompressed: boolean;
    showNotCompressed: boolean;
    showWithExternalId: boolean;
    showWithoutExternalId: boolean;
  };
  sortBy:
    | "title"
    | "publishDate"
    | "lastPlayedAt"
    | "createdAt"
    | "rating"
    | "playTime"
    | "maker";
  sortOrder: "asc" | "desc";
} | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // 파싱 실패 시 무시
  }
  return null;
}

/**
 * localStorage에 필터 상태 저장
 */
function saveToStorage(
  searchQuery: string,
  filters: {
    showHidden: boolean;
    showFavorites: boolean;
    showCleared: boolean;
    showNotCleared: boolean;
    showCompressed: boolean;
    showNotCompressed: boolean;
    showWithExternalId: boolean;
    showWithoutExternalId: boolean;
  },
  sortBy:
    | "title"
    | "publishDate"
    | "lastPlayedAt"
    | "createdAt"
    | "rating"
    | "playTime"
    | "maker",
  sortOrder: "asc" | "desc",
): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ searchQuery, filters, sortBy, sortOrder }),
    );
  } catch {
    // 저장 실패 시 무시
  }
}

/**
 * useSearch Composable
 */
export function useSearch(sourcePaths: () => string[]) {
  const queryClient = useQueryClient();

  // localStorage에서 저장된 상태 로드
  const stored = loadFromStorage();

  // 검색 상태
  const searchQuery = ref(stored?.searchQuery ?? "");
  const filters = ref<{
    showHidden: boolean;
    showFavorites: boolean;
    showCleared: boolean;
    showNotCleared: boolean;
    showCompressed: boolean;
    showNotCompressed: boolean;
    showWithExternalId: boolean;
    showWithoutExternalId: boolean;
  }>(
    stored?.filters ?? {
      showHidden: false,
      showFavorites: false,
      showCleared: false,
      showNotCleared: false,
      showCompressed: false,
      showNotCompressed: false,
      showWithExternalId: false,
      showWithoutExternalId: false,
    },
  );

  const sortBy = ref<
    | "title"
    | "publishDate"
    | "lastPlayedAt"
    | "createdAt"
    | "rating"
    | "playTime"
    | "maker"
  >(stored?.sortBy ?? "title");
  const sortOrder = ref<"asc" | "desc">(stored?.sortOrder ?? "asc");

  // 상태 변경 시 localStorage에 자동 저장
  watch(
    [searchQuery, filters, sortBy, sortOrder],
    ([newQuery, newFilters, newSortBy, newSortOrder]) => {
      saveToStorage(newQuery, newFilters, newSortBy, newSortOrder);
    },
    { deep: true },
  );

  // Vue Query를 사용한 검색 쿼리 객체
  // toRaw로 감싸서 reactive proxy를 일반 객체로 변환 (structuredClone 호환)
  const searchQueryObj = computed<SearchQuery>(() => ({
    query: searchQuery.value || undefined,
    filters: toRaw(filters.value),
    sortBy: sortBy.value,
    sortOrder: sortOrder.value,
  }));

  // 무한 스크롤 쿼리
  const {
    data: infiniteData,
    isLoading: isSearching,
    error: searchError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: computed(() => [
      "games",
      "search",
      toRaw(searchQueryObj.value),
      toRaw(sourcePaths()),
    ]) as unknown as readonly unknown[],
    queryFn: async ({ pageParam = 0 }) => {
      const searchQueryObjWithPagination: SearchQuery = {
        ...searchQueryObj.value,
        offset: pageParam,
        limit: 20, // 페이지당 20개
      };
      const plainQuery = structuredClone(searchQueryObjWithPagination);
      const result = await window.api.invoke("searchGames", {
        sourcePaths: [...sourcePaths()],
        searchQuery: plainQuery,
      });
      return result as {
        games: GameItem[];
        totalCount: number;
        hasMore: boolean;
      };
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.hasMore) {
        // 다음 페이지 offset 계산
        return allPages.reduce((sum, page) => sum + page.games.length, 0);
      }
      return undefined; // 더 이상 페이지 없음
    },
    staleTime: 1000 * 60 * 5, // 5분
  });

  // 파싱된 검색어
  const parsedQuery = computed(() => {
    if (!searchQuery.value) return null;
    return parseSearchQuery(searchQuery.value);
  });

  // 모든 페이지의 게임을 하나의 배열로 병합
  const games = computed(() => {
    if (!infiniteData.value) return [];
    return infiniteData.value.pages.flatMap((page) => page.games);
  });

  // totalCount는 첫 번째 페이지에서 가져옴
  const totalCount = computed(() => {
    return infiniteData.value?.pages[0]?.totalCount ?? 0;
  });

  // 특수 검색어만 적용한 검색어 문자열 (랜덤 버튼 활성화용)
  const specialOnlyQuery = computed(() => {
    const parsed = parsedQuery.value;
    if (!parsed) return "";

    const parts: string[] = [];
    if (parsed.provider) parts.push(`provider:${parsed.provider}`);
    if (parsed.externalId) parts.push(`id:${parsed.externalId}`);
    for (const circle of parsed.circles) parts.push(`circle:${circle}`);
    for (const tag of parsed.tags) parts.push(`tag:${tag}`);
    for (const category of parsed.categories)
      parts.push(`category:${category}`);

    return parts.join(" ");
  });

  // 특수 검색어만 적용한 결과의 totalCount (랜덤 버튼 활성화용)
  const { data: specialOnlyTotalCountData } = useQuery({
    queryKey: computed(() => [
      "games",
      "count",
      "specialOnly",
      toRaw({
        query: specialOnlyQuery.value,
        filters: toRaw(filters.value),
        sourcePaths: toRaw(sourcePaths()),
      }),
    ]) as unknown as readonly unknown[],
    queryFn: async () => {
      const result = await window.api.invoke("searchGames", {
        sourcePaths: [...sourcePaths()],
        searchQuery: {
          query: specialOnlyQuery.value || undefined,
          filters: toRaw(filters.value),
          offset: 0,
          limit: 0, // totalCount만 필요하므로 0
        },
      });
      return (result as { totalCount: number }).totalCount;
    },
    staleTime: 1000 * 60 * 5, // 5분
  });

  const specialOnlyTotalCount = computed(
    () => specialOnlyTotalCountData.value ?? 0,
  );

  // 즐겨찾기 토글 mutation
  const favoriteMutation = useMutation({
    mutationFn: async (path: string) => {
      const result = await window.api.invoke("toggleFavorite", { path });
      return result as { path: string; field: string; value: boolean };
    },
    onSuccess: () => {
      // 검색 결과 자동 리페칭
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
    },
  });

  // 숨김 토글 mutation
  const hiddenMutation = useMutation({
    mutationFn: async (path: string) => {
      const result = await window.api.invoke("toggleHidden", { path });
      return result as { path: string; field: string; value: boolean };
    },
    onSuccess: () => {
      // 검색 결과 자동 리페칭
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
    },
  });

  // 클리어 토글 mutation
  const clearMutation = useMutation({
    mutationFn: async (path: string) => {
      const result = await window.api.invoke("toggleClear", { path });
      return result as { path: string; field: string; value: boolean };
    },
    onSuccess: () => {
      // 검색 결과 자동 리페칭
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
    },
  });

  // 배치 토글 mutation
  const batchToggleMutation = useMutation({
    mutationFn: async (params: {
      paths: string[];
      field: "is_favorite" | "is_hidden" | "is_clear";
      value: boolean;
    }) => {
      const result = await window.api.invoke("batchToggleGames", params);
      return result as { field: string; updatedCount: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
    },
  });

  // 태그 토글
  function toggleTag(tag: string): void {
    // 띄어쓰기를 _로 변환
    const convertedTag = tag.replace(/\s+/g, "_");
    searchQuery.value = toggleSearchFilter(
      searchQuery.value,
      "tag",
      convertedTag,
    );
  }

  // 서클 토글
  function toggleCircle(circle: string): void {
    // 띄어쓰기를 _로 변환
    const convertedCircle = circle.replace(/\s+/g, "_");
    searchQuery.value = toggleSearchFilter(
      searchQuery.value,
      "circle",
      convertedCircle,
    );
  }

  // 카테고리 토글
  function toggleCategory(category: string): void {
    // 띄어쓰기를 _로 변환
    const convertedCategory = category.replace(/\s+/g, "_");
    searchQuery.value = toggleSearchFilter(
      searchQuery.value,
      "category",
      convertedCategory,
    );
  }

  // 필터 포함 확인
  function hasTag(tag: string): boolean {
    // 띄어쓰기를 _로 변환하여 검사
    const convertedTag = tag.replace(/\s+/g, "_");
    return hasSearchFilter(searchQuery.value, "tag", convertedTag);
  }

  function hasCircle(circle: string): boolean {
    // 띄어쓰기를 _로 변환하여 검사
    const convertedCircle = circle.replace(/\s+/g, "_");
    return hasSearchFilter(searchQuery.value, "circle", convertedCircle);
  }

  function hasCategory(category: string): boolean {
    // 띄어쓰기를 _로 변환하여 검사
    const convertedCategory = category.replace(/\s+/g, "_");
    return hasSearchFilter(searchQuery.value, "category", convertedCategory);
  }

  // 필터 초기화
  function resetFilters(): void {
    searchQuery.value = "";
    filters.value = {
      showHidden: false,
      showFavorites: false,
      showCleared: false,
      showNotCleared: false,
      showCompressed: false,
      showNotCompressed: false,
      showWithExternalId: false,
      showWithoutExternalId: false,
    };
    sortBy.value = "title";
    sortOrder.value = "asc";
  }

  // 활성 필터 개수
  const activeFilterCount = computed(() => {
    let count = 0;
    if (searchQuery.value) count++;
    if (filters.value.showFavorites) count++;
    if (filters.value.showCleared && !filters.value.showNotCleared) count++;
    if (!filters.value.showCleared && filters.value.showNotCleared) count++;
    if (filters.value.showCompressed && !filters.value.showNotCompressed)
      count++;
    if (!filters.value.showCompressed && filters.value.showNotCompressed)
      count++;
    if (
      filters.value.showWithExternalId &&
      !filters.value.showWithoutExternalId
    )
      count++;
    if (
      !filters.value.showWithExternalId &&
      filters.value.showWithoutExternalId
    )
      count++;
    return count;
  });

  return {
    // 상태
    searchQuery,
    filters,
    sortBy: sortBy as Ref<
      | "title"
      | "publishDate"
      | "lastPlayedAt"
      | "createdAt"
      | "rating"
      | "playTime"
      | "maker"
    >,
    sortOrder: sortOrder as Ref<"asc" | "desc">,
    parsedQuery,

    // 검색 결과
    games,
    totalCount,
    specialOnlyTotalCount,
    isSearching,
    searchError,

    // 무한 스크롤 관련
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,

    // 메서드
    toggleTag,
    toggleCircle,
    toggleCategory,
    hasTag,
    hasCircle,
    hasCategory,
    resetFilters,

    // 토글 작업
    toggleFavorite: favoriteMutation.mutateAsync,
    toggleHidden: hiddenMutation.mutateAsync,
    toggleClear: clearMutation.mutateAsync,

    // 토글 작업 상태
    isTogglingFavorite: favoriteMutation.isPending.value,
    isTogglingHidden: hiddenMutation.isPending.value,
    isTogglingClear: clearMutation.isPending.value,

    // 배치 토글 작업
    batchToggle: batchToggleMutation.mutateAsync,
    isBatchToggling: batchToggleMutation.isPending,

    // 기타
    activeFilterCount,
  };
}
