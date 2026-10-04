import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  EXPORT_COLUMN_GROUP_LABELS,
} from "./export-columns.js";

/**
 * export-columns 카탈로그 테스트
 * 실행: pnpm test -- src/main/lib/export-columns.test.ts
 */
describe("EXPORT_COLUMNS 카탈로그", () => {
  it("23개 컬럼을 포함한다", () => {
    expect(EXPORT_COLUMNS).toHaveLength(23);
  });

  it("id에 중복이 없다", () => {
    const ids = EXPORT_COLUMNS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("모든 컬럼의 group 라벨이 정의되어 있다", () => {
    for (const c of EXPORT_COLUMNS) {
      expect(EXPORT_COLUMN_GROUP_LABELS[c.group]).toBeTruthy();
    }
  });

  it("label에 탭/줄바꿈이 포함되지 않는다 (TSV 헤더 안전)", () => {
    for (const c of EXPORT_COLUMNS) {
      expect(c.label).not.toMatch(/[\t\r\n]/);
    }
  });

  it("기본 선택은 8개다: title, originalTitle, makers, tags, rating, totalPlayTime, publishDate, path", () => {
    expect([...DEFAULT_EXPORT_COLUMNS].sort()).toEqual(
      [
        "title",
        "originalTitle",
        "makers",
        "tags",
        "rating",
        "totalPlayTime",
        "publishDate",
        "path",
      ].sort(),
    );
  });
});
