/**
 * 라이브러리 경로 관리, 스캔 기록, 자동 스캔 핸들러
 *
 * - 라이브러리 경로 추가/제거/조회
 * - 마지막 갱신 시간 관리
 * - 라이브러리 변경 감지 및 자동 스캔
 * - 스캔 기록 관리
 */

import type { IpcMainInvokeEvent } from "electron";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { COMPRESS_FILE_TYPE } from "../constants.js";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import {
  EXCLUDED_FOLDER_NAMES,
  EXECUTABLE_EXTENSIONS,
  hasExecutableFile,
} from "../lib/scan-logic.js";
import {
  addLibraryPath as addLibraryPathToStore,
  getAllLibraryScanHistory,
  getLastRefreshedAt,
  getLibraryPaths,
  getLibraryScanHistory,
  getOfflineLibraryPaths,
  getScanDepth,
  removeLibraryPath as removeLibraryPathFromStore,
  removeLibraryScanHistory,
  setLastRefreshedAt,
} from "../store.js";
import { deleteImage } from "../utils/downloader.js";
import { toAbsolutePath } from "../utils/image-path.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";
import { normalizePath } from "../lib/normalize-path.js";
import { scanFolder } from "./home-scan.js";

/**
 * 라이브러리 경로 목록 조회 핸들러
 */
export async function getLibraryPathsHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["getLibraryPaths"],
): Promise<IpcMainEventMap["libraryPaths"]> {
  const paths = getLibraryPaths();
  return { paths };
}

/**
 * 라이브러리 경로 추가 핸들러
 */
export const addLibraryPathHandler = wrapIpcHandler(
  "addLibraryPath",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["addLibraryPath"],
  ): Promise<IpcMainEventMap["libraryPathAdded"]> => {
    const { path } = payload;
    const normalizedPath = normalizePath(path);
    addLibraryPathToStore(normalizedPath);
    return { path: normalizedPath };
  },
);

/**
 * 라이브러리 경로 제거 핸들러
 * 해당 경로의 게임도 함께 삭제 (DB만, 실제 파일은 유지)
 */
export const removeLibraryPathHandler = wrapIpcHandler(
  "removeLibraryPath",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["removeLibraryPath"],
  ): Promise<IpcMainEventMap["libraryPathRemoved"]> => {
    const { path } = payload;
    const normalizedPath = normalizePath(path);

    // 해당 경로 하위의 게임 조회
    const gamesToDelete = await db("games")
      .where("source", normalizedPath)
      .select("path", "thumbnail");

    const gamePaths = gamesToDelete.map((g) => g.path);
    const deletedGameCount = gamePaths.length;

    if (deletedGameCount > 0) {
      // 썸네일 경로 조회
      const thumbnailsToDelete = gamesToDelete
        .map((g) => g.thumbnail)
        .filter((t): t is string => t !== null);

      // 이미지 경로 조회
      const imagesToDelete = await db("gameImages")
        .whereIn("gamePath", gamePaths)
        .pluck("path");

      // 관계 데이터 삭제 (gamePath 기반)
      await db("gameMakers").whereIn("gamePath", gamePaths).delete();
      await db("gameCategories").whereIn("gamePath", gamePaths).delete();
      await db("gameTags").whereIn("gamePath", gamePaths).delete();
      await db("gameImages").whereIn("gamePath", gamePaths).delete();

      // 게임 레코드 삭제 (userGameData는 보존됨)
      await db("games").whereIn("path", gamePaths).delete();

      // 썸네일 및 이미지 파일 삭제
      for (const thumbnail of thumbnailsToDelete) {
        await deleteImage(toAbsolutePath(thumbnail) ?? thumbnail);
      }
      for (const imagePath of imagesToDelete) {
        await deleteImage(toAbsolutePath(imagePath) ?? imagePath);
      }
    }

    // 설정에서 경로 제거
    removeLibraryPathFromStore(normalizedPath);

    // 스캔 기록 삭제
    removeLibraryScanHistory(normalizedPath);

    return { path: normalizedPath, deletedGameCount };
  },
);

/**
 * 마지막 갱신 시간 저장 핸들러
 */
export async function setLastRefreshedHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["lastRefreshedSet"],
): Promise<void> {
  setLastRefreshedAt(payload.timestamp);
}

/**
 * 마지막 갱신 시간 조회 핸들러
 */
