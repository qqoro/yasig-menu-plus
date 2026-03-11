/**
 * 게임 목록 및 실행 핸들러
 *
 * Phase 1 MVP:
 * - 폴더 스캔 및 게임 등록
 * - 게임 목록 로드
 * - 게임 실행
 * - 폴더 열기
 *
 * Phase 3:
 * - 검색 및 필터링
 * - 토글 기능
 * - 자동완성
 */

import type { IpcMainInvokeEvent } from "electron";
import { shell } from "electron";
import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { COMPRESS_FILE_TYPE } from "../constants.js";
import { db } from "../db/db-manager.js";
import type { GameCandidate } from "../lib/scan-logic.js";
import {
  EXCLUDED_FOLDER_NAMES,
  EXECUTABLE_EXTENSIONS,
  hasExecutableFile,
} from "../lib/scan-logic.js";
import { runScanWorker } from "../workers/run-scan-worker.js";
import type { SqliteBoolean } from "../db/db.js";
import type {
  GameItem,
  IpcMainEventMap,
  IpcRendererEventMap,
} from "../events.js";
import {
  ENGLISH_PREFIXES,
  KOREAN_PREFIXES,
  KOREAN_PREFIX_PARTIALS,
  normalizeToEnglish,
} from "../lib/search-prefix.js";
import { processMonitor } from "../services/ProcessMonitor.js";
import { getOrCreateUserGameData } from "../services/user-game-data.js";
import { computeFingerprint } from "../lib/fingerprint.js";
import {
  addExcludedExecutable,
  addLibraryPath as addLibraryPathToStore,
  DEFAULT_TITLE_DISPLAY_PRIORITY,
  getAllLibraryScanHistory,
  getExcludedExecutables as getExcludedExecutablesFromStore,
  getLastRefreshedAt,
  getLibraryPaths,
  getLibraryScanHistory,
  getScanDepth,
  getTranslationSettings,
  removeExcludedExecutable,
  removeLibraryPath as removeLibraryPathFromStore,
  removeLibraryScanHistory,
  setLastRefreshedAt,
  updateLibraryScanHistory,
} from "../store.js";
import type { TitleDisplayMode } from "../store.js";
import { deleteImage } from "../utils/downloader.js";
import { toAbsolutePath } from "../utils/image-path.js";
import {
  validateDirectoryPath,
  validatePath,
  validateSearchQuery,
} from "../utils/validator.js";

/**
 * 게임 경로에서 실행 파일 후보들을 찾음
 */
async function findExecutables(folderPath: string): Promise<string[]> {
  if (!existsSync(folderPath)) {
    return [];
  }

  try {
    const entries = readdirSync(folderPath, { withFileTypes: true });
    const executables: string[] = [];

    // 스토어에서 실행 제외 목록 가져오기
    const excludedList = getExcludedExecutablesFromStore();

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const ext = entry.name.toLowerCase();
      if (!EXECUTABLE_EXTENSIONS.some((e) => ext.endsWith(e))) continue;

      // 실행 제외 목록 체크
      if (
        excludedList.some(
          (excluded) => entry.name.toLowerCase() === excluded.toLowerCase(),
        )
      ) {
        continue;
      }

      executables.push(join(folderPath, entry.name));
    }

    return executables;
  } catch {
    return [];
  }
}

/**
 * 게임 경로에서 가장 가능성 높은 실행 파일 선택
 */
function selectBestExecutable(executables: string[]): string | null {
  if (executables.length === 0) return null;
  if (executables.length === 1) return executables[0];

  // 우선순위: .exe > .lnk > .url
  for (const ext of [".exe", ".lnk", ".url"]) {
    const exactMatch = executables.find((e) => e.toLowerCase().endsWith(ext));
    if (exactMatch) return exactMatch;
  }

  return executables[0];
}

