/**
 * 게임 검색, 필터링, 랜덤, 자동완성 핸들러
 *
 * - 고급 검색 파싱 (tag:, circle:, category:, provider:, id:)
 * - 필터 및 정렬 적용
 * - 랜덤 게임 조회
 * - 자동완성 제안
 */

import type { IpcMainInvokeEvent } from "electron";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import {
  ENGLISH_PREFIXES,
  KOREAN_PREFIX_PARTIALS,
  KOREAN_PREFIXES,
  normalizeToEnglish,
} from "../lib/search-prefix.js";
import {
  DEFAULT_TITLE_DISPLAY_PRIORITY,
  getTranslationSettings,
} from "../store.js";
import {
  validateDirectoryPath,
  validateSearchQuery,
} from "../utils/validator.js";
import {
  buildGameItems,
  buildTitleOrderParts,
  loadRelationsAndGroup,
} from "./home-utils.js";

/**
 * 고급 검색 파싱 결과
 */
interface ParsedSearchQuery {
  textQuery?: string;
  provider?: string;
  externalId?: string;
  circles: string[];
  tags: string[];
  categories: string[];
}

/**
 * 고급 검색 문법 파싱
 * - provider:dlsite / 제공자:dlsite
 * - id:RJ123456 / 아이디:RJ123456
 * - circle:name / 서클:name
 * - tag:value / 태그:value
 * - category:RPG / 카테고리:RPG
 */
export function parseSearchQuery(query: string): ParsedSearchQuery {
  const result: ParsedSearchQuery = {
    circles: [],
    tags: [],
    categories: [],
  };

  // 한글+영문 prefix 패턴 생성
  const allPrefixes = [...ENGLISH_PREFIXES, ...KOREAN_PREFIXES];
  const prefixPattern = allPrefixes.join("|");
  const prefixRegex = new RegExp(String.raw`(${prefixPattern}):(\S+)`, "g");

  let remainingQuery = query;
  let match;

  while ((match = prefixRegex.exec(query)) !== null) {
    const rawPrefix = match[1];
    const value = match[2];
    if (!value) continue;

    // 한글/영문을 영문으로 정규화
    const normalizedPrefix = normalizeToEnglish(rawPrefix);
    if (!normalizedPrefix) continue;

    if (
      normalizedPrefix === "circle" ||
      normalizedPrefix === "tag" ||
      normalizedPrefix === "category"
    ) {
      const field = `${normalizedPrefix}s` as "circles" | "tags" | "categories";
      result[field].push(value);
    } else if (normalizedPrefix === "provider") {
      result.provider = value;
    } else if (normalizedPrefix === "id") {
      result.externalId = value;
    }

    // 매칭된 부분을 제거
    remainingQuery = remainingQuery.replace(match[0], "");
  }

  // 불완전한 prefix: 형태 제거 (값이 없는 경우)
  remainingQuery = remainingQuery
    .replaceAll(new RegExp(String.raw`(?:${prefixPattern}):(\s|$)`, "g"), "")
    .trim();

  // 남은 텍스트 (공백 제거)
  const trimmed = remainingQuery.trim();
  if (trimmed) {
    result.textQuery = trimmed;
  }

  return result;
}

/**
 * 게임 검색 핸들러
 */
