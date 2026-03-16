import { realpathSync } from "fs";
import path from "path";

/**
 * 경로 정규화
 * 1. path.resolve() — 절대 경로 변환, 구분자 통일
 * 2. 끝 구분자 제거 (루트 드라이브 제외)
 * 3. realpathSync.native() — 파일 시스템의 실제 대소문자 반영
 */
export function normalizePath(inputPath: string): string {
  let resolved = path.resolve(inputPath);
  if (resolved !== path.parse(resolved).root) {
    resolved = resolved.replace(/[\\/]+$/, "");
  }
  try {
    return realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}
