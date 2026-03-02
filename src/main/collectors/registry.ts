import { Page } from "puppeteer-core";
import { db } from "../db/db-manager.js";
import { deleteImage, downloadImage } from "../utils/downloader.js";
import { CienCollector } from "./cien-collector.js";
import { DLSiteCollector } from "./dlsite-collector.js";
import { GetchuCollector } from "./getchu-collector.js";
import { GoogleCollector } from "./google-collector.js";
import { SteamCollector } from "./steam-collector.js";

/**
 * 컬렉터가 수집한 정보의 결과 타입
 * DB 스키마에 맞춰 관계 테이블을 위한 배열 형태로 정의
 */
export interface CollectorResult {
  /** 썸네일 URL */
  thumbnailUrl: string | null;
  /** 추가 이미지 URL들 (DLSite 샘플 이미지 등) */
  images: string[];
  /** 게임 제목 (games.title) */
  title: string | null;
  /** 발매일 (games.publishDate) */
  publishDate: Date | null;
  /** 제작사 목록 (makers 테이블 → gameMakers) */
  makers: string[];
  /** 카테고리 목록 (categories 테이블 → gameCategories) */
  categories: string[];
  /** 태그 목록 (tags 테이블 → gameTags) */
  tags: string[];
  /** 외부 ID (games.externalId) */
  externalId: string | null;
  /** 제공자 (games.provider) */
  provider: string | null;
}

export interface Collector {
  name: string;
  getId: (path: string) => Promise<string | undefined>;
  fetchInfo: ({
    path,
    id,
    page,
  }: {
    path: string;
    id: string;
    page?: Page;
  }) => Promise<CollectorResult | undefined>;
  /** 외부 사이트 URL 생성 */
  getUrl?: (id: string) => string;
}

export const collectors: Collector[] = [
  DLSiteCollector,
  SteamCollector,
  GetchuCollector,
  CienCollector,
];

// Fallback 컬렉터: 다른 컬렉터가 정보를 찾지 못했을 때만 사용
export const fallbackCollector: Collector = GoogleCollector;

/**
 * 게임 경로에 맞는 컬렉터를 찾습니다.
 * 1단계: 일반 컬렉터들 병렬 실행
 * 2단계: 모두 실패하면 GoogleCollector 실행
 */
export async function findCollector(path: string) {
  // 1단계: 일반 컬렉터들 병렬 실행
  const primaryResult = (
    await Promise.all(
      collectors.map(async (collector) => ({
        collector,
        id: await collector.getId(path),
      })),
    )
  ).find((data) => !!data.id);

  if (primaryResult) {
    return primaryResult as { collector: Collector; id: string };
  }

  // 2단계: 일반 컬렉터가 모두 실패하면 GoogleCollector 실행
  const fallbackId = await fallbackCollector.getId(path);
  if (fallbackId) {
    return {
      collector: fallbackCollector,
      id: fallbackId,
    } as { collector: Collector; id: string };
  }

  return undefined;
}

/**
 * 컬렉터 결과를 DB에 저장
 * 관계 테이블(game_makers, game_categories, game_tags)에 올바르게 저장
 */
