import { isAbsolute, join } from "node:path";
import { getThumbnailDir } from "./downloader.js";

/**
 * 상대 경로를 절대 경로로 변환
 * - null이면 null 반환
 * - 이미 절대 경로면 그대로 반환 (마이그레이션 전 데이터 호환)
 * - 상대 경로면 thumbnails 디렉토리 기준 절대 경로 반환
 */
export function toAbsolutePath(relativePath: string | null): string | null {
  if (!relativePath) return null;
  if (isAbsolute(relativePath)) return relativePath;
  return join(getThumbnailDir(), relativePath);
}

/**
 * 절대 경로를 상대 경로로 변환 (파일명만 저장)
 * - null이면 null 반환
 * - thumbnails 디렉토리 내 파일이면 파일명만 반환
 * - 외부 경로면 그대로 반환
 */
export function toRelativePath(absolutePath: string | null): string | null {
  if (!absolutePath) return null;

  const thumbnailDir = getThumbnailDir();
  const normalizedPath = absolutePath.replace(/\\/g, "/");
  const normalizedDir = thumbnailDir.replace(/\\/g, "/");

  if (normalizedPath.startsWith(normalizedDir + "/")) {
    // 파일명만 반환
    return normalizedPath.slice(normalizedDir.length + 1);
  }
  return absolutePath;
}
