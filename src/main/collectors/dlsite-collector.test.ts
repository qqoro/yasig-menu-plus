import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deriveSampleImageUrl,
  DLSiteCollector,
  parseCircleName,
  parseDlsiteAjaxFallback,
  parseDlsiteDownloadCount,
  parseDlsiteProduct,
  parseDlsiteRating,
  parseDlsiteReviewCount,
} from "./dlsite-collector.js";

/**
 * DLSiteCollector.getId 테스트
 * 실행: pnpm test
 */

// 현재 정규식
const currentRegex = /[RBV]J\d{6,8}/i;

// 개선된 정규식 (대괄호 우선)
function getImprovedId(path: string): string | undefined {
  // 1순위: 대괄호 안의 RJ 코드 추출
  const bracketMatch = /\[([RBV]J\d{6,8})\]/i.exec(path);
  if (bracketMatch) {
    return bracketMatch[1];
  }
  // 2순위: 대괄호 없는 RJ 코드
  return currentRegex.exec(path)?.[0];
}

// 모든 테스트 케이스 (입력, 기대값, 설명)
const allTestCases: [string, string | undefined, string][] = [
  // ===== 기본 형식 =====
  ["RJ123456", "RJ123456", "코드만"],
  ["RJ123456 게임이름", "RJ123456", "코드 + 게임명"],
  ["게임이름 RJ123456", "RJ123456", "게임명 + 코드"],

  // ===== 대괄호 형식 (사용자 요청) =====
  ["[RJ123456]", "RJ123456", "대괄호만"],
  ["[RJ123456] 게임이름", "RJ123456", "대괄호 + 게임명"],
  ["게임이름 [RJ123456]", "RJ123456", "게임명 + 대괄호"],
  ["게임이름 [RJ123456] 추가설명", "RJ123456", "게임명 + 대괄호 + 설명"],
  ["[RJ123456] 게임이름 [한글]", "RJ123456", "대괄호 + 게임명 + 다른 대괄호"],

  // ===== 다양한 코드 타입 =====
  ["[BJ123456] 게임이름", "BJ123456", "BJ 코드 (Booth)"],
  ["[VJ123456] 게임이름", "VJ123456", "VJ 코드"],
  ["[rj123456] 게임이름", "rj123456", "소문자 rj"],
  ["[Rj123456] 게임이름", "Rj123456", "대소문자 혼합"],

  // ===== 자릿수 변형 =====
  ["[RJ12345678] 게임이름", "RJ12345678", "8자리 숫자"],

  // ===== 한글 게임명 - 위치별 테스트 =====
  // 괄호 있이
  ["[RJ123456] 동굴 탐험", "RJ123456", "한글: 앞 (대괄호)"],
  ["동굴 탐험 [RJ123456]", "RJ123456", "한글: 뒤 (대괄호)"],
  ["동굴 탐험 [RJ123456] 완결판", "RJ123456", "한글: 중간 (대괄호)"],
  // 괄호 없이
  ["RJ123456 동굴 탐험", "RJ123456", "한글: 앞 (괄호없음)"],
  ["동굴 탐험 RJ123456", "RJ123456", "한글: 뒤 (괄호없음)"],
  ["동굴 탐험 RJ123456 완결판", "RJ123456", "한글: 중간 (괄호없음)"],

  // ===== 일본어 게임명 - 위치별 테스트 =====
  // 괄호 있이
  ["[RJ123456] 異世界に転生したら", "RJ123456", "일본어: 앞 (대괄호)"],
  ["異世界に転生したら [RJ123456]", "RJ123456", "일본어: 뒤 (대괄호)"],
  [
    "異世界に転生したら [RJ123456] 奴隷だった",
    "RJ123456",
    "일본어: 중간 (대괄호)",
  ],
  // 괄호 없이
  ["RJ123456 異世界に転生したら", "RJ123456", "일본어: 앞 (괄호없음)"],
  ["異世界に転生したら RJ123456", "RJ123456", "일본어: 뒤 (괄호없음)"],
  [
    "異世界に転生したら RJ123456 奴隷だった",
    "RJ123456",
    "일본어: 중간 (괄호없음)",
  ],

  // ===== 영문 게임명 - 위치별 테스트 =====
  // 괄호 있이
  ["[RJ123456] Forest of the Blue Skin", "RJ123456", "영문: 앞 (대괄호)"],
  ["Forest of the Blue Skin [RJ123456]", "RJ123456", "영문: 뒤 (대괄호)"],
  [
    "Forest of the Blue Skin [RJ123456] Complete Edition",
    "RJ123456",
    "영문: 중간 (대괄호)",
  ],
  // 괄호 없이
  ["RJ123456 Forest of the Blue Skin", "RJ123456", "영문: 앞 (괄호없음)"],
  ["Forest of the Blue Skin RJ123456", "RJ123456", "영문: 뒤 (괄호없음)"],
  [
    "Forest of the Blue Skin RJ123456 Complete Edition",
    "RJ123456",
    "영문: 중간 (괄호없음)",
  ],

  // ===== 혼합 게임명 - 위치별 테스트 =====
  ["[RJ123456] Final Fantasy VII (파이널 판타지 7)", "RJ123456", "혼합: 앞"],
  ["Final Fantasy VII (파이널 판타지 7) [RJ123456]", "RJ123456", "혼합: 뒤"],
  ["Final Fantasy VII [RJ123456] (파이널 판타지 7)", "RJ123456", "혼합: 중간"],

  // ===== 특수문자 포함 =====
  ["[RJ123456] 게임~이름!", "RJ123456", "특수문자 포함"],
  ["[RJ123456] 게임 (Ver.2)", "RJ123456", "버전 정보 포함"],
  ["[RJ123456] 게임 [한국어판]", "RJ123456", "추가 대괄호 정보"],

  // ===== 전체 경로 (Windows) =====
  ["C:/Games/[RJ123456] 게임이름", "RJ123456", "전체 경로 (/)"],
  ["C:\\Games\\[RJ123456] 게임이름", "RJ123456", "전체 경로 (\\)"],
  ["D:\\Users\\User\\Games\\[RJ123456] 게임이름", "RJ123456", "깊은 경로"],
  ["C:/Games/RJ123456 게임이름", "RJ123456", "전체 경로 (괄호없음)"],
  ["C:/Games/게임이름 RJ123456", "RJ123456", "전체 경로 (괄호없음, 뒤)"],

  // ===== 복잡한 형식 =====
  ["[RJ123456][BJ654321] 게임이름", "RJ123456", "다중 코드 (첫 번째)"],
  ["게임이름 [RJ123456] [한국어]", "RJ123456", "다중 대괄호"],
  ["[RJ123456] 게임이름 [CV.성우명]", "RJ123456", "CV 정보 포함"],

  // ===== 엣지 케이스 =====
  ["[RJ000001] 게임이름", "RJ000001", "0으로 시작"],
  ["[RJ99999999] 게임이름", "RJ99999999", "9로만 구성 (8자리)"],
  ["  [RJ123456] 게임이름  ", "RJ123456", "앞뒤 공백"],

  // ===== 매칭되지 않아야 하는 케이스 (undefined) =====
  ["게임이름만", undefined, "코드 없음"],
  ["[한글만] 게임이름", undefined, "한글만 있는 대괄호"],
  ["[RJ12345] 게임이름", undefined, "5자리는 미지원 (6~8자리만)"],
  ["[XJ123456] 게임이름", undefined, "지원하지 않는 접두사"],
  ["RJ12345", undefined, "대괄호 없는 5자리"],
  ["RJ123456789", "RJ12345678", "9자리는 앞 8자리만 매칭"],
];

