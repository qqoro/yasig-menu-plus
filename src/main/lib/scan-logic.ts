/**
 * 파일시스템 스캔 로직
 *
 * Worker Thread에서 import할 순수 파일시스템 스캔 로직.
 * DB 의존성 없이 fs 작업만 수행합니다.
 */

import { existsSync, readdirSync } from "fs";
import { join } from "path";
import { COMPRESS_FILE_TYPE } from "../constants.js";
import { hasRjCode } from "./rj-code.js";

/**
 * 실행 가능한 파일 확장자
 */
export const EXECUTABLE_EXTENSIONS = [".exe", ".lnk", ".url"];

/**
 * 스캔 제외 폴더명 (대소문자 무시)
 */
export const EXCLUDED_FOLDER_NAMES = new Set([
  // Windows 시스템
  "$recycle.bin",
  "system volume information",
  // 개발 도구
  "node_modules",
  "__pycache__",
  // 게임 재배포 패키지
  "_commonredist",
  "directx",
  "redist",
  // 임시/캐시
  "temp",
  "tmp",
  "cache",
  "logs",
]);

/**
 * 게임 후보 (폴더 또는 압축파일)
 */
export interface GameCandidate {
  path: string;
  name: string;
  isCompressFile: boolean;
  hasExecutable: boolean;
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
export function scanSingleFolder(
  folderPath: string,
  enableNonGameContent = false,
): {
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
        if (EXCLUDED_FOLDER_NAMES.has(entry.name.toLowerCase())) continue;
        const hasExecutable = hasExecutableFile(fullPath);

        if (hasExecutable) {
          candidates.push({
            path: fullPath,
            name: entry.name,
            isCompressFile: false,
            hasExecutable: true,
          });
        } else {
          // 실행파일 없으면 하위 폴더로 스캔 예약
          // (RJ코드 폴더도 하위 스캔을 먼저 진행, scanFolderRecursive에서 후처리)
          subFolders.push(fullPath);
        }
      } else if (isCompressFile) {
        // 압축파일은 게임 후보
        candidates.push({
          path: fullPath,
          name: entry.name,
          isCompressFile: true,
          hasExecutable: true,
        });
      } else if (isExecutableFile) {
        // 실행파일(.exe, .lnk, .url)도 게임 후보
        candidates.push({
          path: fullPath,
          name: entry.name,
          isCompressFile: false,
          hasExecutable: true,
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
  enableNonGameContent = false,
): GameCandidate[] {
  const allCandidates: GameCandidate[] = [];
  // RJ코드 폴더 후보: 하위 스캔 후 게임이 없으면 비게임 콘텐츠로 등록
  const rjCodeFolders: string[] = [];
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

    const { candidates, subFolders } = scanSingleFolder(
      currentPath,
      enableNonGameContent,
    );

    // 게임 후보 수집
    allCandidates.push(...candidates);

    // 하위 폴더를 큐에 추가 + RJ코드 폴더 기록
    for (const subFolder of subFolders) {
      queue.push({ path: subFolder, depth: depth + 1 });

      if (enableNonGameContent) {
        const folderName = subFolder.split(/[\\/]/).pop() || "";
        if (hasRjCode(folderName)) {
          rjCodeFolders.push(subFolder);
        }
      }
    }
  }

  // 비게임 콘텐츠 후처리: 하위에 게임 후보가 없는 RJ코드 폴더만 등록
  // 깊은 폴더부터 처리하여 중첩 RJ코드 폴더를 올바르게 판별
  if (enableNonGameContent) {
    rjCodeFolders.sort((a, b) => b.length - a.length);
    for (const rjFolder of rjCodeFolders) {
      const hasChildCandidate = allCandidates.some(
        (c) =>
          c.path.startsWith(rjFolder + "/") ||
          c.path.startsWith(rjFolder + "\\"),
      );
      if (!hasChildCandidate) {
        allCandidates.push({
          path: rjFolder,
          name: rjFolder.split(/[\\/]/).pop() || "",
          isCompressFile: false,
          hasExecutable: false,
        });
      }
    }
  }

  return allCandidates;
}
