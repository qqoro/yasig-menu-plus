/**
 * 게임 폴더의 콘텐츠 핑거프린트 계산
 *
 * 폴더 내 실행파일(EXECUTABLE_EXTENSIONS)의 이름+크기를 정렬하여 SHA-256 해시 생성.
 * 파일 내용을 읽지 않으므로 매우 빠름.
 *
 * 우선순위 (높은 순):
 * 1. www/data/System.json의 gameTitle (RPG Maker MV/MZ NW.js 패키징)
 * 2. data/System.json의 gameTitle (RPG Maker MV/MZ 직접 배포)
 * 3. RGSS 파일 (.rgss3a/.rgss2a/.rgssad) (RPG Maker VX/Ace/XP)
 * 4. package.json의 window.title (일반 NW.js)
 * 5. 실행파일 목록 (일반 게임)
 */

import { createHash } from "crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";
import { EXECUTABLE_EXTENSIONS } from "./scan-logic.js";

/** RGSS 확장자 목록 (RPG Maker VX/Ace/XP) */
const RGSS_EXTENSIONS = [".rgss3a", ".rgss2a", ".rgssad"];

/**
 * System.json에서 gameTitle 추출 시도
 * @returns gameTitle 또는 null
 */
function tryGetGameTitle(systemJsonPath: string): { gameTitle: string } | null {
  try {
    const systemJson = JSON.parse(readFileSync(systemJsonPath, "utf-8")) as {
      gameTitle?: string;
    };
    if (systemJson?.gameTitle) {
      return { gameTitle: systemJson.gameTitle };
    }
  } catch {
    // 파싱 실패
  }
  return null;
}

/**
 * 게임 경로의 핑거프린트 계산
 * - 폴더: 내부 실행파일(.exe, .lnk, .url 등)들의 이름:크기 목록을 SHA-256
 * - 단일 파일(압축 등): 파일명:크기를 SHA-256
 */
export function computeFingerprint(
  gamePath: string,
  isCompressFile: boolean,
): string | null {
  try {
    const stat = statSync(gamePath);
    if (isCompressFile || !stat.isDirectory()) {
      // 단일 파일: 파일명 + 크기
      const name = gamePath.split(/[\\/]/).pop() || "";
      const data = `${name}:${stat.size}`;
      return createHash("sha256").update(data).digest("hex");
    }

    // 폴더: 실행파일 및 RGSS 파일 목록 수집
    const entries = readdirSync(gamePath, { withFileTypes: true });
    const execEntries: string[] = [];
    const rgssEntries: string[] = [];
    let firstExecSize = 0;

    for (const entry of entries) {
      const lowerName = entry.name.toLowerCase();

      // 실행파일 수집
      if (
        entry.isFile() &&
        EXECUTABLE_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
      ) {
        const fileStat = statSync(join(gamePath, entry.name));
        execEntries.push(`${entry.name}:${fileStat.size}`);
        if (firstExecSize === 0) firstExecSize = fileStat.size;
      }

      // RGSS 파일 수집 (RPG Maker VX/Ace/XP)
      if (
        entry.isFile() &&
        RGSS_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
      ) {
        const fileStat = statSync(join(gamePath, entry.name));
        rgssEntries.push(`${entry.name}:${fileStat.size}`);
      }
    }

    if (execEntries.length === 0) return null;

    // 1. www/data/System.json (RPG Maker MV/MZ NW.js 패키징) - 최우선
    const wwwSystemPath = join(gamePath, "www", "data", "System.json");
    if (existsSync(wwwSystemPath)) {
      const result = tryGetGameTitle(wwwSystemPath);
      if (result) {
        const data = `${result.gameTitle}:${firstExecSize}`;
        return createHash("sha256").update(data).digest("hex");
      }
    }

    // 2. data/System.json (RPG Maker MV/MZ 직접 배포)
    const dataSystemPath = join(gamePath, "data", "System.json");
    if (existsSync(dataSystemPath)) {
      const result = tryGetGameTitle(dataSystemPath);
      if (result) {
        const data = `${result.gameTitle}:${firstExecSize}`;
        return createHash("sha256").update(data).digest("hex");
      }
    }

    // 3. RGSS 파일 (RPG Maker VX/Ace/XP)
    if (rgssEntries.length > 0) {
      rgssEntries.sort();
      const data = rgssEntries.join("|");
      return createHash("sha256").update(data).digest("hex");
    }

    // 4. NW.js: package.json의 window.title
    const pkgPath = join(gamePath, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
          window?: { title?: string };
        };
        if (pkg?.window?.title) {
          const data = `${pkg.window.title}:${firstExecSize}`;
          return createHash("sha256").update(data).digest("hex");
        }
      } catch {
        // package.json 파싱 실패 → 기존 로직 사용
      }
    }

    // 5. 일반 게임: 실행파일 목록으로 해시
    execEntries.sort();
    const data = execEntries.join("|");
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}
