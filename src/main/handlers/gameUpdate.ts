/**
 * 게임 메타데이터 수정 핸들러
 * 메타데이터 수정, 관계 데이터 관리, 썸네일 관리
 */

import { app, ipcMain } from "electron";
import { copyFile, mkdir } from "fs/promises";
import { join } from "path";
import { db } from "../db/db-manager.js";
import { IpcRendererSend } from "../events.js";
import { downloadImage } from "../utils/downloader.js";
import { validatePath, validateUrl } from "../utils/validator.js";

/**
 * 썸네일 저장 디렉토리 경로
 */
function getThumbnailDir(): string {
  return join(app.getPath("userData"), "thumbnails");
}

/**
 * 메타데이터 수정
 */
export async function updateGameMetadata(
  path: string,
  metadata: {
    title?: string;
    publishDate?: Date | string | null;
    memo?: string | null;
  },
): Promise<void> {
  // 경로 유효성 검증
  validatePath(path);

  const updates: Record<string, unknown> = {};

  if (metadata.title !== undefined) {
    updates.title = metadata.title;
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
  validatePath(path);

  // 범위 검증
  if (rating !== null && (rating < 1 || rating > 5)) {
    throw new Error("rating은 1-5 사이의 정수 또는 null이어야 합니다.");
  }

  await db("games").where("path", path).update({ rating });
}

/**
 * 제작사 추가
 */
export async function addMaker(path: string, name: string): Promise<void> {
  // 경로 유효성 검증
  validatePath(path);

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
  validatePath(path);

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
  validatePath(path);

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
  validatePath(path);

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
  validatePath(path);

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
  validatePath(path);

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
  validatePath(path);
  // URL 유효성 검증
  validateUrl(url);

  const thumbnailDir = getThumbnailDir();
  await mkdir(thumbnailDir, { recursive: true });

  const filePath = await downloadImage(url, path);

  // DB 업데이트
  await db("games").where("path", path).update({ thumbnail: filePath });

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
  validatePath(path);

  const thumbnailDir = getThumbnailDir();
  await mkdir(thumbnailDir, { recursive: true });

  const { createHash } = await import("crypto");
  const hash = createHash("md5").update(path).digest("hex");
  const filename = `${hash}.${getFileExtension(sourceFilePath)}`;
  const destPath = join(thumbnailDir, filename);

  // 파일 복사
  await copyFile(sourceFilePath, destPath);

  // DB 업데이트
  await db("games").where("path", path).update({ thumbnail: destPath });

  return destPath;
}

/**
 * 썸네일 삭제 (파일 삭제 + DB null)
 */
export async function hideThumbnail(path: string): Promise<void> {
  // 경로 유효성 검증
  validatePath(path);

  // 현재 썸네일 경로 조회
  const game = await db("games").where("path", path).first();
  const thumbnailPath = game?.thumbnail;

  // DB에서 썸네일 경로 제거
  await db("games").where("path", path).update({ thumbnail: null });

  // 실제 파일 삭제
  if (thumbnailPath) {
    const { deleteThumbnail: deleteFile } =
      await import("../utils/downloader.js");
    await deleteFile(thumbnailPath);
  }
}

/**
 * 파일 확장자 추출
 */
function getFileExtension(filePath: string): string {
  const ext = filePath.split(".").pop();
  return ext || "jpg";
}

/**
 * 핸들러 등록
 */
export function registerHandlers(): void {
  // 메타데이터 수정
  ipcMain.handle(
    IpcRendererSend.UpdateGameMetadata,
    async (_event, { path, metadata }) => {
      try {
        await updateGameMetadata(path, metadata);
        return { path };
      } catch (error) {
        console.error("메타데이터 수정 실패:", error);
        throw error;
      }
    },
  );

  // 별점 수정
  ipcMain.handle(
    IpcRendererSend.UpdateRating,
    async (_event, { path, rating }) => {
      try {
        await updateRating(path, rating);
        return { path, rating };
      } catch (error) {
        console.error("별점 수정 실패:", error);
        throw error;
      }
    },
  );

  // 제작사 관리
  ipcMain.handle(IpcRendererSend.AddMaker, async (_event, { path, name }) => {
    try {
      await addMaker(path, name);
      return { path, name };
    } catch (error) {
      console.error("제작사 추가 실패:", error);
      throw error;
    }
  });

  ipcMain.handle(
    IpcRendererSend.RemoveMaker,
    async (_event, { path, name }) => {
      try {
        await removeMaker(path, name);
        return { path, name };
      } catch (error) {
        console.error("제작사 제거 실패:", error);
        throw error;
      }
    },
  );

  // 카테고리 관리
  ipcMain.handle(
    IpcRendererSend.AddCategory,
    async (_event, { path, name }) => {
      try {
        await addCategory(path, name);
        return { path, name };
      } catch (error) {
        console.error("카테고리 추가 실패:", error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    IpcRendererSend.RemoveCategory,
    async (_event, { path, name }) => {
      try {
        await removeCategory(path, name);
        return { path, name };
      } catch (error) {
        console.error("카테고리 제거 실패:", error);
        throw error;
      }
    },
  );

  // 태그 관리
  ipcMain.handle(IpcRendererSend.AddTag, async (_event, { path, name }) => {
    try {
      await addTag(path, name);
      return { path, name };
    } catch (error) {
      console.error("태그 추가 실패:", error);
      throw error;
    }
  });

  ipcMain.handle(IpcRendererSend.RemoveTag, async (_event, { path, name }) => {
    try {
      await removeTag(path, name);
      return { path, name };
    } catch (error) {
      console.error("태그 제거 실패:", error);
      throw error;
    }
  });

  // 썸네일 관리
  ipcMain.handle(
    IpcRendererSend.SetThumbnailFromUrl,
    async (_event, { path, url }) => {
      try {
        const thumbnailPath = await setThumbnailFromUrl(path, url);
        return { path, thumbnailPath };
      } catch (error) {
        console.error("썸네일 설정 실패 (URL):", error);
        throw error;
      }
    },
  );

  ipcMain.handle(
    IpcRendererSend.SetThumbnailFromFile,
    async (_event, { path, filePath }) => {
      try {
        const thumbnailPath = await setThumbnailFromFile(path, filePath);
        return { path, thumbnailPath };
      } catch (error) {
        console.error("썸네일 설정 실패 (파일):", error);
        throw error;
      }
    },
  );

  ipcMain.handle(IpcRendererSend.HideThumbnail, async (_event, { path }) => {
    try {
      await hideThumbnail(path);
      return { path };
    } catch (error) {
      console.error("썸네일 숨김 실패:", error);
      throw error;
    }
  });
}