/**
 * 폴더를 스캔하여 게임을 DB에 등록
 * - 새 게임 추가
 * - 기존 게임 정보 업데이트
 * - 존재하지 않는 게임 DB에서 삭제
 * - 재귀적으로 하위 폴더를 스캔하여 게임 폴더 자동 탐지
 */
async function scanFolder(
  sourcePath: string,
): Promise<{ addedCount: number; deletedCount: number }> {
  if (!existsSync(sourcePath)) {
    return { addedCount: 0, deletedCount: 0 };
  }

  try {
    // 스캔 전 DB에 있는 해당 라이브러리의 모든 게임 경로를 가져옴
    const existingGames = await db("games")
      .where("source", sourcePath)
      .select("path");
    const existingPaths = new Set(existingGames.map((g) => g.path));
    const foundPaths = new Set<string>();
    let addedCount = 0;

    // Worker Thread에서 스캔 실행
    const candidates = await runScanWorker(sourcePath, getScanDepth());

    // 발견한 게임 후보 등록
    for (const candidate of candidates) {
      const { path: fullPath, name, isCompressFile } = candidate;

      // 압축파일인 경우 제목에서 확장자 제거
      let title = name;
      if (isCompressFile) {
        for (const ext of COMPRESS_FILE_TYPE) {
          if (title.toLowerCase().endsWith(ext)) {
            title = title.slice(0, -ext.length);
            break;
          }
        }
      }

      // 게임 정보 생성
      const fingerprint = computeFingerprint(fullPath, Boolean(isCompressFile));
      const gameData = {
        path: fullPath,
        title: title,
        originalTitle: name,
        source: sourcePath,
        isCompressFile: Boolean(isCompressFile),
        fingerprint,
      };

      // 발견된 경로 기록
      foundPaths.add(fullPath);

      // DB에 이미 존재하는지 확인 후 삽입
      const existing = await db("games").where("path", fullPath).first();
      if (!existing) {
        await db("games").insert(gameData);
        addedCount++;
      } else {
        // 기존 게임 정보 업데이트 (발견한 경우)
        // title은 정보 수집으로 변경된 값을 유지하고, originalTitle만 업데이트
        // fingerprint 변경 시 user_game_data도 갱신
        const oldFingerprint = existing.fingerprint;
        const newFingerprint = fingerprint ?? existing.fingerprint;
        if (
          oldFingerprint &&
          newFingerprint &&
          oldFingerprint !== newFingerprint
        ) {
          await db("userGameData")
            .where("fingerprint", oldFingerprint)
            .update({ fingerprint: newFingerprint });
        }
        await db("games").where("path", fullPath).update({
          originalTitle: name,
          source: sourcePath,
          fingerprint: newFingerprint,
          updatedAt: new Date(),
        });
      }
    }

    // DB에 있지만 실제로는 존재하지 않는 게임 삭제
    const deletedPaths = [...existingPaths].filter(
      (path) => !foundPaths.has(path),
    );
    let deletedCount = 0;
    if (deletedPaths.length > 0) {
      // 삭제 전 썸네일 및 이미지 경로 조회 (파일 삭제용)
      const gamesToDelete = await db("games")
        .whereIn("path", deletedPaths)
        .select("path", "thumbnail");
      const thumbnailsToDelete = gamesToDelete
        .map((g) => g.thumbnail)
        .filter((t): t is string => t !== null);

      const imagesToDelete = await db("gameImages")
        .whereIn("gamePath", deletedPaths)
        .pluck("path");

      // 관계 데이터 먼저 삭제
      await db("gameMakers").whereIn("gamePath", deletedPaths).delete();
      await db("gameCategories").whereIn("gamePath", deletedPaths).delete();
      await db("gameTags").whereIn("gamePath", deletedPaths).delete();
      await db("gameImages").whereIn("gamePath", deletedPaths).delete();

      // 게임 삭제
      deletedCount = await db("games").whereIn("path", deletedPaths).delete();

      // 실제 이미지 파일 삭제 (상대 경로를 절대 경로로 변환)
      for (const thumbnail of thumbnailsToDelete) {
        await deleteImage(toAbsolutePath(thumbnail) ?? thumbnail);
      }
      for (const imagePath of imagesToDelete) {
        await deleteImage(toAbsolutePath(imagePath) ?? imagePath);
      }
    }

    // 스캔 완료 후 기록 업데이트 (DB에 있는 총 게임 수)
    const totalGames = (await db("games")
      .where("source", sourcePath)
      .count("* as count")
      .first()) as { count: bigint } | undefined;
    updateLibraryScanHistory(sourcePath, Number(totalGames?.count ?? 0));

    return { addedCount, deletedCount };
  } catch (error) {
    console.error("폴더 스캔 오류:", error);
    return { addedCount: 0, deletedCount: 0 };
  }
}

