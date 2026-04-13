/**
 * 게임 실행, 토글, 실행 제외 목록, 원본 사이트 열기 핸들러
 *
 * - 게임 실행 (프로세스 모니터링 포함)
 * - 즐겨찾기/숨김/클리어 토글
 * - 배치 토글
 * - 실행 제외 목록 관리
 * - 실행 파일 경로 직접 지정
 * - 원본 사이트 열기
 */

import { spawn } from "child_process";
import { existsSync, readdirSync } from "fs";
import { extname, join } from "path";
import type { IpcMainInvokeEvent } from "electron";
import { shell } from "electron";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import { processMonitor } from "../services/ProcessMonitor.js";
import { getOrCreateUserGameData } from "../services/user-game-data.js";
import {
  addExcludedExecutable,
  getExcludedExecutables as getExcludedExecutablesFromStore,
  getMediaPlayerSettings,
  removeExcludedExecutable,
} from "../store.js";
import { validateDirectoryPath, validatePath } from "../utils/validator.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";
import { findExecutables, selectBestExecutable } from "./home-scan.js";

const AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac", ".ogg", ".m4a"];
const VIDEO_EXTENSIONS = [".mp4", ".avi", ".mkv", ".wmv"];
const MEDIA_EXTENSIONS = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

/**
 * 폴더를 재귀 탐색하여 상대 경로 기준 사전순 첫 번째 미디어 파일 반환
 */
function findFirstMediaFile(folderPath: string): string | null {
  const mediaFiles: string[] = [];

  function traverse(currentPath: string): void {
    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });
      const sorted = [...entries].sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of sorted) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = join(currentPath, entry.name);

        if (entry.isFile()) {
          const ext = extname(entry.name).toLowerCase();
          if (MEDIA_EXTENSIONS.includes(ext)) {
            mediaFiles.push(fullPath);
            return;
          }
        } else if (entry.isDirectory()) {
          traverse(fullPath);
          if (mediaFiles.length > 0) return;
        }
      }
    } catch {
      // 접근 불가 폴더 무시
    }
  }

  traverse(folderPath);
  return mediaFiles[0] ?? null;
}

/**
 * 미디어 파일이 오디오인지 확인
 */
function isAudioFile(filePath: string): boolean {
  return AUDIO_EXTENSIONS.includes(extname(filePath).toLowerCase());
}

/**
 * 게임 실행 핸들러
 */
export const playGameHandler = wrapIpcHandler(
  "playGame",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["playGame"],
  ): Promise<IpcMainEventMap["gamePlayed"]> => {
    const { path } = payload;

    // 경로 유효성 검증
    validatePath(path, { mustExist: true });

    // DB에서 게임 정보 조회
    const game = await db("games").where("path", path).first();
    if (!game) {
      throw new Error("게임을 찾을 수 없습니다.");
    }

    const isCompressFile = Boolean(game.isCompressFile);
    const isShortcutFile = path.toLowerCase().endsWith(".lnk");
    let executablePath: string | null = null;

    // 압축파일이거나 바로가기 파일인 경우 파일 자체를 실행
    if (isCompressFile || isShortcutFile) {
      executablePath = path;
    } else if (game.executablePath) {
      // 직접 지정한 실행 파일이 있으면 사용
      executablePath = game.executablePath;
    } else {
      // 폴더에서 실행 파일 찾기
      const executables = await findExecutables(path);
      executablePath = selectBestExecutable(executables);
    }

    if (!executablePath) {
      // 미디어 재생 fallback
      const mediaFile = findFirstMediaFile(path);
      if (!mediaFile) {
        throw new Error("실행 파일을 찾을 수 없습니다.");
      }

      const playerSettings = getMediaPlayerSettings();
      const isAudio = isAudioFile(mediaFile);
      const playerPath = isAudio
        ? playerSettings.audioPlayerPath
        : playerSettings.videoPlayerPath;

      if (playerPath && existsSync(playerPath)) {
        spawn(playerPath, [mediaFile], {
          detached: true,
          stdio: "ignore",
        }).unref();
      } else {
        const openResult = await shell.openPath(mediaFile);
        if (openResult) {
          throw new Error(`미디어 파일을 열 수 없습니다: ${openResult}`);
        }
      }

      // lastPlayedAt 업데이트
      const userGameDataId = await getOrCreateUserGameData(path);
      await db("userGameData").where("id", userGameDataId).update({
        lastPlayedAt: new Date(),
      });
      await db("games").where("path", path).update({ updatedAt: new Date() });

      return { executablePath: mediaFile };
    }

    // .exe 파일인 경우 ProcessMonitor로 실행 (플레이 타임 추적)
    if (processMonitor.isExeFile(executablePath)) {
      const started = await processMonitor.startSession(path, executablePath);
      if (started) {
        return { executablePath };
      }
      // 이미 실행 중이거나 다른 이유로 시작 실패 시 기존 방식으로 실행
    }

    // 마지막 플레이 시간 업데이트 (.exe가 아니거나 spawn 실패 시)
    const userGameDataId = await getOrCreateUserGameData(path);
    await db("userGameData").where("id", userGameDataId).update({
      lastPlayedAt: new Date(),
    });
    await db("games").where("path", path).update({ updatedAt: new Date() });

    // 게임 실행 (shell.openPath 사용)
    const openResult = await shell.openPath(executablePath);
    if (openResult) {
      throw new Error(`게임을 실행할 수 없습니다: ${openResult}`);
    }

    return { executablePath };
  },
);

