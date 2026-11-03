/**
 * 외부 작품 ID 추출 (DLsite / Steam / Getchu / Ci-en / VNDB)
 *
 * 컬렉터 매칭, 스캔의 비게임 콘텐츠 판별, 목록 대조가 같은 규칙을 쓰도록 한곳에 모은 순수 모듈.
 * Worker Thread에서도 import하므로 fs/DB/Electron 의존성을 두지 않는다.
 *
 * 공통 규칙 (VNDB 제외):
 * - 접두어 앞에 영문/숫자가 붙으면 제외 (Latest12345, Test2024)
 * - 접두어와 숫자 사이에는 구분자 -_[]() 만 허용 (ST-12345, [RJ]01234567)
 * - 숫자 뒤에 영문/숫자가 붙으면 제외 (자릿수 초과 코드를 잘라서 인식하지 않음, GC12ABCD)
 * - 상점 URL은 폴더명에 나올 수 없으므로(/ 포함) 같은 함수에서 함께 인식해도 폴더 판별에 영향 없음
 */

export type ExternalIdProvider =
  "dlsite" | "steam" | "getchu" | "cien" | "vndb";

export interface ExternalIdMatch {
  provider: ExternalIdProvider;
  id: string;
}

/** 접두어와 숫자 사이 허용 구분자 */
const SEP = String.raw`[-_\[\]()]*`;
/** 접두어 앞 경계 (영문/숫자가 붙어 있으면 제외) */
const LEAD = String.raw`(?<![a-z0-9])`;
/** 숫자 뒤 경계 (영문/숫자가 이어지면 제외) */
const TRAIL = String.raw`(?![a-z0-9])`;

const DLSITE_CODE = new RegExp(
  String.raw`${LEAD}([RBV]J)${SEP}(\d{6,8})${TRAIL}`,
  "i",
);

const STEAM_CODE = new RegExp(
  String.raw`${LEAD}(?:ST|steam)${SEP}(\d{4,8})${TRAIL}`,
  "i",
);
const STEAM_URL = /store\.steampowered\.com\/app\/(\d+)/i;

const GETCHU_CODE = new RegExp(
  String.raw`${LEAD}(?:GC|GETCHU)${SEP}(\d{1,7})${TRAIL}`,
  "i",
);
const GETCHU_URL = /getchu\.com\/(?:soft\.phtml\?id=|item\/)(\d+)/i;

const CIEN_CODE = new RegExp(
  String.raw`${LEAD}(?:CE|CIEN|CI-EN)${SEP}(\d+-\d+|(?:creator)?\d+article\d+)${TRAIL}`,
  "i",
);
const CIEN_URL = /ci-en\.(?:net|dlsite\.com)\/creator\/(\d+)\/article\/(\d+)/i;

/**
 * VNDB 코드 (v562, vn562)
 * - 앞에 영문/숫자가 붙으면 제외 (Rev12, ver12)
 * - 뒤에 소수점+숫자가 오면 버전 표기로 보고 제외 (v1.02, v10.5)
 * - v는 1자리면 버전(v1)과 구별되지 않아 2자리부터, vn은 버전 표기와 겹치지 않아 1자리부터
 * - v 한 글자 코드라 구분자는 허용하지 않음
 */
const VNDB_CODE = /(?<![a-z0-9])v(?:n(\d{1,6})|(\d{2,6}))(?!\d|\.\d)/i;
const VNDB_URL = /vndb\.org\/v(\d+)/i;

/** 경로의 마지막 구간 (OS와 무관하게 / \ 모두 구분자로 취급) */
function lastSegment(text: string): string {
  return text.split(/[\\/]/).pop() ?? "";
}

/** DLsite 코드 (RJ01234567) — 구분자는 빼고 접두어+숫자로 반환, 대소문자는 원문 유지 */
export function extractDlsiteId(text: string): string | undefined {
  const match = DLSITE_CODE.exec(text);
  return match ? `${match[1]}${match[2]}` : undefined;
}

/** Steam 앱 ID (ST1145360, steam_1145360, 상점 URL) */
export function extractSteamId(text: string): string | undefined {
  return STEAM_URL.exec(text)?.[1] ?? STEAM_CODE.exec(text)?.[1];
}

/** Getchu 상품 ID (GC1234567, 상점 URL) */
export function extractGetchuId(text: string): string | undefined {
  return GETCHU_URL.exec(text)?.[1] ?? GETCHU_CODE.exec(text)?.[1];
}

/** Ci-en 크리에이터-글 ID ("123-456" 형태로 반환) */
export function extractCienId(text: string): string | undefined {
  const url = CIEN_URL.exec(text);
  if (url) return `${url[1]}-${url[2]}`;

  return (
    CIEN_CODE.exec(text)?.[1]
      // 정규식이 대소문자를 무시하므로 치환도 대소문자 무시 (CIENCREATOR1ARTICLE2 대응)
      ?.replace(/creator/i, "")
      .replace(/article/i, "-")
  );
}

/**
 * VNDB 숫자 ID
 * 상점 URL이 아니면 마지막 경로 구간(게임 폴더명)에서만 찾음 — v 한 글자 코드라 상위 폴더까지 보면 오인식이 잦음
 */
export function extractVndbId(text: string): string | undefined {
  const url = VNDB_URL.exec(text);
  if (url) return url[1];

  const match = VNDB_CODE.exec(lastSegment(text));
  return match?.[1] ?? match?.[2];
}

/** 제공자별 추출기 (배열 순서 = 우선순위, VNDB는 버전 표기와 겹칠 수 있어 맨 뒤) */
export const EXTERNAL_ID_EXTRACTORS: ReadonlyArray<{
  provider: ExternalIdProvider;
  extract: (text: string) => string | undefined;
}> = [
  { provider: "dlsite", extract: extractDlsiteId },
  { provider: "steam", extract: extractSteamId },
  { provider: "getchu", extract: extractGetchuId },
  { provider: "cien", extract: extractCienId },
  { provider: "vndb", extract: extractVndbId },
];

/** 텍스트(폴더명, 목록 한 줄 등)에서 우선순위가 가장 높은 외부 ID */
export function extractExternalId(text: string): ExternalIdMatch | undefined {
  for (const { provider, extract } of EXTERNAL_ID_EXTRACTORS) {
    const id = extract(text);
    if (id) return { provider, id };
  }
  return undefined;
}

/** 폴더명에 인식 가능한 외부 ID가 있는지 (비게임 콘텐츠 판별용) */
export function hasExternalId(name: string): boolean {
  return extractExternalId(name) !== undefined;
}

/**
 * 게임 경로에서 외부 ID 추출 (컬렉터 매칭용)
 * - 게임 폴더부터 상위로 올라가며 찾음: RJ코드 폴더 안에 풀린 게임 폴더도 부모 코드로 수집되고,
 *   코드가 여러 단계에 있으면 게임에 가까운 쪽을 우선
 * - 같은 폴더 안에서는 제공자 우선순위를 따름
 * - VNDB는 모든 단계에서 다른 코드를 못 찾았을 때만, 게임 폴더명에서만 찾음
 */
export function extractExternalIdFromPath(
  path: string,
): ExternalIdMatch | undefined {
  const segments = path.split(/[\\/]/).filter(Boolean).reverse();

  for (const segment of segments) {
    for (const { provider, extract } of EXTERNAL_ID_EXTRACTORS) {
      if (provider === "vndb") continue;
      const id = extract(segment);
      if (id) return { provider, id };
    }
  }

  const vndbId = extractVndbId(path);
  return vndbId ? { provider: "vndb", id: vndbId } : undefined;
}