/**
 * 관계 데이터 조회 및 맵 생성
 */
async function loadRelationsAndGroup(gamePaths: string[]): Promise<{
  makers: Map<string, string[]>;
  categories: Map<string, string[]>;
  tags: Map<string, string[]>;
}> {
  // 관계 데이터 병렬 조회
  const [makers, categories, tags] = await Promise.all([
    db("gameMakers")
      .join("makers", "gameMakers.makerId", "makers.id")
      .whereIn("gameMakers.gamePath", gamePaths)
      .select("gameMakers.gamePath", "makers.name"),
    db("gameCategories")
      .join("categories", "gameCategories.categoryId", "categories.id")
      .whereIn("gameCategories.gamePath", gamePaths)
      .select("gameCategories.gamePath", "categories.name"),
    db("gameTags")
      .join("tags", "gameTags.tagId", "tags.id")
      .whereIn("gameTags.gamePath", gamePaths)
      .select("gameTags.gamePath", "tags.name"),
  ]);

  // 게임별로 그룹화
  const groupByPath = (
    relations: Array<{ gamePath: string; name: string }>,
  ) => {
    const map = new Map<string, string[]>();
    for (const r of relations) {
      if (!map.has(r.gamePath)) map.set(r.gamePath, []);
      map.get(r.gamePath)!.push(r.name);
    }
    return map;
  };

  return {
    makers: groupByPath(makers as Array<{ gamePath: string; name: string }>),
    categories: groupByPath(
      categories as Array<{ gamePath: string; name: string }>,
    ),
    tags: groupByPath(tags as Array<{ gamePath: string; name: string }>),
  };
}

/**
 * titleDisplayPriority에 따른 ORDER BY COALESCE 구문 생성
 *
 * @param priority - 제목 표시 우선순위 배열
 * @returns ORDER BY에 사용할 COALESCE 표현식
 *
 * @example
 * // ["translated", "collected", "original"]
 * // → "COALESCE(NULLIF(translated_title, ''), NULLIF(title, ''), original_title)"
 */
function buildTitleOrderParts(priority: TitleDisplayMode[]): string {
  const columnMap: Record<TitleDisplayMode, string> = {
    translated: "translated_title",
    collected: "title",
    original: "original_title",
  };

  const parts = priority.map((mode, index, arr) => {
    const column = columnMap[mode];
    // 마지막 항목은 NULLIF 없이 (기본값 역할)
    if (index === arr.length - 1) {
      return column;
    }
    return `NULLIF(${column}, '')`;
  });

  return `COALESCE(${parts.join(", ")})`;
}

/**
 * Knex 결과를 GameItem으로 변환
 */