export async function searchGamesHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["searchGames"],
): Promise<IpcMainEventMap["searchedGames"]> {
  const { sourcePaths, searchQuery } = payload;

  // 검색어 유효성 검증
  if (searchQuery.query) {
    validateSearchQuery(searchQuery.query);
  }

  // 라이브러리 경로들 유효성 검증 후 필터링
  const validPaths = sourcePaths.filter((p) => {
    try {
      validateDirectoryPath(p);
      return true;
    } catch {
      return false;
    }
  });

  // 기본 쿼리 빌더
  let query = db("games")
    .leftJoin("userGameData", "games.fingerprint", "userGameData.fingerprint")
    .whereIn("games.source", validPaths)
    .select(
      "games.path",
      "games.title",
      "games.originalTitle",
      "games.source",
      "games.thumbnail",
      "games.executablePath",
      "games.isCompressFile",
      "games.publishDate",
      "games.isHidden",
      "games.provider",
      "games.externalId",
      "games.createdAt",
      "games.updatedAt",
      "games.translatedTitle",
      "games.translationSource",
      "userGameData.isFavorite",
      "userGameData.isClear",
      "userGameData.lastPlayedAt",
      "userGameData.rating",
      "userGameData.totalPlayTime",
    );

  // 필터 적용
  const { filters, sortBy, sortOrder } = searchQuery;

  // 숨김 게임 필터 (기본: 숨김 게임 제외, true면 숨겨진 게임만)
  if (filters.showHidden) {
    query = query.where("games.isHidden", 1);
  } else {
    query = query.where("games.isHidden", 0);
  }

  // 즐겨찾기 필터
  if (filters.showFavorites) {
    query = query.where("userGameData.isFavorite", 1);
  }

  // 클리어 필터
  if (filters.showCleared && !filters.showNotCleared) {
    query = query.where("userGameData.isClear", 1);
  } else if (!filters.showCleared && filters.showNotCleared) {
    // 클리어하지 않음: isClear = 0 또는 유저 데이터 없음 (NULL)
    query = query.where((qb) =>
      qb.where("userGameData.isClear", 0).orWhereNull("userGameData.isClear"),
    );
  }
  // 둘 다 true면 필터 적용 안 함 (모두 표시)

  // 압축 파일 필터
  if (filters.showCompressed && !filters.showNotCompressed) {
    query = query.where("isCompressFile", 1);
  } else if (!filters.showCompressed && filters.showNotCompressed) {
    query = query.where("isCompressFile", 0);
  }

  // 외부 ID 필터
  if (filters.showWithExternalId && !filters.showWithoutExternalId) {
    query = query.whereNotNull("externalId").where("externalId", "!=", "");
  } else if (!filters.showWithExternalId && filters.showWithoutExternalId) {
    query = query.where((qb) =>
      qb.whereNull("externalId").orWhere("externalId", "=", ""),
    );
  }

  // 검색어 파싱 및 적용
  if (searchQuery.query) {
    const parsed = parseSearchQuery(searchQuery.query);

    // 텍스트 검색 (번역제목 > 제목 > 원본이름 순서)
    if (parsed.textQuery) {
      const searchTerm = `%${parsed.textQuery}%`;
      query = query.where((qb) => {
        qb.where("translatedTitle", "LIKE", searchTerm)
          .orWhere("title", "LIKE", searchTerm)
          .orWhere("originalTitle", "LIKE", searchTerm);
      });
    }

    // 제공자 필터
    if (parsed.provider) {
      query = query.where("provider", parsed.provider);
    }

    // 외부 ID 필터
    if (parsed.externalId) {
      // RJ 접두사가 있으면 제거하고 비교
      const id = parsed.externalId.replace(/^RJ/i, "");
      query = query.where((qb) => {
        qb.where("externalId", "LIKE", `%${parsed.externalId}%`).orWhere(
          "externalId",
          "LIKE",
          `%${id}%`,
        );
      });
    }

    // 서클/태그/카테고리 필터는 서브쿼리 또는 JOIN으로 처리
    if (
      parsed.circles.length > 0 ||
      parsed.tags.length > 0 ||
      parsed.categories.length > 0
    ) {
      // 관계 데이터 필터링을 위한 서브쿼리
      for (const circle of parsed.circles) {
        query = query.whereExists(
          db("gameMakers")
            .join("makers", "gameMakers.makerId", "makers.id")
            .where("gameMakers.gamePath", db.ref("games.path"))
            .where("makers.name", "LIKE", `%${circle}%`),
        );
      }

      for (const tag of parsed.tags) {
        query = query.whereExists(
          db("gameTags")
            .join("tags", "gameTags.tagId", "tags.id")
            .where("gameTags.gamePath", db.ref("games.path"))
            .where("tags.name", "LIKE", `%${tag}%`),
        );
      }

      for (const category of parsed.categories) {
        query = query.whereExists(
          db("gameCategories")
            .join("categories", "gameCategories.categoryId", "categories.id")
            .where("gameCategories.gamePath", db.ref("games.path"))
            .where("categories.name", "LIKE", `%${category}%`),
        );
      }
    }
  }

  // 정렬 적용
  const order = sortOrder === "asc" ? "asc" : "desc";
  switch (sortBy) {
    case "title": {
      const priority =
        getTranslationSettings().titleDisplayPriority ??
        DEFAULT_TITLE_DISPLAY_PRIORITY;
      const orderExpr = buildTitleOrderParts(priority);
      query = query.orderByRaw(`${orderExpr} ${order}`);
      break;
    }
    case "publishDate":
      query = query.orderByRaw(`publish_date IS NULL, publish_date ${order}`);
      break;
    case "lastPlayedAt":
      query = query.orderByRaw(
        `user_game_data.last_played_at IS NULL, user_game_data.last_played_at ${order}`,
      );
      break;
    case "createdAt":
      query = query.orderBy("games.createdAt", order);
      break;
    case "rating":
      // 별점 순으로 정렬 (별점 없는 게임은 뒤로)
      query = query.orderByRaw(
        "user_game_data.rating IS NULL, user_game_data.rating " + order,
      );
      break;
    case "playTime":
      // 플레이 시간 순으로 정렬 (플레이 시간 없는 게임은 뒤로)
      query = query.orderByRaw(
        `user_game_data.total_play_time IS NULL OR user_game_data.total_play_time = 0, user_game_data.total_play_time ${order}`,
      );
      break;
    case "maker":
      // 서클명 정렬 (서클 없는 게임은 뒤로)
      query = query.orderByRaw(
        `(SELECT MIN(m.name) FROM game_makers gm JOIN makers m ON gm.maker_id = m.id WHERE gm.game_path = games.path) IS NULL, ` +
          `(SELECT MIN(m.name) FROM game_makers gm JOIN makers m ON gm.maker_id = m.id WHERE gm.game_path = games.path) ${order}`,
      );
      break;
    default:
      query = query.orderBy("title", "asc");
  }

  // 페이지네이션 파라미터 설정
  const offset = searchQuery.offset ?? 0;
  const limit = searchQuery.limit ?? 20;

  // 전체 개수 조회 (복제해서)
  const countQuery = query.clone();
  const totalCountResult = (await countQuery.count("* as count").first()) as
    | { count: bigint }
    | undefined;
  const totalCount = Number(totalCountResult?.count ?? 0);

  // 페이지네이션 적용하여 게임 목록 조회
  const games = await query.offset(offset).limit(limit);

  // 관계 데이터 조회 및 그룹화
  const gamePaths = games.map((g) => g.path);
  const relations = await loadRelationsAndGroup(gamePaths);

  // GameItem으로 변환
  const plainGames = buildGameItems(games, relations);

  // 더 로드할 데이터가 있는지 확인
  const hasMore = offset + limit < totalCount;

  return { games: plainGames, totalCount, hasMore };
}

