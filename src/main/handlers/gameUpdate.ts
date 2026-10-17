/**
 * 게임 메타데이터 수정 핸들러
 * 메타데이터 수정, 관계 데이터 관리, 썸네일 관리
 */

import { ipcMain } from "electron";
import { db } from "../db/db-manager.js";
import { IpcRendererSend } from "../events.js";
import { getOrCreateUserGameData } from "../services/user-game-data.js";
import { copyImage, downloadImage } from "../utils/downloader.js";
import { validatePath, validateUrl } from "../utils/validator.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";
import { createLogger } from "../utils/logger.js";
import { deleteImageFileIfUnused } from "./gameImages.js";

const log = createLogger("GameUpdate");

/**
 * 메타데이터 수정
 */
export async function updateGameMetadata(
  path: string,
  metadata: {
    title?: string;
    originalTitle?: string;
    translatedTitle?: string | null;
    publishDate?: Date | string | null;
    memo?: string | null;
  },
): Promise<void> {
  // 경로 유효성 검증
  await validatePath(path);

  const updates: Record<string, unknown> = {};

  if (metadata.title !== undefined) {
    updates.title = metadata.title;
  }

  if (metadata.originalTitle !== undefined) {
    updates.originalTitle = metadata.originalTitle;
  }

  if (metadata.translatedTitle !== undefined) {
    updates.translatedTitle = metadata.translatedTitle;
  }

  if (metadata.publishDate !== undefined) {
    updates.publishDate = metadata.publishDate;
  }

  if (metadata.memo !== undefined) {
    updates.memo = metadata.memo;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  // 수동 수정 표시
  updates.isLoadedInfo = true;

  await db("games").where("path", path).update(updates);
}

/**
 * 별점 수정
 */
export async function updateRating(
  path: string,
  rating: number | null,
): Promise<void> {
  // 경로 유효성 검증
  await validatePath(path);

  // 범위 검증
  if (rating !== null && (rating < 1 || rating > 5)) {
    throw new Error("rating은 1-5 사이의 정수 또는 null이어야 합니다.");
  }

  const userGameDataId = await getOrCreateUserGameData(path);
  await db("userGameData").where("id", userGameDataId).update({ rating });
}

/**
 * 제작사 추가
 */
export async function addMaker(path: string, name: string): Promise<void> {
  // 경로 유효성 검증
  await validatePath(path);

  // 기존 제작사 확인
  const existingMaker = await db("makers").where("name", name).first();

  let makerId: number;
  if (existingMaker) {
    makerId = existingMaker.id;
  } else {
    // 새 제작사 생성
    const [maker] = await db("makers")
      .insert({
        name,
        createdAt: new Date(),
      })
      .returning("id");
    makerId = maker.id;
  }

  // 관계 확인 (이미 존재하면 무시)
  const existingRelation = await db("game_makers")
    .where("gamePath", path)
    .where("makerId", makerId)
    .first();

  if (!existingRelation) {
    await db("game_makers").insert({
      gamePath: path,
      makerId,
    });
  }
}

/**
 * 제작사 제거
 */
export async function removeMaker(path: string, name: string): Promise<void> {
  // 경로 유효성 검증
  await validatePath(path);

  // 제작사 ID 조회
  const maker = await db("makers").where("name", name).first();
  if (!maker) {
    return;
  }

  await db("game_makers")
    .where("gamePath", path)
    .where("makerId", maker.id)
    .delete();
}

/**
 * 카테고리 추가
 */
export async function addCategory(path: string, name: string): Promise<void> {
  // 경로 유효성 검증
  await validatePath(path);

  // 기존 카테고리 확인
  const existingCategory = await db("categories").where("name", name).first();

  let categoryId: number;
  if (existingCategory) {
    categoryId = existingCategory.id;
  } else {
    // 새 카테고리 생성
    const [category] = await db("categories")
      .insert({
        name,
        sortOrder: Date.now(), // 현재 시간을 정렬 순서로 사용
        createdAt: new Date(),
      })
      .returning("id");
    categoryId = category.id;
  }

  // 관계 확인 (이미 존재하면 무시)
  const existingRelation = await db("game_categories")
    .where("gamePath", path)
    .where("categoryId", categoryId)
    .first();

  if (!existingRelation) {
    await db("game_categories").insert({
      gamePath: path,
      categoryId,
    });
  }
}

/**
 * 카테고리 제거
 */
export async function removeCategory(
  path: string,
  name: string,
): Promise<void> {
  // 경로 유효성 검증
  await validatePath(path);

  // 카테고리 ID 조회
  const category = await db("categories").where("name", name).first();
  if (!category) {
    return;
  }

  await db("game_categories")
    .where("gamePath", path)
    .where("categoryId", category.id)
    .delete();
}

/**
 * 태그 추가
 */
export async function addTag(path: string, name: string): Promise<void> {
  // 경로 유효성 검증
  await validatePath(path);

  // 기존 태그 확인
  const existingTag = await db("tags").where("name", name).first();

  let tagId: number;
  if (existingTag) {
    tagId = existingTag.id;
  } else {
    // 새 태그 생성
    const [tag] = await db("tags")
      .insert({
        name,
        createdAt: new Date(),
      })
      .returning("id");
    tagId = tag.id;
  }

  // 관계 확인 (이미 존재하면 무시)
  const existingRelation = await db("game_tags")
    .where("gamePath", path)
    .where("tagId", tagId)
    .first();

  if (!existingRelation) {
    await db("game_tags").insert({
      gamePath: path,
      tagId,
    });
  }
}

/**
 * 태그 제거
 */
export async function removeTag(path: string, name: string): Promise<void> {
  // 경로 유효성 검증
  await validatePath(path);

  // 태그 ID 조회
  const tag = await db("tags").where("name", name).first();
  if (!tag) {
    return;
  }

  await db("game_tags").where("gamePath", path).where("tagId", tag.id).delete();
}

/**
 * URL에서 썸네일 설정
 */
export async function setThumbnailFromUrl(
  path: string,
  url: string,
): Promise<string> {
  // 경로 유효성 검증
  await validatePath(path);
  // URL 유효성 검증
  validateUrl(url);

  // 고유 이름으로 저장: 순번 파일(캐러셀 0번 이미지)을 덮어쓰지 않도록
  const filePath = await downloadImage(url, path, "unique");
  await replaceThumbnail(path, filePath);
  return filePath;
}

/**
 * 로컬 파일에서 썸네일 설정
 */
export async function setThumbnailFromFile(
  path: string,
  sourceFilePath: string,
): Promise<string> {
  // 경로 유효성 검증
  await validatePath(path);

  const filePath = await copyImage(sourceFilePath, path, "unique");
  await replaceThumbnail(path, filePath);
  return filePath;
}

/**
 * 썸네일 경로를 바꾸고, 더 이상 쓰이지 않는 이전 썸네일 파일을 정리
 */
async function replaceThumbnail(
  path: string,
  thumbnail: string | null,
): Promise<void> {
  const game = await db("games").where("path", path).first("thumbnail");
  const previous: string | null = game?.thumbnail ?? null;

  // DB 업데이트 (수동 수정 표시)
  await db("games")
    .where("path", path)
    .update({ thumbnail, isLoadedInfo: true, updatedAt: new Date() });

  // 캐러셀 이미지와 같은 파일일 수 있으므로 참조가 없을 때만 삭제
  if (previous && previous !== thumbnail) {
    await deleteImageFileIfUnused(previous);
  }
}

/**
 * 썸네일 삭제 (DB null + 쓰이지 않는 파일 삭제)
 */
export async function hideThumbnail(path: string): Promise<void> {
  // 경로 유효성 검증
  await validatePath(path);

  await replaceThumbnail(path, null);
}

/**
 * 핸들러 등록
 */
export function registerHandlers(): void {
  // 메타데이터 수정
  ipcMain.handle(
    IpcRendererSend.UpdateGameMetadata,
    wrapIpcHandler("updateGameMetadata", async (_event, { path, metadata }) => {
      await updateGameMetadata(path, metadata);
      log.info(
        `메타데이터 수정: ${path} (${Object.keys(metadata).join(", ")})`,
      );
      return { path };
    }),
  );

  // 별점 수정
  ipcMain.handle(
    IpcRendererSend.UpdateRating,
    wrapIpcHandler("updateRating", async (_event, { path, rating }) => {
      await updateRating(path, rating);
      log.info(`별점 수정: ${path} → ${rating}`);
      return { path, rating };
    }),
  );

  // 제작사 관리
  ipcMain.handle(
    IpcRendererSend.AddMaker,
    wrapIpcHandler("addMaker", async (_event, { path, name }) => {
      await addMaker(path, name);
      log.info(`제작사 추가: ${path} + ${name}`);
      return { path, name };
    }),
  );

  ipcMain.handle(
    IpcRendererSend.RemoveMaker,
    wrapIpcHandler("removeMaker", async (_event, { path, name }) => {
      await removeMaker(path, name);
      log.info(`제작사 제거: ${path} - ${name}`);
      return { path, name };
    }),
  );

  // 카테고리 관리
  ipcMain.handle(
    IpcRendererSend.AddCategory,
    wrapIpcHandler("addCategory", async (_event, { path, name }) => {
      await addCategory(path, name);
      log.info(`카테고리 추가: ${path} + ${name}`);
      return { path, name };
    }),
  );

  ipcMain.handle(
    IpcRendererSend.RemoveCategory,
    wrapIpcHandler("removeCategory", async (_event, { path, name }) => {
      await removeCategory(path, name);
      log.info(`카테고리 제거: ${path} - ${name}`);
      return { path, name };
    }),
  );

  // 태그 관리
  ipcMain.handle(
    IpcRendererSend.AddTag,
    wrapIpcHandler("addTag", async (_event, { path, name }) => {
      await addTag(path, name);
      log.info(`태그 추가: ${path} + ${name}`);
      return { path, name };
    }),
  );

  ipcMain.handle(
    IpcRendererSend.RemoveTag,
    wrapIpcHandler("removeTag", async (_event, { path, name }) => {
      await removeTag(path, name);
      log.info(`태그 제거: ${path} - ${name}`);
      return { path, name };
    }),
  );

  // 썸네일 관리
  ipcMain.handle(
    IpcRendererSend.SetThumbnailFromUrl,
    wrapIpcHandler("setThumbnailFromUrl", async (_event, { path, url }) => {
      const thumbnailPath = await setThumbnailFromUrl(path, url);
      log.info(`썸네일 설정 (URL): ${path}`);
      return { path, thumbnailPath };
    }),
  );

  ipcMain.handle(
    IpcRendererSend.SetThumbnailFromFile,
    wrapIpcHandler(
      "setThumbnailFromFile",
      async (_event, { path, filePath }) => {
        const thumbnailPath = await setThumbnailFromFile(path, filePath);
        log.info(`썸네일 설정 (파일): ${path} ← ${filePath}`);
        return { path, thumbnailPath };
      },
    ),
  );

  ipcMain.handle(
    IpcRendererSend.HideThumbnail,
    wrapIpcHandler("hideThumbnail", async (_event, { path }) => {
      await hideThumbnail(path);
      log.info(`썸네일 숨김: ${path}`);
      return { path };
    }),
  );
}
