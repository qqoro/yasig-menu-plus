import type { Knex } from "knex";

/**
 * games 테이블 인덱스 추가
 *
 * - source: whereIn 필터링에 빈번하게 사용
 * - created_at: 정렬에 사용
 * - total_play_time: 정렬에 사용
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.index("source");
    table.index("created_at");
    table.index("total_play_time");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("games", (table) => {
    table.dropIndex("source");
    table.dropIndex("created_at");
    table.dropIndex("total_play_time");
  });
}
