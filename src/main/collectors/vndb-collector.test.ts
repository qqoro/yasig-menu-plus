import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractVndbId,
  parseVndbReleased,
  parseVndbVn,
  pickVndbTags,
  pickVndbTitle,
  type VndbVn,
} from "./vndb-collector.js";

vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("extractVndbId", () => {
  const testCases: [string, string | undefined, string][] = [
    // ===== 인식 =====
    ["v562", "562", "코드만"],
    ["v562 Game Title", "562", "코드 + 제목"],
    ["Game Title v562", "562", "제목 + 코드"],
    ["[v562] 게임 제목", "562", "대괄호"],
    ["(v562) 게임 제목", "562", "소괄호"],
    ["RJ123456_v562", "562", "언더스코어 뒤"],
    ["title-v562", "562", "하이픈 뒤"],
    ["V562 Title", "562", "대문자 V"],
    ["v11 Game Title", "11", "2자리 (최소)"],
    ["v123456 Title", "123456", "6자리 (최대)"],
    ["v562.zip", "562", "파일 확장자"],
    ["C:\\Games\\VN\\v562 Title", "562", "Windows 경로의 폴더명"],

    // ===== vn 접두사 (1자리부터) =====
    ["vn562 Title", "562", "vn + 3자리"],
    ["[VN4] Title", "4", "vn + 1자리"],
    ["Title_vn17", "17", "언더스코어 뒤 vn"],
    ["vn123456 Title", "123456", "vn + 6자리 (최대)"],
    ["Title vn1.5", undefined, "vn 버전 표기"],
    ["Title vn1234567", undefined, "vn + 7자리 이상"],
    ["VNDB Title", undefined, "vn 뒤에 숫자 없음"],
    ["Devn12 Title", undefined, "단어 안의 vn"],

    // ===== 버전 표기 제외 =====
    ["Title v1", undefined, "1자리"],
    ["Title v1.02", undefined, "v1.02"],
    ["Title v10.5", undefined, "v10.5"],
    ["Title v2.0.1", undefined, "v2.0.1"],
    ["Title ver12", undefined, "ver 뒤"],
    ["Title Rev12", undefined, "단어 안의 v"],
    ["KV12 Title", undefined, "영문 뒤"],
    ["2v12 Title", undefined, "숫자 뒤"],
    ["Title v1234567", undefined, "7자리 이상"],

    // ===== 상위 폴더는 보지 않음 =====
    ["C:\\Games\\v12\\Some Game", undefined, "상위 폴더의 코드"],
    ["D:/vn/v562/Title", undefined, "슬래시 경로의 상위 폴더"],

    // ===== 미매칭 =====
    ["Game Title", undefined, "코드 없음"],
    ["VJ012345 Title", undefined, "DLSite VJ 코드"],
    ["", undefined, "빈 문자열"],
  ];

  it.each(testCases)("%s → %s (%s)", (input, expected) => {
    expect(extractVndbId(input)).toBe(expected);
  });
});

describe("pickVndbTitle", () => {
  const titles = [
    { lang: "en", title: "English Title" },
    { lang: "ja", title: "日本語タイトル" },
    { lang: "ko", title: "한국어 제목" },
  ];

  it("한국어 제목을 가장 먼저 고른다", () => {
    expect(pickVndbTitle({ title: "Romanized Title", titles })).toBe(
      "한국어 제목",
    );
  });

  it("한국어가 없으면 일본어", () => {
    expect(
      pickVndbTitle({
        title: "Romanized Title",
        titles: titles.filter((t) => t.lang !== "ko"),
      }),
    ).toBe("日本語タイトル");
  });

  it("한국어·일본어가 없으면 영어", () => {
    expect(
      pickVndbTitle({
        title: "Romanized Title",
        titles: [{ lang: "en", title: "English Title" }],
      }),
    ).toBe("English Title");
  });

  it("셋 다 없으면 대표 제목", () => {
    expect(
      pickVndbTitle({
        title: "Romanized Title",
        titles: [{ lang: "zh-Hans", title: "中文标题" }],
      }),
    ).toBe("Romanized Title");
  });
});

describe("pickVndbTags", () => {
  it("스포일러·거짓·낮은 점수 태그를 빼고 점수 높은 순으로", () => {
    expect(
      pickVndbTags([
        { name: "Low", rating: 0.8, spoiler: 0, lie: false },
        { name: "Mid", rating: 2, spoiler: 0, lie: false },
        { name: "Spoiler", rating: 3, spoiler: 1, lie: false },
        { name: "Lie", rating: 3, spoiler: 0, lie: true },
        { name: "Top", rating: 3, spoiler: 0, lie: false },
      ]),
    ).toEqual(["Top", "Mid"]);
  });

  it("최대 20개", () => {
    const tags = Array.from({ length: 30 }, (_, i) => ({
      name: `tag${i}`,
      rating: 2,
      spoiler: 0,
      lie: false,
    }));
    expect(pickVndbTags(tags)).toHaveLength(20);
  });

  it("태그가 없으면 빈 배열", () => {
    expect(pickVndbTags(undefined)).toEqual([]);
  });
});

