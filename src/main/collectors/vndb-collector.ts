import { basename } from "path";
import { createLogger } from "../utils/logger.js";
import { Collector, type CollectorResult } from "./registry.js";

const log = createLogger("VndbCollector");

const API_URL = "https://api.vndb.org/kana/vn";
const VN_FIELDS = [
  "title",
  "alttitle",
  "titles.lang",
  "titles.title",
  "released",
  "rating",
  "votecount",
  "developers.name",
  "developers.original",
  "tags.name",
  "tags.rating",
  "tags.spoiler",
  "tags.lie",
  "image.url",
  "screenshots.url",
].join(",");

/** 제목 언어 우선순위 (한국어 → 일본어 → 영어) */
const TITLE_LANG_PRIORITY = ["ko", "ja", "en"];
/** 태그 점수(0-3) 하한 — 투표가 약한 태그 제외 */
const MIN_TAG_RATING = 1;
const MAX_TAGS = 20;

/** 5분 200회 제한 → 요청 사이 1.5초 간격 */
const MIN_REQUEST_INTERVAL_MS = 1_500;
const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5_000;

export interface VndbVn {
  id: string;
  title: string;
  alttitle: string | null;
  titles?: { lang: string; title: string }[];
  released: string | null;
  rating: number | null;
  votecount: number;
  developers?: { name: string; original: string | null }[];
  tags?: { name: string; rating: number; spoiler: number; lie: boolean }[];
  image: { url: string } | null;
  screenshots?: { url: string }[];
}

/**
 * 게임 폴더명에서 VNDB 코드(v562, vn562) 숫자 추출
 * - 상위 폴더는 보지 않음 (v 한 글자 코드라 경로 전체에서 찾으면 오인식이 잦음)
 * - 앞에 영문/숫자가 붙으면 제외 (Rev12, ver12)
 * - 뒤에 소수점+숫자가 오면 버전 표기로 보고 제외 (v1.02, v10.5)
 * - v는 1자리면 버전(v1)과 구별되지 않아 2자리부터, vn은 버전 표기와 겹치지 않아 1자리부터
 */
export function extractVndbId(path: string): string | undefined {
  const match = /(?<![a-z0-9])v(?:n(\d{1,6})|(\d{2,6}))(?!\d|\.\d)/i.exec(
    basename(path),
  );
  return match?.[1] ?? match?.[2];
}

/** 언어 우선순위대로 제목 선택, 없으면 VNDB 대표 제목 */
export function pickVndbTitle(vn: Pick<VndbVn, "title" | "titles">): string {
  for (const lang of TITLE_LANG_PRIORITY) {
    const found = vn.titles?.find((t) => t.lang === lang)?.title;
    if (found) return found;
  }
  return vn.title;
}

/** 스포일러·거짓 태그를 빼고 점수 높은 순으로 */
export function pickVndbTags(tags: VndbVn["tags"]): string[] {
  return (tags ?? [])
    .filter((t) => t.spoiler === 0 && !t.lie && t.rating >= MIN_TAG_RATING)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, MAX_TAGS)
    .map((t) => t.name);
}

/** 발매일은 YYYY-MM-DD 전체가 있을 때만 (연도만 있거나 TBA면 null) */
export function parseVndbReleased(released: string | null): Date | null {
  if (!released || !/^\d{4}-\d{2}-\d{2}$/.test(released)) return null;
  const date = new Date(`${released}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseVndbVn(vn: VndbVn, id: string): CollectorResult {
  return {
    title: pickVndbTitle(vn),
    // 커버(세로 패키지 이미지)를 썸네일로, 스크린샷은 추가 이미지로
    thumbnailUrl: vn.image?.url ?? null,
    images: (vn.screenshots ?? []).map((s) => s.url),
    publishDate: parseVndbReleased(vn.released),
    // 10-100 → 0-5
    rating: vn.rating != null ? Math.round(vn.rating * 5) / 100 : null,
    reviewCount: vn.votecount > 0 ? vn.votecount : null,
    downloadCount: null,
    makers: (vn.developers ?? []).map((d) => d.original ?? d.name),
    // VNDB엔 장르 필드가 없음 — DLSite에서 비주얼노벨이 주로 분류되는 작품 형식에 맞춤
    categories: ["어드벤쳐"],
    tags: pickVndbTags(vn.tags),
    externalId: id,
    provider: "vndb",
  };
}

let nextRequestAt = 0;

/** 요청 간격 확보 — 일괄 수집·목록 미리보기에서 동시에 불려도 순서대로 간격을 둔다 */
async function waitForRequestSlot() {
  const now = Date.now();
  const wait = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + MIN_REQUEST_INTERVAL_MS;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

async function queryVn(id: string): Promise<VndbVn | undefined> {
  for (let attempt = 0; ; attempt++) {
    await waitForRequestSlot();
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: ["id", "=", `v${id}`],
        fields: VN_FIELDS,
      }),
    });

    // 요청 한도 초과: Retry-After(초)만큼, 없으면 점점 길게 기다렸다 재시도
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      const delay =
        retryAfter > 0
          ? retryAfter * 1000
          : DEFAULT_RETRY_DELAY_MS * (attempt + 1);
      log.warn(`요청 한도 초과, ${delay}ms 후 재시도: v${id}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }

    if (!res.ok) {
      throw new Error(`VNDB 응답 오류 ${res.status}: v${id}`);
    }

    const json = (await res.json()) as { results?: VndbVn[] };
    return json.results?.[0];
  }
}

export const VndbCollector: Collector = {
  name: "VNDB",
  getId: async (path) => extractVndbId(path),
  fetchInfo: async ({ id }) => {
    const vn = await queryVn(id);
    if (!vn) {
      log.warn(`VNDB에 없는 작품: v${id}`);
      return undefined;
    }
    return parseVndbVn(vn, id);
  },
  getUrl: (id) => `https://vndb.org/v${id}`,
};
