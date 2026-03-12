/**
 * 게임 핸들러 공통 유틸리티
 *
 * - 관계 데이터 조회 및 맵 생성
 * - 제목 정렬 ORDER BY 구문 생성
 * - Knex 결과 → GameItem 변환
 */

import { db } from "../db/db-manager.js";
import type { SqliteBoolean } from "../db/db.js";
import type { GameItem } from "../events.js";
import type { TitleDisplayMode } from "../store.js";
import { DEFAULT_TITLE_DISPLAY_PRIORITY } from "../store.js";
import { toAbsolutePath } from "../utils/image-path.js";

/**
 * 관계 데이터 조회 및 맵 생성
 */
export async function loadRelationsAndGroup(gamePaths: string[]): Promise<{
  makers: Map<string, string[]>;
  categories: Map<string, string[]>;
  tags: Map<string, string[]>;
}> {
  // 관계 데이터 병렬 조회
  const [makers, categories, tags] = await Promise.all([
    db("gameMakers")
      .join("makers", "gameMakers.makerId", "makers.id")
      .whereIn("gameMakers.gamePath", gamePaths)
      .select("gameMakers.gamePath", "makers.name"),
    db("gameCategories")
      .join("categories", "gameCategories.categoryId", "categories.id")
      .whereIn("gameCategories.gamePath", gamePaths)
      .select("gameCategories.gamePath", "categories.name"),
    db("gameTags")
      .join("tags", "gameTags.tagId", "tags.id")
      .whereIn("gameTags.gamePath", gamePaths)
      .select("gameTags.gamePath", "tags.name"),
  ]);

  // 게임별로 그룹화
  const groupByPath = (
    relations: Array<{ gamePath: string; name: string }>,
  ) => {
    const map = new Map<string, string[]>();
    for (const r of relations) {
      if (!map.has(r.gamePath)) map.set(r.gamePath, []);
      map.get(r.gamePath)!.push(r.name);
    }
    return map;
  };

  return {
    makers: groupByPath(makers as Array<{ gamePath: string; name: string }>),
    categories: groupByPath(
      categories as Array<{ gamePath: string; name: string }>,
    ),
    tags: groupByPath(tags as Array<{ gamePath: string; name: string }>),
  };
}

/**
 * titleDisplayPriority에 따른 ORDER BY COALESCE 구문 생성
 *
 * @param priority - 제목 표시 우선순위 배열
 * @returns ORDER BY에 사용할 COALESCE 표현식
 *
 * @example
 * // ["translated", "collected", "original"]
 * // → "COALESCE(NULLIF(translated_title, ''), NULLIF(title, ''), original_title)"
 */
export function buildTitleOrderParts(priority: TitleDisplayMode[]): string {
  const columnMap: Record<TitleDisplayMode, string> = {
    translated: "translated_title",
    collected: "title",
    original: "original_title",
  };

  // 빈 배열이면 기본 우선순위 사용
  if (priority.length === 0) {
    priority = [...DEFAULT_TITLE_DISPLAY_PRIORITY];
  }

  const parts = priority.map((mode, index, arr) => {
    const column = columnMap[mode];
    // 마지막 항목은 NULLIF 없이 (기본값 역할)
    if (index === arr.length - 1) {
      return column;
    }
    return `NULLIF(${column}, '')`;
  });

  return `COALESCE(${parts.join(", ")})`;
}

/**
 * Knex 결과를 GameItem으로 변환
 */
export function buildGameItems(
  games: Array<{
    path: string;
    title: string;
    originalTitle: string;
    source: string;
    thumbnail: string | null;
    executablePath: string | null;
    isCompressFile: SqliteBoolean;
    publishDate: Date | null;
    translatedTitle: string | null;
    translationSource: string | null;
    rating: number | null;
    isFavorite?: SqliteBoolean;
    isHidden?: SqliteBoolean;
    isClear?: SqliteBoolean;
    provider?: string | null;
    externalId?: string | null;
    lastPlayedAt?: Date | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
  }>,
  relations: {
    makers: Map<string, string[]>;
    categories: Map<string, string[]>;
    tags: Map<string, string[]>;
  },
): GameItem[] {
  return games.map((g) => ({
    path: g.path,
    title: g.title,
    originalTitle: g.originalTitle,
    source: g.source,
    thumbnail: toAbsolutePath(g.thumbnail),
    executablePath: g.executablePath || null,
    isCompressFile: Boolean(g.isCompressFile),
    publishDate: g.publishDate ? new Date(g.publishDate) : null,
    translatedTitle: g.translatedTitle || null,
    translationSource: g.translationSource || null,
    rating: g.rating,
    isFavorite: g.isFavorite !== undefined ? Boolean(g.isFavorite) : undefined,
    isHidden: g.isHidden !== undefined ? Boolean(g.isHidden) : undefined,
    isClear: g.isClear !== undefined ? Boolean(g.isClear) : undefined,
    provider: g.provider || null,
    externalId: g.externalId || null,
    lastPlayedAt: g.lastPlayedAt ? new Date(g.lastPlayedAt) : null,
    createdAt: g.createdAt ? new Date(g.createdAt) : null,
    updatedAt: g.updatedAt ? new Date(g.updatedAt) : null,
    makers: relations.makers.get(g.path) || [],
    categories: relations.categories.get(g.path) || [],
    tags: relations.tags.get(g.path) || [],
  }));
}
