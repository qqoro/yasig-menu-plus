/**
 * 라이브러리 툴: refresh_library, add_library_path,
 * list/add/remove_excluded_executable
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toExecutableFileName } from "../../handlers/home-game-control.js";
import { registerLibraryPath } from "../../handlers/home-library.js";
import { scanLibraryPaths } from "../../handlers/home-scan.js";
import {
  addExcludedExecutable,
  getExcludedExecutables,
  getLibraryPaths,
  removeExcludedExecutable,
  setLastRefreshedAt,
} from "../../store.js";
import { createLogger } from "../../utils/logger.js";
import { validateDirectoryPath } from "../../utils/validator.js";
import { getActiveLibraryPaths } from "../library-paths.js";
import { notifyExternalChange } from "../notify.js";
import { runTool } from "../tool-result.js";

const log = createLogger("Mcp");

// ========== refresh_library ==========

export const refreshLibraryInput = {
  paths: z
    .array(z.string().min(1))
    .min(1)
    .optional()
    .describe(
      "Registered library paths to rescan. Omit to rescan all active libraries.",
    ),
};

/**
 * 입력 경로를 등록된 라이브러리 경로로 정규화 (대소문자 무시). 미등록이면 오류
 */
function resolveRegisteredPaths(paths: string[]): string[] {
  const registered = getLibraryPaths();
  return paths.map((input) => {
    const match = registered.find(
      (p) => p.toLowerCase() === input.toLowerCase(),
    );
    if (!match) {
      throw new Error(`등록되지 않은 라이브러리 경로입니다: ${input}`);
    }
    return match;
  });
}

export async function refreshLibraryTool(input: { paths?: string[] }): Promise<{
  addedCount: number;
  deletedCount: number;
  scannedPaths: string[];
}> {
  const scannedPaths = input.paths
    ? resolveRegisteredPaths(input.paths)
    : getActiveLibraryPaths();
  log.info(`MCP 재스캔 시작: ${scannedPaths.length}개 경로`);
  const result = await scanLibraryPaths(scannedPaths);
  setLastRefreshedAt(new Date().toISOString());
  notifyExternalChange({ scope: "games" });
  return { ...result, scannedPaths };
}

// ========== add_library_path ==========

export async function addLibraryPathTool(input: {
  path: string;
}): Promise<{ ok: true; path: string; libraryPaths: string[] }> {
  await validateDirectoryPath(input.path);
  const { path } = registerLibraryPath(input.path);
  notifyExternalChange({ scope: "library" });
  return { ok: true, path, libraryPaths: getLibraryPaths() };
}

// ========== 실행 제외 목록 ==========

export async function listExcludedExecutablesTool(): Promise<string[]> {
  return getExcludedExecutables();
}

export async function addExcludedExecutableTool(input: {
  executable: string;
}): Promise<string[]> {
  addExcludedExecutable(toExecutableFileName(input.executable));
  notifyExternalChange({ scope: "excludedExecutables" });
  return getExcludedExecutables();
}

export async function removeExcludedExecutableTool(input: {
  executable: string;
}): Promise<string[]> {
  removeExcludedExecutable(toExecutableFileName(input.executable));
  notifyExternalChange({ scope: "excludedExecutables" });
  return getExcludedExecutables();
}

// ========== 등록 ==========

export function registerLibraryTools(server: McpServer): void {
  server.registerTool(
    "refresh_library",
    {
      title: "Rescan library folders",
      description:
        "Rescan library folders for added/removed games and wait for the result. Large libraries can take minutes; if the client times out, the scan still completes in the app.",
      inputSchema: refreshLibraryInput,
    },
    (input) =>
      runTool("refresh_library", `paths=${input.paths?.length ?? "all"}`, () =>
        refreshLibraryTool(input),
      ),
  );

  server.registerTool(
    "add_library_path",
    {
      title: "Add library folder",
      description:
        "Register a folder as a game library. Call refresh_library afterwards to scan it.",
      inputSchema: { path: z.string().min(1).describe("Absolute folder path") },
    },
    (input) =>
      runTool("add_library_path", input.path, () => addLibraryPathTool(input)),
  );

  server.registerTool(
    "list_excluded_executables",
    {
      title: "List excluded executables",
      description:
        "File names the scanner never treats as a game executable (e.g. unins000.exe).",
      inputSchema: {},
    },
    () => runTool("list_excluded_executables", "", listExcludedExecutablesTool),
  );

  const executableInput = {
    executable: z
      .string()
      .min(1)
      .describe("File name; a path is reduced to its file name"),
  };

  server.registerTool(
    "add_excluded_executable",
    {
      title: "Add excluded executable",
      description:
        "Add a file name to the excluded executables list. Returns the full list.",
      inputSchema: executableInput,
    },
    (input) =>
      runTool("add_excluded_executable", input.executable, () =>
        addExcludedExecutableTool(input),
      ),
  );

  server.registerTool(
    "remove_excluded_executable",
    {
      title: "Remove excluded executable",
      description:
        "Remove a file name from the excluded executables list. Returns the full list.",
      inputSchema: executableInput,
    },
    (input) =>
      runTool("remove_excluded_executable", input.executable, () =>
        removeExcludedExecutableTool(input),
      ),
  );
}
