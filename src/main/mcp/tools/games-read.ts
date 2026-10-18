/**
 * 조회 툴: search_games, get_game, list_tags, list_makers, list_categories,
 * get_game_images, find_duplicates, export_game_list
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "../../db/db-manager.js";
import type { DuplicateGroup } from "../../events.js";
import { findDuplicates } from "../../handlers/duplicates.js";
import { getGameDetail } from "../../handlers/gameDetail.js";
import { getGameImages } from "../../handlers/gameImages.js";
import { searchGames } from "../../handlers/home-search.js";
import { getAllGamesForExport } from "../../handlers/exportGameList.js";
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  type ExportColumnId,
} from "../../lib/export-columns.js";
import {
  buildTsvRows,
  exportColumnLabels,
  rowsToTsv,
} from "../../lib/export-format.js";
import {
  toGameDetailSummary,
  toGameSummary,
  type GameDetailSummary,
  type GameSummary,
} from "../format.js";
import { getActiveLibraryPaths } from "../library-paths.js";
import { runTool } from "../tool-result.js";

// ========== search_games ==========

const SORT_BY = [
  "title",
  "publishDate",
  "lastPlayedAt",
  "createdAt",
  "rating",
  "externalRating",
  "playTime",
  "maker",
  "downloadCount",
  "size",
] as const;

export const searchGamesInput = {
  query: z
    .string()
    .max(500)
    .optional()
    .describe(
      "Same syntax as the app search box. Prefixes: tag:, circle:, category:, provider:, id:. Korean prefixes also work.",
    ),
  filters: z
    .object({
      showHidden: z.boolean().optional().describe("true = only hidden games"),
      showFavorites: z.boolean().optional(),
      showNotFavorites: z.boolean().optional(),
      showCleared: z.boolean().optional(),
      showNotCleared: z.boolean().optional(),
      showCompressed: z.boolean().optional(),
      showNotCompressed: z.boolean().optional(),
      showWithExternalId: z.boolean().optional(),
      showWithoutExternalId: z.boolean().optional(),
      providers: z
        .array(z.string())
        .optional()
        .describe("dlsite / steam / getchu / cien / vndb. Empty = all"),
    })
    .optional(),
  sortBy: z.enum(SORT_BY).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
};

/** zod 스키마에서 파생한 입력 타입 (기본값 적용 후이므로 limit/offset은 필수) */
type SearchGamesInput = z.output<
  ReturnType<typeof z.object<typeof searchGamesInput>>
>;

export interface SearchGamesOutput {
  total: number;
  offset: number;
  limit: number;
  games: GameSummary[];
}

export async function searchGamesTool(
  input: SearchGamesInput,
): Promise<SearchGamesOutput> {
  const result = await searchGames({
    sourcePaths: getActiveLibraryPaths(),
    searchQuery: {
      query: input.query,
      filters: input.filters ?? {},
      sortBy: input.sortBy,
      sortOrder: input.sortOrder,
      limit: input.limit,
      offset: input.offset,
    },
  });
  return {
    total: result.totalCount,
    offset: input.offset,
    limit: input.limit,
    games: result.games.map(toGameSummary),
  };
}

// ========== get_game ==========

export const pathInput = {
  path: z
    .string()
    .min(1)
    .describe("Game path (primary key) as returned by search_games"),
};

export async function getGameTool(input: {
  path: string;
}): Promise<GameDetailSummary> {
  const game = await getGameDetail(input.path);
  if (!game) {
    throw new Error("게임을 찾을 수 없습니다.");
  }
  return toGameDetailSummary(game);
}

// ========== list_tags / list_makers / list_categories ==========

interface NameCount {
  name: string;
  count: number;
}

/**
 * 이름 테이블과 관계 테이블을 조인해 이름별 게임 수를 센다
 */