export async function saveInfo(path: string, info: CollectorResult) {
  const {
    title,
    publishDate,
    makers,
    categories,
    tags,
    externalId,
    provider,
    thumbnailUrl,
    images,
  } = info;

  // 1. 먼저 기존 이미지 파일들 삭제
  const existingImages = await db("gameImages")
    .where({ game_path: path })
    .select("path");
  for (const image of existingImages) {
    try {
      await deleteImage(image.path);
    } catch (error) {
      console.error("[saveInfo] 기존 이미지 파일 삭제 실패:", error);
    }
  }

  // 2. 새 이미지 다운로드
  let downloadedPaths: string[] = [];
  let thumbnailPath: string | null = null;

  // 썸네일 다운로드 (항상 먼저)
  if (thumbnailUrl) {
    thumbnailPath = await downloadImage(thumbnailUrl, path, 0);
    downloadedPaths.push(thumbnailPath);
  }

  // images 배열 다운로드 (썸네일과 중복되면 건너뜀)
  for (const image of images) {
    // 썸네일 URL과 같으면 건너뜀
    if (thumbnailUrl && image === thumbnailUrl) {
      continue;
    }
    // 인덱스는 이미 썸네일 하나가 있으므로 +1
    const filePath = await downloadImage(image, path, downloadedPaths.length);
    downloadedPaths.push(filePath);
  }

  // 3. 트랜잭션으로 DB 저장
  const tx = await db.transaction();
  try {
    // games 테이블 업데이트 (썸네일 경로 포함)
    await tx("games")
      .update({
        title: title ?? undefined,
        publishDate: publishDate ?? undefined,
        externalId: externalId ?? undefined,
        provider: provider ?? undefined,
        thumbnail: thumbnailPath, // 썸네일 경로 업데이트
        isLoadedInfo: true,
      })
      .where({ path });

    // 2. makers 저장 (upsert)
    if (makers.length > 0) {
      // 기존 관계 삭제
      await tx("gameMakers").delete().where({ gamePath: path });

      for (const makerName of makers) {
        const [maker] = await tx("makers")
          .insert({ name: makerName, createdAt: db.fn.now() })
          .onConflict("name")
          .merge()
          .returning("id");
        await tx("gameMakers")
          .insert({ gamePath: path, makerId: maker.id })
          .onConflict()
          .ignore();
      }
    }

    // 3. categories 저장 (upsert)
    if (categories.length > 0) {
      // 기존 관계 삭제
      await tx("gameCategories").delete().where({ gamePath: path });

      for (const categoryName of categories) {
        const [category] = await tx("categories")
          .insert({ name: categoryName, sortOrder: 0, createdAt: db.fn.now() })
          .onConflict("name")
          .merge()
          .returning("id");
        await tx("gameCategories")
          .insert({ gamePath: path, categoryId: category.id })
          .onConflict()
          .ignore();
      }
    }

    // 4. tags 저장 (upsert)
    if (tags.length > 0) {
      // 기존 관계 삭제
      await tx("gameTags").delete().where({ gamePath: path });

      for (const tagName of tags) {
        const [tag] = await tx("tags")
          .insert({ name: tagName, createdAt: db.fn.now() })
          .onConflict("name")
          .merge()
          .returning("id");
        await tx("gameTags")
          .insert({ gamePath: path, tagId: tag.id })
          .onConflict()
          .ignore();
      }
    }

    // 5. 기존 이미지 DB 레코드 삭제 (파일은 위에서 이미 삭제)
    await tx("gameImages").delete().where({ game_path: path });

    // 6. 다운로드된 이미지 경로들 저장
    if (downloadedPaths.length > 0) {
      // 이미지 경로들 DB 저장
      for (let i = 0; i < downloadedPaths.length; i++) {
        await tx("gameImages").insert({
          game_path: path,
          path: downloadedPaths[i],
          sort_order: i,
        });
      }
    }

    await tx.commit();
  } catch (error) {
    console.error("saveInfo error:", error);
    await tx.rollback();
    throw error;
  }
}

/**
 * 제공자와 외부 ID로 원본 사이트 URL 생성
 */
export function getCollectorUrl(
  provider: string | null,
  externalId: string | null,
): string | null {
  if (!provider || !externalId) return null;

  // Collector name과 DB provider 값 매핑 (대소문자 처리)
  const collectorMap: Record<string, Collector> = {
    dlsite: DLSiteCollector,
    steam: SteamCollector,
    getchu: GetchuCollector,
    cien: CienCollector,
  };

  const collector = collectorMap[provider.toLowerCase()];
  return collector?.getUrl?.(externalId) ?? null;
}
