import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. user_game_data 테이블 생성
  await knex.schema.createTable("user_game_data", (table) => {
    table.increments("id").primary();
    table.string("external_key").nullable().unique(); // "dlsite:RJ12345" 형태
    table.string("fingerprint").nullable().unique(); // SHA-256 해시
    table.integer("rating").nullable().defaultTo(null); // 별점 (1-5)
    table.integer("total_play_time").defaultTo(0); // 총 플레이 시간 (초)
    table.boolean("is_favorite").defaultTo(false);
    table.boolean("is_clear").defaultTo(false);
    table.datetime("last_played_at").nullable();
    table.datetime("created_at").defaultTo(knex.fn.now());

    // games 테이블에서 이동한 컬럼 인덱스
    table.index("is_favorite");
    table.index("is_clear");
    table.index("last_played_at");
    table.index("total_play_time");
  });

  // 2. 기존 games 데이터 → user_game_data로 마이그레이션
  // 유저 데이터가 있는 게임만 (기본값이 아닌 값이 하나라도 있는 경우)
  await knex.raw(`
    INSERT INTO user_game_data (external_key, rating, total_play_time, is_favorite, is_clear, last_played_at, created_at)
    SELECT
      CASE WHEN provider IS NOT NULL AND external_id IS NOT NULL AND external_id != ''
        THEN provider || ':' || external_id
        ELSE NULL
      END,
      rating,
      total_play_time,
      is_favorite,
      is_clear,
      last_played_at,
      created_at
    FROM games
    WHERE rating IS NOT NULL
      OR total_play_time > 0
      OR is_favorite = 1
      OR is_clear = 1
      OR last_played_at IS NOT NULL
  `);

  // 3. games에 user_game_data_id FK 추가
  // Knex alterTable의 .references()는 테이블 재생성(DROP TABLE)을 유발하므로
  // 네이티브 ALTER TABLE ADD COLUMN + inline REFERENCES 사용
  await knex.raw(`
    ALTER TABLE games ADD COLUMN user_game_data_id INTEGER
    REFERENCES user_game_data(id) ON DELETE SET NULL
  `);
  await knex.raw("ALTER TABLE games ADD COLUMN fingerprint TEXT");

  // 4. games.user_game_data_id 연결 (external_key 기준)
  await knex.raw(`
    UPDATE games SET user_game_data_id = (
      SELECT ud.id FROM user_game_data ud
      WHERE ud.external_key = games.provider || ':' || games.external_id
    )
    WHERE games.provider IS NOT NULL
      AND games.external_id IS NOT NULL
      AND games.external_id != ''
  `);

  // external_key가 없는 게임은 created_at 기준으로 매칭 (1:1 보장을 위해)
  // 유저 데이터가 있지만 external_key가 없는 경우
  await knex.raw(`
    UPDATE games SET user_game_data_id = (
      SELECT ud.id FROM user_game_data ud
      WHERE ud.external_key IS NULL
        AND ud.created_at = games.created_at
        AND ud.rating IS NOT DISTINCT FROM games.rating
        AND ud.total_play_time = games.total_play_time
        AND ud.is_favorite = games.is_favorite
        AND ud.is_clear = games.is_clear
      LIMIT 1
    )
    WHERE games.user_game_data_id IS NULL
      AND (games.rating IS NOT NULL
        OR games.total_play_time > 0
        OR games.is_favorite = 1
        OR games.is_clear = 1
        OR games.last_played_at IS NOT NULL)
  `);

  // 5. play_sessions 테이블 재생성 (FK 변경: gamePath → user_game_data_id)
  await knex.schema.createTable("play_sessions_new", (table) => {
    table.increments("id").primary();
    table
      .integer("user_game_data_id")
      .notNullable()
      .references("id")
      .inTable("user_game_data")
      .onDelete("CASCADE");
    table.datetime("started_at").notNullable();
    table.datetime("ended_at").nullable();
    table.integer("duration_seconds").notNullable();
    table.index("user_game_data_id");
    table.index("started_at");
  });

  // play_sessions 데이터 마이그레이션
  await knex.raw(`
    INSERT INTO play_sessions_new (id, user_game_data_id, started_at, ended_at, duration_seconds)
    SELECT ps.id, g.user_game_data_id, ps.started_at, ps.ended_at, ps.duration_seconds
    FROM play_sessions ps
    JOIN games g ON ps.game_path = g.path
    WHERE g.user_game_data_id IS NOT NULL
  `);

  await knex.schema.dropTable("play_sessions");
  await knex.schema.renameTable("play_sessions_new", "play_sessions");

  // 6. games 테이블에서 유저 데이터 컬럼 제거
  // 네이티브 ALTER TABLE DROP COLUMN 사용 (SQLite 3.35+)
  // Knex의 dropColumn은 테이블 재생성 방식이라 트랜잭션 내에서
  // PRAGMA foreign_keys = OFF가 불가능해 CASCADE 삭제가 발생함
  // 인덱스 제거 후 컬럼 삭제 (네이티브 DROP COLUMN은 인덱스가 있으면 실패)
  await knex.raw("DROP INDEX IF EXISTS games_is_favorite_index");
  await knex.raw("DROP INDEX IF EXISTS games_is_clear_index");
  await knex.raw("DROP INDEX IF EXISTS games_last_played_at_index");
  await knex.raw("DROP INDEX IF EXISTS games_total_play_time_index");
  await knex.raw("ALTER TABLE games DROP COLUMN rating");
  await knex.raw("ALTER TABLE games DROP COLUMN total_play_time");
  await knex.raw("ALTER TABLE games DROP COLUMN is_favorite");
  await knex.raw("ALTER TABLE games DROP COLUMN is_clear");
  await knex.raw("ALTER TABLE games DROP COLUMN last_played_at");
}

