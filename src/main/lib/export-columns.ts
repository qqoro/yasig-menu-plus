/**
 * 게임 목록 내보내기 컬럼 카탈로그
 *
 * 메인(TSV 파일 생성)과 렌더러(열 선택 다이얼로그)가 공유하는 순수 데이터 모듈.
 * Electron/DB 런타임 의존을 절대 추가하지 말 것 (렌더러 번들에 포함됨).
 */

export type ExportColumnId =
  | "title"
  | "originalTitle"
  | "translatedTitle"
  | "makers"
  | "categories"
  | "tags"
  | "rating"
  | "externalRating"
  | "externalReviewCount"
  | "downloadCount"
  | "totalPlayTime"
  | "lastPlayedAt"
  | "isClear"
  | "publishDate"
  | "createdAt"
  | "path"
  | "source"
  | "executablePath"
  | "isCompressFile"
  | "isHidden"
  | "isFavorite"
  | "provider"
  | "externalId";

export type ExportColumnGroup = "basic" | "rating" | "play" | "date" | "file";

export interface ExportColumnDef {
  id: ExportColumnId;
  /** TSV 헤더 셀 및 다이얼로그에 표시되는 한글 라벨 */
  label: string;
  group: ExportColumnGroup;
  defaultSelected: boolean;
}

/** 그룹 표시 순서 및 한글 이름 (다이얼로그 그룹핑용) */
export const EXPORT_COLUMN_GROUP_LABELS: Record<ExportColumnGroup, string> = {
  basic: "기본 정보",
  rating: "평가",
  play: "플레이",
  date: "날짜",
  file: "파일 정보",
};

/** 카탈로그 순서 = 다이얼로그 표시 순서 = TSV 열 순서의 기준 */
export const EXPORT_COLUMNS: ExportColumnDef[] = [
  // 기본 정보
  { id: "title", label: "제목", group: "basic", defaultSelected: true },
  { id: "originalTitle", label: "원제", group: "basic", defaultSelected: true },
  {
    id: "translatedTitle",
    label: "번역제목",
    group: "basic",
    defaultSelected: false,
  },
  { id: "makers", label: "제작사", group: "basic", defaultSelected: true },
  {
    id: "categories",
    label: "카테고리",
    group: "basic",
    defaultSelected: false,
  },
  { id: "tags", label: "태그", group: "basic", defaultSelected: true },
  // 평가
  { id: "rating", label: "별점", group: "rating", defaultSelected: true },
  {
    id: "externalRating",
    label: "외부 평점",
    group: "rating",
    defaultSelected: false,
  },
  {
    id: "externalReviewCount",
    label: "리뷰 수",
    group: "rating",
    defaultSelected: false,
  },
  {
    id: "downloadCount",
    label: "판매 수",
    group: "rating",
    defaultSelected: false,
  },
  // 플레이
  {
    id: "totalPlayTime",
    label: "총 플레이 시간",
    group: "play",
    defaultSelected: true,
  },
  {
    id: "lastPlayedAt",
    label: "최근 플레이",
    group: "play",
    defaultSelected: false,
  },
  {
    id: "isClear",
    label: "클리어 여부",
    group: "play",
    defaultSelected: false,
  },
  // 날짜
  { id: "publishDate", label: "발매일", group: "date", defaultSelected: true },
  { id: "createdAt", label: "등록일", group: "date", defaultSelected: false },
  // 파일 정보
  { id: "path", label: "경로", group: "file", defaultSelected: true },
  {
    id: "source",
    label: "라이브러리 경로",
    group: "file",
    defaultSelected: false,
  },
  {
    id: "executablePath",
    label: "실행 파일",
    group: "file",
    defaultSelected: false,
  },
  {
    id: "isCompressFile",
    label: "압축 여부",
    group: "file",
    defaultSelected: false,
  },
  { id: "isHidden", label: "숨김 여부", group: "file", defaultSelected: false },
  {
    id: "isFavorite",
    label: "즐겨찾기",
    group: "file",
    defaultSelected: false,
  },
  { id: "provider", label: "정보 출처", group: "file", defaultSelected: false },
  { id: "externalId", label: "외부 ID", group: "file", defaultSelected: false },
];

/** 기본 선택 컬럼 (다이얼로그 "기본값" 버튼용) */
export const DEFAULT_EXPORT_COLUMNS: ExportColumnId[] = EXPORT_COLUMNS.filter(
  (c) => c.defaultSelected,
).map((c) => c.id);

/** id → 정의 조회 (없는 id는 undefined) */
export function findExportColumn(id: string): ExportColumnDef | undefined {
  return EXPORT_COLUMNS.find((c) => c.id === id);
}