export async function getLastRefreshedHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["lastRefreshedGet"],
): Promise<IpcMainEventMap["lastRefreshedLoaded"]> {
  const timestamp = getLastRefreshedAt();
  return { timestamp: timestamp ?? null };
}

// ========== 라이브러리 스캔 기록 관리 ==========

/**
 * 폴더의 게임 수를 셈 (재귀 스캔)
 * 실행파일이 있는 폴더, 압축파일, 실행파일(.exe, .lnk, .url)을 게임으로 간주
 */
function countGames(sourcePath: string): number {
  if (!existsSync(sourcePath)) {
    return 0;
  }

  let count = 0;
  const queue: Array<{ path: string; depth: number }> = [
    { path: sourcePath, depth: 0 },
  ];
  const maxDepth = getScanDepth();

  while (queue.length > 0) {
    const { path: currentPath, depth } = queue.shift()!;

    if (depth > maxDepth) continue;

    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;

        const fullPath = join(currentPath, entry.name);
        const isCompressFile = COMPRESS_FILE_TYPE.some((ext) =>
          entry.name.toLowerCase().endsWith(ext),
        );
        const isExecutableFile =
          entry.isFile() &&
          EXECUTABLE_EXTENSIONS.some((ext) =>
            entry.name.toLowerCase().endsWith(ext),
          );

        if (entry.isDirectory()) {
          if (EXCLUDED_FOLDER_NAMES.has(entry.name.toLowerCase())) continue;
          if (hasExecutableFile(fullPath)) {
            count++;
          } else {
            queue.push({ path: fullPath, depth: depth + 1 });
          }
        } else if (isCompressFile || isExecutableFile) {
          count++;
        }
      }
    } catch {
      // 권한 등의 문제로 읽기 실패 시 스킵
    }
  }

  return count;
}

/**
 * 라이브러리 변경 감지 (하이브리드 방식)
 * 1단계: 폴더 mtime 빠른 체크
 * 2단계: 파일 개수 비교
 */
async function hasLibraryChanges(libraryPath: string): Promise<boolean> {
  const history = getLibraryScanHistory(libraryPath);

  // 기록이 없으면 변경 있음 (처음 스캔)
  if (!history) return true;

  try {
    // 1단계: 폴더 mtime 빠른 체크
    const stat = statSync(libraryPath);
    if (stat.mtime > new Date(history.lastScannedAt)) return true;

    // 2단계: 파일 개수 비교
    const currentCount = countGames(libraryPath);
    return currentCount !== history.lastGameCount;
  } catch {
    return false;
  }
}

/**
 * 라이브러리 스캔 기록 조회 핸들러
 */
export async function getLibraryScanHistoryHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getLibraryScanHistory"],
): Promise<IpcMainEventMap["libraryScanHistory"]> {
  const { path } = payload;
  const history = getLibraryScanHistory(path);
  return { path, history: history ?? null };
}

/**
 * 모든 라이브러리 스캔 기록 조회 핸들러
 */
export async function getAllLibraryScanHistoryHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["getAllLibraryScanHistory"],
): Promise<IpcMainEventMap["allLibraryScanHistory"]> {
  const history = getAllLibraryScanHistory();
  return { history };
}

/**
 * 라이브러리 자동 스캔 (변경 있는 폴더만)
 * 앱 시작 시 호출됨
 */
export async function autoScanLibraries(): Promise<number> {
  const paths = getLibraryPaths();
  if (paths.length === 0) return 0;

  const offlinePaths = getOfflineLibraryPaths();
  let totalAdded = 0;
  let totalDeleted = 0;
  for (const path of paths) {
    // 오프라인 경로는 자동 스캔에서 제외
    if (offlinePaths.includes(path)) {
      console.log(`자동 스캔 스킵: 오프라인 경로 — ${path}`);
      continue;
    }

    // 드라이브/경로가 존재하지 않으면 스킵 (블로킹 방지)
    if (!existsSync(path)) {
      console.log(`자동 스캔 스킵: 경로 없음 — ${path}`);
      continue;
    }

    if (await hasLibraryChanges(path)) {
      const result = await scanFolder(path);
      totalAdded += result.addedCount;
      totalDeleted += result.deletedCount;
    }
  }

  // 변경 사항 있으면 마지막 갱신 시간 업데이트
  if (totalAdded > 0 || totalDeleted > 0) {
    setLastRefreshedAt(new Date().toISOString());
  }

  return totalAdded;
}
