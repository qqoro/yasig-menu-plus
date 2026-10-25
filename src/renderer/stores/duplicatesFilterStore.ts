import { defineStore } from "pinia";
import { ref } from "vue";
import type { DuplicateGroup } from "../types";

export type DuplicateCriterion = DuplicateGroup["type"];

export const DUPLICATE_CRITERIA: DuplicateCriterion[] = [
  "externalId",
  "fingerprint",
  "originalTitle",
];

/**
 * 중복 검사 화면의 범위·기준
 * 다른 화면에 다녀와도 남도록 앱 실행 중에만 유지한다.
 * 라이브러리는 "뺀 경로"로 관리 — 새로 추가한 경로는 기본으로 검사에 포함된다
 */
export const useDuplicatesFilterStore = defineStore("duplicatesFilter", () => {
  const excludedSources = ref<string[]>([]);
  const criteria = ref<DuplicateCriterion[]>([...DUPLICATE_CRITERIA]);

  function toggleSource(path: string): void {
    excludedSources.value = excludedSources.value.includes(path)
      ? excludedSources.value.filter((p) => p !== path)
      : [...excludedSources.value, path];
  }

  function setAllSources(enabled: boolean, paths: string[]): void {
    excludedSources.value = enabled ? [] : [...paths];
  }

  function toggleCriterion(criterion: DuplicateCriterion): void {
    // 순서를 고정해 쿼리 키가 토글 순서에 따라 달라지지 않게 함
    const next = criteria.value.includes(criterion)
      ? criteria.value.filter((c) => c !== criterion)
      : [...criteria.value, criterion];
    criteria.value = DUPLICATE_CRITERIA.filter((c) => next.includes(c));
  }

  return {
    excludedSources,
    criteria,
    toggleSource,
    setAllSources,
    toggleCriterion,
  };
});
