import type { IpcMainInvokeEvent } from "electron";
import { readdir, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import {
  deleteThumbnail as deleteFile,
  downloadImage,
  getThumbnailDir,
} from "../utils/downloader.js";
import { validatePath } from "../utils/validator.js";

/**
 * 썸네일 다운로드 핸들러
 */
export async function downloadThumbnailHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["downloadThumbnail"],
): Promise<IpcMainEventMap["thumbnailDone"]> {
  const { gamePath, url } = payload;

  // gamePath 유효성 검증
  validatePath(gamePath);

  const filePath = await downloadImage(url, gamePath);

  // DB 업데이트
  await db("games").where("path", gamePath).update({ thumbnail: filePath });

  return { gamePath, thumbnailPath: filePath };
}

/**
 * 썸네일 삭제 핸들러
 */
export async function deleteThumbnailHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["deleteThumbnail"],
): Promise<void> {
  const { gamePath } = payload;

  // gamePath 유효성 검증
  validatePath(gamePath);

  // DB에서 썸네일 경로 조회
  const game = await db("games").where("path", gamePath).first();
  if (game?.thumbnail) {
    await deleteFile(game.thumbnail);
  }

  // DB 업데이트
  await db("games").where("path", gamePath).update({ thumbnail: null });
}

/**
 * 사용하지 않는 썸네일 삭제 핸들러
 */
export async function cleanUnusedThumbnailsHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["cleanUnusedThumbnails"],
): Promise<IpcMainEventMap["unusedThumbnailsCleaned"]> {
  const thumbnailDir = getThumbnailDir();

  // 1. thumbnails 폴더의 모든 파일 가져오기
  const files = await readdir(thumbnailDir);

  // 2. DB에서 사용 중인 썸네일 경로 가져오기
  const gameThumbnails = await db("games")
    .whereNotNull("thumbnail")
    .pluck("thumbnail")
    .select();

  // 3. game_images 테이블에서 사용 중인 이미지 경로도 가져오기
  const gameImages = await db("gameImages")
    .whereNotNull("path")
    .pluck("path")
    .select();

  // 4. DB에 있는 경로에서 파일명만 추출
  const nonNullThumbnails: string[] = gameThumbnails.filter(
    (path: unknown): path is string => path !== null,
  );
  const nonNullImages: string[] = gameImages.filter(
    (path: unknown): path is string => path !== null,
  );

  const usedFilenames = new Set([
    ...nonNullThumbnails.map((path: string) => basename(path)),
    ...nonNullImages.map((path: string) => basename(path)),
  ]);

  // 5. 사용하지 않는 파일 찾아 삭제
  let deletedCount = 0;
  let freedSpace = 0;

  for (const file of files) {
    if (!usedFilenames.has(file)) {
      const filePath = join(thumbnailDir, file);
      const stats = await stat(filePath);
      await unlink(filePath);
      deletedCount++;
      freedSpace += stats.size;
    }
  }

  return { deletedCount, freedSpace };
}
