/**
 * 태그 숨기기 (스포일러 방지) 판정 로직
 *
 * 숨긴 태그는 표시에서만 빠지고 DB에는 그대로 남는다.
 * 숨긴 흔적(개수, 아이콘)을 남기지 않는 것이 원칙이므로, 화면은 visible만 그린다.
 */

import type { HiddenTagSettings } from "../types";

export interface SplitTagsResult {
  visible: string[];
  hidden: string[];
}

/**
 * 태그 목록을 보이는 태그와 숨긴 태그로 나눈다 (이름 정확히 일치 기준)
 */
export function splitTags(
  tags: readonly string[] | undefined,
  settings: HiddenTagSettings | undefined,
): SplitTagsResult {
  const list = tags ?? [];
  if (!settings) return { visible: [...list], hidden: [] };
  if (settings.hideAll) return { visible: [], hidden: [...list] };

  const hiddenSet = new Set(settings.tags);
  const visible: string[] = [];
  const hidden: string[] = [];
  for (const tag of list) {
    (hiddenSet.has(tag) ? hidden : visible).push(tag);
  }
  return { visible, hidden };
}

/**
 * 숨김 목록에 태그 추가 (공백 제거, 중복·빈 값 무시)
 */
export function addHiddenTag(list: readonly string[], tag: string): string[] {
  const name = tag.trim();
  if (!name || list.includes(name)) return [...list];
  return [...list, name];
}

/**
 * 숨김 목록에서 태그 제거
 */
export function removeHiddenTag(
  list: readonly string[],
  tag: string,
): string[] {
  return list.filter((t) => t !== tag);
}
