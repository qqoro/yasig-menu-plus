import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetSteamTagMapCache,
  getSteamTagMap,
  parsePopularTags,
} from "./steam-tag-map.js";

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

describe("parsePopularTags", () => {
  it("tagid→name 맵으로 변환", () => {
    const map = parsePopularTags([
      { tagid: 492, name: "인디" },
      { tagid: 19, name: "액션" },
    ]);
    expect(map.get(492)).toBe("인디");
    expect(map.get(19)).toBe("액션");
    expect(map.size).toBe(2);
  });

  it("배열이 아니면 빈 맵", () => {
    expect(parsePopularTags(null).size).toBe(0);
    expect(parsePopularTags({}).size).toBe(0);
  });

  it("형식이 잘못된 항목은 무시", () => {
    const map = parsePopularTags([
      { tagid: 1, name: "정상" },
      { tagid: "x", name: "잘못" },
      { name: "id없음" },
    ]);
    expect(map.size).toBe(1);
    expect(map.get(1)).toBe("정상");
  });
});

describe("getSteamTagMap", () => {
  afterEach(() => {
    __resetSteamTagMapCache();
    vi.unstubAllGlobals();
  });

  it("fetch 결과를 파싱해 캐시한다", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => [{ tagid: 19, name: "액션" }],
    });
    vi.stubGlobal("fetch", fetchMock);

    const map1 = await getSteamTagMap();
    const map2 = await getSteamTagMap();

    expect(map1.get(19)).toBe("액션");
    expect(map2).toBe(map1); // 동일 인스턴스(캐시)
    expect(fetchMock).toHaveBeenCalledTimes(1); // 1회만 호출
  });

  it("fetch 실패 시 빈 맵 반환", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("네트워크")));
    const map = await getSteamTagMap();
    expect(map.size).toBe(0);
  });
});
