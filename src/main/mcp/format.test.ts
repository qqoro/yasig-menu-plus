import { describe, expect, it } from "vitest";
import type { GameDetailItem, GameItem } from "../events.js";
import { parseIsoDate, toGameDetailSummary, toGameSummary } from "./format.js";

const baseGame: GameItem = {
  path: "C:\\games\\a",
  title: "A",
  originalTitle: "a",
  source: "C:\\games",
  thumbnail: "C:\\thumbs\\a.jpg",
  executablePath: null,
  isCompressFile: false,
  hasExecutable: true,
  publishDate: new Date("2024-03-01T00:00:00.000Z"),
  isFavorite: true,
  isHidden: false,
  isClear: false,
  provider: "dlsite",
  externalId: "RJ123456",
  lastPlayedAt: null,
  rating: 4,
  totalPlayTime: 120,
  makers: ["circle"],
  categories: ["RPG"],
  tags: ["tag1"],
};

describe("toGameSummary", () => {
  it("AI용 필드만 추리고 날짜는 ISO 문자열, 썸네일은 boolean이어야 한다", () => {
    const summary = toGameSummary(baseGame);
    expect(summary).toEqual({
      path: "C:\\games\\a",
      title: "A",
      originalTitle: "a",
      translatedTitle: null,
      publishDate: "2024-03-01T00:00:00.000Z",
      provider: "dlsite",
      externalId: "RJ123456",
      makers: ["circle"],
      categories: ["RPG"],
      tags: ["tag1"],
      rating: 4,
      isFavorite: true,
      isHidden: false,
      isClear: false,
      totalPlayTime: 120,
      lastPlayedAt: null,
      hasExecutable: true,
      executablePath: null,
      thumbnail: true,
    });
  });

  it("없는 값은 null/0/false로 채워야 한다", () => {
    const summary = toGameSummary({
      ...baseGame,
      thumbnail: null,
      publishDate: null,
      rating: undefined,
      totalPlayTime: undefined,
      isFavorite: undefined,
    });
    expect(summary.thumbnail).toBe(false);
    expect(summary.publishDate).toBeNull();
    expect(summary.rating).toBeNull();
    expect(summary.totalPlayTime).toBe(0);
    expect(summary.isFavorite).toBe(false);
  });
});

describe("toGameDetailSummary", () => {
  it("상세 필드(memo 등)를 추가해야 한다", () => {
    const detail: GameDetailItem = {
      ...baseGame,
      memo: "note",
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: null,
      externalRating: 4.5,
      externalReviewCount: 10,
      downloadCount: 100,
    };
    const summary = toGameDetailSummary(detail);
    expect(summary.memo).toBe("note");
    expect(summary.source).toBe("C:\\games");
    expect(summary.isCompressFile).toBe(false);
    expect(summary.createdAt).toBe("2024-01-01T00:00:00.000Z");
    expect(summary.updatedAt).toBeNull();
    expect(summary.externalRating).toBe(4.5);
    expect(summary.externalReviewCount).toBe(10);
    expect(summary.downloadCount).toBe(100);
  });
});

describe("parseIsoDate", () => {
  it("YYYY-MM-DD를 Date로 바꿔야 한다", () => {
    expect(parseIsoDate("2024-03-01").toISOString()).toBe(
      "2024-03-01T00:00:00.000Z",
    );
  });

  it("날짜+시각 ISO 문자열을 받아야 한다", () => {
    expect(parseIsoDate("2024-03-01T12:30:00Z").toISOString()).toBe(
      "2024-03-01T12:30:00.000Z",
    );
  });

  it("슬래시 날짜는 거부해야 한다", () => {
    expect(() => parseIsoDate("2024/03/01")).toThrow(
      "발매일 형식이 올바르지 않습니다",
    );
  });

  it("형식은 맞지만 존재하지 않는 날짜는 거부해야 한다", () => {
    expect(() => parseIsoDate("2024-13-45")).toThrow(
      "발매일 형식이 올바르지 않습니다",
    );
  });

  it("날짜+시각 형식도 월/일 넘침은 거부해야 한다", () => {
    expect(() => parseIsoDate("2024-02-30T10:00:00Z")).toThrow(
      "발매일 형식이 올바르지 않습니다",
    );
  });
});
