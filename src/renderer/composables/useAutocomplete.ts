/**
 * 자동완성 Composable
 *
 * SmartSearchInput.vue 패턴을 적용한 단순화된 자동완성
 * - computed 기반 파싱 (currentPrefix, currentSearchTerm)
 * - currentTerms Set으로 중복 제거
 * - Vue Query를 사용한 비동기 자동완성
 */

import { ALL_VALID_PREFIXES } from "@/lib/search-prefix";
import { useQuery } from "@tanstack/vue-query";
import { computed, ref } from "vue";

type AutocompletePrefix =
  | "tag"
  | "circle"
  | "category"
  | "provider"
  | "id"
  | "태그"
  | "서클"
  | "카테고리"
  | "제공자"
  | "아이디"
  | null;

/**
 * useAutocomplete Composable
 */
export function useAutocomplete() {
  // 자동완성 상태
  const inputValue = ref("");
  const selectedIndex = ref(0);
  const showAutocomplete = ref(false);
  const isFocused = ref(false);

  // 현재 입력된 prefix (예: "tag", "circle", "태그", "서클" 등)
  const currentPrefix = computed((): AutocompletePrefix => {
    const lastSpaceIndex = inputValue.value.lastIndexOf(" ");
    let lastWord = inputValue.value.substring(lastSpaceIndex + 1);
    // 제외 검색 prefix(-tag:) 인식: 앞의 - 제거 후 확인
    if (lastWord.startsWith("-")) {
      lastWord = lastWord.substring(1);
    }
    const colonIndex = lastWord.indexOf(":");
    if (colonIndex > -1) {
      const prefix = lastWord.substring(0, colonIndex);
      // 한글/영문 모두 유효한 prefix로 인식 (원본 유지)
      if (ALL_VALID_PREFIXES.includes(prefix)) {
        return prefix as AutocompletePrefix;
      }
    }
    return null;
  });

  // 현재 검색어 (prefix 제외)
  const currentSearchTerm = computed(() => {
    const lastSpaceIndex = inputValue.value.lastIndexOf(" ");
    let lastWord = inputValue.value.substring(lastSpaceIndex + 1);
    // 제외 검색 prefix에서 - 제거
    if (lastWord.startsWith("-")) {
      lastWord = lastWord.substring(1);
    }
    const colonIndex = lastWord.indexOf(":");
    if (colonIndex > -1) {
      return lastWord.substring(colonIndex + 1);
    }
    return lastWord;
  });

  // 이미 선택된 값 목록 (중복 제거용)
  const currentTerms = computed(() => {
    return new Set(
      inputValue.value
        .toLowerCase()
        .split(" ")
        .filter((s) => s.length > 0),
    );
  });

  // Vue Query를 사용한 자동완성
  const { data: suggestionsData, isLoading: isLoadingSuggestions } = useQuery({
    queryKey: ["autocomplete", currentPrefix, currentSearchTerm] as const,
    queryFn: async () => {
      const result = await window.api.invoke("getAutocompleteSuggestions", {
        prefix: currentPrefix.value || "",
        query: currentSearchTerm.value,
      });
      return result as { prefix: string; query: string; suggestions: string[] };
    },
    enabled: computed(() => inputValue.value.length > 0),
    staleTime: 1000 * 60 * 5, // 5분
  });

  // 이미 사용된 prefix 목록 추출
  const usedPrefixes = computed(() => {
    const used = new Set<string>();
    const words = inputValue.value.toLowerCase().split(/\s+/);
    for (let word of words) {
      // 제외 검색 prefix에서 - 제거
      if (word.startsWith("-")) word = word.substring(1);
      const colonIndex = word.indexOf(":");
      if (colonIndex > 0) {
        used.add(word.substring(0, colonIndex));
      }
    }
    return used;
  });

  // 자동완성 제안 목록 (이미 선택된 값 제외)
  const suggestions = computed(() => {
    const rawSuggestions = suggestionsData.value?.suggestions ?? [];
    // 이미 선택된 값 필터링
    return rawSuggestions.filter((suggestion) => {
      // prefix 제안 단계 (suggestion이 "tag:" 형태)
      if (suggestion.endsWith(":")) {
        const prefixName = suggestion.slice(0, -1).toLowerCase();
        // 이미 사용된 prefix는 제외
        return !usedPrefixes.value.has(prefixName);
      }
      // prefix가 있는 경우 "tag:RPG" 형태로 비교
      if (currentPrefix.value) {
        const key = `${currentPrefix.value}:${suggestion}`.toLowerCase();
        return !currentTerms.value.has(key);
      }
      return true;
    });
  });

  /**
   * 입력 값 처리 (외부에서 호출)
   */
  function handleInput(value: string): void {
    inputValue.value = value;
    if (value.length > 0) {
      showAutocomplete.value = true;
      selectedIndex.value = 0;
    } else {
      showAutocomplete.value = false;
    }
  }

  /**
   * 자동완성 항목 선택 - SmartSearchInput 패턴 적용
   */
  function selectSuggestion(currentValue: string, suggestion: string): string {
    const lastSpaceIndex = currentValue.lastIndexOf(" ");
    if (lastSpaceIndex > -1) {
      // 마지막 단어를 선택한 제안으로 교체
      return `${currentValue.substring(0, lastSpaceIndex + 1)}${suggestion}`;
    }
    return suggestion;
  }

  /**
   * 키보드 네비게이션
   */
  function handleKeyDown(event: KeyboardEvent): void {
    // Tab 키는 자동완성 팝업이 열려있고 항목이 있을 때만 처리
    if (event.key === "Tab") {
      if (showAutocomplete.value && suggestions.value.length > 0) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }

    if (!showAutocomplete.value || suggestions.value.length === 0) return;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        selectedIndex.value =
          (selectedIndex.value + 1) % suggestions.value.length;
        break;
      case "ArrowUp":
        event.preventDefault();
        selectedIndex.value =
          selectedIndex.value === 0
            ? suggestions.value.length - 1
            : selectedIndex.value - 1;
        break;
      case "Enter":
        event.preventDefault();
        // 실제 선택은 SearchBar에서 처리
        break;
      case "Escape":
        event.preventDefault();
        showAutocomplete.value = false;
        break;
    }
  }

  /**
   * 자동완성 표시 (Ctrl+Space)
   */
  function showAutocompleteAtCursor(currentValue: string): void {
    inputValue.value = currentValue;
    showAutocomplete.value = true;
    selectedIndex.value = 0;
  }

  /**
   * 팝업 닫기
   */
  function closeAutocomplete(): void {
    showAutocomplete.value = false;
  }

  /**
   * 자동완성 초기화
   */
  function resetAutocomplete(): void {
    inputValue.value = "";
    showAutocomplete.value = false;
    selectedIndex.value = 0;
  }

  return {
    // 상태
    showAutocomplete,
    inputValue,
    selectedIndex,
    isFocused,
    currentPrefix,
    currentSearchTerm,

    // 데이터
    suggestions,
    isLoadingSuggestions,

    // 메서드
    handleInput,
    selectSuggestion,
    handleKeyDown,
    closeAutocomplete,
    resetAutocomplete,
    showAutocompleteAtCursor,
  };
}