export async function down(knex: Knex): Promise<void> {
  // games에 유저 데이터 컬럼 복원
  await knex.schema.alterTable("games", (table) => {
    table.integer("rating").nullable().defaultTo(null);
    table.integer("total_play_time").defaultTo(0);
    table.boolean("is_favorite").defaultTo(false);
    table.boolean("is_clear").defaultTo(false);
    table.datetime("last_played_at").nullable();
  });

  // user_game_data → games 데이터 복원
  await knex.raw(`
    UPDATE games SET
      rating = (SELECT ud.rating FROM user_game_data ud WHERE ud.id = games.user_game_data_id),
      total_play_time = (SELECT ud.total_play_time FROM user_game_data ud WHERE ud.id = games.user_game_data_id),
      is_favorite = (SELECT ud.is_favorite FROM user_game_data ud WHERE ud.id = games.user_game_data_id),
      is_clear = (SELECT ud.is_clear FROM user_game_data ud WHERE ud.id = games.user_game_data_id),
      last_played_at = (SELECT ud.last_played_at FROM user_game_data ud WHERE ud.id = games.user_game_data_id)
    WHERE games.user_game_data_id IS NOT NULL
  `);

  // play_sessions 복원 (user_game_data_id → gamePath)
  await knex.schema.createTable("play_sessions_old", (table) => {
    table.increments("id").primary();
    table.string("game_path").notNullable();
    table.datetime("started_at").notNullable();
    table.datetime("ended_at").nullable();
    table.integer("duration_seconds").notNullable();
    table.index("game_path");
    table.index("started_at");
  });

  await knex.raw(`
    INSERT INTO play_sessions_old (id, game_path, started_at, ended_at, duration_seconds)
    SELECT ps.id, g.path, ps.started_at, ps.ended_at, ps.duration_seconds
    FROM play_sessions ps
    JOIN user_game_data ud ON ps.user_game_data_id = ud.id
    JOIN games g ON g.user_game_data_id = ud.id
  `);

  await knex.schema.dropTable("play_sessions");
  await knex.schema.renameTable("play_sessions_old", "play_sessions");

  // FK 및 fingerprint 컬럼 제거 (네이티브 DROP COLUMN 사용)
  await knex.raw("ALTER TABLE games DROP COLUMN user_game_data_id");
  await knex.raw("ALTER TABLE games DROP COLUMN fingerprint");

  await knex.schema.dropTableIfExists("user_game_data");
}
