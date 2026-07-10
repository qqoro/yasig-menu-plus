import dayjs from "dayjs";
import { parse } from "node-html-parser";
import { Collector, type CollectorResult } from "./registry.js";
import { extractRjCode } from "../lib/rj-code.js";

/**
 * info/ajax 응답에서 평균 평점(0-5)을 파싱한다.
 * 평가가 없거나 형식이 잘못되면 null.
 */
export function parseDlsiteRating(json: unknown, id: string): number | null {
  if (!json || typeof json !== "object") return null;
  const entry = (json as Record<string, unknown>)[id] as
    | Record<string, unknown>
    | undefined;
  if (!entry) return null;
  const count = Number(entry.rate_count ?? 0);
  if (!count) return null;
  const avg = Number(entry.rate_average_2dp);
  return Number.isFinite(avg) && avg > 0 ? avg : null;
}

/**
 * info/ajax 응답에서 리뷰 수(rate_count)를 파싱한다.
 * 평가가 없거나 형식이 잘못되면 null.
 */
export function parseDlsiteReviewCount(
  json: unknown,
  id: string,
): number | null {
  if (!json || typeof json !== "object") return null;
  const entry = (json as Record<string, unknown>)[id] as
    | Record<string, unknown>
    | undefined;
  if (!entry) return null;
  const count = Number(entry.rate_count ?? 0);
  return count > 0 ? count : null;
}

/**
 * info/ajax 응답에서 다운로드 수(dl_count, 판매 수)를 파싱한다.
 * 수치가 없거나 0이면 null.
 */
export function parseDlsiteDownloadCount(
  json: unknown,
  id: string,
): number | null {
  if (!json || typeof json !== "object") return null;
  const entry = (json as Record<string, unknown>)[id] as
    | Record<string, unknown>
    | undefined;
  if (!entry) return null;
  const count = Number(entry.dl_count ?? 0);
  return count > 0 ? count : null;
}

/**
 * DLsite work_type 코드 → 한국어 라벨 매핑.
 * 판매 중단 작품 폴백 시 info/ajax의 work_type 코드를 카테고리명으로 변환하는 용도.
 * DLsite 공식 작품 형식 목록(ko-KR) 기준이며, 하단 4개는 타 사이트(books 등)용 코드.
 */
const WORK_TYPE_LABELS: Record<string, string> = {
  ACN: "액션",
  QIZ: "퀴즈",
  ADV: "어드벤쳐",
  RPG: "롤플레잉",
  TBL: "테이블",
  DNV: "디지털 소설",
  SLN: "시뮬레이션",
  TYP: "타이핑",
  STG: "슈팅",
  PZL: "퍼즐",
  ETC: "기타 게임",
  ET3: "기타",
  MNG: "만화",
  ICG: "CG・일러스트",
  MOV: "동영상 작품",
  SOU: "보이스・ASMR",
  TOL: "툴 / 악세사리",
  IMT: "이미지 소재",
  AMT: "소리 소재",
  VCM: "보이스 코믹",
  NRE: "노벨",
  MUS: "음악",
  SCM: "극화",
  WBT: "웹툰",
};

/** 판매 중단 작품의 샘플 이미지 존재 여부를 확인할 최대 개수 */
const MAX_SAMPLE_IMAGES = 20;

/** 프로토콜 상대 URL(//img.dlsite.jp/...)을 https 절대 URL로 변환. 문자열이 아니면 null */
function toAbsoluteUrl(url: unknown): string | null {
  if (typeof url !== "string" || url === "") return null;
  return url.startsWith("//") ? `https:${url}` : url;
}

/** regist_date("YYYY-MM-DD HH:mm:ss") 문자열을 Date로 변환. 잘못된 값이면 null */
function parseRegistDate(value: unknown): Date | null {
  if (typeof value !== "string" || value === "") return null;
  const date = dayjs(value);
  return date.isValid() ? date.toDate() : null;
}

/** 값이 비어있지 않은 문자열이면 그대로, 아니면 null */
function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** product.json에서 파싱한 판매 중 작품 정보 */
export interface DlsiteProductInfo {
  title: string | null;
  thumbnailUrl: string | null;
  images: string[];
  publishDate: Date | null;
  makers: string[];
  categories: string[];
  tags: string[];
}

