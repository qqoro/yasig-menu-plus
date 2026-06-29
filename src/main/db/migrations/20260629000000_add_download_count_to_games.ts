import type { Knex } from "knex";

/**
 * download_count 컬럼 추가 (사이트 다운로드/판매 수)
 * DLSite dl_count 기반. Steam/Getchu/Cien/Google은 null.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.integer("download_count").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.dropColumn("download_count");
  });
}