function buildGameItems(
  games: Array<{
    path: string;
    title: string;
    originalTitle: string;
    source: string;
    thumbnail: string | null;
    executablePath: string | null;
    isCompressFile: SqliteBoolean;
    publishDate: Date | null;
    translatedTitle: string | null;
    translationSource: string | null;
    rating: number | null;
    isFavorite?: SqliteBoolean;
    isHidden?: SqliteBoolean;
    isClear?: SqliteBoolean;
    provider?: string | null;
    externalId?: string | null;
    lastPlayedAt?: Date | null;
    createdAt?: Date | null;
    updatedAt?: Date | null;
  }>,
  relations: {
    makers: Map<string, string[]>;
    categories: Map<string, string[]>;
    tags: Map<string, string[]>;
  },
): GameItem[] {
  return games.map((g) => ({
    path: g.path,
    title: g.title,
    originalTitle: g.originalTitle,
    source: g.source,
    thumbnail: toAbsolutePath(g.thumbnail),
    executablePath: g.executablePath || null,
    isCompressFile: Boolean(g.isCompressFile),
    publishDate: g.publishDate ? new Date(g.publishDate) : null,
    translatedTitle: g.translatedTitle || null,
    translationSource: g.translationSource || null,
    rating: g.rating,
    isFavorite: g.isFavorite !== undefined ? Boolean(g.isFavorite) : undefined,
    isHidden: g.isHidden !== undefined ? Boolean(g.isHidden) : undefined,
    isClear: g.isClear !== undefined ? Boolean(g.isClear) : undefined,
    provider: g.provider || null,
    externalId: g.externalId || null,
    lastPlayedAt: g.lastPlayedAt ? new Date(g.lastPlayedAt) : null,
    createdAt: g.createdAt ? new Date(g.createdAt) : null,
    updatedAt: g.updatedAt ? new Date(g.updatedAt) : null,
    makers: relations.makers.get(g.path) || [],
    categories: relations.categories.get(g.path) || [],
    tags: relations.tags.get(g.path) || [],
  }));
}

/**
 * 게임 목록 새로고침 핸들러 (폴더 재스캔)
 */
export async function refreshListHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["refreshList"],
): Promise<IpcMainEventMap["listRefreshed"]> {
  const { sourcePaths } = payload;

  // 각 경로 유효성 검증 후 스캔
  let totalAdded = 0;
  let totalDeleted = 0;
  for (const sourcePath of sourcePaths) {
    const result = await scanFolder(sourcePath);
    totalAdded += result.addedCount;
    totalDeleted += result.deletedCount;
  }

  // 스캔 후 다시 목록 로드
  const games = await db("games")
    .leftJoin("userGameData", "games.fingerprint", "userGameData.fingerprint")
    .whereIn(
      "games.source",
      sourcePaths.filter((p) => existsSync(p)),
    )
    .where("games.isHidden", 0)
    .orderBy("games.title", "asc")
    .select(
      "games.path",
      "games.title",
      "games.originalTitle",
      "games.source",
      "games.thumbnail",
      "games.executablePath",
      "games.isCompressFile",
      "games.publishDate",
      "games.translatedTitle",
      "games.translationSource",
      "userGameData.rating",
    );

  // 관계 데이터 조회 및 그룹화
  const gamePaths = games.map((g) => g.path);
  const relations = await loadRelationsAndGroup(gamePaths);

  // GameItem으로 변환
  const plainGames = buildGameItems(games, relations);

  return {
    games: plainGames,
    addedCount: totalAdded,
    deletedCount: totalDeleted,
  };
}

/**
 * 게임 실행 핸들러
 */
