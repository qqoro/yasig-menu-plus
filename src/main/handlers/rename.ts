/**
 * 파일명 리네임 핸들러
 *
 * - 템플릿 기반 파일명 변경 미리보기
 * - 파일 시스템 + DB 경로 일괄 업데이트
 */

import type { IpcMainInvokeEvent } from "electron";
import { rename as fsRename } from "fs/promises";
import { basename, dirname, extname, join } from "path";
import { db } from "../db/db-manager.js";
import type { RenameExecuteItem, RenamePreviewItem } from "../events.js";
import { applyTemplate, type TemplateContext } from "../lib/rename-template.js";
import { toAbsolutePath } from "../utils/image-path.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Rename");

/**
 * Windows EPERM/EBUSY 대응 재시도 래퍼
 *
 * 탐색기, 바이러스 백신, 인덱서 등이 폴더를 일시적으로 잠근 경우
 * 잠시 대기 후 재시도하여 성공할 수 있음
 */
async function renameWithRetry(
  oldPath: string,
  newPath: string,
  maxRetries = 3,
): Promise<void> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fsRename(oldPath, newPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code === "EPERM" || code === "EBUSY") && attempt < maxRetries) {
        log.warn(
          `리네임 재시도 (${attempt + 1}/${maxRetries}): ${basename(oldPath)}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, 500 * (attempt + 1)),
        );
        continue;
      }
      throw error;
    }
  }
}

/** 내부 작업용 게임 + 관계 데이터 */
interface GameWithRelations {
  path: string;
  title: string;
  originalTitle: string;
  translatedTitle: string | null;
  provider: string | null;
  externalId: string | null;
  publishDate: Date | null;
  thumbnail: string | null;
  source: string;
  isCompressFile: number | boolean;
  executablePath: string | null;
  makers: string[];
  categories: string[];
  tags: string[];
}

/** 미리보기 내부 아이템 (newPath 포함) */
interface PreviewItemInternal extends RenamePreviewItem {
  newPath: string;
}

/**
 * 숨겨지지 않은 모든 게임 + 관계 데이터 조회
 */
async function loadGamesWithRelations(): Promise<GameWithRelations[]> {
  const games = await db("games")
    .where("isHidden", false)
    .whereNotNull("provider")
    .select(
      "path",
      "title",
      "originalTitle",
      "translatedTitle",
      "provider",
      "externalId",
      "publishDate",
      "thumbnail",
      "source",
      "isCompressFile",
      "executablePath",
    );

  if (games.length === 0) return [];

  const gamePaths = games.map((g) => g.path);

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

  // gamePath별 그룹화
  const groupByPath = (
    rows: Array<{ gamePath: string; name: string }>,
  ): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    for (const r of rows) {
      let arr = map.get(r.gamePath);
      if (!arr) {
        arr = [];
        map.set(r.gamePath, arr);
      }
      arr.push(r.name);
    }
    return map;
  };

  const makerMap = groupByPath(
    makers as Array<{ gamePath: string; name: string }>,
  );
  const categoryMap = groupByPath(
    categories as Array<{ gamePath: string; name: string }>,
  );
  const tagMap = groupByPath(tags as Array<{ gamePath: string; name: string }>);

  return games.map((g) => ({
    ...g,
    makers: makerMap.get(g.path) ?? [],
    categories: categoryMap.get(g.path) ?? [],
    tags: tagMap.get(g.path) ?? [],
  }));
}

/**
 * DB 게임 데이터를 템플릿 컨텍스트로 변환
 */
/** provider별 externalId 접두사 매핑 (DLSite은 이미 RJ/BJ/VJ 포함) */
const PROVIDER_ID_PREFIX: Record<string, string> = {
  steam: "ST",
  getchu: "GC",
  cien: "CE",
};

function toTemplateContext(game: GameWithRelations): TemplateContext {
  // publish_date는 Unix 타임스탬프(ms)로 저장됨
  const publishDate = game.publishDate
    ? new Date(Number(game.publishDate)).toISOString().slice(0, 10)
    : null;
  const publishYear = publishDate ? publishDate.slice(0, 4) : null;

  // externalId에 provider 접두사가 없으면 추가
  const prefix = PROVIDER_ID_PREFIX[game.provider ?? ""];
  const externalId =
    game.externalId && prefix && !game.externalId.startsWith(prefix)
      ? prefix + game.externalId
      : game.externalId;

  return {
    externalId,
    title: game.title,
    originalTitle: game.originalTitle,
    translatedTitle: game.translatedTitle,
    maker: game.makers[0] ?? null,
    makers: game.makers,
    category: game.categories[0] ?? null,
    categories: game.categories,
    publishDate,
    publishYear,
    tag: game.tags[0] ?? null,
    tags: game.tags,
    provider: game.provider,
  };
}

/**
 * 새 파일/폴더 경로 생성
 *
 * 압축 파일이면 확장자를 유지하고, 폴더면 이름만 교체
 */
function buildNewPath(
  oldPath: string,
  newName: string,
  isCompressFile: boolean | number,
): string {
  const dir = dirname(oldPath);
  if (isCompressFile) {
    return join(dir, newName + extname(oldPath));
  }
  return join(dir, newName);
}

/**
 * 리네임 미리보기 핸들러
 *
 * 템플릿을 적용하여 변경될 파일명을 미리 확인
 */
export async function previewRenameHandler(
  _event: IpcMainInvokeEvent,
  payload: { template: string },
): Promise<{ items: RenamePreviewItem[] }> {
  const { template } = payload;

  const games = await loadGamesWithRelations();

  // 템플릿 적용 및 미리보기 아이템 생성
  const items: PreviewItemInternal[] = games.map((game) => {
    const context = toTemplateContext(game);
    const newName = applyTemplate(template, context);

    // 표시명: 압축 파일이면 확장자 포함
    const displayName = game.isCompressFile
      ? newName + extname(game.path)
      : newName;
    const currentName = basename(game.path);
    const newPath = buildNewPath(game.path, newName, game.isCompressFile);

    let status: "ok" | "conflict" | "noChange" = "ok";
    if (newPath === game.path) {
      status = "noChange";
    }

    return {
      path: game.path,
      currentName,
      newName: displayName,
      thumbnail: game.thumbnail ? toAbsolutePath(game.thumbnail) : null,
      source: game.source,
      isCompressFile: Boolean(game.isCompressFile),
      status,
      newPath,
    };
  });

  // 충돌 감지: 동일한 newPath가 여러 개면 conflict
  const pathCount = new Map<string, number>();
  for (const item of items) {
    if (item.status === "noChange") continue;
    const count = pathCount.get(item.newPath) ?? 0;
    pathCount.set(item.newPath, count + 1);
  }
  for (const item of items) {
    if (item.status !== "ok") continue;
    if ((pathCount.get(item.newPath) ?? 0) > 1) {
      item.status = "conflict";
    }
  }

  // 정렬: conflict → ok → noChange (변경 없는 항목은 맨 아래)
  const statusOrder: Record<string, number> = {
    conflict: 0,
    ok: 1,
    noChange: 2,
  };
  items.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  // newPath는 내부 필드이므로 제외하고 반환
  const result: RenamePreviewItem[] = items.map(
    ({ newPath: _newPath, ...rest }) => rest,
  );

  return { items: result };
}

/**
 * 리네임 실행 핸들러
 *
 * 파일 시스템 리네임 + DB 경로 업데이트
 * junction 테이블은 ON UPDATE CASCADE가 없으므로 수동으로 업데이트
 */
export async function executeRenameHandler(
  _event: IpcMainInvokeEvent,
  payload: { items: RenameExecuteItem[] },
): Promise<{
  successCount: number;
  failCount: number;
  failedPaths: string[];
  errors: string[];
}> {
  const { items } = payload;

  let successCount = 0;
  let failCount = 0;
  const failedPaths: string[] = [];
  const errors: string[] = [];

  for (const item of items) {
    try {
      // DB에서 게임 정보 조회
      const game = await db("games")
        .where("path", item.path)
        .select("isCompressFile", "executablePath")
        .first();

      if (!game) {
        failCount++;
        failedPaths.push(item.path);
        errors.push(`게임을 찾을 수 없음: ${item.path}`);
        continue;
      }

      const newPath = buildNewPath(
        item.path,
        item.newName,
        game.isCompressFile,
      );

      // 변경이 없으면 스킵
      if (newPath === item.path) {
        successCount++;
        continue;
      }

      // 파일 시스템 리네임 (EPERM/EBUSY 시 재시도)
      await renameWithRetry(item.path, newPath);

      // DB 업데이트: games.path 변경 시 ON UPDATE CASCADE로 junction 자동 갱신
      await db("games")
        .where("path", item.path)
        .update({
          path: newPath,
          originalTitle: item.newName,
          ...(game.executablePath && game.executablePath.startsWith(item.path)
            ? {
                executablePath:
                  newPath + game.executablePath.slice(item.path.length),
              }
            : {}),
        });

      successCount++;
    } catch (error) {
      failCount++;
      failedPaths.push(item.path);
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${item.path}: ${message}`);
      log.error(`리네임 실패: ${item.path}`, error);
    }
  }

  log.info(`리네임 완료: 성공 ${successCount}건, 실패 ${failCount}건`);

  return { successCount, failCount, failedPaths, errors };
}
