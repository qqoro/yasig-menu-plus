/**
 * 치트 플러그인 IPC 핸들러
 *
 * - RPG Maker 게임 감지
 * - 치트 모드로 게임 실행 (감지 → 주입 → 실행)
 */

import { ipcMain } from "electron";
import { IpcRendererSend } from "../events.js";
import { cheatInjector } from "../services/cheat-injector.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";
import { executeGameLaunch } from "./home-game-control.js";

/**
 * RPG Maker 게임 감지 핸들러
 */
const detectRpgMakerHandler = wrapIpcHandler(
  "detectRpgMaker",
  async (_event, payload: { path: string }) => {
    return await cheatInjector.detect(payload.path);
  },
);

/**
 * 치트 모드로 게임 실행 핸들러
 *
 * 1. RPG Maker 게임 감지
 * 2. 치트 플러그인 주입
 * 3. 게임 실행 (치트 모드 플래그 전달)
 */
const playGameWithCheatHandler = wrapIpcHandler(
  "playGameWithCheat",
  async (_event, payload: { path: string }) => {
    const { path } = payload;

    // RPG Maker 게임 감지
    const detection = await cheatInjector.detect(path);
    if (!detection.isRpgMaker) {
      throw new Error("RPG Maker MV/MZ 게임이 아닙니다.");
    }

    // 치트 플러그인 주입
    await cheatInjector.inject(path, detection);

    // 게임 실행 (치트 모드)
    return executeGameLaunch(path, true);
  },
);

/**
 * 치트 플러그인 관련 IPC 핸들러 등록
 */
export function registerCheatHandlers(): void {
  ipcMain.handle(IpcRendererSend.DetectRpgMaker, detectRpgMakerHandler);
  ipcMain.handle(IpcRendererSend.PlayGameWithCheat, playGameWithCheatHandler);
}