/**
 * 랜덤 게임 조회 핸들러
 */
export async function getRandomGameHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getRandomGame"],
): Promise<IpcMainEventMap["randomGame"]> {
  const { sourcePaths, searchQuery } = payload;

  // 라이브러리 경로들 유효성 검증 후 필터링
  const validPaths = sourcePaths.filter((p) => {
    try {
      validateDirectoryPath(p);
      return true;
    } catch {
      return false;
    }
  });

  // 기본 쿼리 빌더
  let query = db("games")
    .leftJoin("userGameData", "games.fingerprint", "userGameData.fingerprint")
    .whereIn("games.source", validPaths)
    .select(
      "games.path",
      "games.title",
      "games.originalTitle",
      "games.source",
      "games.thumbnail",
      "games.executablePath",
      "games.isCompressFile",
      "games.publishDate",
      "games.isHidden",
      "games.provider",
      "games.externalId",
      "games.createdAt",
      "games.translatedTitle",
      "games.translationSource",
      "userGameData.isFavorite",
      "userGameData.isClear",
      "userGameData.lastPlayedAt",
      "userGameData.rating",
    );

  // 필터 적용
  const { filters } = searchQuery;

  // 숨김 게임 필터 (기본: 숨김 게임 제외, true면 숨겨진 게임만)
  if (filters.showHidden) {
    query = query.where("games.isHidden", 1);
  } else {
    query = query.where("games.isHidden", 0);
  }

  // 즐겨찾기 필터
  if (filters.showFavorites) {
    query = query.where("userGameData.isFavorite", 1);
  }

  // 클리어 필터
  if (filters.showCleared && !filters.showNotCleared) {
    query = query.where("userGameData.isClear", 1);
  } else if (!filters.showCleared && filters.showNotCleared) {
    // 클리어하지 않음: isClear = 0 또는 유저 데이터 없음 (NULL)
    query = query.where((qb) =>
      qb.where("userGameData.isClear", 0).orWhereNull("userGameData.isClear"),
    );
  }

  // 압축 파일 필터
  if (filters.showCompressed && !filters.showNotCompressed) {
    query = query.where("isCompressFile", 1);
  } else if (!filters.showCompressed && filters.showNotCompressed) {
    query = query.where("isCompressFile", 0);
  }

  // 외부 ID 필터
  if (filters.showWithExternalId && !filters.showWithoutExternalId) {
    query = query.whereNotNull("externalId").where("externalId", "!=", "");
  } else if (!filters.showWithExternalId && filters.showWithoutExternalId) {
    query = query.where((qb) =>
      qb.whereNull("externalId").orWhere("externalId", "=", ""),
    );
  }

  // 검색어 파싱 및 적용
  if (searchQuery.query) {
    const parsed = parseSearchQuery(searchQuery.query);

    // 텍스트 검색 (번역제목 > 제목 > 원본이름 순서)
    if (parsed.textQuery) {
      const searchTerm = `%${parsed.textQuery}%`;
      query = query.where((qb) => {
        qb.where("translatedTitle", "LIKE", searchTerm)
          .orWhere("title", "LIKE", searchTerm)
          .orWhere("originalTitle", "LIKE", searchTerm);
      });
    }

    // 제공자 필터
    if (parsed.provider) {
      query = query.where("provider", parsed.provider);
    }

    // 외부 ID 필터
    if (parsed.externalId) {
      const id = parsed.externalId.replace(/^RJ/i, "");
      query = query.where((qb) => {
        qb.where("externalId", "LIKE", `%${parsed.externalId}%`).orWhere(
          "externalId",
          "LIKE",
          `%${id}%`,
        );
      });
    }

    // 서클/태그/카테고리 필터
    if (
      parsed.circles.length > 0 ||
      parsed.tags.length > 0 ||
      parsed.categories.length > 0
    ) {
      for (const circle of parsed.circles) {
        query = query.whereExists(
          db("gameMakers")
            .join("makers", "gameMakers.makerId", "makers.id")
            .where("gameMakers.gamePath", db.ref("games.path"))
            .where("makers.name", "LIKE", `%${circle}%`),
        );
      }

      for (const tag of parsed.tags) {
        query = query.whereExists(
          db("gameTags")
            .join("tags", "gameTags.tagId", "tags.id")
            .where("gameTags.gamePath", db.ref("games.path"))
            .where("tags.name", "LIKE", `%${tag}%`),
        );
      }

      for (const category of parsed.categories) {
        query = query.whereExists(
          db("gameCategories")
            .join("categories", "gameCategories.categoryId", "categories.id")
            .where("gameCategories.gamePath", db.ref("games.path"))
            .where("categories.name", "LIKE", `%${category}%`),
        );
      }
    }
  }

  // 전체 개수 조회
  const countQuery = query.clone();
  const totalCountResult = (await countQuery.count("* as count").first()) as
    | { count: bigint }
    | undefined;
  const totalCount = Number(totalCountResult?.count ?? 0);

  // 결과가 없으면 null 반환
  if (totalCount === 0) {
    return { game: null };
  }

  // 랜덤 위치 계산
  const randomOffset = Math.floor(Math.random() * totalCount);

  // 랜덤 게임 1개 조회 (정렬은 title 기준으로 일관성 유지)
  const games = await query
    .orderBy("title", "asc")
    .limit(1)
    .offset(randomOffset);

  if (games.length === 0) {
    return { game: null };
  }

  // 관계 데이터 조회
  const relations = await loadRelationsAndGroup([games[0].path]);

  // GameItem으로 변환
  const plainGames = buildGameItems(games, relations);

  return { game: plainGames[0] };
}