export async function playGameHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["playGame"],
): Promise<IpcMainEventMap["gamePlayed"]> {
  const { path } = payload;

  // 경로 유효성 검증
  validatePath(path, { mustExist: true });

  // DB에서 게임 정보 조회
  const game = await db("games").where("path", path).first();
  if (!game) {
    throw new Error("게임을 찾을 수 없습니다.");
  }

  const isCompressFile = Boolean(game.isCompressFile);
  const isShortcutFile = path.toLowerCase().endsWith(".lnk");
  let executablePath: string | null = null;

  // 압축파일이거나 바로가기 파일인 경우 파일 자체를 실행
  if (isCompressFile || isShortcutFile) {
    executablePath = path;
  } else if (game.executablePath) {
    // 직접 지정한 실행 파일이 있으면 사용
    executablePath = game.executablePath;
  } else {
    // 폴더에서 실행 파일 찾기
    const executables = await findExecutables(path);
    executablePath = selectBestExecutable(executables);
  }

  if (!executablePath) {
    throw new Error("실행 파일을 찾을 수 없습니다.");
  }

  // .exe 파일인 경우 ProcessMonitor로 실행 (플레이 타임 추적)
  if (processMonitor.isExeFile(executablePath)) {
    const started = await processMonitor.startSession(path, executablePath);
    if (started) {
      return { executablePath };
    }
    // 이미 실행 중이거나 다른 이유로 시작 실패 시 기존 방식으로 실행
  }

  // 마지막 플레이 시간 업데이트 (.exe가 아니거나 spawn 실패 시)
  const userGameDataId = await getOrCreateUserGameData(path);
  await db("userGameData").where("id", userGameDataId).update({
    lastPlayedAt: new Date(),
  });
  await db("games").where("path", path).update({ updatedAt: new Date() });

  // 게임 실행 (shell.openPath 사용)
  shell.openPath(executablePath);

  return { executablePath };
}

/**
 * 폴더 열기 핸들러
 */
export async function openFolderHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["openFolder"],
): Promise<void> {
  const { path } = payload;

  // DB에서 게임 정보 조회 (압축파일 확인용)
  const game = await db("games").where("path", path).first();

  // 게임이 없으면 일반 폴더로 처리
  if (!game) {
    validateDirectoryPath(path);
    shell.openPath(path);
    return;
  }

  const isCompressFile = Boolean(game.isCompressFile);
  const isShortcutFile = path.toLowerCase().endsWith(".lnk");

  if (isCompressFile || isShortcutFile) {
    // 압축파일이거나 바로가기 파일인 경우 파일이 있는 폴더에서 파일 선택
    shell.showItemInFolder(path);
  } else {
    // 폴더인 경우 해당 폴더 열기
    validateDirectoryPath(path);
    shell.openPath(path);
  }
}

// ========== Phase 3: 검색 및 필터링 ==========

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
function parseSearchQuery(query: string): ParsedSearchQuery {
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
 * 게임 토글 핸들러 (즐겨찾기/숨김/클리어)
 */
export async function toggleGameHandler(
  _event: IpcMainInvokeEvent,
  payload: { path: string },
  field: "is_favorite" | "is_hidden" | "is_clear",
): Promise<IpcMainEventMap["gameToggled"]> {
  const { path } = payload;

  if (field === "is_hidden") {
    // isHidden은 games 테이블에 유지
    const game = await db("games")
      .where("path", path)
      .select("path", "isHidden")
      .first();
    if (!game) throw new Error("게임을 찾을 수 없습니다.");
    const newValue = !(game.isHidden === 1);
    await db("games")
      .where("path", path)
      .update({
        isHidden: newValue ? 1 : 0,
        updatedAt: new Date(),
      });
    return { path, field, value: newValue };
  }

  // isFavorite, isClear → user_game_data
  const userGameDataId = await getOrCreateUserGameData(path);
  const userData = await db("userGameData").where("id", userGameDataId).first();

  const fieldMap = {
    is_favorite: "isFavorite" as const,
    is_clear: "isClear" as const,
  };
  const camelField = fieldMap[field as "is_favorite" | "is_clear"];
  const currentValue = userData?.[camelField] === 1;
  const newValue = !currentValue;

  await db("userGameData")
    .where("id", userGameDataId)
    .update({
      [camelField]: newValue ? 1 : 0,
    });

  return { path, field, value: newValue };
}

/**
 * 게임 배치 토글 핸들러 (여러 게임 일괄 즐겨찾기/숨김/클리어)
 */
export async function batchToggleGamesHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["batchToggleGames"],
): Promise<IpcMainEventMap["batchToggled"]> {
  const { paths, field, value } = payload;

  if (paths.length === 0) {
    return { field, updatedCount: 0 };
  }

  if (field === "is_hidden") {
    // isHidden은 games 테이블
    const updatedCount = await db("games")
      .whereIn("path", paths)
      .update({
        isHidden: value ? 1 : 0,
        updatedAt: new Date(),
      });
    return { field, updatedCount };
  }

  // isFavorite, isClear → user_game_data
  const fieldMap = {
    is_favorite: "isFavorite" as const,
    is_clear: "isClear" as const,
  };
  const camelField = fieldMap[field as "is_favorite" | "is_clear"];

  // 각 게임의 userGameData를 생성/확보
  const userGameDataIds: number[] = [];
  for (const path of paths) {
    const id = await getOrCreateUserGameData(path);
    userGameDataIds.push(id);
  }

  const updatedCount = await db("userGameData")
    .whereIn("id", userGameDataIds)
    .update({
      [camelField]: value ? 1 : 0,
    });

  return { field, updatedCount };
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

/**
 * 실행 제외 목록 조회 핸들러
 */
export async function getExcludedExecutablesHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["getExcludedExecutables"],
): Promise<IpcMainEventMap["excludedExecutables"]> {
  const executables = getExcludedExecutablesFromStore();
  return { executables };
}

