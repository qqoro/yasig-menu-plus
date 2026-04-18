/**
 * 게임 폴더의 콘텐츠 핑거프린트 계산
 *
 * 폴더 내 파일의 이름+크기를 정렬하여 SHA-256 해시 생성.
 * 파일 내용을 읽지 않으므로 매우 빠름.
 *
 * 우선순위 (높은 순):
 * 1. www/data/System.json의 gameTitle (RPG Maker MV/MZ NW.js 패키징)
 * 2. data/System.json의 gameTitle (RPG Maker MV/MZ 직접 배포)
 * 3. RGSS 파일 (.rgss3a/.rgss2a/.rgssad) (RPG Maker VX/Ace/XP)
 * 4. 블랙리스트 기반 전체 파일 목록 (루트 + 1단계 하위)
 */

import { createHash } from "crypto";
import { type Dirent } from "fs";
import { readFile, stat, readdir, access } from "fs/promises";
import { join } from "path";
import { EXECUTABLE_EXTENSIONS } from "./scan-logic.js";

/** RGSS 확장자 목록 (RPG Maker VX/Ace/XP) */
const RGSS_EXTENSIONS = [".rgss3a", ".rgss2a", ".rgssad"];

/** 블랙리스트 — 제외 디렉토리 (소문자) */
const EXCLUDED_DIRS = new Set([
  "save",
  "saves",
  "log",
  "logs",
  "screenshot",
  "screenshots",
  "backup",
  "backups",
  "crash",
  "crashes",
  "temp",
  "tmp",
  "cache",
  "node_modules",
  "__pycache__",
  "_commonredist",
  "directx",
  "redist",
]);

/** 블랙리스트 — 제외 파일 확장자 (소문자) */
const EXCLUDED_FILE_EXTENSIONS = new Set([
  ".sav",
  ".save",
  ".rpgsave",
  ".log",
  ".bak",
  ".tmp",
  ".dmp",
  ".crashdump",
]);

/** 블랙리스트 — 제외 파일명 (소문자) */
const EXCLUDED_FILE_NAMES = new Set(["thumbs.db", "desktop.ini", ".ds_store"]);

/** 디렉토리당 최대 수집 파일 수 */
const MAX_FILES_PER_DIR = 100;

/** 경로 존재 여부 확인 (async) */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * System.json에서 gameTitle 추출 시도
 * @returns gameTitle 또는 null
 */
async function tryGetGameTitle(
  systemJsonPath: string,
): Promise<{ gameTitle: string } | null> {
  try {
    const systemJson = JSON.parse(await readFile(systemJsonPath, "utf-8")) as {
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
 * 파일이 블랙리스트에 해당하는지 확인
 */
function isExcludedFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  if (lower.startsWith(".")) return true;
  if (EXCLUDED_FILE_NAMES.has(lower)) return true;
  const dotIdx = lower.lastIndexOf(".");
  if (dotIdx >= 0 && EXCLUDED_FILE_EXTENSIONS.has(lower.slice(dotIdx)))
    return true;
  return false;
}

/**
 * Dirent 배열에서 블랙리스트 제외 후 파일 엔트리 수집
 *
 * @param dirPath 파일들이 위치한 디렉토리 절대경로 (stat용)
 * @param entries 이미 읽은 Dirent 배열
 * @param prefix 상대경로 프리픽스 (루트이면 "", 하위이면 "subdir/")
 * @returns "상대경로:크기" 형식의 엔트리 배열 (정렬+상한 적용)
 */
async function collectFileEntries(
  dirPath: string,
  entries: Dirent[],
  prefix: string,
): Promise<string[]> {
  const fileEntries: string[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (isExcludedFile(entry.name)) continue;

    const fileStat = await stat(join(dirPath, entry.name));
    fileEntries.push(`${prefix}${entry.name}:${fileStat.size}`);
  }

  fileEntries.sort();
  return fileEntries.slice(0, MAX_FILES_PER_DIR);
}

/**
 * 게임 경로의 핑거프린트 계산
 * - 폴더: 블랙리스트 기반 전체 파일 목록의 이름:크기를 SHA-256
 * - 단일 파일(압축 등): 파일명:크기를 SHA-256
 */
export async function computeFingerprint(
  gamePath: string,
  isCompressFile: boolean,
): Promise<string | null> {
  try {
    const fileStat = await stat(gamePath);
    if (isCompressFile || !fileStat.isDirectory()) {
      // 단일 파일: 파일명 + 크기
      const name = gamePath.split(/[\\/]/).pop() || "";
      const data = `${name}:${fileStat.size}`;
      return createHash("sha256").update(data).digest("hex");
    }

    // 폴더: 실행파일 및 RGSS 파일 목록 수집
    const entries = await readdir(gamePath, { withFileTypes: true });
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
        const es = await stat(join(gamePath, entry.name));
        execEntries.push(`${entry.name}:${es.size}`);
        if (firstExecSize === 0) firstExecSize = es.size;
      }

      // RGSS 파일 수집 (RPG Maker VX/Ace/XP)
      if (
        entry.isFile() &&
        RGSS_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
      ) {
        const es = await stat(join(gamePath, entry.name));
        rgssEntries.push(`${entry.name}:${es.size}`);
      }
    }

    // 1. www/data/System.json (RPG Maker MV/MZ NW.js 패키징) - 최우선
    const wwwSystemPath = join(gamePath, "www", "data", "System.json");
    if (await pathExists(wwwSystemPath)) {
      const result = await tryGetGameTitle(wwwSystemPath);
      if (result) {
        const data = `${result.gameTitle}:${firstExecSize}`;
        return createHash("sha256").update(data).digest("hex");
      }
    }

    // 2. data/System.json (RPG Maker MV/MZ 직접 배포)
    const dataSystemPath = join(gamePath, "data", "System.json");
    if (await pathExists(dataSystemPath)) {
      const result = await tryGetGameTitle(dataSystemPath);
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

    // 4. Fallback: 블랙리스트 기반 전체 파일 목록 (루트 + 1단계 하위)
    const allEntries: string[] = [];

    // 루트 파일 수집 (이미 읽은 entries 재사용)
    allEntries.push(...(await collectFileEntries(gamePath, entries, "")));

    // 1단계 하위 디렉토리 파일 수집
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (EXCLUDED_DIRS.has(entry.name.toLowerCase())) continue;

      try {
        const subPath = join(gamePath, entry.name);
        const subDirEntries = await readdir(subPath, { withFileTypes: true });
        const subEntries = await collectFileEntries(
          subPath,
          subDirEntries,
          `${entry.name}/`,
        );
        allEntries.push(...subEntries);
      } catch {
        // 하위 디렉토리 접근 실패 시 무시
      }
    }

    if (allEntries.length === 0) return null;

    allEntries.sort();
    const data = allEntries.join("|");
    return createHash("sha256").update(data).digest("hex");
  } catch {
    return null;
  }
}
