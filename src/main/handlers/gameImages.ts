import type { IpcMainInvokeEvent } from "electron";
import type { Knex } from "knex";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import { copyImage, deleteImage, downloadImage } from "../utils/downloader.js";
import { toAbsolutePath } from "../utils/image-path.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";
import { createLogger } from "../utils/logger.js";
import { validatePath, validateUrl } from "../utils/validator.js";

const log = createLogger("GameImages");

/**
 * 게임 이미지 목록 조회 (IPC와 MCP가 공유)
 */
export async function getGameImages(
  gamePath: string,
): Promise<IpcMainEventMap["gameImagesLoaded"]> {
  // gamePath 유효성 검증
  await validatePath(gamePath);

  const images = await db("gameImages")
    .where("game_path", gamePath)
    .orderBy("sort_order")
    .select();

  // 이미지 경로를 절대 경로로 변환
  return {
    images: images.map((img: { path: string; sortOrder: number }) => ({
      path: toAbsolutePath(img.path) ?? img.path,
      sortOrder: img.sortOrder,
    })),
  };
}

/**
 * 게임 이미지 목록 조회 핸들러
 */
export async function getGameImagesHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getGameImages"],
): Promise<IpcMainEventMap["gameImagesLoaded"]> {
  return getGameImages(payload.gamePath);
}

// ========== 이미지 관리 ==========

interface ImageRow {
  id: number;
  path: string;
  sortOrder: number;
}

/**
 * DB에 저장된 경로(상대/절대)가 렌더러가 넘긴 절대 경로와 같은지
 */
function isSamePath(dbPath: string, absolutePath: string): boolean {
  return (toAbsolutePath(dbPath) ?? dbPath) === absolutePath;
}

async function loadImageRows(
  trx: Knex | Knex.Transaction,
  gamePath: string,
): Promise<ImageRow[]> {
  return trx("gameImages")
    .where("game_path", gamePath)
    .orderBy([{ column: "sort_order" }, { column: "id" }])
    .select("id", "path", "sortOrder");
}

/**
 * 이미지 파일을 아무 게임도 쓰지 않을 때만 삭제
 * 썸네일과 캐러셀 이미지가 같은 파일을 공유할 수 있어서 참조를 확인한다.
 */
export async function deleteImageFileIfUnused(dbPath: string): Promise<void> {
  const absolutePath = toAbsolutePath(dbPath) ?? dbPath;
  const candidates = [dbPath, absolutePath];

  const usedByGame = await db("games")
    .whereIn("thumbnail", candidates)
    .first("path");
  const usedByImage = await db("gameImages")
    .whereIn("path", candidates)
    .first("id");
  if (usedByGame || usedByImage) return;

  await deleteImage(absolutePath);
}

/**
 * 저장된 이미지 파일들을 목록에 끼워 넣는다
 * @param afterPath 이 이미지 바로 뒤에 추가 (null이거나 못 찾으면 맨 뒤)
 */
async function insertImages(
  gamePath: string,
  newPaths: string[],
  afterPath: string | null,
): Promise<void> {
  await db.transaction(async (trx) => {
    const rows: Array<{ id?: number; path: string; sortOrder?: number }> =
      await loadImageRows(trx, gamePath);

    // 추가 이미지 없이 썸네일만 보이던 게임은 썸네일을 먼저 목록에 올린다
    // (캐러셀이 썸네일로 폴백하던 상태라, 그대로 추가하면 썸네일이 캐러셀에서 사라짐)
    if (rows.length === 0) {
      const game = await trx("games")
        .where("path", gamePath)
        .first("thumbnail");
      if (game?.thumbnail) rows.push({ path: game.thumbnail });
    }

    const afterIndex = afterPath
      ? rows.findIndex((row) => isSamePath(row.path, afterPath))
      : -1;
    const insertAt = afterIndex >= 0 ? afterIndex + 1 : rows.length;
    rows.splice(insertAt, 0, ...newPaths.map((path) => ({ path })));

    for (const [index, row] of rows.entries()) {
      if (row.id === undefined) {
        await trx("gameImages").insert({
          game_path: gamePath,
          path: row.path,
          sort_order: index,
        });
      } else if (row.sortOrder !== index) {
        await trx("gameImages")
          .where("id", row.id)
          .update({ sort_order: index });
      }
    }

    // 수동 수정 표시 (일반 수집에서 덮어쓰지 않도록)
    await trx("games")
      .where("path", gamePath)
      .update({ isLoadedInfo: true, updatedAt: new Date() });
  });
}

/**
 * URL 이미지를 받아 게임 이미지로 추가
 * @returns 추가된 이미지의 절대 경로
 */
export async function addGameImageFromUrl(
  gamePath: string,
  url: string,
  afterPath: string | null,
): Promise<string[]> {
  await validatePath(gamePath);
  validateUrl(url);

  const saved = await downloadImage(url, gamePath, "unique");
  await insertImages(gamePath, [saved], afterPath);
  return [toAbsolutePath(saved) ?? saved];
}

