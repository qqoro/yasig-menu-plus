import type { IpcMainInvokeEvent } from "electron";
import { readdir, stat, unlink } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import {
  copyImage,
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

// 지원하는 이미지 확장자 (우선순위 순)
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"];

/**
 * 이전 버전 썸네일 마이그레이션 핸들러
 */
export async function migrateThumbnailsHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["migrateThumbnails"],
): Promise<IpcMainEventMap["thumbnailsMigrated"]> {
  const { sourceFolder } = payload;

  // sourceFolder 유효성 검증 (폴더인지 확인)
  try {
    const stats = await stat(sourceFolder);
    if (!stats.isDirectory()) {
      throw new Error("선택한 경로가 폴더가 아닙니다.");
    }
  } catch (error) {
    console.error("[마이그레이션] 폴더 접근 실패:", sourceFolder, error);
    throw new Error("폴더에 접근할 수 없습니다.");
  }

  // 폴더 내 파일 목록 읽기
  const files = await readdir(sourceFolder);

  // 이미지 파일만 필터링
  const imageFiles = files.filter((file) => {
    const ext = extname(file).toLowerCase();
    return IMAGE_EXTENSIONS.includes(ext);
  });

  // 파일명(확장자 제외)으로 그룹핑
  const fileGroups = new Map<string, string[]>();
  for (const file of imageFiles) {
    const nameWithoutExt = basename(file, extname(file));
    const group = fileGroups.get(nameWithoutExt) || [];
    group.push(file);
    fileGroups.set(nameWithoutExt, group);
  }

  // 각 그룹에서 우선순위에 따라 하나 선택
  const selectedFiles = new Map<string, string>();
  for (const [name, groupFiles] of fileGroups) {
    // 우선순위 순으로 정렬된 첫 번째 매칭 선택
    for (const ext of IMAGE_EXTENSIONS) {
      const match = groupFiles.find((f) => extname(f).toLowerCase() === ext);
      if (match) {
        selectedFiles.set(name, join(sourceFolder, match));
        break;
      }
    }
  }

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;

  // DB에서 모든 게임 조회 (originalTitle 기준 매칭)
  const games = await db("games")
    .select("path", "originalTitle", "thumbnail")
    .whereNotNull("originalTitle");

  // originalTitle → game 매핑 (대소문자 무시)
  const gameMap = new Map<string, { path: string; thumbnail: string | null }>();
  for (const game of games) {
    const title = game.originalTitle?.toLowerCase();
    if (title) {
      gameMap.set(title, {
        path: game.path,
        thumbnail: game.thumbnail,
      });
    }
  }

  console.log(`[마이그레이션] DB에서 ${gameMap.size}개 게임 로드됨`);

  // 마이그레이션 수행
  for (const [nameWithoutExt, sourcePath] of selectedFiles) {
    const game = gameMap.get(nameWithoutExt.toLowerCase());

    if (!game) {
      console.log(`[마이그레이션] 매칭 실패: ${nameWithoutExt}`);
      failCount++;
      continue;
    }

    // 이미 썸네일이 있으면 건너뜀
    if (game.thumbnail) {
      skipCount++;
      continue;
    }

    try {
      // 파일 복사
      const destPath = await copyImage(sourcePath, game.path);

      // DB 업데이트
      await db("games")
        .where("path", game.path)
        .update({ thumbnail: destPath });

      successCount++;
    } catch (error) {
      console.error(`[마이그레이션] 복사 실패: ${nameWithoutExt}`, error);
      failCount++;
    }
  }

  console.log(
    `[마이그레이션] 완료: 성공 ${successCount}, 건너뜀 ${skipCount}, 실패 ${failCount}`,
  );

  return { successCount, skipCount, failCount };
}