/**
 * 실행 제외 목록에 추가 핸들러
 */
export async function addExcludedExecutableHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["addExcludedExecutable"],
): Promise<IpcMainEventMap["excludedExecutableAdded"]> {
  const { executable } = payload;

  // 파일명만 추출 (경로가 포함된 경우)
  const fileName = executable.split(/[/\\]/).pop() || executable;

  addExcludedExecutable(fileName);
  return { executable: fileName };
}

/**
 * 실행 제외 목록에서 제거 핸들러
 */
export async function removeExcludedExecutableHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["removeExcludedExecutable"],
): Promise<IpcMainEventMap["excludedExecutableRemoved"]> {
  const { executable } = payload;
  removeExcludedExecutable(executable);
  return { executable };
}

/**
 * 실행 파일 경로 직접 지정 핸들러
 */
export async function setExecutablePathHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["setExecutablePath"],
): Promise<IpcMainEventMap["executablePathSet"]> {
  const { path, executablePath } = payload;

  // 경로 유효성 검증
  validateDirectoryPath(path);

  // 게임 존재 확인
  const game = await db("games").where("path", path).first();
  if (!game) {
    throw new Error("게임을 찾을 수 없습니다.");
  }

  // 실행 파일 경로 업데이트
  await db("games").where("path", path).update({
    executablePath,
    updatedAt: new Date(),
  });

  return { path, executablePath };
}

/**
 * 라이브러리 경로 목록 조회 핸들러
 */
export async function getLibraryPathsHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["getLibraryPaths"],
): Promise<IpcMainEventMap["libraryPaths"]> {
  const paths = getLibraryPaths();
  return { paths };
}

/**
 * 라이브러리 경로 추가 핸들러
 */
export async function addLibraryPathHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["addLibraryPath"],
): Promise<IpcMainEventMap["libraryPathAdded"]> {
  const { path } = payload;
  addLibraryPathToStore(path);
  return { path };
}

/**
 * 라이브러리 경로 제거 핸들러
 * 해당 경로의 게임도 함께 삭제 (DB만, 실제 파일은 유지)
 */
