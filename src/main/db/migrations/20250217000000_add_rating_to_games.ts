import type { Knex } from "knex";

/**
 * rating 컬럼 추가 (별점: 1-5)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.integer("rating").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.dropColumn("rating");
  });
}
