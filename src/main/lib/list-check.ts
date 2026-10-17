/**
 * 목록 대조 로직
 *
 * 붙여넣은 작품 목록을 줄 단위로 나눠 작품 코드를 뽑고, 라이브러리 게임과 대조한다.
 * 코드 인식은 폴더명과 같은 규칙(각 컬렉터의 getId)을 그대로 쓰도록 extractor를 주입받는다.
 */

import { basename } from "path";
import type { TitleDisplayMode } from "../store.js";

/** 코드 추출기 — 컬렉터의 getId를 provider 값과 묶은 것 */
export interface CodeExtractor {
  provider: string;
  getId: (text: string) => Promise<string | undefined>;
}

/** 대조 대상 라이브러리 게임 */
export interface ListCheckLibraryGame {
  path: string;
  title: string | null;
  originalTitle: string | null;
  translatedTitle: string | null;
  provider: string | null;
  externalId: string | null;
  thumbnail: string | null;
  isHidden: boolean;
}

/** 결과 줄에 붙는 보유 게임 정보 */
export interface ListCheckOwnedGame {
  path: string;
  /** 제목 표시 설정(titleDisplayPriority)을 따른 표시 제목 */
  title: string | null;
  thumbnail: string | null;
  isHidden: boolean;
}

export type ListCheckStatus = "owned" | "missing" | "unknown";

/** 대조 결과 한 줄 (같은 코드/같은 줄은 하나로 합쳐짐) */
export interface ListCheckRow {
  /** 처음 등장한 원문 줄 */
  line: string;
  /** 목록 안에서 등장한 횟수 */
  occurrences: number;
  provider: string | null;
  externalId: string | null;
  status: ListCheckStatus;
  /** 보유 판정 근거 (코드 일치 / 제목 완전 일치) */
  matchedBy: "code" | "title" | null;
  games: ListCheckOwnedGame[];
}

/** 웹 페이지 복사 시 섞여 들어오는 폭 없는 문자 (trim으로 지워지지 않음) */
const ZERO_WIDTH_CHARS = /[​-‍⁠]/g;

/** 붙여넣은 텍스트 → 공백 제거된 비어 있지 않은 줄 목록 */
export function splitListLines(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((line) => line.replace(ZERO_WIDTH_CHARS, "").trim())
    .filter((line) => line.length > 0);
}

/** 첫 번째로 인식되는 작품 코드 (컬렉터 우선순위 순) */
export async function extractCode(
  text: string,
  extractors: CodeExtractor[],
): Promise<{ provider: string; externalId: string } | null> {
  for (const extractor of extractors) {
    const id = await extractor.getId(text);
    if (id) return { provider: extractor.provider, externalId: id };
  }
  return null;
}

/** 코드 비교 키 (RJ/rj 대소문자 차이 무시) */
export function codeKey(provider: string, externalId: string): string {
  return `${provider}:${externalId.toUpperCase()}`;
}

/** 제목 비교용 정규화 (대소문자·연속 공백 무시) */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * 제목 표시 우선순위에 따른 표시 제목 (라이브러리 카드와 같은 규칙)
 * original은 폴더/파일명, collected는 수집한 제목, translated는 번역 제목
 */
export function resolveDisplayTitle(
  game: Pick<
    ListCheckLibraryGame,
    "title" | "originalTitle" | "translatedTitle"
  >,
  priority: TitleDisplayMode[],
): string | null {
  const byMode: Record<TitleDisplayMode, string | null> = {
    translated: game.translatedTitle,
    collected: game.title,
    original: game.originalTitle,
  };
  for (const mode of priority) {
    if (byMode[mode]) return byMode[mode];
  }
  return game.originalTitle || game.title;
}

function toOwned(
  game: ListCheckLibraryGame,
  titlePriority: TitleDisplayMode[],
): ListCheckOwnedGame {
  return {
    path: game.path,
    title: resolveDisplayTitle(game, titlePriority),
    thumbnail: game.thumbnail,
    isHidden: game.isHidden,
  };
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** 라이브러리 게임 → 코드 키 / 제목 키 색인 */
async function indexLibrary(
  games: ListCheckLibraryGame[],
  extractors: CodeExtractor[],
): Promise<{
  byCode: Map<string, ListCheckLibraryGame[]>;
  byTitle: Map<string, ListCheckLibraryGame[]>;
}> {
  const byCode = new Map<string, ListCheckLibraryGame[]>();
  const byTitle = new Map<string, ListCheckLibraryGame[]>();

  for (const game of games) {
    // 정보 수집 전 게임은 externalId가 비어 있으므로 폴더명에서 코드를 직접 인식
    const code =
      game.provider && game.externalId
        ? { provider: game.provider, externalId: game.externalId }
        : await extractCode(basename(game.path), extractors);
    if (code) pushTo(byCode, codeKey(code.provider, code.externalId), game);

    const titles = new Set(
      [
        game.title,
        game.originalTitle,
        game.translatedTitle,
        basename(game.path),
      ]
        .filter((t): t is string => !!t && t.trim().length > 0)
        .map(normalizeTitle),
    );
    for (const title of titles) pushTo(byTitle, title, game);
  }

  return { byCode, byTitle };
}

/**
 * 붙여넣은 텍스트를 라이브러리와 대조한다.
 * - 코드가 있는 줄: provider + externalId 일치로 판정
 * - 코드가 없는 줄: 제목(번역/원본/폴더명)이 완전히 같을 때만 보유, 아니면 판별 불가
 * - 코드로 못 찾은 줄도 제목이 완전히 같으면 보유 ("Steampunk 1886"처럼 우연히 코드로 인식된 제목 대응)
 */
export async function buildListCheckRows(
  text: string,
  games: ListCheckLibraryGame[],
  extractors: CodeExtractor[],
  titlePriority: TitleDisplayMode[] = ["translated", "collected", "original"],
): Promise<ListCheckRow[]> {
  const { byCode, byTitle } = await indexLibrary(games, extractors);
  const rows: ListCheckRow[] = [];
  const rowByKey = new Map<string, ListCheckRow>();

  for (const line of splitListLines(text)) {
    const code = await extractCode(line, extractors);
    const key = code
      ? `code|${codeKey(code.provider, code.externalId)}`
      : `line|${normalizeTitle(line)}`;

    const existing = rowByKey.get(key);
    if (existing) {
      existing.occurrences += 1;
      continue;
    }

    const byCodeMatch = code
      ? (byCode.get(codeKey(code.provider, code.externalId)) ?? [])
      : [];
    const byTitleMatch =
      byCodeMatch.length === 0 ? (byTitle.get(normalizeTitle(line)) ?? []) : [];
    const owned = byCodeMatch.length > 0 ? byCodeMatch : byTitleMatch;

    const row: ListCheckRow = {
      line,
      occurrences: 1,
      provider: code?.provider ?? null,
      externalId: code?.externalId ?? null,
      status: owned.length > 0 ? "owned" : code ? "missing" : "unknown",
      matchedBy:
        byCodeMatch.length > 0
          ? "code"
          : byTitleMatch.length > 0
            ? "title"
            : null,
      games: owned.map((game) => toOwned(game, titlePriority)),
    };

    rowByKey.set(key, row);
    rows.push(row);
  }

  return rows;
}
