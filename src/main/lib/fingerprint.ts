/**
 * 게임 폴더의 콘텐츠 핑거프린트 계산
 *
 * 폴더 내 실행파일(.exe)의 이름+크기를 정렬하여 SHA-256 해시 생성.
 * 파일 내용을 읽지 않으므로 매우 빠름.
 */

import { createHash } from "crypto";
import { readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * 게임 경로의 핑거프린트 계산
 * - 폴더: 내부 .exe 파일들의 이름:크기 목록을 SHA-256
 * - 단일 파일(압축 등): 파일명:크기를 SHA-256
 */
export function computeFingerprint(
  gamePath: string,
  isCompressFile: boolean,
): string | null {
  try {
    if (isCompressFile || !statSync(gamePath).isDirectory()) {
      // 단일 파일: 파일명 + 크기
      const stat = statSync(gamePath);
      const name = gamePath.split(/[\\/]/).pop() || "";
      const data = `${name}:${stat.size}`;
      return createHash("sha256").update(data).digest("hex");
    }

    // 폴더: exe 파일 목록
    const entries = readdirSync(gamePath, { withFileTypes: true });
    const exeEntries: string[] = [];

    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase().endsWith(".exe")) {
        const fileStat = statSync(join(gamePath, entry.name));
        exeEntries.push(`${entry.name}:${fileStat.size}`);
      }
    }

    if (exeEntries.length === 0) return null;

    exeEntries.sort();
    const data = exeEntries.join("|");
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}
