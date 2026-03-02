import type { Knex } from "knex";

/**
 * game_images 테이블 생성
 * 게임의 추가 이미지들을 저장 (DLSite 샘플 이미지 등)
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable("game_images", (table) => {
    table.bigIncrements("id").primary();
    table.string("game_path").notNullable();
    table.string("path").notNullable(); // 다운로드된 로컬 경로
    table.integer("sort_order").defaultTo(0);
    table.datetime("created_at").defaultTo(knex.fn.now());

    table.foreign("game_path").references("games.path").onDelete("CASCADE");
    table.index("game_path");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("game_images");
}
