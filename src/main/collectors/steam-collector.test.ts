import { describe, expect, it, vi } from "vitest";
import {
  computeSteamRating,
  parseSteamReviewCount,
  resolveStoreTags,
} from "./steam-collector.js";

// logger 모킹 (Electron app 의존성 제거)
const mockLog = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("../utils/logger.js", () => ({
  createLogger: () => mockLog,
  logger: mockLog,
}));

describe("computeSteamRating", () => {
  it("긍정 비율을 0-5로 환산(2자리 반올림)", () => {
    expect(
      computeSteamRating({ total_positive: 267256, total_reviews: 273809 }),
    ).toBe(4.88);
  });

  it("리뷰가 0개면 null", () => {
    expect(
      computeSteamRating({ total_positive: 0, total_reviews: 0 }),
    ).toBeNull();
  });

  it("undefined/null이면 null", () => {
    expect(computeSteamRating(undefined)).toBeNull();
    expect(computeSteamRating(null)).toBeNull();
  });
});

describe("parseSteamReviewCount", () => {
  it("total_reviews를 반환", () => {
    expect(parseSteamReviewCount({ total_reviews: 273809 })).toBe(273809);
  });

  it("리뷰가 0개면 null", () => {
    expect(parseSteamReviewCount({ total_reviews: 0 })).toBeNull();
  });

  it("undefined/null이면 null", () => {
    expect(parseSteamReviewCount(undefined)).toBeNull();
    expect(parseSteamReviewCount(null)).toBeNull();
  });
});

describe("resolveStoreTags", () => {
  const map = new Map<number, string>([
    [19, "액션"],
    [492, "인디"],
    [21, "어드벤처"],
  ]);

  it("ID 객체를 이름 배열로 변환(인기순 유지)", () => {
    const tags = resolveStoreTags({ "0": 492, "1": 19 }, map);
    expect(tags).toEqual(["인디", "액션"]);
  });

  it("ID 배열도 처리", () => {
    expect(resolveStoreTags([19, 21], map)).toEqual(["액션", "어드벤처"]);
  });

  it("맵에 없는 ID는 스킵", () => {
    expect(resolveStoreTags([19, 99999], map)).toEqual(["액션"]);
  });

  it("limit으로 개수 제한", () => {
    expect(resolveStoreTags([492, 19, 21], map, 2)).toEqual(["인디", "액션"]);
  });

  it("빈/잘못된 입력이면 빈 배열", () => {
    expect(resolveStoreTags(null, map)).toEqual([]);
    expect(resolveStoreTags(undefined, map)).toEqual([]);
  });
});
