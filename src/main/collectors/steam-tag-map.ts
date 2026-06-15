import { createLogger } from "../utils/logger.js";

const log = createLogger("SteamTagMap");

const POPULAR_TAGS_URL =
  "https://store.steampowered.com/tagdata/populartags/koreana";

let cachedTagMap: Map<number, string> | null = null;

/** populartags JSON 배열을 tagid→name 맵으로 변환 */
export function parsePopularTags(json: unknown): Map<number, string> {
  const map = new Map<number, string>();
  if (!Array.isArray(json)) return map;
  for (const entry of json) {
    const id = Number((entry as Record<string, unknown>)?.tagid);
    const name = (entry as Record<string, unknown>)?.name;
    if (Number.isFinite(id) && typeof name === "string" && name) {
      map.set(id, name);
    }
  }
  return map;
}

/**
 * Steam 전역 인기 태그(약 432개) ID→이름 맵을 반환한다.
 * 세션당 1회만 fetch하고 메모리에 캐시한다. 실패 시 빈 맵.
 */
export async function getSteamTagMap(): Promise<Map<number, string>> {
  if (cachedTagMap) return cachedTagMap;
  try {
    const res = await fetch(POPULAR_TAGS_URL);
    const json = await res.json();
    cachedTagMap = parsePopularTags(json);
  } catch (error) {
    log.error("Steam 태그 맵 로드 실패:", error);
    cachedTagMap = new Map();
  }
  return cachedTagMap;
}

/** 테스트용 캐시 초기화 */
export function __resetSteamTagMapCache(): void {
  cachedTagMap = null;
}
