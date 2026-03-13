/**
 * 번역 핸들러
 *
 * 단일 게임 번역, 전체 게임 번역 (구글 번역만 사용)
 */

import type { IpcMainInvokeEvent } from "electron";
import { BrowserWindow } from "electron";
import { db } from "../db/db-manager.js";
import {
  IpcMainEventMap,
  IpcMainSend,
  IpcRendererEventMap,
} from "../events.js";
import { TranslationManager } from "../services/translation-manager.js";
import { getTranslationSettings, setTranslationSettings } from "../store.js";

/**
 * 번역 매니저 인스턴스 가져오기
 */
function getTranslationManager(): TranslationManager {
  return new TranslationManager();
}

/**
 * 단일 게임 제목 번역 핸들러
 */
export async function translateTitleHandler(
  event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["translateTitle"],
): Promise<IpcMainEventMap["translationDone"]> {
  const { path, force } = payload;

  // 게임 정보 조회
  const game = await db("games").where("path", path).first();
  if (!game) {
    throw new Error("게임을 찾을 수 없습니다.");
  }

  // 이미 번역된 경우, force=true가 아니면 스킵
  if (game.translatedTitle && !force) {
    return {
      path,
      translatedTitle: game.translatedTitle,
      source: game.translationSource || "unknown",
    };
  }

  // 번역 매니저로 번역
  const manager = getTranslationManager();
  const result = await manager.translate(game.title);

  // DB 업데이트
  await db("games").where("path", path).update({
    translatedTitle: result.translatedText,
    translationSource: result.source,
    translatedAt: new Date(),
    updatedAt: new Date(),
  });

  return {
    path,
    translatedTitle: result.translatedText,
    source: result.source,
  };
}

/**
 * 전체 게임 제목 번역 핸들러
 */
export async function translateAllTitlesHandler(
  event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["translateAllTitles"],
): Promise<IpcMainEventMap["allTranslationsDone"]> {
  const { force } = payload;

  // 번역할 게임 목록 조회
  let query = db("games").select("path", "title", "translatedTitle");

  // force=false면 아직 번역되지 않은 게임만
  if (!force) {
    query = query.whereNull("translatedTitle");
  }

  const games = await query;
  const total = games.length;

  if (total === 0) {
    return { total: 0, success: 0, failed: 0 };
  }

  let success = 0;
  let failed = 0;
  const manager = getTranslationManager();
  const win = BrowserWindow.fromWebContents(event.sender);

  // 순차적으로 번역
  for (let i = 0; i < games.length; i++) {
    const game = games[i];

    try {
      // 진행률 이벤트 전송
      if (win) {
        win.webContents.send(IpcMainSend.TranslationProgress, {
          current: i + 1,
          total,
          gameTitle: game.title,
        });
      }

      const result = await manager.translate(game.title);

      // DB 업데이트
      await db("games").where("path", game.path).update({
        translatedTitle: result.translatedText,
        translationSource: result.source,
        translatedAt: new Date(),
        updatedAt: new Date(),
      });

      success++;
    } catch {
      failed++;
    }
  }

  return { total, success, failed };
}

/**
 * 번역 설정 조회 핸들러
 */
export async function getTranslationSettingsHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["getTranslationSettings"],
): Promise<IpcMainEventMap["translationSettings"]> {
  const settings = getTranslationSettings();
  return { settings };
}

/**
 * 번역 설정 저장 핸들러
 */
export async function setTranslationSettingsHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["setTranslationSettings"],
): Promise<void> {
  const { settings } = payload;
  setTranslationSettings(settings);
}
