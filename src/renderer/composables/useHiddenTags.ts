/**
 * 태그 숨기기 (스포일러 방지) Composable
 *
 * 설정의 hiddenTagSettings를 읽어 태그 표시 여부를 판정하고,
 * 숨김 목록 추가/제거·전체 숨기기 전환을 제공한다.
 */

import { useQuery } from "@tanstack/vue-query";
import { computed, type Ref } from "vue";
import { addHiddenTag, removeHiddenTag, splitTags } from "../lib/hidden-tags";
import { queryKeys } from "../queryKeys";
import type { HiddenTagSettings } from "../types";
import { useAllSettings, useUpdateSettings } from "./useAllSettings";

const DEFAULT_SETTINGS: HiddenTagSettings = { hideAll: false, tags: [] };

/**
 * 태그 숨김 판정 (표시용 컴포넌트에서 사용)
 */
export function useHiddenTags() {
  const { data: settings } = useAllSettings();

  const hiddenTagSettings = computed<HiddenTagSettings>(
    () => settings.value?.hiddenTagSettings ?? DEFAULT_SETTINGS,
  );
  const hideAll = computed(() => hiddenTagSettings.value.hideAll);

  /** 화면에 그릴 태그만 반환 (숨긴 흔적을 남기지 않기 위해 visible만 노출) */
  function visibleTags(tags: readonly string[] | undefined): string[] {
    return splitTags(tags, hiddenTagSettings.value).visible;
  }

  /** 숨긴 태그만 반환 (상세 편집의 "숨긴 태그 보기" 전용) */
  function hiddenTags(tags: readonly string[] | undefined): string[] {
    return splitTags(tags, hiddenTagSettings.value).hidden;
  }

  return { hiddenTagSettings, hideAll, visibleTags, hiddenTags };
}

/**
 * 태그 숨기기 설정 변경 (설정 화면에서 사용)
 */
export function useUpdateHiddenTags() {
  const { hiddenTagSettings } = useHiddenTags();
  const updateSettingsMutation = useUpdateSettings();

  function save(next: Partial<HiddenTagSettings>) {
    const current = hiddenTagSettings.value;
    // 캐시의 tags는 반응형 Proxy라 그대로 넘기면 IPC 직렬화가 실패한다 → 일반 배열로 복사
    updateSettingsMutation.mutate({
      hiddenTagSettings: {
        hideAll: next.hideAll ?? current.hideAll,
        tags: [...(next.tags ?? current.tags)],
      },
    });
  }

  return {
    setHideAll: (value: boolean) => save({ hideAll: value }),
    addTag: (tag: string) =>
      save({ tags: addHiddenTag(hiddenTagSettings.value.tags, tag) }),
    removeTag: (tag: string) =>
      save({ tags: removeHiddenTag(hiddenTagSettings.value.tags, tag) }),
  };
}

/**
 * 라이브러리 태그 자동완성 (부분 일치, 검색창 tag: 자동완성과 같은 쿼리)
 */
export function useTagSuggestions(query: Ref<string>) {
  const trimmed = computed(() => query.value.trim());

  return useQuery({
    queryKey: queryKeys.autocomplete.hiddenTagSuggestions(trimmed),
    queryFn: async () => {
      const result = await window.api.invoke("getAutocompleteSuggestions", {
        prefix: "tag",
        query: trimmed.value,
      });
      return result.suggestions;
    },
    enabled: computed(() => trimmed.value.length > 0),
    staleTime: 1000 * 60 * 5, // 5분
  });
}
