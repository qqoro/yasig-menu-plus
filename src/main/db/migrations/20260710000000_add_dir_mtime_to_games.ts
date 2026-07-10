import type { Knex } from "knex";

/**
 * dir_mtime_ms 컬럼 추가 (증분 스캔용)
 *
 * 게임 후보(폴더/압축파일)의 mtime을 저장해두고,
 * 재스캔 시 mtime이 같으면 fingerprint 재계산과 UPDATE를 건너뛴다.
 * 기존 행은 NULL → 업그레이드 후 첫 스캔에서 한 번 채워진다.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.double("dir_mtime_ms").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.dropColumn("dir_mtime_ms");
  });
}
