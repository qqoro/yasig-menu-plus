import type { Knex } from "knex";

export type SqliteBoolean = 0 | 1 | boolean;

interface TableBaseColumn {
  createdAt: Date | Knex.Raw;
  updatedAt: Date | Knex.Raw | null;
}

// ========== user_game_data 테이블 ==========
export interface UserGameData {
  id: number; // PK
  externalKey: string | null; // "dlsite:RJ12345" 형태
  fingerprint: string | null; // SHA-256 해시
  rating: number | null; // 별점 (1-5)
  totalPlayTime: number; // 총 플레이 시간 (초)
  isFavorite: SqliteBoolean;
  isClear: SqliteBoolean;
  lastPlayedAt: Date | null;
  createdAt: Date | null;
}

export type InsertUserGameData = Omit<UserGameData, "id">;

// ========== games 테이블 ==========
export interface Game extends Omit<TableBaseColumn, "createdAt" | "updatedAt"> {
  path: string; // PK
  title: string; // 표시 이름
  originalTitle: string; // 원본 파일/폴더명
  source: string; // 라이브러리 경로
  thumbnail: string | null; // 썸네일 경로
  executablePath: string | null; // 실행 파일 경로 (직접 지정 시)
  provider: string | null; // 제공자 (dlsite, steam, getchu, cien, null)
  externalId: string | null; // 외부 ID (RJ123456, Steam AppID 등)
  memo: string | null; // 메모
  publishDate: Date | null; // 발매일
  isLoadedInfo: SqliteBoolean; // 컬렉터 정보 수집 완료
  userGameDataId: number | null; // FK → user_game_data.id
  fingerprint: string | null; // SHA-256 해시 (게임 식별용)
  isHidden: SqliteBoolean;
  isCompressFile: SqliteBoolean;
  translatedTitle: string | null; // 번역된 제목
  translationSource: string | null; // 번역 출처 (ollama, google)
  translatedAt: Date | null; // 번역 시간
  sessionStartAt: Date | null; // 현재 세션 시작 시간
  createdAt: Date | null; // 조회 시 Date | null로 반환
  updatedAt: Date | null; // 조회 시 Date | null로 반환
}

export type InsertGame = Pick<
  Game,
  "path" | "title" | "originalTitle" | "source"
> &
  Partial<Omit<Game, "path" | "title" | "originalTitle" | "source">>;
export type UpdateGame = Partial<Game>;

// ========== makers 테이블 ==========
export interface Maker {
  id: number; // bigint PK
  name: string; // 서큘/제작사명
  nameEn: string | null; // 영문명
  url: string | null; // 공식 사이트 URL
  description: string | null; // 설명
  createdAt: Date | Knex.Raw;
}

export type InsertMaker = Partial<Omit<Maker, "id">> &
  Pick<Maker, "name" | "createdAt">;

// ========== categories 테이블 ==========
export interface Category {
  id: number; // bigint PK
  name: string; // 카테고리명
  color: string | null; // 표시 색상
  sortOrder: number; // 표시 순서
  createdAt: Date | Knex.Raw;
}

export type InsertCategory = Partial<Omit<Category, "id">> &
  Pick<Category, "name" | "createdAt" | "sortOrder">;

// ========== tags 테이블 ==========
export interface Tag {
  id: number; // bigint PK
  name: string; // 태그명
  createdAt: Date | Knex.Raw;
}

export type InsertTag = Pick<Tag, "name" | "createdAt">;

// ========== 관계 테이블 ==========
export interface GameMaker {
  gamePath: string; // FK → games.path
  makerId: number; // FK → makers.id
}

export interface GameCategory {
  gamePath: string; // FK → games.path
  categoryId: number; // FK → categories.id
}

export interface GameTag {
  gamePath: string; // FK → games.path
  tagId: number; // FK → tags.id
}

// ========== play_sessions 테이블 ==========
export interface PlaySession {
  id: number; // PK
  userGameDataId: number; // FK → user_game_data.id
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number;
}

export type InsertPlaySession = Omit<PlaySession, "id">;

// Knex 타입 선언
declare module "knex/types/tables.js" {
  interface Tables {
    user_game_data: Knex.CompositeTableType<
      UserGameData,
      InsertUserGameData,
      Partial<UserGameData>
    >;
    games: Knex.CompositeTableType<Game, InsertGame, UpdateGame>;
    makers: Knex.CompositeTableType<Maker, InsertMaker, Maker>;
    categories: Knex.CompositeTableType<Category, InsertCategory, Category>;
    tags: Knex.CompositeTableType<Tag, InsertTag, Tag>;
    game_makers: Knex.CompositeTableType<GameMaker, GameMaker, GameMaker>;
    game_categories: Knex.CompositeTableType<
      GameCategory,
      GameCategory,
      GameCategory
    >;
    game_tags: Knex.CompositeTableType<GameTag, GameTag, GameTag>;
    play_sessions: Knex.CompositeTableType<
      PlaySession,
      InsertPlaySession,
      Partial<PlaySession>
    >;
  }
}
