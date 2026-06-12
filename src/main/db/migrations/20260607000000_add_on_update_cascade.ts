import type { Knex } from "knex";

/**
 * junction 테이블 FK에 ON UPDATE CASCADE 추가
 *
 * SQLite는 FK 제약조건 변경 DDL을 지원하지 않아 테이블 재생성이 필요하다.
 *
 * 주의: Knex 마이그레이션은 트랜잭션 내에서 실행되므로
 * PRAGMA foreign_keys = OFF가 동작하지 않는다.
 * 다행히 대상 테이블들은 다른 테이블에서 참조되지 않아
 * FK 활성 상태에서도 안전하게 재생성할 수 있다.
 *
 * game_path FK에만 ON UPDATE CASCADE를 추가한다.
 * (maker_id, category_id, tag_id는 auto-increment PK로 변경되지 않음)
 */

/** 재생성할 junction 테이블 정의 */
interface JunctionTableDef {
  name: string;
  /** 임시 테이블명과 cascade 여부를 받아 DDL 구문 배열 반환 */
  buildDdl: (tempName: string, cascade: boolean) => string[];
}

/** 대상 테이블 스키마 정의 */
const JUNCTION_TABLES: JunctionTableDef[] = [
  {
    name: "game_makers",
    buildDdl: (t, c) => [
      `CREATE TABLE "${t}" (
        "game_path" VARCHAR(255) NOT NULL,
        "maker_id" BIGINT NOT NULL,
        FOREIGN KEY("game_path") REFERENCES "games"("path") ON DELETE CASCADE${c ? " ON UPDATE CASCADE" : ""},
        FOREIGN KEY("maker_id") REFERENCES "makers"("id") ON DELETE CASCADE,
        PRIMARY KEY("game_path", "maker_id")
      )`,
    ],
  },
  {
    name: "game_categories",
    buildDdl: (t, c) => [
      `CREATE TABLE "${t}" (
        "game_path" VARCHAR(255) NOT NULL,
        "category_id" BIGINT NOT NULL,
        FOREIGN KEY("game_path") REFERENCES "games"("path") ON DELETE CASCADE${c ? " ON UPDATE CASCADE" : ""},
        FOREIGN KEY("category_id") REFERENCES "categories"("id") ON DELETE CASCADE,
        PRIMARY KEY("game_path", "category_id")
      )`,
    ],
  },
  {
    name: "game_tags",
    buildDdl: (t, c) => [
      `CREATE TABLE "${t}" (
        "game_path" VARCHAR(255) NOT NULL,
        "tag_id" BIGINT NOT NULL,
        FOREIGN KEY("game_path") REFERENCES "games"("path") ON DELETE CASCADE${c ? " ON UPDATE CASCADE" : ""},
        FOREIGN KEY("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE,
        PRIMARY KEY("game_path", "tag_id")
      )`,
    ],
  },
  {
    name: "game_images",
    buildDdl: (t, c) => [
      `CREATE TABLE "${t}" (
        "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        "game_path" VARCHAR(255) NOT NULL,
        "path" VARCHAR(255) NOT NULL,
        "sort_order" INTEGER DEFAULT 0,
        "created_at" DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY("game_path") REFERENCES "games"("path") ON DELETE CASCADE${c ? " ON UPDATE CASCADE" : ""}
      )`,
      `CREATE INDEX "${t}_game_path_index" ON "${t}"("game_path")`,
    ],
  },
];

/**
 * 테이블 재생성
 *
 * 1. 임시 테이블 생성 + 데이터 복사
 * 2. 기존 테이블을 백업으로 rename
 * 3. 임시를 원래 이름으로 rename
 * 4. 백업 삭제 (실패 시 백업에서 복구)
 */
async function recreateTable(
  knex: Knex,
  table: JunctionTableDef,
  cascade: boolean,
): Promise<void> {
  const { name } = table;
  const temp = `_temp_${name}`;
  const backup = `_old_${name}`;

  // 잔여 임시/백업 테이블 정리
  await knex.raw(`DROP TABLE IF EXISTS "${temp}"`);
  await knex.raw(`DROP TABLE IF EXISTS "${backup}"`);

  try {
    // 임시 테이블 생성 + 데이터 복사
    for (const sql of table.buildDdl(temp, cascade)) {
      await knex.raw(sql);
    }
    await knex.raw(`INSERT INTO "${temp}" SELECT * FROM "${name}"`);

    // 기존 → 백업, 임시 → 원래 이름
    await knex.raw(`ALTER TABLE "${name}" RENAME TO "${backup}"`);
    await knex.raw(`ALTER TABLE "${temp}" RENAME TO "${name}"`);

    // 성공: 백업 삭제
    await knex.raw(`DROP TABLE "${backup}"`);
  } catch (error) {
    // 실패 시 백업에서 복구 시도
    try {
      await knex.raw(`ALTER TABLE "${backup}" RENAME TO "${name}"`);
    } catch {
      // 복구 불가 - 백업 테이블(_old_*)이 남음
    }
    throw error;
  }
}

export async function up(knex: Knex): Promise<void> {
  for (const table of JUNCTION_TABLES) {
    await recreateTable(knex, table, true);
  }
}

export async function down(knex: Knex): Promise<void> {
  for (const table of JUNCTION_TABLES) {
    await recreateTable(knex, table, false);
  }
}
