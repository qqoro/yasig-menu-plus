import type { Knex } from "knex";
import { app } from "electron";
import { isAbsolute } from "node:path";

/**
 * 기존 절대 경로에서 파일명만 추출
 * 개발 모드에서는 app이 준비되지 않을 수 있으므로 안전하게 처리
 */
function extractFileName(absolutePath: string | null): string | null {
  if (!absolutePath) return null;
  if (!isAbsolute(absolutePath)) return absolutePath;

  // thumbnails 디렉토리 경로 계산
  let thumbnailDir: string;
  try {
    thumbnailDir = app.getPath("userData");
  } catch {
    // 개발 모드에서 app이 준비되지 않은 경우
    return absolutePath;
  }

  const normalizedPath = absolutePath.replace(/\\/g, "/");
  const normalizedDir = thumbnailDir.replace(/\\/g, "/");

  if (normalizedPath.startsWith(normalizedDir + "/thumbnails/")) {
    // 파일명만 반환
    return normalizedPath.slice(normalizedDir.length + "/thumbnails/".length);
  }
  return absolutePath;
}

/**
 * games.thumbnail과 game_images.path를 파일명만 저장하도록 변환
 */
export async function up(knex: Knex): Promise<void> {
  // games 테이블 마이그레이션
  const games = await knex("games")
    .whereNotNull("thumbnail")
    .select("path", "thumbnail");

  for (const game of games) {
    const fileName = extractFileName(game.thumbnail);
    if (fileName && fileName !== game.thumbnail) {
      await knex("games")
        .where("path", game.path)
        .update({ thumbnail: fileName });
    }
  }

  // game_images 테이블 마이그레이션
  const images = await knex("game_images")
    .whereNotNull("path")
    .select("id", "path");

  for (const image of images) {
    const fileName = extractFileName(image.path);
    if (fileName && fileName !== image.path) {
      await knex("game_images")
        .where("id", image.id)
        .update({ path: fileName });
    }
  }

  console.log(
    `[마이그레이션] 썸네일 경로 상대 경로 변환 완료: games ${games.length}개, images ${images.length}개`,
  );
}

export async function down(knex: Knex): Promise<void> {
  // 롤백은 불가능 (원래 절대 경로를 알 수 없음)
  console.log("[마이그레이션] down: 롤백 불가능");
}