describe("parseVndbReleased", () => {
  it("전체 날짜만 인정", () => {
    expect(parseVndbReleased("2015-10-23")?.getFullYear()).toBe(2015);
    expect(parseVndbReleased("2015-10-23")?.getDate()).toBe(23);
  });

  it.each(["2015", "2015-10", "TBA", null])("%s → null", (input) => {
    expect(parseVndbReleased(input)).toBeNull();
  });
});

const SAMPLE_VN: VndbVn = {
  id: "v562",
  title: "Romanized Title",
  alttitle: "日本語タイトル",
  titles: [
    { lang: "ja", title: "日本語タイトル" },
    { lang: "ko", title: "한국어 제목" },
  ],
  released: "2015-10-23",
  rating: 87.5,
  votecount: 4321,
  developers: [
    { name: "Sample Studio", original: "サンプル工房" },
    { name: "Romanized Only", original: null },
  ],
  tags: [{ name: "Sample Tag", rating: 3, spoiler: 0, lie: false }],
  image: { url: "https://example.com/cover.jpg" },
  screenshots: [
    { url: "https://example.com/shot1.jpg" },
    { url: "https://example.com/shot2.jpg" },
  ],
};

describe("parseVndbVn", () => {
  it("VNDB 응답을 수집 결과로 변환", () => {
    expect(parseVndbVn(SAMPLE_VN, "562")).toEqual({
      title: "한국어 제목",
      thumbnailUrl: "https://example.com/cover.jpg",
      images: [
        "https://example.com/shot1.jpg",
        "https://example.com/shot2.jpg",
      ],
      publishDate: new Date("2015-10-23T00:00:00"),
      rating: 4.38,
      reviewCount: 4321,
      downloadCount: null,
      makers: ["サンプル工房", "Romanized Only"],
      categories: ["어드벤쳐"],
      tags: ["Sample Tag"],
      externalId: "562",
      provider: "vndb",
    });
  });

  it("커버·평점·투표가 없으면 null", () => {
    const result = parseVndbVn(
      { ...SAMPLE_VN, image: null, rating: null, votecount: 0 },
      "562",
    );
    expect(result.thumbnailUrl).toBeNull();
    expect(result.rating).toBeNull();
    expect(result.reviewCount).toBeNull();
  });
});

describe("VndbCollector", () => {
  const fetchMock = vi.fn();
  let VndbCollector: typeof import("./vndb-collector.js").VndbCollector;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", fetchMock);
    // 요청 간격 상태(모듈 변수)가 테스트끼리 섞이지 않도록 매번 새로 로드
    vi.resetModules();
    ({ VndbCollector } = await import("./vndb-collector.js"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  const jsonResponse = (body: unknown, status = 200, headers = {}) =>
    new Response(JSON.stringify(body), { status, headers });

  it("getUrl", () => {
    expect(VndbCollector.getUrl?.("562")).toBe("https://vndb.org/v562");
  });

  it("v+ID로 조회해 결과를 변환", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [SAMPLE_VN] }));

    const promise = VndbCollector.fetchInfo({ path: "v562", id: "562" });
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result?.title).toBe("한국어 제목");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.filters).toEqual(["id", "=", "v562"]);
  });

  it("없는 작품이면 undefined", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [] }));

    const promise = VndbCollector.fetchInfo({ path: "v99999", id: "99999" });
    await vi.runAllTimersAsync();

    expect(await promise).toBeUndefined();
  });

  it("요청 한도 초과(429)면 Retry-After만큼 기다렸다 재시도", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, 429, { "Retry-After": "3" }))
      .mockResolvedValueOnce(jsonResponse({ results: [SAMPLE_VN] }));

    const promise = VndbCollector.fetchInfo({ path: "v562", id: "562" });
    await vi.runAllTimersAsync();

    expect((await promise)?.externalId).toBe("562");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("재시도해도 계속 429면 에러", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({}, 429));

    const promise = VndbCollector.fetchInfo({ path: "v562", id: "562" });
    const assertion = expect(promise).rejects.toThrow("429");
    await vi.runAllTimersAsync();
    await assertion;
    // 최초 1회 + 재시도 3회
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("연달아 조회하면 요청 사이에 간격을 둔다", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ results: [SAMPLE_VN] }),
    );

    const first = VndbCollector.fetchInfo({ path: "v562", id: "562" });
    const second = VndbCollector.fetchInfo({ path: "v562", id: "562" });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1_500);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await Promise.all([first, second]);
  });
});