/**
 * 로컬 이미지 파일들을 게임 이미지로 추가
 * 일부 파일이 실패해도 나머지는 추가한다.
 */
export async function addGameImagesFromFiles(
  gamePath: string,
  filePaths: string[],
  afterPath: string | null,
): Promise<IpcMainEventMap["gameImagesAdded"]> {
  await validatePath(gamePath);

  const saved: string[] = [];
  let failed = 0;
  for (const filePath of filePaths) {
    try {
      saved.push(await copyImage(filePath, gamePath, "unique"));
    } catch (error) {
      failed++;
      log.warn(`이미지 추가 실패, 건너뜀: ${filePath}`, error);
    }
  }

  if (saved.length === 0) {
    throw new Error("이미지를 추가하지 못했습니다.");
  }

  await insertImages(gamePath, saved, afterPath);
  return {
    paths: saved.map((path) => toAbsolutePath(path) ?? path),
    failed,
  };
}

/**
 * 게임 이미지 삭제
 * 썸네일로 쓰이던 이미지면 썸네일도 비운다.
 */
export async function deleteGameImage(
  gamePath: string,
  imagePath: string,
): Promise<void> {
  await validatePath(gamePath);

  const rows = await loadImageRows(db, gamePath);
  const target = rows.find((row) => isSamePath(row.path, imagePath));
  const game = await db("games").where("path", gamePath).first("thumbnail");
  const thumbnail: string | null = game?.thumbnail ?? null;
  const isThumbnail = !!thumbnail && isSamePath(thumbnail, imagePath);

  // 캐러셀이 썸네일로 폴백해 보여주던 이미지는 목록에 없을 수 있다
  const removedPath = target?.path ?? (isThumbnail ? thumbnail : null);
  if (!removedPath) {
    throw new Error("이미지를 찾을 수 없습니다.");
  }

  await db.transaction(async (trx) => {
    if (target) {
      await trx("gameImages").where("id", target.id).delete();
    }
    await trx("games")
      .where("path", gamePath)
      .update({
        ...(isThumbnail ? { thumbnail: null } : {}),
        isLoadedInfo: true,
        updatedAt: new Date(),
      });
  });

  await deleteImageFileIfUnused(removedPath);
}

/**
 * 게임 이미지 하나를 썸네일로 지정
 */
export async function setThumbnailFromImage(
  gamePath: string,
  imagePath: string,
): Promise<void> {
  await validatePath(gamePath);

  const rows = await loadImageRows(db, gamePath);
  const target = rows.find((row) => isSamePath(row.path, imagePath));
  if (!target) {
    throw new Error("이미지를 찾을 수 없습니다.");
  }

  const game = await db("games").where("path", gamePath).first("thumbnail");
  const previous: string | null = game?.thumbnail ?? null;

  await db("games").where("path", gamePath).update({
    thumbnail: target.path,
    isLoadedInfo: true,
    updatedAt: new Date(),
  });

  // 이전 썸네일 파일이 더 이상 쓰이지 않으면 정리
  if (previous && previous !== target.path) {
    await deleteImageFileIfUnused(previous);
  }
}

// ========== IPC 핸들러 ==========

export const addGameImageFromUrlHandler = wrapIpcHandler(
  "addGameImageFromUrl",
  async (
    _event: IpcMainInvokeEvent,
    { gamePath, url, afterPath }: IpcRendererEventMap["addGameImageFromUrl"],
  ): Promise<IpcMainEventMap["gameImagesAdded"]> => {
    const paths = await addGameImageFromUrl(gamePath, url, afterPath);
    log.info(`이미지 추가 (URL): ${gamePath}`);
    return { paths, failed: 0 };
  },
);

export const addGameImagesFromFilesHandler = wrapIpcHandler(
  "addGameImagesFromFiles",
  async (
    _event: IpcMainInvokeEvent,
    {
      gamePath,
      filePaths,
      afterPath,
    }: IpcRendererEventMap["addGameImagesFromFiles"],
  ): Promise<IpcMainEventMap["gameImagesAdded"]> => {
    const result = await addGameImagesFromFiles(gamePath, filePaths, afterPath);
    log.info(
      `이미지 추가 (파일): ${gamePath} — ${result.paths.length}장, 실패 ${result.failed}장`,
    );
    return result;
  },
);

export const deleteGameImageHandler = wrapIpcHandler(
  "deleteGameImage",
  async (
    _event: IpcMainInvokeEvent,
    { gamePath, imagePath }: IpcRendererEventMap["deleteGameImage"],
  ): Promise<void> => {
    await deleteGameImage(gamePath, imagePath);
    log.info(`이미지 삭제: ${gamePath}`);
  },
);

export const setThumbnailFromImageHandler = wrapIpcHandler(
  "setThumbnailFromImage",
  async (
    _event: IpcMainInvokeEvent,
    { gamePath, imagePath }: IpcRendererEventMap["setThumbnailFromImage"],
  ): Promise<void> => {
    await setThumbnailFromImage(gamePath, imagePath);
    log.info(`썸네일 지정 (이미지): ${gamePath}`);
  },
);
