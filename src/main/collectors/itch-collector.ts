import { parse } from "node-html-parser";
import { extractItchId } from "../lib/external-id.js";
import { createLogger } from "../utils/logger.js";
import { Collector, type CollectorResult } from "./registry.js";

const log = createLogger("ItchCollector");

/** itch.io 공개 data.json 응답 (쓰는 필드만) */
interface ItchDataJson {
  title?: string;
  cover_image?: string | null;
  screenshots?: string[];
  authors?: { name: string; url?: string }[];
  tags?: string[];
}

/** 작품 페이지 HTML에서 읽는 정보 */
export interface ItchPageInfo {
  /** 원본 크기 커버 (og:image) */
  cover: string | null;
  rating: number | null;
  reviewCount: number | null;
  categories: string[];
  images: string[];
}

/** "제작자.슬러그" → 상점 주소 */
function toStoreUrl(id: string): string {
  const dot = id.indexOf(".");
  const creator = id.slice(0, dot);
  const slug = id.slice(dot + 1);
  return `https://${creator}.itch.io/${slug}`;
}

/** 숫자로 바꿀 수 없으면 null */
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * 작품 페이지 HTML 파싱
 * - 커버: og:image 원본 (data.json의 cover_image는 315x250으로 잘린 축소본)
 * - 평점: ld+json Product의 aggregateRating
 * - 카테고리: 정보 표의 Genre 행
 * - 이미지: 스크린샷 목록의 원본 크기 링크 (data.json은 347x500 축소본만 제공)
 * 발매일은 서버 HTML에 없어서 읽지 않음
 */
export function parseItchPage(html: string): ItchPageInfo {
  const root = parse(html);

  const cover =
    root.querySelector('meta[property="og:image"]')?.getAttribute("content") ||
    null;

  let rating: number | null = null;
  let reviewCount: number | null = null;
  for (const script of root.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const data = JSON.parse(script.textContent);
      if (data?.aggregateRating) {
        rating = toNumber(data.aggregateRating.ratingValue);
        reviewCount = toNumber(data.aggregateRating.ratingCount);
        break;
      }
    } catch {
      // 깨진 ld+json은 무시
    }
  }

  const categories: string[] = [];
  for (const row of root.querySelectorAll(".game_info_panel_widget tr")) {
    const [label, value] = row.querySelectorAll("td");
    if (label?.textContent.trim() === "Genre" && value) {
      categories.push(
        ...value
          .querySelectorAll("a")
          .map((a) => a.textContent.trim())
          .filter(Boolean),
      );
    }
  }

  const images = root
    .querySelectorAll(".screenshot_list a")
    .map((a) => a.getAttribute("href"))
    .filter((href): href is string => !!href);

  return { cover, rating, reviewCount, categories, images };
}

/** 작품 페이지 정보 (실패해도 data.json만으로 수집할 수 있게 빈 값 반환) */
async function fetchPageInfo(url: string): Promise<ItchPageInfo> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`응답 오류 ${res.status}`);
    return parseItchPage(await res.text());
  } catch (error) {
    log.warn(`작품 페이지 읽기 실패, data.json 정보만 사용: ${url}`, error);
    return {
      cover: null,
      rating: null,
      reviewCount: null,
      categories: [],
      images: [],
    };
  }
}

export const ItchCollector: Collector = {
  name: "itch.io",
  getId: async (path) => extractItchId(path),
  fetchInfo: async ({ id }) => {
    const storeUrl = toStoreUrl(id);

    const res = await fetch(`${storeUrl}/data.json`);
    if (res.status === 404) {
      log.warn(`itch.io에 없는 작품: ${storeUrl}`);
      return undefined;
    }
    if (!res.ok) {
      throw new Error(`itch.io 응답 오류 ${res.status}: ${storeUrl}`);
    }
    const data = (await res.json()) as ItchDataJson;
    const page = await fetchPageInfo(storeUrl);

    return {
      title: data.title ?? null,
      thumbnailUrl: page.cover ?? data.cover_image ?? null,
      images: page.images.length > 0 ? page.images : (data.screenshots ?? []),
      publishDate: null,
      rating: page.rating,
      reviewCount: page.reviewCount,
      downloadCount: null,
      makers: (data.authors ?? []).map((a) => a.name),
      categories: page.categories,
      tags: data.tags ?? [],
      externalId: id,
      provider: "itch",
    } satisfies CollectorResult;
  },
  getUrl: toStoreUrl,
};
