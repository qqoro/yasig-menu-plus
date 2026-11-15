import { afterEach, describe, expect, it, vi } from "vitest";
import { ItchCollector, parseItchPage } from "./itch-collector.js";

vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const DATA_URL = "https://maker.itch.io/some-game/data.json";
const PAGE_URL = "https://maker.itch.io/some-game";

const ORIGINAL_1 = "https://img.example.com/a/original/1.png";
const ORIGINAL_2 = "https://img.example.com/b/original/2.png";
const SMALL_1 = "https://img.example.com/a/347x500/1.png";

/** data.json 응답 픽스처 (가상 값) */
function makeDataJson() {
  return {
    title: "테스트 게임",
    cover_image: "https://img.example.com/cover/315x250/c.png",
    screenshots: [SMALL_1],
    authors: [{ name: "테스트 제작자", url: "https://maker.itch.io" }],
    tags: ["puzzle", "short"],
    id: 1,
    price: "$0.00",
    links: { self: PAGE_URL },
  };
}

/** 작품 페이지 HTML 픽스처 (실제 itch.io 구조를 축약) */
const COVER_ORIGINAL = "https://img.example.com/cover/original/c.png";

const PAGE_HTML = `<!DOCTYPE html><html><head>
<meta property="og:image" content="${COVER_ORIGINAL}"/>
<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">{"@context":"http:\\/\\/schema.org\\/","@type":"Product","name":"테스트 게임","aggregateRating":{"ratingValue":"4.5","ratingCount":12,"@type":"AggregateRating"}}</script>
</head><body>
<div class="screenshot_list"><a href="${ORIGINAL_1}" data-image_lightbox="true"><img class="screenshot" src="${SMALL_1}"/></a><a href="${ORIGINAL_2}" data-image_lightbox="true"><img class="screenshot"/></a></div>
<div class="game_info_panel_widget base_widget"><table><tbody>
<tr><td>Status</td><td><a href="https://itch.io/games/released">Released</a></td></tr>
<tr><td>Genre</td><td><a href="https://itch.io/games/genre-puzzle">Puzzle</a>, <a href="https://itch.io/games/genre-adventure">Adventure</a></td></tr>
<tr><td>Tags</td><td><a href="https://itch.io/games/tag-short">Short</a></td></tr>
</tbody></table></div>
</body></html>`;

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function textResponse(text: string) {
  return { ok: true, status: 200, text: async () => text };
}

describe("parseItchPage", () => {
  it("ld+json의 평점과 리뷰 수를 숫자로 읽음", () => {
    const result = parseItchPage(PAGE_HTML);
    expect(result.rating).toBe(4.5);
    expect(result.reviewCount).toBe(12);
  });

  it("정보 표의 Genre 행을 카테고리로 읽음", () => {
    expect(parseItchPage(PAGE_HTML).categories).toEqual([
      "Puzzle",
      "Adventure",
    ]);
  });

  it("스크린샷 목록에서 원본 크기 링크를 읽음", () => {
    expect(parseItchPage(PAGE_HTML).images).toEqual([ORIGINAL_1, ORIGINAL_2]);
  });

  it("og:image를 원본 크기 커버로 읽음", () => {
    expect(parseItchPage(PAGE_HTML).cover).toBe(COVER_ORIGINAL);
  });

  it("빈 HTML이면 모두 비어 있음", () => {
    expect(parseItchPage("<html></html>")).toEqual({
      cover: null,
      rating: null,
      reviewCount: null,
      categories: [],
      images: [],
    });
  });
});

describe("ItchCollector.fetchInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("data.json과 작품 페이지를 합쳐 수집", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === DATA_URL) return jsonResponse(makeDataJson());
      if (url === PAGE_URL) return textResponse(PAGE_HTML);
      throw new Error(`예상치 못한 fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await ItchCollector.fetchInfo({
      path: "x",
      id: "maker.some-game",
    });

    expect(result).toEqual({
      title: "테스트 게임",
      thumbnailUrl: COVER_ORIGINAL,
      images: [ORIGINAL_1, ORIGINAL_2],
      publishDate: null,
      rating: 4.5,
      reviewCount: 12,
      downloadCount: null,
      makers: ["테스트 제작자"],
      categories: ["Puzzle", "Adventure"],
      tags: ["puzzle", "short"],
      externalId: "maker.some-game",
      provider: "itch",
    });
  });

  it("작품이 없으면(404) undefined", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 404 })),
    );

    await expect(
      ItchCollector.fetchInfo({ path: "x", id: "maker.some-game" }),
    ).resolves.toBeUndefined();
  });

  it("작품 페이지를 못 읽어도 data.json 정보로 수집", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === DATA_URL) return jsonResponse(makeDataJson());
        throw new Error("network down");
      }),
    );

    const result = await ItchCollector.fetchInfo({
      path: "x",
      id: "maker.some-game",
    });

    expect(result!.title).toBe("테스트 게임");
    expect(result!.thumbnailUrl).toBe(
      "https://img.example.com/cover/315x250/c.png",
    );
    expect(result!.rating).toBeNull();
    expect(result!.categories).toEqual([]);
    expect(result!.images).toEqual([SMALL_1]);
  });

  it("404가 아닌 오류 응답이면 실패", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500 })),
    );

    await expect(
      ItchCollector.fetchInfo({ path: "x", id: "maker.some-game" }),
    ).rejects.toThrow();
  });
});

describe("ItchCollector.getUrl", () => {
  it("제작자.슬러그를 상점 주소로 변환", () => {
    expect(ItchCollector.getUrl!("maker.some-game")).toBe(
      "https://maker.itch.io/some-game",
    );
  });
});
