import type { Knex } from "knex";

/**
 * translated_at 컬럼 추가
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.datetime("translated_at").nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.dropColumn("translated_at");
  });
}
