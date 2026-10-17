/**
 * 폴더/파일 용량 계산
 */

import { readdir, stat } from "fs/promises";
import { join } from "path";

/**
 * 폴더 하위 전체 파일 용량 합계 (바이트)
 * 접근 불가 파일/디렉토리는 0으로 계산한다.
 */
export async function getFolderSize(dirPath: string): Promise<number> {
  let size = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    // 병렬로 처리하여 성능 개선
    const results = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return getFolderSize(fullPath);
        } else if (entry.isFile()) {
          try {
            const fileStat = await stat(fullPath);
            return fileStat.size;
          } catch {
            // 접근 불가 파일 무시
            return 0;
          }
        }
        return 0;
      }),
    );
    size = results.reduce((sum, s) => sum + s, 0);
  } catch {
    // 접근 불가 디렉토리 무시
  }
  return size;
}

/**
 * 게임 경로의 용량 (바이트)
 * 압축파일은 파일 크기, 폴더는 하위 전체 합계. 경로 자체에 접근할 수 없으면 null.
 */
export async function getGameSize(
  gamePath: string,
  isCompressFile: boolean,
): Promise<number | null> {
  try {
    const pathStat = await stat(gamePath);
    if (isCompressFile || pathStat.isFile()) {
      return pathStat.size;
    }
    return await getFolderSize(gamePath);
  } catch {
    return null;
  }
}
