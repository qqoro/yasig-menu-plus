import {
  ALL_CARD_IDS,
  HELP_CARDS,
  type HelpSectionId,
} from "./helpCardRegistry.js";

export interface SearchEntry {
  cardId: string;
  sectionId: string;
  sectionLabel: string;
  title: string;
  body: string;
}

export interface SearchResult {
  cardId: string;
  sectionId: string;
  sectionLabel: string;
  title: string;
  snippet: string;
}

const SECTION_LABELS: Record<HelpSectionId, string> = {
  "getting-started": "시작하기",
  "game-management": "게임 관리",
  collectors: "썸네일 수집",
  "search-filter": "검색과 필터링",
  "image-carousel": "이미지 캐러셀",
  "game-detail": "게임 상세 정보",
  "special-features": "특별 기능",
  dashboard: "대시보드",
  settings: "설정 안내",
  shortcuts: "단축키",
};

function getSectionId(cardId: string): string {
  for (const [sectionId, cardIds] of Object.entries(HELP_CARDS)) {
    if ((cardIds as readonly string[]).includes(cardId)) {
      return sectionId;
    }
  }
  return "";
}

/**
 * DOM에서 도움말 카드 검색 인덱스 구축
 */
export function buildSearchIndex(contentEl: HTMLElement): SearchEntry[] {
  return ALL_CARD_IDS.map((cardId) => {
    const el = document.getElementById(cardId);
    if (!el || !contentEl.contains(el)) return null;

    const sectionId = getSectionId(cardId);
    const titleEl = el.querySelector("[data-slot='card-title']");
    const bodyEl = el.querySelector("[data-slot='card-content']");

    return {
      cardId,
      sectionId,
      sectionLabel: SECTION_LABELS[sectionId as HelpSectionId] ?? "",
      title: titleEl?.textContent?.trim() ?? "",
      body: bodyEl?.textContent?.trim() ?? "",
    };
  }).filter((entry): entry is SearchEntry => entry !== null);
}

/**
 * 검색 인덱스에서 쿼리에 매칭되는 결과 반환
 */
export function searchEntries(
  entries: SearchEntry[],
  query: string,
): SearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const lowerQuery = trimmed.toLowerCase();

  return entries
    .map((entry) => {
      const titleLower = entry.title.toLowerCase();
      const bodyLower = entry.body.toLowerCase();

      const titleMatch = titleLower.includes(lowerQuery);
      const bodyMatchIndex = bodyLower.indexOf(lowerQuery);

      if (!titleMatch && bodyMatchIndex === -1) return null;

      const snippet = buildSnippet(
        entry.body,
        bodyMatchIndex >= 0 ? bodyMatchIndex : -1,
        lowerQuery.length,
      );

      return {
        cardId: entry.cardId,
        sectionId: entry.sectionId,
        sectionLabel: entry.sectionLabel,
        title: entry.title,
        snippet,
      };
    })
    .filter((result): result is SearchResult => result !== null);
}

/**
 * 매칭 위치 기준 텍스트 스니펫 생성
 */
function buildSnippet(
  text: string,
  matchIndex: number,
  matchLength: number,
  context = 30,
): string {
  if (!text) return "";
  if (matchIndex === -1) {
    return text.slice(0, 60) + (text.length > 60 ? "..." : "");
  }

  const start = Math.max(0, matchIndex - context);
  const end = Math.min(text.length, matchIndex + matchLength + context);

  let snippet = text.slice(start, end);
  if (start > 0) snippet = "..." + snippet;
  if (end < text.length) snippet += "...";

  return snippet;
}
