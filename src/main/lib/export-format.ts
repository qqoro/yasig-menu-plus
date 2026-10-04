/**
 * 게임 목록 TSV 포맷터 (순수 함수)
 *
 * 메인(파일 저장)과 렌더러(미리보기)가 공유한다 — 한쪽만 고치면 미리보기와
 * 파일 내용이 어긋난다. GameItem은 type-only import로 런타임 의존이
 * 렌더러 번들에 끌려들어오지 않게 한다.
 */
import type { GameItem } from "../events.js";
import { findExportColumn, type ExportColumnId } from "./export-columns.js";

/** 초 단위 → "12시간 34분" (0인 부분은 생략) */
export function formatPlayTime(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || seconds < 0) return "";
  if (seconds === 0) return "0분";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

/** 셀 정제: TSV 구조를 깨는 문자 치환 */
function sanitizeCell(value: string): string {
  return value
    .replaceAll("\t", " ")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ");
}

/** 날짜 → YYYY-MM-DD (null/undefined → 빈 칸) */
function formatDate(date: Date | null | undefined): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function stringCell(v: string | null | undefined): string {
  return v ?? "";
}

function numCell(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

function boolCell(v: boolean | undefined): string {
  return v ? "O" : "X";
}

function arrayCell(v: string[] | undefined): string {
  return (v ?? []).join(", ");
}

function dateCell(v: Date | null | undefined): string {
  return formatDate(v);
}

/** 외부 ID 프리픽스 (폴더명 코드 규칙과 동일 — dlsite는 코드 자체에 RJ/BJ/VJ 포함) */
const PROVIDER_ID_PREFIX: Record<string, string> = {
  steam: "ST",
  getchu: "GC",
  cien: "CE",
};

/** 외부 ID → 공급자 프리픽스 부착 (dlsite/알 수 없는 공급자는 그대로) */
function externalIdCell(g: GameItem): string {
  const id = stringCell(g.externalId);
  if (!id) return "";
  const prefix = g.provider ? PROVIDER_ID_PREFIX[g.provider] : undefined;
  return prefix ? `${prefix}${id}` : id;
}

type CellFormatter = (g: GameItem) => string;

/** 컬럼별 셀 변환기 */
const COLUMN_FORMATTERS: Record<ExportColumnId, CellFormatter> = {
  title: (g) => stringCell(g.title),
  originalTitle: (g) => stringCell(g.originalTitle),
  translatedTitle: (g) => stringCell(g.translatedTitle),
  makers: (g) => arrayCell(g.makers),
  categories: (g) => arrayCell(g.categories),
  tags: (g) => arrayCell(g.tags),
  rating: (g) => numCell(g.rating),
  externalRating: (g) => numCell(g.externalRating),
  externalReviewCount: (g) => numCell(g.externalReviewCount),
  downloadCount: (g) => numCell(g.downloadCount),
  totalPlayTime: (g) => formatPlayTime(g.totalPlayTime),
  lastPlayedAt: (g) => dateCell(g.lastPlayedAt ?? null),
  isClear: (g) => boolCell(g.isClear),
  publishDate: (g) => dateCell(g.publishDate),
  createdAt: (g) => dateCell(g.createdAt ?? null),
  path: (g) => stringCell(g.path),
  source: (g) => stringCell(g.source),
  executablePath: (g) => stringCell(g.executablePath),
  isCompressFile: (g) => boolCell(g.isCompressFile),
  isHidden: (g) => boolCell(g.isHidden),
  isFavorite: (g) => boolCell(g.isFavorite),
  provider: (g) => stringCell(g.provider),
  externalId: (g) => externalIdCell(g),
};

/** 선택한 컬럼 id들의 한글 라벨 (같은 순서) */
export function exportColumnLabels(columns: ExportColumnId[]): string[] {
  return columns.map((id) => findExportColumn(id)?.label ?? id);
}

/** 게임 목록 → TSV 행 배열 (포맷·정제 완료된 셀) */
export function buildTsvRows(
  items: GameItem[],
  columns: ExportColumnId[],
): string[][] {
  return items.map((g) =>
    columns.map((id) => sanitizeCell(COLUMN_FORMATTERS[id](g))),
  );
}

/** 행 배열 → TSV 문자열 (마지막에 개행 포함) */
export function rowsToTsv(
  headerLabels: string[],
  rows: string[][],
  includeHeader: boolean,
): string {
  const lines = rows.map((r) => r.join("\t"));
  if (includeHeader) lines.unshift(headerLabels.join("\t"));
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
