import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // 1. games.fingerprint 인덱스 추가 (JOIN 성능)
  await knex.raw(
    "CREATE INDEX IF NOT EXISTS idx_games_fingerprint ON games(fingerprint)",
  );

  // 2. fingerprint가 없는 user_game_data에 연결된 games의 fingerprint 채우기
  await knex.raw(`
    UPDATE user_game_data SET fingerprint = (
      SELECT g.fingerprint FROM games g
      WHERE g.user_game_data_id = user_game_data.id
        AND g.fingerprint IS NOT NULL
      LIMIT 1
    )
    WHERE fingerprint IS NULL
  `);

  // 3. games 테이블에서 user_game_data_id 컬럼 제거
  // SQLite는 ALTER TABLE DROP COLUMN을 지원 (3.35.0+)
  await knex.raw("ALTER TABLE games DROP COLUMN user_game_data_id");
}

export async function down(knex: Knex): Promise<void> {
  // user_game_data_id 컬럼 복원
  await knex.raw(`
    ALTER TABLE games ADD COLUMN user_game_data_id INTEGER
    REFERENCES user_game_data(id) ON DELETE SET NULL
  `);

  // fingerprint 기반으로 FK 재연결
  await knex.raw(`
    UPDATE games SET user_game_data_id = (
      SELECT ud.id FROM user_game_data ud
      WHERE ud.fingerprint = games.fingerprint
      LIMIT 1
    )
    WHERE games.fingerprint IS NOT NULL
  `);

  // 인덱스 제거
  await knex.raw("DROP INDEX IF EXISTS idx_games_fingerprint");
}