/**
 * 게임 토글 핸들러 (즐겨찾기/숨김/클리어)
 */
export async function toggleGameHandler(
  _event: IpcMainInvokeEvent,
  payload: { path: string },
  field: "is_favorite" | "is_hidden" | "is_clear",
): Promise<IpcMainEventMap["gameToggled"]> {
  const { path } = payload;

  if (field === "is_hidden") {
    // isHidden은 games 테이블에 유지
    const game = await db("games")
      .where("path", path)
      .select("path", "isHidden")
      .first();
    if (!game) throw new Error("게임을 찾을 수 없습니다.");
    const newValue = !(game.isHidden === 1);
    await db("games")
      .where("path", path)
      .update({
        isHidden: newValue ? 1 : 0,
        updatedAt: new Date(),
      });
    return { path, field, value: newValue };
  }

  // isFavorite, isClear → user_game_data
  const userGameDataId = await getOrCreateUserGameData(path);
  const userData = await db("userGameData").where("id", userGameDataId).first();

  const fieldMap = {
    is_favorite: "isFavorite" as const,
    is_clear: "isClear" as const,
  };
  const camelField = fieldMap[field as "is_favorite" | "is_clear"];
  const currentValue = userData?.[camelField] === 1;
  const newValue = !currentValue;

  await db("userGameData")
    .where("id", userGameDataId)
    .update({
      [camelField]: newValue ? 1 : 0,
    });

  return { path, field, value: newValue };
}

/**
 * 게임 배치 토글 핸들러 (여러 게임 일괄 즐겨찾기/숨김/클리어)
 */
export async function batchToggleGamesHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["batchToggleGames"],
): Promise<IpcMainEventMap["batchToggled"]> {
  const { paths, field, value } = payload;

  if (paths.length === 0) {
    return { field, updatedCount: 0 };
  }

  if (field === "is_hidden") {
    // isHidden은 games 테이블
    const updatedCount = await db("games")
      .whereIn("path", paths)
      .update({
        isHidden: value ? 1 : 0,
        updatedAt: new Date(),
      });
    return { field, updatedCount };
  }

  // isFavorite, isClear → user_game_data
  const fieldMap = {
    is_favorite: "isFavorite" as const,
    is_clear: "isClear" as const,
  };
  const camelField = fieldMap[field as "is_favorite" | "is_clear"];

  // 각 게임의 userGameData를 생성/확보
  const userGameDataIds: number[] = [];
  for (const path of paths) {
    const id = await getOrCreateUserGameData(path);
    userGameDataIds.push(id);
  }

  const updatedCount = await db("userGameData")
    .whereIn("id", userGameDataIds)
    .update({
      [camelField]: value ? 1 : 0,
    });

  return { field, updatedCount };
}

/**
 * 실행 제외 목록 조회 핸들러
 */
export async function getExcludedExecutablesHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["getExcludedExecutables"],
): Promise<IpcMainEventMap["excludedExecutables"]> {
  const executables = getExcludedExecutablesFromStore();
  return { executables };
}

/**
 * 실행 제외 목록에 추가 핸들러
 */
export async function addExcludedExecutableHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["addExcludedExecutable"],
): Promise<IpcMainEventMap["excludedExecutableAdded"]> {
  const { executable } = payload;

  // 파일명만 추출 (경로가 포함된 경우)
  const fileName = executable.split(/[/\\]/).pop() || executable;

  addExcludedExecutable(fileName);
  return { executable: fileName };
}

/**
 * 실행 제외 목록에서 제거 핸들러
 */
export async function removeExcludedExecutableHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["removeExcludedExecutable"],
): Promise<IpcMainEventMap["excludedExecutableRemoved"]> {
  const { executable } = payload;
  removeExcludedExecutable(executable);
  return { executable };
}

/**
 * 실행 파일 경로 직접 지정 핸들러
 */
export async function setExecutablePathHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["setExecutablePath"],
): Promise<IpcMainEventMap["executablePathSet"]> {
  const { path, executablePath } = payload;

  // 경로 유효성 검증
  validateDirectoryPath(path);

  // 게임 존재 확인
  const game = await db("games").where("path", path).first();
  if (!game) {
    throw new Error("게임을 찾을 수 없습니다.");
  }

  // 실행 파일 경로 업데이트
  await db("games").where("path", path).update({
    executablePath,
    updatedAt: new Date(),
  });

  return { path, executablePath };
}

/**
 * 원본 사이트 열기 핸들러
 */
export async function openOriginalSiteHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["openOriginalSite"],
): Promise<void> {
  const { path } = payload;

  // DB에서 게임 정보 조회
  const game = await db("games")
    .select("provider", "externalId")
    .where({ path })
    .first();

  if (!game?.provider || !game?.externalId) {
    throw new Error("원본 사이트 정보가 없습니다.");
  }

  // getCollectorUrl 함수를 사용하여 URL 생성
  const { getCollectorUrl } = await import("../collectors/registry.js");
  const url = getCollectorUrl(game.provider, game.externalId);
  if (!url) {
    throw new Error("원본 사이트 URL을 생성할 수 없습니다.");
  }

  shell.openExternal(url);
}