describe("DLSiteCollector.getId - 현재 정규식", () => {
  it.each(allTestCases)("%s → %s (%s)", (input, expected, _desc) => {
    if (expected === undefined) {
      expect(currentRegex.exec(input)?.[0]).toBeUndefined();
    } else {
      expect(currentRegex.exec(input)?.[0]).toBe(expected);
    }
  });
});

describe("DLSiteCollector.getId - 개선된 정규식", () => {
  it.each(allTestCases)("%s → %s (%s)", (input, expected, _desc) => {
    expect(getImprovedId(input)).toBe(expected);
  });
});

describe("parseDlsiteRating", () => {
  const id = "RJ01017217";

  it("평가가 있으면 rate_average_2dp를 숫자로 반환", () => {
    const json = { [id]: { rate_count: 4727, rate_average_2dp: 4.92 } };
    expect(parseDlsiteRating(json, id)).toBe(4.92);
  });

  it("문자열로 와도 숫자로 파싱", () => {
    const json = { [id]: { rate_count: 10, rate_average_2dp: "3.50" } };
    expect(parseDlsiteRating(json, id)).toBe(3.5);
  });

  it("평가 수가 0이면 null", () => {
    const json = { [id]: { rate_count: 0, rate_average_2dp: 0 } };
    expect(parseDlsiteRating(json, id)).toBeNull();
  });

  it("해당 id 항목이 없으면 null", () => {
    expect(parseDlsiteRating({}, id)).toBeNull();
  });

  it("잘못된 입력이면 null", () => {
    expect(parseDlsiteRating(null, id)).toBeNull();
    expect(parseDlsiteRating("oops", id)).toBeNull();
  });
});

