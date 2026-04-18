/**
 * 입력값 검증 유틸리티
 *
 * 보안: Path Traversal, 잘못된 입력 등을 방지
 */

import { stat, access } from "fs/promises";

/**
 * 경로 검증 오류
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * 경로가 상위 디렉토리 접근을 포함하는지 확인 (Path Traversal 방지)
 */
function hasPathTraversal(path: string): boolean {
  // 윈도우 경로 구분자도 처리
  const normalized = path.replace(/\\/g, "/");
  return normalized.includes("..");
}

/**
 * 경로 존재 여부 비동기 확인
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 경로 유효성 검증
 * @throws {ValidationError} 경로가 유효하지 않은 경우
 */
export async function validatePath(
  path: string,
  options?: { mustExist: boolean },
): Promise<void> {
  if (typeof path !== "string" || path.trim() === "") {
    throw new ValidationError("경로가 비어있습니다.");
  }

  // Path Traversal 방지
  if (hasPathTraversal(path)) {
    throw new ValidationError("경로에 상위 디렉토리 접근이 포함되어 있습니다.");
  }

  // 존재 여부 확인 (옵션)
  if (options?.mustExist && !(await pathExists(path))) {
    throw new ValidationError("존재하지 않는 경로입니다.");
  }
}

/**
 * 디렉토리 경로 유효성 검증
 * @throws {ValidationError} 경로가 유효하지 않은 경우
 */
export async function validateDirectoryPath(path: string): Promise<void> {
  await validatePath(path, { mustExist: true });

  try {
    const s = await stat(path);
    if (!s.isDirectory()) {
      throw new ValidationError("디렉토리가 아닙니다.");
    }
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("경로 정보를 가져올 수 없습니다.");
  }
}

/**
 * URL 유효성 검증
 * @throws {ValidationError} URL이 유효하지 않은 경우
 */
export function validateUrl(url: string): void {
  if (typeof url !== "string" || url.trim() === "") {
    throw new ValidationError("URL이 비어있습니다.");
  }

  // data URL 허용
  if (url.startsWith("data:")) {
    return;
  }

  try {
    const parsed = new URL(url);

    // HTTP/HTTPS만 허용
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new ValidationError("허용되지 않은 프로토콜입니다.");
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError("유효하지 않은 URL 형식입니다.");
  }
}

/**
 * 검색어 문자열 검증
 * @throws {ValidationError} 검색어가 유효하지 않은 경우
 */
export function validateSearchQuery(query: string): void {
  if (typeof query !== "string") {
    throw new ValidationError("검색어는 문자열이어야 합니다.");
  }

  // 너무 긴 검색어 방지
  if (query.length > 500) {
    throw new ValidationError("검색어가 너무 깁니다.");
  }
}

/**
 * SQL LIKE 쿼리용 문자열 이스케이프
 * Knex의 파라미터화된 쿼리를 사용하면 필요 없지만,
 * 직접 문자열을 조합해야 하는 경우를 대비해 제공
 */
export function escapeLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, "\\$&");
}
