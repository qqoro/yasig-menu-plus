import { describe, expect, it } from "vitest";
import type { GameItem } from "../events.js";
import {
  buildTsvRows,
  exportColumnLabels,
  formatPlayTime,
  rowsToTsv,
} from "./export-format.js";

/**
 * export-format 포맷터 테스트
 * 실행: pnpm test
 */

// 테스트용 GameItem 팩토리 (필수 필드만 채움)
function makeGame(overrides: Partial<GameItem> = {}): GameItem {
  return {
    path: "C:/games/sample",
    title: "Sample Game",
    originalTitle: "サンプル",
    source: "C:/library",
    thumbnail: null,
    executablePath: null,
    isCompressFile: false,
    hasExecutable: true,
    publishDate: new Date(2024, 0, 5),
    makers: ["서클A", "서클B"],
    categories: ["RPG"],
    tags: ["태그1", "태그2"],
    ...overrides,
  };
}

describe("formatPlayTime", () => {
  it.each([
    [undefined, ""],
    [0, "0분"],
    [45, "0분"],
    [34 * 60, "34분"],
    [12 * 3600, "12시간"],
    [12 * 3600 + 34 * 60, "12시간 34분"],
  ])("%i초 → %s", (seconds, expected) => {
    expect(formatPlayTime(seconds)).toBe(expected);
  });
});

describe("buildTsvRows", () => {
  it("선택한 컬럼 순서대로 포맷된 행을 반환한다", () => {
    const game = makeGame({
      rating: 4,
      isClear: true,
      totalPlayTime: 12 * 3600 + 34 * 60,
    });
    const rows = buildTsvRows(
      [game],
      ["title", "makers", "rating", "isClear", "totalPlayTime"],
    );
    expect(rows).toEqual([
      ["Sample Game", "서클A, 서클B", "4", "O", "12시간 34분"],
    ]);
  });

  it("null/undefined 값은 빈 칸이 된다", () => {
    const game = makeGame({ rating: null, translatedTitle: null });
    const rows = buildTsvRows(
      [game],
      ["rating", "translatedTitle", "externalId"],
    );
    expect(rows).toEqual([["", "", ""]]);
  });

  it("불린 undefined는 X로 표시한다", () => {
    const game = makeGame(); // isFavorite/isClear 등 undefined
    const rows = buildTsvRows([game], ["isFavorite", "isClear"]);
    expect(rows).toEqual([["X", "X"]]);
  });

  it("날짜는 YYYY-MM-DD로 표시한다", () => {
    const game = makeGame({ lastPlayedAt: new Date(2025, 11, 31) });
    const rows = buildTsvRows([game], ["publishDate", "lastPlayedAt"]);
    expect(rows).toEqual([["2024-01-05", "2025-12-31"]]);
  });

  it("셀 내 탭/줄바꿈은 공백으로 치환한다", () => {
    const game = makeGame({ title: "제목\t이다\n두줄", tags: ["a\r\nb"] });
    const rows = buildTsvRows([game], ["title", "tags"]);
    expect(rows).toEqual([["제목 이다 두줄", "a  b"]]);
  });

  it("여러 게임은 입력 순서를 유지한다", () => {
    const rows = buildTsvRows(
      [makeGame({ title: "A" }), makeGame({ title: "B" })],
      ["title"],
    );
    expect(rows).toEqual([["A"], ["B"]]);
  });
});

describe("externalId 프리픽스", () => {
  it("steam은 ST 프리픽스가 붙는다", () => {
    const game = makeGame({ provider: "steam", externalId: "3576350" });
    expect(buildTsvRows([game], ["externalId"])).toEqual([["ST3576350"]]);
  });

  it("getchu는 GC, cien은 CE 프리픽스가 붙는다", () => {
    const gc = makeGame({ provider: "getchu", externalId: "123456" });
    const ce = makeGame({ provider: "cien", externalId: "1234-567" });
    expect(buildTsvRows([gc, ce], ["externalId"])).toEqual([
      ["GC123456"],
      ["CE1234-567"],
    ]);
  });

  it("dlsite는 저장된 코드가 그대로 나간다 (RJ/BJ/VJ 계열 유지)", () => {
    const rj = makeGame({ provider: "dlsite", externalId: "RJ01207277" });
    const bj = makeGame({ provider: "dlsite", externalId: "BJ01234567" });
    expect(buildTsvRows([rj, bj], ["externalId"])).toEqual([
      ["RJ01207277"],
      ["BJ01234567"],
    ]);
  });

  it("프로바이더가 없거나 알 수 없으면 ID 그대로", () => {
    const none = makeGame({ provider: null, externalId: "12345" });
    const unknown = makeGame({ provider: "other", externalId: "67890" });
    expect(buildTsvRows([none, unknown], ["externalId"])).toEqual([
      ["12345"],
      ["67890"],
    ]);
  });
});

describe("exportColumnLabels", () => {
  it("id를 카탈로그 라벨로 변환한다", () => {
    expect(exportColumnLabels(["title", "path"])).toEqual(["제목", "경로"]);
  });

  it("알 수 없는 id는 id 그대로 반환한다", () => {
    expect(exportColumnLabels(["title", "unknown" as never])).toEqual([
      "제목",
      "unknown",
    ]);
  });
});

describe("rowsToTsv", () => {
  it("헤더 포함 시 첫 줄에 헤더가 온다", () => {
    const tsv = rowsToTsv(["제목", "별점"], [["A", "4"]], true);
    expect(tsv).toBe("제목\t별점\nA\t4\n");
  });

  it("헤더 제외 시 데이터 행만 나온다", () => {
    const tsv = rowsToTsv(["제목"], [["A"]], false);
    expect(tsv).toBe("A\n");
  });

  it("빈 데이터 + 헤더 제외는 빈 문자열이다", () => {
    expect(rowsToTsv(["제목"], [], false)).toBe("");
  });

  it("빈 데이터 + 헤더 포함은 헤더 줄만 나온다", () => {
    expect(rowsToTsv(["제목"], [], true)).toBe("제목\n");
  });
});