async function countByName(
  table: "tags" | "makers" | "categories",
  relation: "gameTags" | "gameMakers" | "gameCategories",
  fk: "tagId" | "makerId" | "categoryId",
): Promise<NameCount[]> {
  const rows = (await db(table)
    .leftJoin(relation, `${table}.id`, `${relation}.${fk}`)
    .groupBy(`${table}.id`, `${table}.name`)
    .select(`${table}.name`)
    .count({ count: `${relation}.gamePath` })) as Array<{
    name: string;
    count: number | string;
  }>;
  return rows
    .map((row) => ({ name: row.name, count: Number(row.count) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"));
}

export function listTags(): Promise<NameCount[]> {
  return countByName("tags", "gameTags", "tagId");
}

export function listMakers(): Promise<NameCount[]> {
  return countByName("makers", "gameMakers", "makerId");
}

export function listCategories(): Promise<NameCount[]> {
  return countByName("categories", "gameCategories", "categoryId");
}

// ========== get_game_images ==========

export async function getGameImagesTool(input: {
  path: string;
}): Promise<{ path: string; sortOrder: number }[]> {
  const result = await getGameImages(input.path);
  return result.images;
}

// ========== find_duplicates ==========

export interface DuplicateGroupSummary {
  id: string;
  type: DuplicateGroup["type"];
  provider?: string | null;
  games: GameSummary[];
}

export async function findDuplicatesTool(): Promise<DuplicateGroupSummary[]> {
  const result = await findDuplicates();
  return result.groups.map((group) => ({
    id: group.id,
    type: group.type,
    provider: group.provider,
    games: group.games.map(toGameSummary),
  }));
}

// ========== export_game_list ==========

const EXPORT_COLUMN_IDS = EXPORT_COLUMNS.map((c) => c.id) as [
  ExportColumnId,
  ...ExportColumnId[],
];

export const exportGameListInput = {
  columns: z
    .array(z.enum(EXPORT_COLUMN_IDS))
    .min(1)
    .optional()
    .describe(
      "Column ids. Defaults to the app's default columns. 'path' is always appended if missing.",
    ),
  includeHeader: z.boolean().default(true),
};

export async function exportGameListTool(input: {
  columns?: ExportColumnId[];
  includeHeader: boolean;
}): Promise<{ tsv: string; rowCount: number; columns: ExportColumnId[] }> {
  const columns = [...(input.columns ?? DEFAULT_EXPORT_COLUMNS)];
  // AI가 결과로 다른 툴을 호출하려면 path가 반드시 있어야 한다
  if (!columns.includes("path")) {
    columns.push("path");
  }
  const games = await getAllGamesForExport();
  const rows = buildTsvRows(games, columns);
  const tsv = rowsToTsv(exportColumnLabels(columns), rows, input.includeHeader);
  return { tsv, rowCount: games.length, columns };
}

// ========== 등록 ==========

export function registerGamesReadTools(server: McpServer): void {
  server.registerTool(
    "search_games",
    {
      title: "Search games",
      description:
        "Search the game library. Returns paged game summaries; use the 'path' of a result to call other tools.",
      inputSchema: searchGamesInput,
    },
    (input) =>
      runTool("search_games", `query=${input.query ?? ""}`, () =>
        searchGamesTool(input),
      ),
  );

  server.registerTool(
    "get_game",
    {
      title: "Get game detail",
      description:
        "Get full details of one game: titles, release date, makers, categories, tags, memo, rating, play time, external id.",
      inputSchema: pathInput,
    },
    (input) => runTool("get_game", input.path, () => getGameTool(input)),
  );

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description:
        "All tags with the number of games using each. Prefer reusing an existing tag over inventing a new spelling.",
      inputSchema: {},
    },
    () => runTool("list_tags", "", listTags),
  );

  server.registerTool(
    "list_makers",
    {
      title: "List makers",
      description: "All makers (circles) with the number of games for each.",
      inputSchema: {},
    },
    () => runTool("list_makers", "", listMakers),
  );

  server.registerTool(
    "list_categories",
    {
      title: "List categories",
      description: "All categories with the number of games for each.",
      inputSchema: {},
    },
    () => runTool("list_categories", "", listCategories),
  );

  server.registerTool(
    "get_game_images",
    {
      title: "Get game images",
      description: "Absolute file paths of a game's extra (carousel) images.",
      inputSchema: pathInput,
    },
    (input) =>
      runTool("get_game_images", input.path, () => getGameImagesTool(input)),
  );

  server.registerTool(
    "find_duplicates",
    {
      title: "Find duplicate games",
      description:
        "Groups of games that look like duplicates, by external id, file fingerprint, or original title.",
      inputSchema: {},
    },
    () => runTool("find_duplicates", "", findDuplicatesTool),
  );

  server.registerTool(
    "export_game_list",
    {
      title: "Export game list as TSV",
      description:
        "The whole library (including hidden games) as TSV text, sorted by title. Large libraries produce large output.",
      inputSchema: exportGameListInput,
    },
    (input) =>
      runTool(
        "export_game_list",
        `columns=${input.columns?.length ?? "default"}`,
        () => exportGameListTool(input),
      ),
  );
}
