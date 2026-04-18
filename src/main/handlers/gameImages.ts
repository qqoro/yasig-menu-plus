import type { IpcMainInvokeEvent } from "electron";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import { toAbsolutePath } from "../utils/image-path.js";
import { validatePath } from "../utils/validator.js";

/**
 * 게임 이미지 목록 조회 핸들러
 */
export async function getGameImagesHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getGameImages"],
): Promise<IpcMainEventMap["gameImagesLoaded"]> {
  const { gamePath } = payload;

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