/**
 * product.json 응답(배열)에서 해당 workno의 작품 정보를 파싱한다.
 * 판매 중단 작품은 빈 배열이 반환되므로 null.
 */
export function parseDlsiteProduct(
  json: unknown,
  id: string,
): DlsiteProductInfo | null {
  if (!Array.isArray(json)) return null;
  // workno 일치 확인: 빈 workno 요청 등 비정상 응답이 섞여도 무시되도록 방어
  const product = json.find(
    (entry) =>
      entry &&
      typeof entry === "object" &&
      (entry as Record<string, unknown>).workno === id,
  ) as Record<string, unknown> | undefined;
  if (!product) return null;

  const thumbnailUrl = toAbsoluteUrl(
    (product.image_main as Record<string, unknown> | null)?.url,
  );
  const sampleUrls = Array.isArray(product.image_samples)
    ? product.image_samples
        .map((sample) =>
          toAbsoluteUrl((sample as Record<string, unknown> | null)?.url),
        )
        .filter((url): url is string => url !== null)
    : [];
  const images = thumbnailUrl ? [thumbnailUrl, ...sampleUrls] : sampleUrls;

  const makerName = asNonEmptyString(product.maker_name);
  const workTypeString = asNonEmptyString(product.work_type_string);
  const tags = Array.isArray(product.genres)
    ? product.genres
        .map((genre) =>
          asNonEmptyString((genre as Record<string, unknown> | null)?.name),
        )
        .filter((name): name is string => name !== null)
    : [];

  return {
    title: asNonEmptyString(product.work_name),
    thumbnailUrl,
    images,
    publishDate: parseRegistDate(product.regist_date),
    makers: makerName ? [makerName] : [],
    categories: workTypeString ? [workTypeString] : [],
    tags,
  };
}

/** info/ajax에서 파싱한 판매 중단 작품 폴백 정보 */
export interface DlsiteAjaxFallbackInfo {
  title: string | null;
  thumbnailUrl: string | null;
  publishDate: Date | null;
  category: string | null;
  makerId: string | null;
}

/**
 * info/ajax 응답에서 판매 중단 작품의 기본 정보를 파싱한다.
 * info/ajax는 작품 페이지가 내려간 뒤에도 제목/썸네일/발매일 등을 계속 반환한다.
 * 존재하지 않는 workno는 빈 배열이 반환되므로 null.
 */
export function parseDlsiteAjaxFallback(
  json: unknown,
  id: string,
): DlsiteAjaxFallbackInfo | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const entry = (json as Record<string, unknown>)[id] as
    | Record<string, unknown>
    | undefined;
  if (!entry || typeof entry !== "object") return null;

  const workType = asNonEmptyString(entry.work_type);
  return {
    title: asNonEmptyString(entry.work_name),
    thumbnailUrl: toAbsoluteUrl(entry.work_image),
    publishDate: parseRegistDate(entry.regist_date),
    category: workType ? (WORK_TYPE_LABELS[workType] ?? null) : null,
    makerId: asNonEmptyString(entry.maker_id),
  };
}

/**
 * 메인 이미지 URL(..._img_main.jpg)에서 n번째 샘플 이미지 URL(..._img_smpN.jpg)을 유도한다.
 * 메인 이미지 패턴이 아니면 null.
 */
export function deriveSampleImageUrl(
  mainImageUrl: string,
  index: number,
): string | null {
  if (!/_img_main\.[a-zA-Z0-9]+$/.test(mainImageUrl)) return null;
  return mainImageUrl.replace(
    /_img_main(\.[a-zA-Z0-9]+)$/,
    `_img_smp${index}$1`,
  );
}

/**
 * 서클 프로필 페이지 HTML에서 서클명을 추출한다.
 * 서클 페이지는 작품이 판매 중단되어도 유지되므로 maker_id로 서클명을 복구할 수 있다.
 */
export function parseCircleName(html: string): string | null {
  const name = parse(html)
    .querySelector(".prof_maker_name")
    ?.textContent.trim();
  return name ? name : null;
}

