/**
 * 게임 폴더 스캔 및 목록 새로고침 핸들러
 *
 * - 실행 파일 탐색
 * - 폴더 스캔 및 DB 동기화
 * - 목록 새로고침
 * - 폴더 열기
 */

import type { IpcMainInvokeEvent } from "electron";
import { shell } from "electron";
import { existsSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { COMPRESS_FILE_TYPE } from "../constants.js";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import { computeFingerprint } from "../lib/fingerprint.js";
import { EXECUTABLE_EXTENSIONS } from "../lib/scan-logic.js";
import {
  getEnableNonGameContent,
  getExcludedExecutables as getExcludedExecutablesFromStore,
  getOfflineLibraryPaths,
  getScanDepth,
  updateLibraryScanHistory,
} from "../store.js";
import { deleteImage } from "../utils/downloader.js";
import { toAbsolutePath } from "../utils/image-path.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";
import { validateDirectoryPath } from "../utils/validator.js";
import { runScanWorker } from "../workers/run-scan-worker.js";
import {
  buildGameItems,
  leftJoinUserGameData,
  loadRelationsAndGroup,
} from "./home-utils.js";

/**
 * 게임 경로에서 실행 파일 후보들을 찾음
 */
export async function findExecutables(folderPath: string): Promise<string[]> {
  if (!existsSync(folderPath)) {
    return [];
  }

  try {
    const entries = readdirSync(folderPath, { withFileTypes: true });
    const executables: string[] = [];

    // 스토어에서 실행 제외 목록 가져오기
    const excludedList = getExcludedExecutablesFromStore();

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = entry.name.toLowerCase();
      if (!EXECUTABLE_EXTENSIONS.some((e) => ext.endsWith(e))) continue;

      // 실행 제외 목록 체크
      if (
        excludedList.some(
          (excluded) => entry.name.toLowerCase() === excluded.toLowerCase(),
        )
      ) {
        continue;
      }

      executables.push(join(folderPath, entry.name));
    }

    return executables;
  } catch {
    return [];
  }
}

/**
 * 게임 경로에서 가장 가능성 높은 실행 파일 선택
 */
export function selectBestExecutable(executables: string[]): string | null {
  if (executables.length === 0) return null;
  if (executables.length === 1) return executables[0];

  // 우선순위: .exe > .lnk > .url
  for (const ext of [".exe", ".lnk", ".url"]) {
    const exactMatch = executables.find((e) => e.toLowerCase().endsWith(ext));
    if (exactMatch) return exactMatch;
  }

  return executables[0];
}

/**
 * 폴더를 스캔하여 게임을 DB에 등록
 * - 새 게임 추가
 * - 기존 게임 정보 업데이트
 * - 존재하지 않는 게임 DB에서 삭제
 * - 재귀적으로 하위 폴더를 스캔하여 게임 폴더 자동 탐지
 */
