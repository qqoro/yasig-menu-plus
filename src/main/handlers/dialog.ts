/**
 * 다이얼로그 핸들러
 *
 * Electron dialog API 래핑
 */

import type { IpcMainInvokeEvent } from "electron";
import { dialog } from "electron";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";

/**
 * 폴더 선택 다이얼로그
 */
export async function selectFolderHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["selectFolder"],
): Promise<IpcMainEventMap["selectFolder"]> {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    title: "게임 폴더 선택",
  });

  if (result.canceled) {
    return { filePaths: undefined };
  }

  return { filePaths: result.filePaths };
}

/**
 * 파일 선택 다이얼로그
 */
export async function selectFileHandler(
  _event: IpcMainInvokeEvent,
  _payload: unknown,
): Promise<{ filePaths: string[] | undefined }> {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    title: "이미지 파일 선택",
    filters: [
      {
        name: "이미지 파일",
        extensions: ["jpg", "jpeg", "png", "gif", "webp"],
      },
      { name: "모든 파일", extensions: ["*"] },
    ],
  });

  if (result.canceled) {
    return { filePaths: undefined };
  }

  return { filePaths: result.filePaths };
}

/**
 * 프로그램 선택 다이얼로그 (미디어 플레이어 등)
 */
export async function selectProgramHandler(
  _event: IpcMainInvokeEvent,
  _payload: unknown,
): Promise<{ filePaths: string[] | undefined }> {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    title: "프로그램 선택",
    filters: [
      { name: "실행 파일", extensions: ["exe"] },
      { name: "모든 파일", extensions: ["*"] },
    ],
  });

  if (result.canceled) {
    return { filePaths: undefined };
  }

  return { filePaths: result.filePaths };
}

/**
 * 실행 파일 선택 다이얼로그
 */
export async function selectExecutableFileHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["selectExecutableFile"],
): Promise<IpcMainEventMap["executableFileSelected"]> {
  const { gamePath } = payload;

  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    defaultPath: gamePath,
    title: "실행 파일 선택",
    filters: [
      { name: "실행 파일", extensions: ["exe", "lnk", "url"] },
      { name: "모든 파일", extensions: ["*"] },
    ],
  });

  if (result.canceled) {
    return { filePaths: undefined };
  }

  return { filePaths: result.filePaths };
}
