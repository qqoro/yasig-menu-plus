import type { Knex } from "knex";
import knex from "knex";
import { readdirSync } from "fs";
import { resolve } from "path";

// snake_case를 camelCase로 변환하는 함수 (재귀적으로 객체/배열 처리)
const toCamelCase = (obj: any): any => {
  if (obj === null || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  const result: any = {};
  for (const key in obj) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter: string) =>
      letter.toUpperCase(),
    );
    result[camelKey] = toCamelCase(obj[key]);
  }
  return result;
};

// camelCase를 snake_case로 변환하는 함수
const toSnakeCase = (str: string): string => {
  if (!str) return str;
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
};

/**
 * vitest 환경에서 .ts 마이그레이션 파일을 로드하기 위한 커스텀 마이그레이션 소스.
 * Knex 기본 로더는 Node.js의 require/import를 사용하여 .ts 파일을 로드할 수 없으므로,
 * dynamic import()를 통해 vitest의 모듈 변환을 활용한다.
 */
class VitestMigrationSource implements Knex.MigrationSource<string> {
  private readonly migrationsDir: string;

  constructor(migrationsDir: string) {
    this.migrationsDir = migrationsDir;
  }

  getMigrations(): Promise<string[]> {
    const files = readdirSync(this.migrationsDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
      .sort();
    return Promise.resolve(files);
  }

  getMigrationName(migration: string): string {
    return migration;
  }

  async getMigration(migration: string): Promise<{
    up: (knex: Knex) => Promise<void>;
    down: (knex: Knex) => Promise<void>;
  }> {
    const fullPath = resolve(this.migrationsDir, migration);
    const mod = await import(fullPath);
    return mod;
  }
}

/**
 * 인메모리 SQLite 테스트용 Knex 인스턴스를 생성한다.
 * 프로덕션 DBManager와 동일한 postProcessResponse/wrapIdentifier 설정을 적용한다.
 * 마이그레이션을 실행하여 모든 테이블을 생성한 뒤 인스턴스를 반환한다.
 */
export async function createTestDb(): Promise<Knex> {
  const migrationsDir = resolve(import.meta.dirname, "./migrations");

  const db = knex({
    client: "better-sqlite3",
    connection: { filename: ":memory:" },
    useNullAsDefault: true,
    postProcessResponse: (result) => toCamelCase(result),
    wrapIdentifier: (value, origImpl) =>
      value === "*" ? origImpl(value) : origImpl(toSnakeCase(value)),
    migrations: {
      migrationSource: new VitestMigrationSource(migrationsDir),
    },
  });

  // SQLite 외래키 활성화
  await db.raw("PRAGMA foreign_keys = ON");

  // 마이그레이션 실행 — 모든 테이블 생성
  await db.migrate.latest();

  return db;
}

/**
 * 모든 테이블의 데이터를 삭제한다.
 * 외래키 제약 조건 순서를 고려하여 자식 테이블부터 삭제한다.
 */
export async function truncateAll(db: Knex): Promise<void> {
  // FK 종속 순서: 자식 → 부모
  const tables = [
    "play_sessions",
    "game_tags",
    "game_categories",
    "game_makers",
    "game_images",
    "games",
    "user_game_data",
    "tags",
    "categories",
    "makers",
  ];

  for (const table of tables) {
    await db(table).del();
  }
}

// ========== 시드 헬퍼 함수 ==========

/**
 * games 테이블에 테스트 게임을 삽입하고 삽입된 행을 반환한다.
 */
export async function seedGame(
  db: Knex,
  overrides: Record<string, any> = {},
): Promise<any> {
  const defaults = {
    path: "/games/test-game",
    title: "Test Game",
    originalTitle: "test-game",
    source: "/library/path",
    thumbnail: null,
    executablePath: null,
    provider: null,
    externalId: null,
    memo: null,
    publishDate: null,
    isLoadedInfo: false,
    isHidden: false,
    isCompressFile: false,
    translatedTitle: null,
    translationSource: null,
    translatedAt: null,
    sessionStartAt: null,
    fingerprint: null,
  };

  const data = { ...defaults, ...overrides };
  await db("games").insert(data);
  return db("games").where("path", data.path).first();
}

/**
 * user_game_data 테이블에 테스트 데이터를 삽입한다.
 * 게임과의 연결은 fingerprint 기반 JOIN으로 이루어지므로,
 * 게임의 fingerprint를 읽어 user_game_data에도 동일하게 설정한다.
 * 삽입된 user_game_data 행을 반환한다.
 */
export async function seedUserGameData(
  db: Knex,
  gamePath: string,
  overrides: Record<string, any> = {},
): Promise<any> {
  // 게임의 fingerprint를 읽어 user_game_data에 연결
  const game = await db("games").where("path", gamePath).first();
  const gameFingerprint = game?.fingerprint ?? null;

  const defaults = {
    externalKey: null,
    fingerprint: gameFingerprint,
    rating: null,
    totalPlayTime: 0,
    isFavorite: false,
    isClear: false,
    lastPlayedAt: null,
  };

  const data = { ...defaults, ...overrides };
  const [id] = await db("userGameData").insert(data);

  return db("userGameData").where("id", id).first();
}

/**
 * makers 테이블에 제작사를 삽입하고 삽입된 행을 반환한다.
 */
export async function seedMaker(db: Knex, name: string): Promise<any> {
  const [id] = await db("makers").insert({ name });
  return db("makers").where("id", id).first();
}

/**
 * categories 테이블에 카테고리를 삽입하고 삽입된 행을 반환한다.
 */
export async function seedCategory(db: Knex, name: string): Promise<any> {
  const [id] = await db("categories").insert({ name, sortOrder: 0 });
  return db("categories").where("id", id).first();
}

/**
 * tags 테이블에 태그를 삽입하고 삽입된 행을 반환한다.
 */
export async function seedTag(db: Knex, name: string): Promise<any> {
  const [id] = await db("tags").insert({ name });
  return db("tags").where("id", id).first();
}

/**
 * game_makers 관계를 삽입한다. 제작사가 없으면 자동 생성한다.
 */
export async function seedGameMaker(
  db: Knex,
  gamePath: string,
  makerName: string,
): Promise<void> {
  // 제작사가 없으면 생성
  let maker = await db("makers").where("name", makerName).first();
  if (!maker) {
    const [id] = await db("makers").insert({ name: makerName });
    maker = await db("makers").where("id", id).first();
  }
  await db("gameMakers").insert({ gamePath, makerId: maker.id });
}

/**
 * game_categories 관계를 삽입한다. 카테고리가 없으면 자동 생성한다.
 */
export async function seedGameCategory(
  db: Knex,
  gamePath: string,
  categoryName: string,
): Promise<void> {
  // 카테고리가 없으면 생성
  let category = await db("categories").where("name", categoryName).first();
  if (!category) {
    const [id] = await db("categories").insert({
      name: categoryName,
      sortOrder: 0,
    });
    category = await db("categories").where("id", id).first();
  }
  await db("gameCategories").insert({
    gamePath,
    categoryId: category.id,
  });
}

/**
 * game_tags 관계를 삽입한다. 태그가 없으면 자동 생성한다.
 */
export async function seedGameTag(
  db: Knex,
  gamePath: string,
  tagName: string,
): Promise<void> {
  // 태그가 없으면 생성
  let tag = await db("tags").where("name", tagName).first();
  if (!tag) {
    const [id] = await db("tags").insert({ name: tagName });
    tag = await db("tags").where("id", id).first();
  }
  await db("gameTags").insert({ gamePath, tagId: tag.id });
}

/**
 * game_images 테이블에 이미지를 삽입하고 삽입된 행을 반환한다.
 */
export async function seedGameImage(
  db: Knex,
  gamePath: string,
  imagePath: string,
  sortOrder: number,
): Promise<any> {
  const [id] = await db("gameImages").insert({
    gamePath,
    path: imagePath,
    sortOrder,
  });
  return db("gameImages").where("id", id).first();
}