export async function scanFolder(
  sourcePath: string,
): Promise<{ addedCount: number; deletedCount: number }> {
  if (!existsSync(sourcePath)) {
    return { addedCount: 0, deletedCount: 0 };
  }

  try {
    // 스캔 전 DB에 있는 해당 라이브러리의 모든 게임 경로를 가져옴
    const existingGames = await db("games")
      .where("source", sourcePath)
      .select("path");
    const existingPaths = new Set(existingGames.map((g) => g.path));
    const foundPaths = new Set<string>();
    let addedCount = 0;

    // 비게임 콘텐츠 인식 설정 로드
    const enableNonGameContent = getEnableNonGameContent();

    // Worker Thread에서 스캔 실행
    const candidates = await runScanWorker(
      sourcePath,
      getScanDepth(),
      enableNonGameContent,
    );

    // 발견한 게임 후보 등록
    for (const candidate of candidates) {
      const { path: fullPath, name, isCompressFile } = candidate;

      // 압축파일인 경우 제목에서 확장자 제거
      let title = name;
      if (isCompressFile) {
        for (const ext of COMPRESS_FILE_TYPE) {
          if (title.toLowerCase().endsWith(ext)) {
            title = title.slice(0, -ext.length);
            break;
          }
        }
      }

      // 게임 정보 생성
      const fingerprint = computeFingerprint(fullPath, Boolean(isCompressFile));
      const gameData = {
        path: fullPath,
        title: title,
        originalTitle: name,
        source: sourcePath,
        isCompressFile: Boolean(isCompressFile),
        hasExecutable: candidate.hasExecutable,
        fingerprint,
      };

      // 발견된 경로 기록
      foundPaths.add(fullPath);

      // DB에 이미 존재하는지 확인 후 삽입
      const existing = await db("games").where("path", fullPath).first();
      if (!existing) {
        await db("games").insert(gameData);
        addedCount++;
      } else {
        // 기존 게임 정보 업데이트 (발견한 경우)
        // title은 정보 수집으로 변경된 값을 유지하고, originalTitle만 업데이트
        // fingerprint 변경 시 user_game_data도 갱신
        const oldFingerprint = existing.fingerprint;
        const newFingerprint = fingerprint ?? existing.fingerprint;
        if (newFingerprint && oldFingerprint !== newFingerprint) {
          if (oldFingerprint) {
            // fingerprint 변경: user_game_data도 같이 갱신
            await db("userGameData")
              .where("fingerprint", oldFingerprint)
              .update({ fingerprint: newFingerprint });
          } else {
            // fingerprint 최초 설정 (마이그레이션 후 첫 스캔):
            // external_key로 연결된 user_game_data의 fingerprint를 채운다
            const game = await db("games")
              .where("path", fullPath)
              .select("provider", "externalId")
              .first();
            if (game?.provider && game?.externalId) {
              const ek = `${game.provider}:${game.externalId}`;
              // UNIQUE 충돌 방지: 해당 fingerprint를 가진 다른 레코드가 없는 경우만 갱신
              const conflicting = await db("userGameData")
                .where("fingerprint", newFingerprint)
                .first();
              if (!conflicting) {
                await db("userGameData")
                  .where("externalKey", ek)
                  .whereNull("fingerprint")
                  .update({ fingerprint: newFingerprint });
              }
            }
          }
        }
        await db("games").where("path", fullPath).update({
          originalTitle: name,
          source: sourcePath,
          fingerprint: newFingerprint,
          updatedAt: new Date(),
        });
      }
    }

    // 오프라인 경로는 삭제 로직 스킵 (일시적 접근 불가로 인한 삭제 방지)
    const offlinePaths = getOfflineLibraryPaths();
    if (
      offlinePaths.some((op) => op.toLowerCase() === sourcePath.toLowerCase())
    ) {
      return { addedCount, deletedCount: 0 };
    }

    // DB에 있지만 실제로는 존재하지 않는 게임 삭제
    const deletedPaths = [...existingPaths].filter(
      (path) => !foundPaths.has(path),
    );
    let deletedCount = 0;
    if (deletedPaths.length > 0) {
      // 삭제 전 썸네일 및 이미지 경로 조회 (파일 삭제용)
      const gamesToDelete = await db("games")
        .whereIn("path", deletedPaths)
        .select("path", "thumbnail");
      const thumbnailsToDelete = gamesToDelete
        .map((g) => g.thumbnail)
        .filter((t): t is string => t !== null);

      const imagesToDelete = await db("gameImages")
        .whereIn("gamePath", deletedPaths)
        .pluck("path");

      // 관계 데이터 먼저 삭제
      await db("gameMakers").whereIn("gamePath", deletedPaths).delete();
      await db("gameCategories").whereIn("gamePath", deletedPaths).delete();
      await db("gameTags").whereIn("gamePath", deletedPaths).delete();
      await db("gameImages").whereIn("gamePath", deletedPaths).delete();

      // 게임 삭제 (userGameData는 의도적으로 보존 — 재스캔 시 플레이 시간·메모 등 복원용)
      deletedCount = await db("games").whereIn("path", deletedPaths).delete();

      // 실제 이미지 파일 삭제 (상대 경로를 절대 경로로 변환)
      for (const thumbnail of thumbnailsToDelete) {
        await deleteImage(toAbsolutePath(thumbnail) ?? thumbnail);
      }
      for (const imagePath of imagesToDelete) {
        await deleteImage(toAbsolutePath(imagePath) ?? imagePath);
      }
    }

    // 스캔 완료 후 기록 업데이트 (DB에 있는 총 게임 수)
    const totalGames = (await db("games")
      .where("source", sourcePath)
      .count("* as count")
      .first()) as { count: bigint } | undefined;
    updateLibraryScanHistory(sourcePath, Number(totalGames?.count ?? 0));

    return { addedCount, deletedCount };
  } catch (error) {
    console.error("폴더 스캔 오류:", error);
    return { addedCount: 0, deletedCount: 0 };
  }
}