export async function removeLibraryPathHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["removeLibraryPath"],
): Promise<IpcMainEventMap["libraryPathRemoved"]> {
  const { path } = payload;

  // 해당 경로 하위의 게임 조회
  const gamesToDelete = await db("games")
    .where("source", path)
    .select("path", "thumbnail");

  const gamePaths = gamesToDelete.map((g) => g.path);
  const deletedGameCount = gamePaths.length;

  if (deletedGameCount > 0) {
    // 썸네일 경로 조회
    const thumbnailsToDelete = gamesToDelete
      .map((g) => g.thumbnail)
      .filter((t): t is string => t !== null);

    // 이미지 경로 조회
    const imagesToDelete = await db("gameImages")
      .whereIn("gamePath", gamePaths)
      .pluck("path");

    // 관계 데이터 삭제 (gamePath 기반)
    await db("gameMakers").whereIn("gamePath", gamePaths).delete();
    await db("gameCategories").whereIn("gamePath", gamePaths).delete();
    await db("gameTags").whereIn("gamePath", gamePaths).delete();
    await db("gameImages").whereIn("gamePath", gamePaths).delete();

    // 게임 레코드 삭제 (userGameData는 보존됨)
    await db("games").whereIn("path", gamePaths).delete();

    // 썸네일 및 이미지 파일 삭제
    for (const thumbnail of thumbnailsToDelete) {
      await deleteImage(toAbsolutePath(thumbnail) ?? thumbnail);
    }
    for (const imagePath of imagesToDelete) {
      await deleteImage(toAbsolutePath(imagePath) ?? imagePath);
    }
  }

  // 설정에서 경로 제거
  removeLibraryPathFromStore(path);

  // 스캔 기록 삭제
  removeLibraryScanHistory(path);

  return { path, deletedGameCount };
}

/**
 * 마지막 갱신 시간 저장 핸들러
 */
export async function setLastRefreshedHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["lastRefreshedSet"],
): Promise<void> {
  setLastRefreshedAt(payload.timestamp);
}

/**
 * 마지막 갱신 시간 조회 핸들러
 */
export async function getLastRefreshedHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["lastRefreshedGet"],
): Promise<IpcMainEventMap["lastRefreshedLoaded"]> {
  const timestamp = getLastRefreshedAt();
  return { timestamp: timestamp ?? null };
}

/**
 * 원본 사이트 열기 핸들러
 */
export async function openOriginalSiteHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["openOriginalSite"],
): Promise<void> {
  const { path } = payload;

  // DB에서 게임 정보 조회
  const game = await db("games")
    .select("provider", "externalId")
    .where({ path })
    .first();

  if (!game?.provider || !game?.externalId) {
    throw new Error("원본 사이트 정보가 없습니다.");
  }

  // getCollectorUrl 함수를 사용하여 URL 생성
  const { getCollectorUrl } = await import("../collectors/registry.js");
  const url = getCollectorUrl(game.provider, game.externalId);
  if (!url) {
    throw new Error("원본 사이트 URL을 생성할 수 없습니다.");
  }

  shell.openExternal(url);
}

// ========== 라이브러리 스캔 기록 관리 ==========

/**
 * 폴더의 게임 수를 셈 (재귀 스캔)
 * 실행파일이 있는 폴더, 압축파일, 실행파일(.exe, .lnk, .url)을 게임으로 간주
 */
function countGames(sourcePath: string): number {
  if (!existsSync(sourcePath)) {
    return 0;
  }

  let count = 0;
  const queue: Array<{ path: string; depth: number }> = [
    { path: sourcePath, depth: 0 },
  ];
  const maxDepth = getScanDepth();

  while (queue.length > 0) {
    const { path: currentPath, depth } = queue.shift()!;

    if (depth > maxDepth) continue;

    try {
      const entries = readdirSync(currentPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;

        const fullPath = join(currentPath, entry.name);
        const isCompressFile = COMPRESS_FILE_TYPE.some((ext) =>
          entry.name.toLowerCase().endsWith(ext),
        );
        const isExecutableFile =
          entry.isFile() &&
          EXECUTABLE_EXTENSIONS.some((ext) =>
            entry.name.toLowerCase().endsWith(ext),
          );

        if (entry.isDirectory()) {
          if (EXCLUDED_FOLDER_NAMES.has(entry.name.toLowerCase())) continue;
          if (hasExecutableFile(fullPath)) {
            count++;
          } else {
            queue.push({ path: fullPath, depth: depth + 1 });
          }
        } else if (isCompressFile || isExecutableFile) {
          count++;
        }
      }
    } catch {
      // 권한 등의 문제로 읽기 실패 시 스킵
    }
  }

  return count;
}

