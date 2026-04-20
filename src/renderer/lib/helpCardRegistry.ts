/**
 * 도움말 카드 ID 레지스트리
 * 새 카드를 추가하면 자동으로 레드닷이 표시됨
 */

export const HELP_CARDS = {
  "getting-started": [
    "getting-started--library-path",
    "getting-started--first-scan",
    "getting-started--folder-structure",
    "getting-started--auto-collect",
  ],
  "game-management": [
    "game-management--launch",
    "game-management--status-toggle",
    "game-management--multi-select",
    "game-management--sort",
  ],
  collectors: [
    "collectors--auto-rules",
    "collectors--manual-refresh",
    "collectors--collect-results",
  ],
  "search-filter": [
    "search-filter--basic-search",
    "search-filter--special-query",
    "search-filter--autocomplete",
    "search-filter--exclude-search",
    "search-filter--filter-panel",
  ],
  "image-carousel": [
    "image-carousel--open",
    "image-carousel--navigation",
    "image-carousel--add-delete",
  ],
  "game-detail": [
    "game-detail--open",
    "game-detail--metadata-edit",
    "game-detail--tags",
    "game-detail--rating",
    "game-detail--thumbnail",
  ],
  "special-features": [
    "special-features--rpg-cheat",
    "special-features--offline-library",
    "special-features--random-select",
    "special-features--zoom-level",
    "special-features--play-time",
  ],
  dashboard: ["dashboard--overview", "dashboard--duplicates"],
  settings: [
    "settings--theme",
    "settings--translation",
    "settings--excluded-exe",
    "settings--auto-update",
    "settings--debug-export",
  ],
  shortcuts: ["shortcuts--keyboard", "shortcuts--mouse"],
} as const;

/** 전체 카드 ID 플랫 배열 */
export const ALL_CARD_IDS: string[] = Object.values(HELP_CARDS).flat();

/** 섹션 ID 타입 */
export type HelpSectionId = keyof typeof HELP_CARDS;
