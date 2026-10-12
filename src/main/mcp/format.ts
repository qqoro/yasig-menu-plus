/**
 * MCP 응답용 게임 요약 변환
 *
 * GameItem에는 UI 전용 필드(pathMatched, sessionStartAt 등)가 섞여 있어
 * AI가 읽을 필드만 추려 돌려준다. 날짜는 ISO 8601 문자열로 통일한다.
 */

import type { GameDetailItem, GameItem } from "../events.js";

export interface GameSummary {
  path: string;
  title: string;
  originalTitle: string;
  translatedTitle: string | null;
  publishDate: string | null;
  provider: string | null;
  externalId: string | null;
  makers: string[];
  categories: string[];
  tags: string[];
  rating: number | null;
  isFavorite: boolean;
  isHidden: boolean;
  isClear: boolean;
  totalPlayTime: number; // 초
  lastPlayedAt: string | null;
  hasExecutable: boolean;
  executablePath: string | null;
  thumbnail: boolean; // 썸네일 유무
}

export interface GameDetailSummary extends GameSummary {
  memo: string | null;
  source: string;
  isCompressFile: boolean;
  createdAt: string | null;
  updatedAt: string | null;
  externalRating: number | null;
  externalReviewCount: number | null;
  downloadCount: number | null;
}

/**
 * Date → ISO 문자열 (null 유지)
 */
function toIso(value: Date | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

export function toGameSummary(game: GameItem): GameSummary {
  return {
    path: game.path,
    title: game.title,
    originalTitle: game.originalTitle,
    translatedTitle: game.translatedTitle ?? null,
    publishDate: toIso(game.publishDate),
    provider: game.provider ?? null,
    externalId: game.externalId ?? null,
    makers: game.makers,
    categories: game.categories,
    tags: game.tags,
    rating: game.rating ?? null,
    isFavorite: Boolean(game.isFavorite),
    isHidden: Boolean(game.isHidden),
    isClear: Boolean(game.isClear),
    totalPlayTime: game.totalPlayTime ?? 0,
    lastPlayedAt: toIso(game.lastPlayedAt),
    hasExecutable: game.hasExecutable,
    executablePath: game.executablePath,
    thumbnail: game.thumbnail !== null,
  };
}

export function toGameDetailSummary(game: GameDetailItem): GameDetailSummary {
  return {
    ...toGameSummary(game),
    memo: game.memo,
    source: game.source,
    isCompressFile: game.isCompressFile,
    createdAt: toIso(game.createdAt),
    updatedAt: toIso(game.updatedAt),
    externalRating: game.externalRating ?? null,
    externalReviewCount: game.externalReviewCount ?? null,
    downloadCount: game.downloadCount ?? null,
  };
}

// YYYY-MM-DD 또는 날짜+시각(+오프셋)만 허용
const ISO_DATE_PATTERN =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * ISO 8601 문자열을 Date로 변환
 *
 * updateGameMetadata는 받은 값을 그대로 저장하고, getGameDetail의 날짜 변환은
 * Date/숫자만 처리하므로 문자열을 그대로 넘기면 상세 조회에서 null이 된다.
 * @throws {Error} 형식이 틀리거나 존재하지 않는 날짜
 */
export function parseIsoDate(value: string): Date {
  const message = "발매일 형식이 올바르지 않습니다 (YYYY-MM-DD 또는 ISO 8601).";
  if (!ISO_DATE_PATTERN.test(value)) {
    throw new Error(message);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(message);
  }
  // "2024-13-45", "2024-02-30T10:00:00Z"처럼 Date가 관대하게 받아들이는 값을 걸러낸다
  const [datePart] = value.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error(message);
  }
  return date;
}
