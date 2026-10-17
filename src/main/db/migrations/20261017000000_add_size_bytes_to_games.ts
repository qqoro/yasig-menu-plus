import type { Knex } from "knex";

/**
 * size_bytes 컬럼 추가 (게임 폴더/압축파일 용량, 바이트)
 * 스캔 시 계산. 아직 측정하지 않은 게임은 null.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.bigInteger("size_bytes").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.dropColumn("size_bytes");
  });
}
