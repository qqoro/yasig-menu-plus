import type { Knex } from "knex";

/**
 * 게임 라이브러리 테이블 생성
 *
 * 정규화된 구조로 설계, 임시 필드 없음
 */
export async function up(knex: Knex): Promise<void> {
  // ========== games 테이블 ==========
  await knex.schema.createTable("games", (table) => {
    // 기본 키
    table.string("path").primary();

    // 이름
    table.string("title").notNullable(); // 표시 이름
    table.string("original_title").notNullable(); // 원본 파일/폴더명

    // 경로 정보
    table.string("source").notNullable(); // 라이브러리 경로
    table.string("thumbnail"); // 썸네일 경로
    table.string("executable_path"); // 실행 파일 경로 (직접 지정 시)

    // 외부 정보 (DLSite, Steam, Getchu, Ci-en 등)
    table.string("provider"); // 제공자 (dlsite, steam, getchu, cien, null)
    table.string("external_id"); // 외부 ID (RJ123456, Steam AppID 등)

    // 메타데이터
    table.text("memo"); // 메모
    table.datetime("publish_date"); // 발매일
    table.boolean("is_loaded_info").defaultTo(false); // 컬렉터 정보 수집 완료

    // 번역
    table.string("translated_title").nullable(); // 번역된 제목
    table.string("translation_source").nullable(); // 번역 제공자 (google, deepl, etc)

    // 플레이 상태
    table.boolean("is_favorite").defaultTo(false); // 즐겨찾기
    table.boolean("is_hidden").defaultTo(false); // 숨김
    table.boolean("is_clear").defaultTo(false); // 클리어
    table.datetime("last_played_at"); // 마지막 플레이 일시
    table.boolean("is_compress_file").defaultTo(false); // 압축 파일 여부

    // 타임스탬프
    table.datetime("created_at").defaultTo(knex.fn.now());
    table.datetime("updated_at");

    // 인덱스
    table.index("is_favorite");
    table.index("is_hidden");
    table.index("is_clear");
    table.index("last_played_at");
    table.index("is_compress_file");
    table.index(["provider", "external_id"]); // 복합 인덱스
    table.index("publish_date");
  });

  // ========== makers 테이블 (서큘/제작사) ==========
  await knex.schema.createTable("makers", (table) => {
    table.bigIncrements("id").primary();
    table.string("name").notNullable().unique();
    table.string("name_en");
    table.string("url");
    table.text("description");
    table.datetime("created_at").defaultTo(knex.fn.now());
  });

  // ========== categories 테이블 ==========
  await knex.schema.createTable("categories", (table) => {
    table.bigIncrements("id").primary();
    table.string("name").notNullable().unique();
    table.string("color");
    table.integer("sort_order").defaultTo(0);
    table.datetime("created_at").defaultTo(knex.fn.now());
  });

  // ========== tags 테이블 ==========
  await knex.schema.createTable("tags", (table) => {
    table.bigIncrements("id").primary();
    table.string("name").notNullable().unique();
    table.datetime("created_at").defaultTo(knex.fn.now());
  });

  // ========== 관계 테이블 ==========
  await knex.schema.createTable("game_makers", (table) => {
    table.string("game_path").notNullable();
    table.bigint("maker_id").notNullable();
    table.primary(["game_path", "maker_id"]);
    table.foreign("game_path").references("games.path").onDelete("CASCADE");
    table.foreign("maker_id").references("makers.id").onDelete("CASCADE");
  });

  await knex.schema.createTable("game_categories", (table) => {
    table.string("game_path").notNullable();
    table.bigint("category_id").notNullable();
    table.primary(["game_path", "category_id"]);
    table.foreign("game_path").references("games.path").onDelete("CASCADE");
    table
      .foreign("category_id")
      .references("categories.id")
      .onDelete("CASCADE");
  });

  await knex.schema.createTable("game_tags", (table) => {
    table.string("game_path").notNullable();
    table.bigint("tag_id").notNullable();
    table.primary(["game_path", "tag_id"]);
    table.foreign("game_path").references("games.path").onDelete("CASCADE");
    table.foreign("tag_id").references("tags.id").onDelete("CASCADE");
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("game_tags");
  await knex.schema.dropTableIfExists("game_categories");
  await knex.schema.dropTableIfExists("game_makers");
  await knex.schema.dropTableIfExists("tags");
  await knex.schema.dropTableIfExists("categories");
  await knex.schema.dropTableIfExists("makers");
  await knex.schema.dropTableIfExists("games");
}
