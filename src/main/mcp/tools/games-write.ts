/**
 * 메타데이터 수정 툴: update_game, set_rating, add/remove_tags,
 * add/remove_makers, add/remove_categories, set_executable_path
 *
 * 모든 쓰기 툴은 (1) 게임 존재 확인 → (2) 수정 → (3) 렌더러 알림 →
 * (4) 수정 후 요약 반환 순서를 따른다.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  addCategory,
  addMaker,
  addTag,
  removeCategory,
  removeMaker,
  removeTag,
  updateGameMetadata,
  updateRating,
} from "../../handlers/gameUpdate.js";
import { setExecutablePath } from "../../handlers/home-game-control.js";
import { validateExecutableInGame } from "../../utils/validator.js";
import {
  parseIsoDate,
  toGameDetailSummary,
  type GameDetailSummary,
} from "../format.js";
import { notifyGameChanged } from "../notify.js";
import { runTool } from "../tool-result.js";
import { applyEach, requireGameDetail } from "./common.js";

export interface WriteResult {
  ok: true;
  path: string;
  failed?: { name: string; message: string }[];
  game: GameDetailSummary;
}

/**
 * 수정 완료 공통 처리: 알림 + 최신 요약
 */
async function finishWrite(
  path: string,
  failed?: { name: string; message: string }[],
): Promise<WriteResult> {
  notifyGameChanged(path);
  const game = toGameDetailSummary(await requireGameDetail(path));
  return failed && failed.length > 0
    ? { ok: true, path, failed, game }
    : { ok: true, path, game };
}

const pathField = z
  .string()
  .min(1)
  .describe("Game path (primary key) as returned by search_games");

// 이름 배열: 공백 제거, 빈 문자열 거부, 중복 제거
const namesField = z
  .array(z.string().trim().min(1))
  .min(1)
  .transform((names) => [...new Set(names)]);

// ========== update_game ==========

export const updateGameInput = {
  path: pathField,
  title: z.string().min(1).optional(),
  originalTitle: z.string().min(1).optional(),
  translatedTitle: z.string().nullable().optional(),
  publishDate: z
    .string()
    .nullable()
    .optional()
    .describe("ISO 8601: YYYY-MM-DD or full date-time. null clears it."),
  memo: z.string().nullable().optional(),
};

export async function updateGameTool(input: {
  path: string;
  title?: string;
  originalTitle?: string;
  translatedTitle?: string | null;
  publishDate?: string | null;
  memo?: string | null;
}): Promise<WriteResult> {
  await requireGameDetail(input.path);

  // 발매일은 Date로 변환해야 상세 조회에서 읽힌다 (format.ts 참고)
  const publishDate =
    input.publishDate === undefined
      ? undefined
      : input.publishDate === null
        ? null
        : parseIsoDate(input.publishDate);

  await updateGameMetadata(input.path, {
    title: input.title,
    originalTitle: input.originalTitle,
    translatedTitle: input.translatedTitle,
    publishDate,
    memo: input.memo,
  });
  return finishWrite(input.path);
}

// ========== set_rating ==========

export const setRatingInput = {
  path: pathField,
  rating: z
    .number()
    .int()
    .min(1)
    .max(5)
    .nullable()
    .describe("1-5, or null to clear"),
};

export async function setRatingTool(input: {
  path: string;
  rating: number | null;
}): Promise<WriteResult> {
  await requireGameDetail(input.path);
  await updateRating(input.path, input.rating);
  return finishWrite(input.path);
}

// ========== 관계 데이터 (태그/제작사/카테고리) ==========

export const namesInput = { path: pathField, names: namesField };

type NamesInput = { path: string; names: string[] };

async function applyNames(
  input: NamesInput,
  fn: (path: string, name: string) => Promise<void>,
): Promise<WriteResult> {
  await requireGameDetail(input.path);
  const failed = await applyEach(input.names, (name) => fn(input.path, name));
  if (failed.length === input.names.length) {
    throw new Error(
      `모든 항목이 실패했습니다: ${failed.map((f) => f.message).join("; ")}`,
    );
  }
  return finishWrite(input.path, failed);
}

export const addTagsTool = (input: NamesInput) => applyNames(input, addTag);
export const removeTagsTool = (input: NamesInput) =>
  applyNames(input, removeTag);
export const addMakersTool = (input: NamesInput) => applyNames(input, addMaker);
export const removeMakersTool = (input: NamesInput) =>
  applyNames(input, removeMaker);
export const addCategoriesTool = (input: NamesInput) =>
  applyNames(input, addCategory);
export const removeCategoriesTool = (input: NamesInput) =>
  applyNames(input, removeCategory);

// ========== set_executable_path ==========

export const setExecutablePathInput = {
  path: pathField,
  executablePath: z
    .string()
    .min(1)
    .describe("Absolute path of a file inside the game folder"),
};

export async function setExecutablePathTool(input: {
  path: string;
  executablePath: string;
}): Promise<WriteResult> {
  await requireGameDetail(input.path);
  await validateExecutableInGame(input.path, input.executablePath);
  await setExecutablePath(input.path, input.executablePath);
  return finishWrite(input.path);
}

// ========== 등록 ==========

export function registerGamesWriteTools(server: McpServer): void {
  server.registerTool(
    "update_game",
    {
      title: "Update game metadata",
      description:
        "Update title, original title, translated title, release date (ISO 8601) or memo. Only the fields you pass are changed.",
      inputSchema: updateGameInput,
    },
    (input) => runTool("update_game", input.path, () => updateGameTool(input)),
  );

  server.registerTool(
    "set_rating",
    {
      title: "Set rating",
      description: "Set the user rating (1-5) or clear it with null.",
      inputSchema: setRatingInput,
    },
    (input) => runTool("set_rating", input.path, () => setRatingTool(input)),
  );

  const nameTools: Array<
    [string, string, (i: NamesInput) => Promise<WriteResult>]
  > = [
    [
      "add_tags",
      "Add tags to a game. Unknown tags are created. Check list_tags first to reuse existing names.",
      addTagsTool,
    ],
    [
      "remove_tags",
      "Remove tags from a game. Missing tags are ignored.",
      removeTagsTool,
    ],
    [
      "add_makers",
      "Add makers (circles) to a game. Unknown makers are created.",
      addMakersTool,
    ],
    ["remove_makers", "Remove makers from a game.", removeMakersTool],
    [
      "add_categories",
      "Add categories to a game. Unknown categories are created.",
      addCategoriesTool,
    ],
    [
      "remove_categories",
      "Remove categories from a game.",
      removeCategoriesTool,
    ],
  ];
  for (const [name, description, fn] of nameTools) {
    server.registerTool(
      name,
      { title: name.replace("_", " "), description, inputSchema: namesInput },
      (input) => runTool(name, input.path, () => fn(input)),
    );
  }

  server.registerTool(
    "set_executable_path",
    {
      title: "Set executable path",
      description:
        "Set which file the app launches for a game. The file must exist inside the game folder.",
      inputSchema: setExecutablePathInput,
    },
    (input) =>
      runTool("set_executable_path", input.path, () =>
        setExecutablePathTool(input),
      ),
  );
}
