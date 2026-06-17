import type { Knex } from "knex";

/**
 * external_review_count 컬럼 추가 (사이트 외부 리뷰 수)
 * external_rating(사이트 평균 평점)과 나란히 저장.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.integer("external_review_count").nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.dropColumn("external_review_count");
  });
}
