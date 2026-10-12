/**
 * 썸네일 툴: set_thumbnail_from_url, set_thumbnail_from_file, remove_thumbnail
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { stat } from "fs/promises";
import { extname } from "path";
import { z } from "zod";
import {
  hideThumbnail,
  setThumbnailFromFile,
  setThumbnailFromUrl,
} from "../../handlers/gameUpdate.js";
import { toGameDetailSummary } from "../format.js";
import { notifyGameChanged } from "../notify.js";
import { runTool } from "../tool-result.js";
import type { WriteResult } from "./games-write.js";
import { requireGameDetail } from "./common.js";

// 썸네일로 허용하는 이미지 확장자
const IMAGE_EXTENSIONS = /^\.(jpe?g|png|webp|gif|bmp|avif)$/i;

const pathField = z
  .string()
  .min(1)
  .describe("Game path (primary key) as returned by search_games");

async function finishWrite(path: string): Promise<WriteResult> {
  notifyGameChanged(path);
  return {
    ok: true,
    path,
    game: toGameDetailSummary(await requireGameDetail(path)),
  };
}

export const setThumbnailFromUrlInput = {
  path: pathField,
  url: z.string().url().describe("http(s) image URL"),
};

export async function setThumbnailFromUrlTool(input: {
  path: string;
  url: string;
}): Promise<WriteResult> {
  await requireGameDetail(input.path);
  await setThumbnailFromUrl(input.path, input.url);
  return finishWrite(input.path);
}

export const setThumbnailFromFileInput = {
  path: pathField,
  filePath: z.string().min(1).describe("Absolute path of a local image file"),
};

export async function setThumbnailFromFileTool(input: {
  path: string;
  filePath: string;
}): Promise<WriteResult> {
  await requireGameDetail(input.path);
  // 기존 함수는 copyFile 실패를 그대로 던지므로 메시지를 먼저 다듬는다
  let info;
  try {
    info = await stat(input.filePath);
  } catch {
    throw new Error("이미지 파일이 존재하지 않습니다.");
  }
  if (!info.isFile()) {
    throw new Error("이미지 경로가 파일이 아닙니다.");
  }
  if (!IMAGE_EXTENSIONS.test(extname(input.filePath))) {
    throw new Error("이미지 파일만 설정할 수 있습니다.");
  }
  await setThumbnailFromFile(input.path, input.filePath);
  return finishWrite(input.path);
}

export async function removeThumbnailTool(input: {
  path: string;
}): Promise<WriteResult> {
  await requireGameDetail(input.path);
  await hideThumbnail(input.path);
  return finishWrite(input.path);
}

export function registerThumbnailTools(server: McpServer): void {
  server.registerTool(
    "set_thumbnail_from_url",
    {
      title: "Set thumbnail from URL",
      description:
        "Download an image from a URL and use it as the game's thumbnail.",
      inputSchema: setThumbnailFromUrlInput,
    },
    (input) =>
      runTool("set_thumbnail_from_url", input.path, () =>
        setThumbnailFromUrlTool(input),
      ),
  );

  server.registerTool(
    "set_thumbnail_from_file",
    {
      title: "Set thumbnail from local file",
      description:
        "Copy a local image file and use it as the game's thumbnail.",
      inputSchema: setThumbnailFromFileInput,
    },
    (input) =>
      runTool("set_thumbnail_from_file", input.path, () =>
        setThumbnailFromFileTool(input),
      ),
  );

  server.registerTool(
    "remove_thumbnail",
    {
      title: "Remove thumbnail",
      description:
        "Delete the game's thumbnail file and clear it in the database.",
      inputSchema: { path: pathField },
    },
    (input) =>
      runTool("remove_thumbnail", input.path, () => removeThumbnailTool(input)),
  );
}