describe("parseDlsiteReviewCount", () => {
  const id = "RJ01017217";

  it("rate_count를 숫자로 반환", () => {
    const json = { [id]: { rate_count: 4727, rate_average_2dp: 4.92 } };
    expect(parseDlsiteReviewCount(json, id)).toBe(4727);
  });

  it("문자열로 와도 숫자로 파싱", () => {
    const json = { [id]: { rate_count: "10", rate_average_2dp: 3.5 } };
    expect(parseDlsiteReviewCount(json, id)).toBe(10);
  });

  it("평가 수가 0이면 null", () => {
    const json = { [id]: { rate_count: 0, rate_average_2dp: 0 } };
    expect(parseDlsiteReviewCount(json, id)).toBeNull();
  });

  it("해당 id 항목이 없으면 null", () => {
    expect(parseDlsiteReviewCount({}, id)).toBeNull();
  });

  it("잘못된 입력이면 null", () => {
    expect(parseDlsiteReviewCount(null, id)).toBeNull();
    expect(parseDlsiteReviewCount("oops", id)).toBeNull();
  });
});

describe("parseDlsiteDownloadCount", () => {
  const id = "RJ294126";

  it("dl_count가 있으면 숫자로 반환", () => {
    const json = { [id]: { dl_count: 83612 } };
    expect(parseDlsiteDownloadCount(json, id)).toBe(83612);
  });

  it("dl_count가 0이면 null", () => {
    const json = { [id]: { dl_count: 0 } };
    expect(parseDlsiteDownloadCount(json, id)).toBeNull();
  });

  it("해당 id 항목이 없으면 null", () => {
    expect(
      parseDlsiteDownloadCount({ other: { dl_count: 10 } }, id),
    ).toBeNull();
  });

  it("잘못된 입력이면 null", () => {
    expect(parseDlsiteDownloadCount(null, id)).toBeNull();
    expect(parseDlsiteDownloadCount("nope", id)).toBeNull();
  });
});

// ===== product.json 파싱 (판매 중 작품) =====

/** 실제 product.json 응답 형태를 축약한 픽스처 */
function makeProductFixture(id: string) {
  return {
    workno: id,
    work_name: "테스트 작품",
    maker_name: "테스트 서클",
    work_type_string: "만화",
    regist_date: "2013-10-15 00:00:00",
    genres: [
      {
        name: "러브러브/달콤달콤",
        id: 4,
        search_val: "004",
        name_base: "ラブラブ/あまあま",
      },
      { name: "처녀", id: 193, search_val: "193", name_base: "処女" },
    ],
    image_main: {
      url: `//img.dlsite.jp/modpub/images2/work/doujin/RJ124000/${id}_img_main.jpg`,
    },
    image_samples: [
      {
        url: `//img.dlsite.jp/modpub/images2/work/doujin/RJ124000/${id}_img_smp1.jpg`,
      },
      {
        url: `//img.dlsite.jp/modpub/images2/work/doujin/RJ124000/${id}_img_smp2.jpg`,
      },
    ],
  };
}

