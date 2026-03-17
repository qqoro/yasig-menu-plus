import type { Knex } from "knex";
import fs from "fs";
import path from "path";

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
 * 라이브러리 경로 정규화 마이그레이션
 * DB games.source 컬럼 정규화만 수행
 * settings.json 정규화는 앱 시작 시 runLibraryPathsNormalization()에서 수행
 */
export async function up(knex: Knex): Promise<void> {
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

  console.log(
    `[마이그레이션] games.source 경로 정규화 완료: ${dbUpdatedCount}/${games.length}개 업데이트`,
  );
}

export async function down(_knex: Knex): Promise<void> {
  // 비가역적 — 원래 대소문자를 복원할 수 없음
  console.log("[마이그레이션] down: 경로 정규화는 롤백 불가능");
}