/**
 * 게임 목록 새로고침 핸들러 (폴더 재스캔)
 */
export const refreshListHandler = wrapIpcHandler(
  "refreshList",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["refreshList"],
  ): Promise<IpcMainEventMap["listRefreshed"]> => {
    const { sourcePaths } = payload;

    // 각 경로 유효성 검증 후 스캔
    let totalAdded = 0;
    let totalDeleted = 0;
    for (const sourcePath of sourcePaths) {
      const result = await scanFolder(sourcePath);
      totalAdded += result.addedCount;
      totalDeleted += result.deletedCount;
    }

    // 스캔 후 다시 목록 로드
    const games = await leftJoinUserGameData(db("games"))
      .whereIn(
        "games.source",
        sourcePaths.filter((p) => existsSync(p)),
      )
      .where("games.isHidden", 0)
      .orderBy("games.title", "asc")
      .select(
        "games.path",
        "games.title",
        "games.originalTitle",
        "games.source",
        "games.thumbnail",
        "games.executablePath",
        "games.isCompressFile",
        "games.hasExecutable",
        "games.publishDate",
        "games.translatedTitle",
        "games.translationSource",
        "userGameData.rating",
      );

    // 관계 데이터 조회 및 그룹화
    const gamePaths = games.map((g) => g.path);
    const relations = await loadRelationsAndGroup(gamePaths);

    // GameItem으로 변환
    const plainGames = buildGameItems(games, relations);

    return {
      games: plainGames,
      addedCount: totalAdded,
      deletedCount: totalDeleted,
    };
  },
);

/**
 * 폴더 열기 핸들러
 */
export const openFolderHandler = wrapIpcHandler(
  "openFolder",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["openFolder"],
  ): Promise<void> => {
    const { path } = payload;

    // DB에서 게임 정보 조회 (압축파일 확인용)
    const game = await db("games").where("path", path).first();

    // 게임이 없으면 일반 폴더로 처리
    if (!game) {
      validateDirectoryPath(path);
      const openResult = await shell.openPath(path);
      if (openResult) {
        throw new Error(`폴더를 열 수 없습니다: ${openResult}`);
      }
      return;
    }

    const isCompressFile = Boolean(game.isCompressFile);
    const isShortcutFile = path.toLowerCase().endsWith(".lnk");

    if (isCompressFile || isShortcutFile) {
      // 압축파일이거나 바로가기 파일인 경우 파일이 있는 폴더에서 파일 선택
      if (existsSync(path)) {
        shell.showItemInFolder(path);
      } else {
        // 파일이 삭제된 경우 상위 폴더 열기
        const parentDir = dirname(path);
        const openResult = await shell.openPath(parentDir);
        if (openResult) {
          throw new Error(`폴더를 열 수 없습니다: ${openResult}`);
        }
      }
    } else {
      // 폴더인 경우 해당 폴더 열기
      validateDirectoryPath(path);
      const openResult = await shell.openPath(path);
      if (openResult) {
        throw new Error(`폴더를 열 수 없습니다: ${openResult}`);
      }
    }
  },
);