describe("parseDlsiteProduct", () => {
  const id = "RJ123456";

  it("정상 응답에서 모든 필드를 매핑", () => {
    const result = parseDlsiteProduct([makeProductFixture(id)], id);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("테스트 작품");
    expect(result!.thumbnailUrl).toBe(
      "https://img.dlsite.jp/modpub/images2/work/doujin/RJ124000/RJ123456_img_main.jpg",
    );
    expect(result!.images).toEqual([
      "https://img.dlsite.jp/modpub/images2/work/doujin/RJ124000/RJ123456_img_main.jpg",
      "https://img.dlsite.jp/modpub/images2/work/doujin/RJ124000/RJ123456_img_smp1.jpg",
      "https://img.dlsite.jp/modpub/images2/work/doujin/RJ124000/RJ123456_img_smp2.jpg",
    ]);
    expect(result!.publishDate).toEqual(new Date("2013-10-15T00:00:00"));
    expect(result!.makers).toEqual(["테스트 서클"]);
    expect(result!.categories).toEqual(["만화"]);
    expect(result!.tags).toEqual(["러브러브/달콤달콤", "처녀"]);
  });

  it("빈 배열이면 null (판매 중단 작품)", () => {
    expect(parseDlsiteProduct([], id)).toBeNull();
  });

  it("workno가 일치하지 않으면 null", () => {
    const other = { ...makeProductFixture(id), workno: "RJ999999" };
    expect(parseDlsiteProduct([other], id)).toBeNull();
  });

  it("배열이 아니면 null", () => {
    expect(parseDlsiteProduct(null, id)).toBeNull();
    expect(parseDlsiteProduct({}, id)).toBeNull();
    expect(parseDlsiteProduct("oops", id)).toBeNull();
  });

  it("image_main이 없으면 썸네일 null, 샘플만 수집", () => {
    const product = { ...makeProductFixture(id), image_main: null };
    const result = parseDlsiteProduct([product], id);
    expect(result!.thumbnailUrl).toBeNull();
    expect(result!.images).toEqual([
      "https://img.dlsite.jp/modpub/images2/work/doujin/RJ124000/RJ123456_img_smp1.jpg",
      "https://img.dlsite.jp/modpub/images2/work/doujin/RJ124000/RJ123456_img_smp2.jpg",
    ]);
  });

  it("regist_date가 잘못되면 publishDate null", () => {
    const product = { ...makeProductFixture(id), regist_date: null };
    expect(parseDlsiteProduct([product], id)!.publishDate).toBeNull();
  });

  it("genres가 없으면 빈 태그 목록", () => {
    const product = { ...makeProductFixture(id), genres: null };
    expect(parseDlsiteProduct([product], id)!.tags).toEqual([]);
  });
});

// ===== info/ajax 폴백 파싱 (판매 중단 작품) =====

describe("parseDlsiteAjaxFallback", () => {
  const id = "RJ045678";
  const entry = {
    work_name: "くノ一捕獲",
    work_image:
      "//img.dlsite.jp/modpub/images2/work/doujin/RJ046000/RJ045678_img_main.jpg",
    regist_date: "2009-01-12 00:00:00",
    work_type: "MNG",
    maker_id: "RG08182",
  };

  it("판매 중단 작품 엔트리에서 기본 정보 추출", () => {
    const result = parseDlsiteAjaxFallback({ [id]: entry }, id);
    expect(result).not.toBeNull();
    expect(result!.title).toBe("くノ一捕獲");
    expect(result!.thumbnailUrl).toBe(
      "https://img.dlsite.jp/modpub/images2/work/doujin/RJ046000/RJ045678_img_main.jpg",
    );
    expect(result!.publishDate).toEqual(new Date("2009-01-12T00:00:00"));
    expect(result!.category).toBe("만화");
    expect(result!.makerId).toBe("RG08182");
  });

  it("해당 id 엔트리가 없으면 null", () => {
    expect(parseDlsiteAjaxFallback({}, id)).toBeNull();
    expect(parseDlsiteAjaxFallback([], id)).toBeNull();
    expect(parseDlsiteAjaxFallback(null, id)).toBeNull();
  });

  it("알 수 없는 work_type이면 category null", () => {
    const result = parseDlsiteAjaxFallback(
      { [id]: { ...entry, work_type: "XXX" } },
      id,
    );
    expect(result!.category).toBeNull();
  });

  it("work_image가 없으면 thumbnailUrl null", () => {
    const result = parseDlsiteAjaxFallback(
      { [id]: { ...entry, work_image: null } },
      id,
    );
    expect(result!.thumbnailUrl).toBeNull();
  });
});

// ===== 샘플 이미지 URL 유도 =====

describe("deriveSampleImageUrl", () => {
  const mainUrl =
    "https://img.dlsite.jp/modpub/images2/work/doujin/RJ046000/RJ045678_img_main.jpg";

  it("메인 이미지 URL에서 n번째 샘플 URL 유도", () => {
    expect(deriveSampleImageUrl(mainUrl, 1)).toBe(
      "https://img.dlsite.jp/modpub/images2/work/doujin/RJ046000/RJ045678_img_smp1.jpg",
    );
    expect(deriveSampleImageUrl(mainUrl, 3)).toBe(
      "https://img.dlsite.jp/modpub/images2/work/doujin/RJ046000/RJ045678_img_smp3.jpg",
    );
  });

  it("_img_main 패턴이 아니면 null", () => {
    expect(
      deriveSampleImageUrl("https://img.dlsite.jp/other/image.jpg", 1),
    ).toBeNull();
  });
});

// ===== 서클 프로필 HTML에서 서클명 추출 =====

