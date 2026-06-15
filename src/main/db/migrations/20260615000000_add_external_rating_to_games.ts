import type { Knex } from "knex";

/**
 * external_rating 컬럼 추가 (사이트 외부 평균 평점, 0-5 실수)
 * user_game_data.rating(사용자 별점)과 별개.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.float("external_rating").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.dropColumn("external_rating");
  });
}
