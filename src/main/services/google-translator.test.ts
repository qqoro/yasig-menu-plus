import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractTranslatedText,
  GoogleTranslator,
} from "./google-translator.js";

/** 구글 번역 API 응답 형태 생성 (세그먼트별 [번역문, 원문]) */
function makeResponse(segments: Array<[string, string]>) {
  return segments.map(([translated, original]) => [translated, original]);
}

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => body,
  } as unknown as Response;
}

function errorResponse(status: number, statusText = "Error") {
  return {
    ok: false,
    status,
    statusText,
    json: async () => ({}),
  } as unknown as Response;
}

describe("extractTranslatedText", () => {
  it("단일 세그먼트 응답에서 번역문을 추출한다", () => {
    const data = [makeResponse([["최면 앱", "催眠アプリ"]])];
    expect(extractTranslatedText(data)).toBe("최면 앱");
  });

  it("여러 세그먼트로 나뉜 응답을 모두 이어붙인다", () => {
    // 구글은 긴 문장을 문장 단위로 쪼개서 반환한다.
    // 첫 세그먼트만 읽으면 뒷부분이 잘린다.
    const data = [
      makeResponse([
        ["첫 번째 문장입니다. ", "第一の文章です。"],
        ["두 번째 문장입니다. ", "第二の文章です。"],
        ["세 번째 문장입니다.", "第三の文章です。"],
      ]),
    ];

    expect(extractTranslatedText(data)).toBe(
      "첫 번째 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다.",
    );
  });

  it("배열이 아닌 응답은 null을 반환한다", () => {
    expect(extractTranslatedText(null)).toBeNull();
    expect(extractTranslatedText({})).toBeNull();
    expect(extractTranslatedText("문자열")).toBeNull();
  });

  it("세그먼트가 비어있으면 null을 반환한다", () => {
    expect(extractTranslatedText([[]])).toBeNull();
    expect(extractTranslatedText([[[null]]])).toBeNull();
  });
});

describe("GoogleTranslator", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("차단되지 않는 client 값(dict-chrome-ex)으로 요청한다", async () => {
    // client=gtx는 구글이 429로 차단하므로 사용하면 안 된다
    fetchMock.mockResolvedValue(
      okResponse([makeResponse([["최면 앱", "催眠アプリ"]])]),
    );

    await new GoogleTranslator().translate("催眠アプリ");

    const requestedUrl = fetchMock.mock.calls[0][0] as string;
    expect(requestedUrl).toContain("client=dict-chrome-ex");
    expect(requestedUrl).not.toContain("client=gtx");
  });

  it("정상 응답이면 번역 결과를 반환한다", async () => {
    fetchMock.mockResolvedValue(
      okResponse([makeResponse([["최면 앱", "催眠アプリ"]])]),
    );

    const result = await new GoogleTranslator().translate("催眠アプリ");

    expect(result).toEqual({ translatedText: "최면 앱", source: "google" });
  });

  it("여러 세그먼트로 나뉜 긴 제목도 잘리지 않고 번역된다", async () => {
    fetchMock.mockResolvedValue(
      okResponse([
        makeResponse([
          ["앞부분. ", "前半。"],
          ["뒷부분.", "後半。"],
        ]),
      ]),
    );

    const result = await new GoogleTranslator().translate("前半。後半。");

    expect(result.translatedText).toBe("앞부분. 뒷부분.");
  });

  it("HTTP 오류 응답이면 상태 코드를 담은 에러를 던진다", async () => {
    fetchMock.mockResolvedValue(errorResponse(429, "Too Many Requests"));

    await expect(
      new GoogleTranslator().translate("催眠アプリ"),
    ).rejects.toThrow("429");
  });

  it("응답 형식이 예상과 다르면 에러를 던진다", async () => {
    fetchMock.mockResolvedValue(okResponse({ unexpected: true }));

    await expect(
      new GoogleTranslator().translate("催眠アプリ"),
    ).rejects.toThrow("구글 번역 응답 형식 오류");
  });
});
