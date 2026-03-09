/**
 * 파일시스템 스캔 로직
 *
 * Worker Thread에서 import할 순수 파일시스템 스캔 로직.
 * DB 의존성 없이 fs 작업만 수행합니다.
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { COMPRESS_FILE_TYPE } from "../constants.js";

/**
 * 실행 가능한 파일 확장자
 */
export const EXECUTABLE_EXTENSIONS = [".exe", ".lnk", ".url"];

/**
 * 게임 후보 (폴더 또는 압축파일)
 */
export interface GameCandidate {
  path: string;
  name: string;
  isCompressFile: boolean;
}

/**
 * 폴더에 실행 파일이 있는지 확인
 */
export function hasExecutableFile(folderPath: string): boolean {
  try {
    const entries = readdirSync(folderPath, { withFileTypes: true });
    return entries.some(
      (entry) =>
        entry.isFile() &&
        EXECUTABLE_EXTENSIONS.some((ext) =>
          entry.name.toLowerCase().endsWith(ext),
        ),
    );
  } catch {
    return false;
  }
}

/**
 * 단일 폴더를 스캔하여 게임 후보와 하위 폴더 목록 반환
 */
export function scanSingleFolder(folderPath: string): {
  candidates: GameCandidate[];
  subFolders: string[];
} {
  const candidates: GameCandidate[] = [];
  const subFolders: string[] = [];

  if (!existsSync(folderPath)) {
    return { candidates, subFolders };
  }

  try {
    const entries = readdirSync(folderPath, { withFileTypes: true });

    for (const entry of entries) {
      // 숨김 파일/폴더 제외
      if (entry.name.startsWith(".")) continue;

      const fullPath = join(folderPath, entry.name);

      // 압축파일 확인
      const isCompressFile = COMPRESS_FILE_TYPE.some((ext) =>
        entry.name.toLowerCase().endsWith(ext),
      );

      // 실행파일(.exe, .lnk, .url) 확인
      const isExecutableFile =
        entry.isFile() &&
        EXECUTABLE_EXTENSIONS.some((ext) =>
          entry.name.toLowerCase().endsWith(ext),
        );

      if (entry.isDirectory()) {
        // 폴더인 경우: 실행파일 확인
        const hasExecutable = hasExecutableFile(fullPath);

        if (hasExecutable) {
          // 실행파일이 있으면 게임 후보
          candidates.push({
            path: fullPath,
            name: entry.name,
            isCompressFile: false,
          });
        } else {
          // 실행파일이 없으면 하위 폴더로 스캔 예약
          subFolders.push(fullPath);
        }
      } else if (isCompressFile) {
        // 압축파일은 게임 후보
        candidates.push({
          path: fullPath,
          name: entry.name,
          isCompressFile: true,
        });
      } else if (isExecutableFile) {
        // 실행파일(.exe, .lnk, .url)도 게임 후보
        candidates.push({
          path: fullPath,
          name: entry.name,
          isCompressFile: false,
        });
      }
    }
  } catch (error) {
    console.error(`폴더 스캔 오류 (${folderPath}):`, error);
  }

  return { candidates, subFolders };
}

/**
 * 폴더를 재귀적으로 스캔하여 모든 게임 후보 수집
 */
export function scanFolderRecursive(
  startPath: string,
  maxDepth: number,
): GameCandidate[] {
  const allCandidates: GameCandidate[] = [];
  const queue: Array<{ path: string; depth: number }> = [
    { path: startPath, depth: 0 },
  ];

  while (queue.length > 0) {
    const { path: currentPath, depth } = queue.shift()!;

    // 최대 깊이 초과 시 스킵
    if (depth > maxDepth) {
      console.log(`최대 깊이 초과로 스킵: ${currentPath}`);
      continue;
    }

    const { candidates, subFolders } = scanSingleFolder(currentPath);

    // 게임 후보 수집
    allCandidates.push(...candidates);

    // 하위 폴더를 큐에 추가
    for (const subFolder of subFolders) {
      queue.push({ path: subFolder, depth: depth + 1 });
    }
  }

  return allCandidates;
}