/**
 * 라이브러리 변경 감지 (하이브리드 방식)
 * 1단계: 폴더 mtime 빠른 체크
 * 2단계: 파일 개수 비교
 */
async function hasLibraryChanges(libraryPath: string): Promise<boolean> {
  const history = getLibraryScanHistory(libraryPath);

  // 기록이 없으면 변경 있음 (처음 스캔)
  if (!history) return true;

  try {
    // 1단계: 폴더 mtime 빠른 체크
    const stat = statSync(libraryPath);
    if (stat.mtime > new Date(history.lastScannedAt)) return true;

    // 2단계: 파일 개수 비교
    const currentCount = countGames(libraryPath);
    return currentCount !== history.lastGameCount;
  } catch {
    return false;
  }
}

/**
 * 라이브러리 스캔 기록 조회 핸들러
 */
export async function getLibraryScanHistoryHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getLibraryScanHistory"],
): Promise<IpcMainEventMap["libraryScanHistory"]> {
  const { path } = payload;
  const history = getLibraryScanHistory(path);
  return { path, history: history ?? null };
}

/**
 * 모든 라이브러리 스캔 기록 조회 핸들러
 */
export async function getAllLibraryScanHistoryHandler(
  _event: IpcMainInvokeEvent,
  _payload: IpcRendererEventMap["getAllLibraryScanHistory"],
): Promise<IpcMainEventMap["allLibraryScanHistory"]> {
  const history = getAllLibraryScanHistory();
  return { history };
}

/**
 * 라이브러리 자동 스캔 (변경 있는 폴더만)
 * 앱 시작 시 호출됨
 */
export async function autoScanLibraries(): Promise<number> {
  const paths = getLibraryPaths();
  if (paths.length === 0) return 0;

  let totalAdded = 0;
  let totalDeleted = 0;
  for (const path of paths) {
    if (await hasLibraryChanges(path)) {
      const result = await scanFolder(path);
      totalAdded += result.addedCount;
      totalDeleted += result.deletedCount;
    }
  }

  // 변경 사항 있으면 마지막 갱신 시간 업데이트
  if (totalAdded > 0 || totalDeleted > 0) {
    setLastRefreshedAt(new Date().toISOString());
  }

  return totalAdded;
}

// ========== 플레이 타임 관련 ==========

/**
 * 플레이 타임 조회 핸들러
 */
export async function getPlayTimeHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getPlayTime"],
): Promise<IpcMainEventMap["playTimeLoaded"]> {
  const { path } = payload;

  const game = await db("games")
    .leftJoin("userGameData", "games.fingerprint", "userGameData.fingerprint")
    .where("games.path", path)
    .select("userGameData.totalPlayTime")
    .first();

  return {
    path,
    totalPlayTime: game?.totalPlayTime ?? 0,
  };
}

/**
 * 플레이 세션 목록 조회 핸들러
 */
export async function getPlaySessionsHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["getPlaySessions"],
): Promise<IpcMainEventMap["playSessionsLoaded"]> {
  const { path, limit = 10 } = payload;

  const game = await db("games")
    .where("path", path)
    .select("fingerprint")
    .first();
  if (!game?.fingerprint) return { sessions: [] };

  const userData = await db("userGameData")
    .where("fingerprint", game.fingerprint)
    .select("id")
    .first();
  if (!userData) return { sessions: [] };

  const sessions = await db("playSessions")
    .where("userGameDataId", userData.id)
    .orderBy("startedAt", "desc")
    .limit(limit);

  return { sessions };
}
