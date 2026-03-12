import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // external_key가 있지만 fingerprint가 NULL인 user_game_data 레코드에
  // games 테이블의 fingerprint를 동기화한다.
  // UNIQUE 충돌 방지: 해당 fingerprint를 이미 가진 다른 레코드가 없는 경우만 업데이트.
  await knex.raw(`
    UPDATE user_game_data SET fingerprint = (
      SELECT g.fingerprint FROM games g
      WHERE g.provider IS NOT NULL
        AND g.external_id IS NOT NULL
        AND g.external_id != ''
        AND (g.provider || ':' || g.external_id) = user_game_data.external_key
        AND g.fingerprint IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_game_data u2
          WHERE u2.fingerprint = g.fingerprint
            AND u2.id != user_game_data.id
        )
      LIMIT 1
    )
    WHERE user_game_data.fingerprint IS NULL
      AND user_game_data.external_key IS NOT NULL
  `);
}

export async function down(_knex: Knex): Promise<void> {
  // 롤백 불필요: fingerprint 동기화는 데이터 보정이므로 원복 의미 없음
}
