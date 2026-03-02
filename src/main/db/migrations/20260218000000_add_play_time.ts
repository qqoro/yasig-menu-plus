import type { Knex } from "knex";

/**
 * 플레이 타임 추적을 위한 컬럼 및 테이블 추가
 */
export async function up(knex: Knex): Promise<void> {
  // games 테이블에 컬럼 추가
  await knex.schema.alterTable("games", (table) => {
    table.integer("total_play_time").defaultTo(0); // 총 플레이 시간 (초)
    table.datetime("session_start_at").nullable(); // 현재 세션 시작 시간
  });

  // play_sessions 테이블 생성
  await knex.schema.createTable("play_sessions", (table) => {
    table.increments("id").primary();
    table.string("game_path").notNullable();
    table.datetime("started_at").notNullable();
    table.datetime("ended_at").nullable();
    table.integer("duration_seconds").defaultTo(0);

    table.foreign("game_path").references("games.path").onDelete("CASCADE");
    table.index("game_path");
    table.index("started_at");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("play_sessions");
  await knex.schema.alterTable("games", (table) => {
    table.dropColumn("session_start_at");
    table.dropColumn("total_play_time");
  });
}