/**
 * 자동완성 제안 핸들러
 * 두 단계 자동완성:
 * 1. 부분 입력 시 prefix 목록 반환 (t → tag:, 태 → 태그:)
 * 2. prefix 선택 후 해당 값 목록 반환
 */
export async function getAutocompleteSuggestionsHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getAutocompleteSuggestions"],
): Promise<IpcMainEventMap["autocompleteSuggestions"]> {
  const { prefix, query } = payload;

  // 디버깅: 입력값 확인
  console.log("[Autocomplete] prefix:", prefix, "query:", query);

  // prefix가 지정되지 않은 경우 (부분 입력 매칭)
  const trimmedQuery = query.trim();

  // 부분 입력 시 prefix 목록 반환
  if (!prefix) {
    const prefixes: string[] = [];

    // 빈 쿼리이면 모든 prefix 반환 (Ctrl+Space)
    if (!trimmedQuery) {
      return {
        prefix: "",
        query,
        suggestions: [
          "tag:",
          "태그:",
          "circle:",
          "서클:",
          "category:",
          "카테고리:",
          "provider:",
          "제공자:",
          "id:",
          "아이디:",
        ],
      };
    }

    const lowerQuery = trimmedQuery.toLowerCase();

    // 영문 부분 매칭 → 영문 prefix 제안 (startsWith로 간단하게)
    for (const eng of ENGLISH_PREFIXES) {
      if (eng.startsWith(lowerQuery)) {
        prefixes.push(`${eng}:`);
      }
    }

    // 한글 부분 매칭 → 한글 prefix 제안 (자소 분리 포함)
    for (const [korean, parts] of Object.entries(KOREAN_PREFIX_PARTIALS)) {
      if (parts.some((p) => trimmedQuery.endsWith(p))) {
        prefixes.push(`${korean}:`);
      }
    }

    return {
      prefix: "",
      query,
      suggestions: prefixes,
    };
  }

  // prefix가 지정된 경우 해당 값 목록 반환
  // 한글 prefix를 영문으로 정규화
  const normalizedPrefix = normalizeToEnglish(prefix);
  let suggestions: string[] = [];

  if (normalizedPrefix) {
    switch (normalizedPrefix) {
      case "tag": {
        // 태그 자동완성
        const tags = await db("tags")
          .where("name", "LIKE", `%${query}%`)
          .orderBy("name", "asc")
          .limit(20)
          .select("name");
        suggestions = tags.map((t) => t.name);
        break;
      }
      case "circle": {
        // 서클 자동완성
        const circles = await db("makers")
          .where("name", "LIKE", `%${query}%`)
          .orderBy("name", "asc")
          .limit(20)
          .select("name");
        suggestions = circles.map((c) => c.name);
        break;
      }
      case "category": {
        // 카테고리 자동완성
        const categories = await db("categories")
          .where("name", "LIKE", `%${query}%`)
          .orderBy("name", "asc")
          .limit(20)
          .select("name");
        suggestions = categories.map((c) => c.name);
        break;
      }
      case "provider": {
        // 제공자는 고정값
        const providers = ["dlsite", "steam", "getchu", "cien"];
        suggestions = providers.filter((p) =>
          p.toLowerCase().startsWith(query.toLowerCase()),
        );
        break;
      }
      case "id": {
        // 외부 ID 자동완성
        const ids = await db("games")
          .whereNotNull("externalId")
          .where("externalId", "!=", "")
          .where("externalId", "LIKE", `%${query}%`)
          .orderBy("externalId", "asc")
          .limit(20)
          .select("externalId");
        suggestions = [
          ...new Set(
            ids
              .map((i) => i.externalId)
              .filter((id): id is string => id !== null),
          ),
        ]; // 중복 제거 및 null 필터링
        break;
      }
    }
  }

  return {
    prefix,
    query,
    suggestions,
  };
}