describe("parseCircleName", () => {
  it("prof_maker_name 요소에서 서클명 추출", () => {
    const html = `<div class="prof_maker"><strong class="prof_maker_name">みこらび</strong></div>`;
    expect(parseCircleName(html)).toBe("みこらび");
  });

  it("서클명 요소가 없으면 null", () => {
    expect(parseCircleName("<html><body>404</body></html>")).toBeNull();
  });
});

// ===== fetchInfo 통합 (fetch 스텁) =====

describe("DLSiteCollector.fetchInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** JSON 응답 스텁 생성 */
  function jsonResponse(data: unknown) {
    return {
      ok: true,
      json: async () => data,
      text: async () => JSON.stringify(data),
    };
  }

  it("판매 중 작품은 product.json 기반으로 수집하고 ajax 평점을 병합", async () => {
    const id = "RJ123456";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/=/product.json")) {
          return jsonResponse([makeProductFixture(id)]);
        }
        if (url.includes("/product/info/ajax")) {
          return jsonResponse({
            [id]: { rate_count: 10, rate_average_2dp: 4.5, dl_count: 1000 },
          });
        }
        throw new Error(`예상치 못한 fetch: ${url}`);
      }),
    );

    const result = await DLSiteCollector.fetchInfo({ path: "x", id });
    expect(result!.title).toBe("테스트 작품");
    expect(result!.makers).toEqual(["테스트 서클"]);
    expect(result!.categories).toEqual(["만화"]);
    expect(result!.tags).toEqual(["러브러브/달콤달콤", "처녀"]);
    expect(result!.rating).toBe(4.5);
    expect(result!.reviewCount).toBe(10);
    expect(result!.downloadCount).toBe(1000);
    expect(result!.externalId).toBe(id);
    expect(result!.provider).toBe("dlsite");
  });

  it("판매 중단 작품은 ajax 폴백 + 샘플 프로빙 + 서클명 복구", async () => {
    const id = "RJ045678";
    const mainImage = `//img.dlsite.jp/modpub/images2/work/doujin/RJ046000/${id}_img_main.jpg`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: { method?: string }) => {
        if (url.includes("/api/=/product.json")) {
          return jsonResponse([]);
        }
        if (url.includes("/product/info/ajax")) {
          return jsonResponse({
            [id]: {
              work_name: "くノ一捕獲",
              work_image: mainImage,
              regist_date: "2009-01-12 00:00:00",
              work_type: "MNG",
              maker_id: "RG08182",
              rate_count: 21,
              rate_average_2dp: 3.71,
              dl_count: 32,
            },
          });
        }
        if (init?.method === "HEAD") {
          // smp1만 존재, smp2부터 404
          return { ok: url.includes("_img_smp1.jpg") };
        }
        if (url.includes("/circle/profile/=/maker_id/RG08182.html")) {
          return {
            ok: true,
            text: async () =>
              `<strong class="prof_maker_name">みこらび</strong>`,
          };
        }
        throw new Error(`예상치 못한 fetch: ${url}`);
      }),
    );

    const result = await DLSiteCollector.fetchInfo({ path: "x", id });
    expect(result!.title).toBe("くノ一捕獲");
    expect(result!.thumbnailUrl).toBe(`https:${mainImage}`);
    expect(result!.images).toEqual([
      `https:${mainImage}`,
      `https://img.dlsite.jp/modpub/images2/work/doujin/RJ046000/${id}_img_smp1.jpg`,
    ]);
    expect(result!.publishDate).toEqual(new Date("2009-01-12T00:00:00"));
    expect(result!.makers).toEqual(["みこらび"]);
    expect(result!.categories).toEqual(["만화"]);
    expect(result!.tags).toEqual([]);
    expect(result!.rating).toBe(3.71);
    expect(result!.reviewCount).toBe(21);
    expect(result!.downloadCount).toBe(32);
    expect(result!.externalId).toBe(id);
    expect(result!.provider).toBe("dlsite");
  });

  it("양쪽 API 모두 데이터가 없으면 빈 결과 반환", async () => {
    const id = "RJ99999999";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/api/=/product.json")) return jsonResponse([]);
        if (url.includes("/product/info/ajax")) return jsonResponse([]);
        throw new Error(`예상치 못한 fetch: ${url}`);
      }),
    );

    const result = await DLSiteCollector.fetchInfo({ path: "x", id });
    expect(result!.title).toBeNull();
    expect(result!.thumbnailUrl).toBeNull();
    expect(result!.images).toEqual([]);
    expect(result!.makers).toEqual([]);
    expect(result!.categories).toEqual([]);
    expect(result!.tags).toEqual([]);
    expect(result!.externalId).toBe(id);
    expect(result!.provider).toBe("dlsite");
  });
});
