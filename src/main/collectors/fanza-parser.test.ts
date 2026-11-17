import { describe, expect, it } from "vitest";
import { parseFanzaDoujinPage, parseFanzaPcPage } from "./fanza-parser.js";

function product(data: Record<string, unknown>) {
  return `<script type="application/ld+json">broken</script>
<script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    name: "테스트 게임",
    ...data,
  })}</script>`;
}

const DOUJIN = `${product({
  sku: "d_216826",
  image: "//example.com/cover.jpg",
  brand: { name: "테스트 서클" },
  aggregateRating: {
    ratingValue: "4.45",
    ratingCount: "22",
    reviewCount: "10",
  },
})}
<h1 class="productTitle__txt"><span class="productTitle__txt--campaign">【30%OFF】</span>테스트 게임</h1>
<dl class="informationList"><dt class="informationList__ttl">配信開始日</dt><dd class="informationList__txt">2021/12/25 00:00</dd></dl>
<dl class="informationList"><dt class="informationList__ttl">ゲームジャンル</dt><dd class="informationList__txt">RPG</dd></dl>
<dl class="informationList"><dt class="informationList__ttl">ジャンル</dt><dd><a class="genreTag__txt" href="/list/=/article=keyword/id=13/">音声付き</a><a class="genreTag__txt" href="/campaign/">30%OFF</a></dd></dl>
<div class="numberOfSales"><span class="numberOfSales__ttl">トータル販売数</span><span class="numberOfSales__txt">6,058</span></div>
<li class="productPreview__item"><a href="https://example.com/sample.jpg"><img src="thumb.jpg"></a></li>
<li class="productPreview__item"><a href="https://example.com/sample.jpg"></a></li>`;

function pcRow(label: string, value: string, top = false) {
  const cls = top ? "contentsDetailTop" : "contentsDetailBottom";
  return `<div class="${cls}__tableRow"><div class="${cls}__tableDataLeft"><p>${label}</p></div><div class="${cls}__tableDataRight">${value}</div></div>`;
}

const PC = `${product({
  image: "https://example.com/cover.jpg",
  aggregateRating: { ratingValue: 4.9, ratingCount: 10, reviewCount: 7 },
})}<h1 class="productTitle__item--headline">테스트 게임</h1>
${pcRow("ブランド", "<a>테스트 브랜드</a>", true)}
${pcRow("ダウンロード版配信開始日", "2026/10/30 00:00")}
${pcRow("ブラウザ版配信開始日", "2026/11/01 00:00")}
${pcRow("ゲームジャンル", "ADV")}
${pcRow("ジャンル", '<a href="/list/?keyword=1">音声付き</a><a href="/list/?campaign=2">캠페인</a>')}
<img data-src="https://pics.dmm.co.jp/digital/pcgame/cape_0038/cape_0038js-001.jpg">
<img src="https://pics.dmm.co.jp/digital/pcgame/cape_0038/cape_0038jp-001.jpg">
<img src="https://pics.dmm.co.jp/digital/pcgame/other_0001/other_0001jp-001.jpg">`;

describe("FANZA 파서", () => {
  it("동인의 평가 수와 판매 수를 구분해 수집", () => {
    const result = parseFanzaDoujinPage(DOUJIN, "d_216826");
    expect(result).toMatchObject({
      title: "테스트 게임",
      thumbnailUrl: "https://example.com/cover.jpg",
      images: ["https://example.com/sample.jpg"],
      makers: ["테스트 서클"],
      categories: ["RPG"],
      tags: ["音声付き"],
      rating: 4.45,
      reviewCount: 22,
      downloadCount: 6058,
      provider: "fanza",
      externalId: "d_216826",
    });
    expect(result?.publishDate).toEqual(new Date(2021, 11, 25));
  });

  it("PC 게임은 평가 수와 해당 상품 원본 이미지를 읽고 판매 수는 비움", () => {
    const result = parseFanzaPcPage(PC, "cape_0038");
    expect(result).toMatchObject({
      title: "테스트 게임",
      makers: ["테스트 브랜드"],
      categories: ["ADV"],
      tags: ["音声付き"],
      rating: 4.9,
      reviewCount: 10,
      downloadCount: null,
      provider: "fanza",
      externalId: "cape_0038",
      images: [
        "https://pics.dmm.co.jp/digital/pcgame/cape_0038/cape_0038jp-001.jpg",
      ],
    });
    expect(result?.publishDate).toEqual(new Date(2026, 9, 30));
  });

  it("선택 정보가 없어도 유효한 상품은 수집", () => {
    const html = `${product({})}<h1 class="productTitle__item--headline">테스트 게임</h1>`;
    expect(parseFanzaPcPage(html, "test_1")).toMatchObject({
      rating: null,
      reviewCount: null,
      downloadCount: null,
      publishDate: null,
      thumbnailUrl: null,
      images: [],
      makers: [],
      categories: [],
      tags: [],
    });
  });

  it("JSON-LD가 깨졌어도 상품 DOM으로 수집하고 캠페인 제목을 제거", () => {
    const html = DOUJIN.replace(/<script[\s\S]*?<\/script>/g, "");
    expect(parseFanzaDoujinPage(html, "d_216826")?.title).toBe("테스트 게임");
  });

  it.each(["<h1>로그인</h1>", "<h1>지역 제한</h1>", product({}), ""])(
    "상품 구조 없는 페이지를 거부",
    (html) => {
      expect(parseFanzaDoujinPage(html, "d_216826")).toBeUndefined();
      expect(parseFanzaPcPage(html, "cape_0038")).toBeUndefined();
    },
  );

  it("요청한 상품과 다른 SKU 또는 canonical을 거부", () => {
    expect(parseFanzaDoujinPage(DOUJIN, "d_999")).toBeUndefined();
    expect(
      parseFanzaPcPage(
        `<link rel="canonical" href="https://dlsoft.dmm.co.jp/detail/other_1/">${PC}`,
        "cape_0038",
      ),
    ).toBeUndefined();
  });

  it.each([
    ["0", 0],
    ["없음", null],
    ["", null],
  ])("판매 수 %s", (value, expected) => {
    expect(
      parseFanzaDoujinPage(DOUJIN.replace("6,058", value), "d_216826")
        ?.downloadCount,
    ).toBe(expected);
  });

  it("누락된 판매 수는 0이 아님", () => {
    expect(
      parseFanzaDoujinPage(
        DOUJIN.replace('class="numberOfSales__txt"', 'class="missing"'),
        "d_216826",
      )?.downloadCount,
    ).toBeNull();
  });

  it("잘못된 날짜와 평점은 비우고 안전하지 않은 이미지 URL은 제외", () => {
    const html = DOUJIN.replace("2021/12/25", "2021/02/30")
      .replace('"4.45"', '"99"')
      .replace("//example.com/cover.jpg", "javascript:alert(1)");
    expect(parseFanzaDoujinPage(html, "D_216826")).toMatchObject({
      publishDate: null,
      rating: null,
      thumbnailUrl: null,
      externalId: "d_216826",
    });
  });
});
