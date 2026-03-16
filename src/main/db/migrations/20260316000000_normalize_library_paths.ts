import type { Knex } from "knex";
import fs from "fs";
import path from "path";
import { app } from "electron";
import ElectronStore from "electron-store";

/**
 * 경로 정규화 (인라인 — 프로덕션 마이그레이션에서 상대 import 불가)
 */
function normalizePath(inputPath: string): string {
  let resolved = path.resolve(inputPath);
  if (resolved !== path.parse(resolved).root) {
    resolved = resolved.replace(/[\\/]+$/, "");
  }
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

/**
 * 정규화 + 중복 제거 헬퍼
 */
function deduplicateNormalized(paths: string[]): string[] {
  const seen = new Map<string, string>();
  for (const p of paths) {
    const normalized = normalizePath(p);
    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  }
  return [...seen.values()];
}

/**
 * electron-store 인스턴스 생성 (인라인)
 */
function getStore(): ElectronStore {
  return new ElectronStore({
    name: "settings",
    cwd: app.getPath("userData"),
  });
}

interface LibraryScanInfo {
  lastScannedAt: string;
  lastGameCount: number;
}

/**
 * 라이브러리 경로 정규화 마이그레이션
 * - DB games.source 컬럼 정규화
 * - settings.json의 libraryPaths, disabledLibraryPaths, libraryScanHistory 정규화
 */
export async function up(knex: Knex): Promise<void> {
  // 1. DB games.source 정규화
  const games = await knex("games").select("path", "source");
  let dbUpdatedCount = 0;

  for (const game of games) {
    if (!game.source) continue;
    const normalized = normalizePath(game.source);
    if (normalized !== game.source) {
      await knex("games")
        .where("path", game.path)
        .update({ source: normalized });
      dbUpdatedCount++;
    }
  }

  // 2. settings.json 정규화
  const store = getStore();

  // 2-1. libraryPaths
  const paths: string[] = store.get("libraryPaths", []) as string[];
  store.set("libraryPaths", deduplicateNormalized(paths));

  // 2-2. disabledLibraryPaths
  const disabled: string[] = store.get("disabledLibraryPaths", []) as string[];
  store.set("disabledLibraryPaths", deduplicateNormalized(disabled));

  // 2-3. libraryScanHistory 키 정규화
  const history: Record<string, LibraryScanInfo> =
    (store.get("libraryScanHistory") as Record<string, LibraryScanInfo>) || {};
  const newHistory: Record<string, LibraryScanInfo> = {};
  for (const [key, value] of Object.entries(history)) {
    const normalizedKey = normalizePath(key);
    // 중복 키가 생기면 최신 스캔 기록 유지
    if (
      !newHistory[normalizedKey] ||
      value.lastScannedAt > newHistory[normalizedKey].lastScannedAt
    ) {
      newHistory[normalizedKey] = value;
    }
  }
  store.set("libraryScanHistory", newHistory);

  console.log(
    `[마이그레이션] 경로 정규화 완료: games ${dbUpdatedCount}/${games.length}개 업데이트, ` +
      `libraryPaths ${paths.length}개, disabledPaths ${disabled.length}개, ` +
      `scanHistory ${Object.keys(history).length}개`,
  );
}

export async function down(_knex: Knex): Promise<void> {
  // 비가역적 — 원래 대소문자를 복원할 수 없음
  console.log("[마이그레이션] down: 경로 정규화는 롤백 불가능");
}
