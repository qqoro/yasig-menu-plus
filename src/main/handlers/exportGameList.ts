/**
 * 게임 목록 내보내기 핸들러
 *
 * 전체 라이브러리(숨김 게임 포함)를 제목 오름차순으로 TSV 파일에 저장한다.
 * 미리보기용 상위 5개 조회도 함께 제공한다.
 */

import { dialog } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { writeFile } from "fs/promises";
import { db } from "../db/db-manager.js";
import type {
  GameItem,
  IpcMainEventMap,
  IpcRendererEventMap,
} from "../events.js";
import {
  buildTsvRows,
  exportColumnLabels,
  rowsToTsv,
} from "../lib/export-format.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";
import {
  buildGameItems,
  leftJoinUserGameData,
  loadRelationsAndGroup,
} from "./home-utils.js";

/** 오늘 날짜 → YYYYMMDD (기본 파일명용) */
function formatToday(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/** 전체 게임 목록 조회 (숨김 포함, 제목 오름차순) */
export async function getAllGamesForExport(): Promise<GameItem[]> {
  const games = await leftJoinUserGameData(db("games")).select(
    "games.path",
    "games.title",
    "games.originalTitle",
    "games.source",
    "games.thumbnail",
    "games.executablePath",
    "games.isCompressFile",
    "games.hasExecutable",
    "games.publishDate",
    "games.externalRating",
    "games.externalReviewCount",
    "games.downloadCount",
    "games.isHidden",
    "games.provider",
    "games.externalId",
    "games.createdAt",
    "games.updatedAt",
    "games.translatedTitle",
    "games.translationSource",
    "userGameData.isFavorite",
    "userGameData.isClear",
    "userGameData.lastPlayedAt",
    "userGameData.rating",
    "userGameData.totalPlayTime",
  );

  const relations = await loadRelationsAndGroup(games.map((g) => g.path));
  const items = buildGameItems(games, relations);

  // 제목 오름차순 (한글 정렬)
  items.sort((a, b) => a.title.localeCompare(b.title, "ko"));
  return items;
}

/**
 * 게임 목록 TSV 내보내기 핸들러
 */
export const exportGameListHandler = wrapIpcHandler(
  "exportGameList",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["exportGameList"],
  ): Promise<IpcMainEventMap["gameListExported"]> => {
    const { columns, includeHeader } = payload;

    // 1. 전체 목록 조회 및 TSV 생성
    const games = await getAllGamesForExport();
    const rows = buildTsvRows(games, columns);
    const tsv = rowsToTsv(exportColumnLabels(columns), rows, includeHeader);

    // 2. 저장 경로 선택
    const dialogResult = await dialog.showSaveDialog({
      title: "게임 목록 내보내기",
      defaultPath: `yasig-menu-plus-games-${formatToday()}.tsv`,
      filters: [{ name: "TSV 파일", extensions: ["tsv"] }],
    });
    if (dialogResult.canceled || !dialogResult.filePath) {
      return null;
    }

    // 3. 파일 저장 (UTF-8 BOM — 엑셀 한글 깨짐 방지)
    await writeFile(
      dialogResult.filePath,
      String.fromCharCode(0xfeff) + tsv,
      "utf-8",
    );

    return { path: dialogResult.filePath };
  },
);

/**
 * 미리보기용 게임 목록 핸들러 (제목순 상위 5개)
 */
export const getGameExportPreviewHandler = wrapIpcHandler(
  "getGameExportPreview",
  async (
    _event: IpcMainInvokeEvent,
  ): Promise<IpcMainEventMap["exportPreviewLoaded"]> => {
    const games = await getAllGamesForExport();
    return { games: games.slice(0, 5) };
  },
);
