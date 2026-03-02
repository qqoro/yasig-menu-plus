/**
 * 검색 prefix 매핑 상수 및 유틸리티
 * 한글/영문 prefix를 모두 지원하며, 백엔드 파싱 시 영문으로 정규화
 */

// 영문 prefix 목록
export const ENGLISH_PREFIXES = [
  "tag",
  "circle",
  "category",
  "provider",
  "id",
] as const;
export type EnglishPrefix = (typeof ENGLISH_PREFIXES)[number];

// 한글 prefix 목록
export const KOREAN_PREFIXES = [
  "태그",
  "서클",
  "카테고리",
  "제공자",
  "아이디",
] as const;
export type KoreanPrefix = (typeof KOREAN_PREFIXES)[number];

// 한글 → 영문 매핑
export const KOREAN_TO_ENGLISH: Record<KoreanPrefix, EnglishPrefix> = {
  태그: "tag",
  서클: "circle",
  카테고리: "category",
  제공자: "provider",
  아이디: "id",
};

// 영문 → 한글 매핑
export const ENGLISH_TO_KOREAN: Record<EnglishPrefix, KoreanPrefix> = {
  tag: "태그",
  circle: "서클",
  category: "카테고리",
  provider: "제공자",
  id: "아이디",
};

// 모든 유효한 prefix (한글 + 영문)
export const ALL_VALID_PREFIXES: readonly string[] = [
  ...ENGLISH_PREFIXES,
  ...KOREAN_PREFIXES,
];

/**
 * 입력된 prefix를 영문으로 정규화 (백엔드 파싱용)
 * @param prefix 입력된 prefix (한글 또는 영문)
 * @returns 영문 prefix 또는 null (유효하지 않은 경우)
 */
export function normalizeToEnglish(prefix: string): EnglishPrefix | null {
  if (ENGLISH_PREFIXES.includes(prefix as EnglishPrefix)) {
    return prefix as EnglishPrefix;
  }
  return KOREAN_TO_ENGLISH[prefix as KoreanPrefix] ?? null;
}

/**
 * 한글 prefix 부분 매칭용 (자동완성) - 자소 분리 포함
 * 초성 + 완성글자 + 자소분리 조합 모두 지원
 */
export const KOREAN_PREFIX_PARTIALS: Record<KoreanPrefix, string[]> = {
  태그: ["ㅌ", "태", "택", "태ㄱ", "태그"],
  서클: ["ㅅ", "서", "섵", "서ㅋ", "서클"],
  카테고리: [
    "ㅋ",
    "카",
    "캌",
    "카ㅌ",
    "카테",
    "카텨",
    "카테ㄱ",
    "카테고",
    "카테고ㄹ",
    "카테고리",
  ],
  제공자: ["ㅈ", "제", "젝", "제ㄱ", "제공", "제곰", "제공ㅈ", "제공자"],
  아이디: ["ㅇ", "아", "앚", "아ㅇ", "아이", "아잌", "아이ㄷ", "아이디"],
};