/** 판매 중단 작품의 샘플 이미지를 CDN에서 순차 확인하여 존재하는 URL만 수집 */
async function probeSampleImages(mainImageUrl: string): Promise<string[]> {
  const sampleUrls: string[] = [];
  for (let i = 1; i <= MAX_SAMPLE_IMAGES; i++) {
    const url = deriveSampleImageUrl(mainImageUrl, i);
    if (!url) break;
    const exists = await fetch(url, { method: "HEAD" })
      .then((res) => res.ok)
      .catch(() => false);
    if (!exists) break;
    sampleUrls.push(url);
  }
  return sampleUrls;
}

/** maker_id로 서클 프로필 페이지에서 서클명을 조회. 실패해도 치명적이지 않음 */
async function fetchCircleName(makerId: string): Promise<string | null> {
  return fetch(
    `https://www.dlsite.com/maniax/circle/profile/=/maker_id/${makerId}.html`,
    { headers: { cookie: "locale=ko-kr" } },
  )
    .then((res) => res.text())
    .then((html) => parseCircleName(html))
    .catch(() => null);
}

export const DLSiteCollector: Collector = {
  name: "DLSite",
  getId: async (path) => {
    const rjCode = extractRjCode(path);
    return rjCode;
  },
  fetchInfo: async ({ id }) => {
    const [productJson, ajaxJson] = await Promise.all([
      // 판매 중 작품의 전체 메타데이터 (제목/장르/카테고리/제작자/이미지/발매일)
      fetch(
        `https://www.dlsite.com/maniax/api/=/product.json?workno=${id}&locale=ko_KR`,
      ).then((res) => res.json()),
      // 평점/리뷰 수/판매 수 + 판매 중단 작품 폴백 정보. 실패해도 치명적이지 않음.
      fetch(
        `https://www.dlsite.com/maniax/product/info/ajax?product_id=${id}`,
        { headers: { cookie: "locale=ko-kr" } },
      )
        .then((res) => res.json())
        .catch(() => null),
    ]);

    const ratingInfo = {
      rating: parseDlsiteRating(ajaxJson, id),
      reviewCount: parseDlsiteReviewCount(ajaxJson, id),
      downloadCount: parseDlsiteDownloadCount(ajaxJson, id),
    };

    // 1차: product.json (판매 중 작품)
    const product = parseDlsiteProduct(productJson, id);
    if (product) {
      return {
        ...product,
        ...ratingInfo,
        externalId: id,
        provider: "dlsite",
      } satisfies CollectorResult;
    }

    // 2차: info/ajax 폴백 (판매 중단 작품 - product.json은 빈 배열을 반환)
    // 태그(장르)는 판매 중단 후 어떤 공개 API에서도 제공되지 않아 수집 불가.
    const fallback = parseDlsiteAjaxFallback(ajaxJson, id);
    if (!fallback) {
      // 양쪽 모두 데이터 없음 (존재하지 않는 코드 등)
      return {
        title: null,
        thumbnailUrl: null,
        images: [],
        publishDate: null,
        ...ratingInfo,
        makers: [],
        categories: [],
        tags: [],
        externalId: id,
        provider: "dlsite",
      } satisfies CollectorResult;
    }

    // 샘플 이미지는 목록 API가 없지만 CDN에는 남아있으므로 URL 패턴으로 수집
    const sampleUrls = fallback.thumbnailUrl
      ? await probeSampleImages(fallback.thumbnailUrl)
      : [];
    // 서클명은 ajax에 없으므로 (maker_id만 존재) 서클 프로필 페이지에서 복구
    const circleName = fallback.makerId
      ? await fetchCircleName(fallback.makerId)
      : null;

    return {
      title: fallback.title,
      thumbnailUrl: fallback.thumbnailUrl,
      images: fallback.thumbnailUrl
        ? [fallback.thumbnailUrl, ...sampleUrls]
        : [],
      publishDate: fallback.publishDate,
      ...ratingInfo,
      makers: circleName ? [circleName] : [],
      categories: fallback.category ? [fallback.category] : [],
      tags: [],
      externalId: id,
      provider: "dlsite",
    } satisfies CollectorResult;
  },
  getUrl: (id) => `https://www.dlsite.com/maniax/work/=/product_id/${id}.html`,
};
