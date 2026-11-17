import { afterEach, describe, expect, it, vi } from "vitest";
import { FanzaCollector } from "./fanza-collector.js";
import { politeFetch } from "../utils/polite-fetch.js";

vi.mock("../utils/polite-fetch.js", () => ({ politeFetch: vi.fn() }));

afterEach(() => vi.resetAllMocks());

const html = '<h1 class="productTitle__txt">동인 게임</h1>';
const pcHtml = '<h1 class="productTitle__item--headline">PC 게임</h1>';

describe("FanzaCollector", () => {
  it("d_로 시작해도 숫자가 아니면 PC 게임으로 수집", async () => {
    vi.mocked(politeFetch).mockResolvedValue(new Response(pcHtml));
    expect(FanzaCollector.getUrl?.("d_game")).toBe(
      "https://dlsoft.dmm.co.jp/detail/d_game/",
    );
    expect(
      await FanzaCollector.fetchInfo({ path: "test", id: "d_game" }),
    ).toMatchObject({ title: "PC 게임" });
  });
  it.each([
    [
      "d_216826",
      "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_216826/",
      html,
      "동인 게임",
    ],
    [
      "cape_0038",
      "https://dlsoft.dmm.co.jp/detail/cape_0038/",
      pcHtml,
      "PC 게임",
    ],
  ])("%s 상품을 브라우저와 쿠키 없이 수집", async (id, url, body, title) => {
    vi.mocked(politeFetch).mockResolvedValue(new Response(body));
    expect(await FanzaCollector.fetchInfo({ path: "test", id })).toMatchObject({
      title,
      externalId: id,
      provider: "fanza",
    });
    expect(FanzaCollector.getUrl?.(id)).toBe(url);
    expect(politeFetch).toHaveBeenCalledWith(url, {
      headers: {
        "User-Agent":
          "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      },
      redirect: "manual",
      signal: expect.any(AbortSignal),
    });
  });

  it("getId는 공통 추출 규칙을 사용", async () => {
    expect(await FanzaCollector.getId("[FANZA-DEBO_0158]")).toBe("debo_0158");
  });

  it.each(["../escape", "debo_1/../../", "d_", "debo_1?x=2"])(
    "잘못된 ID를 요청하지 않음: %s",
    async (id) => {
      expect(
        await FanzaCollector.fetchInfo({ path: "test", id }),
      ).toBeUndefined();
      expect(politeFetch).not.toHaveBeenCalled();
    },
  );

  it.each([302, 403, 404, 429, 500])(
    "HTTP %s는 상품으로 저장하지 않음",
    async (status) => {
      vi.mocked(politeFetch).mockResolvedValue(new Response(html, { status }));
      expect(
        await FanzaCollector.fetchInfo({ path: "test", id: "d_216826" }),
      ).toBeUndefined();
    },
  );

  it("200 로그인 페이지를 거부", async () => {
    vi.mocked(politeFetch).mockResolvedValue(new Response("<h1>로그인</h1>"));
    expect(
      await FanzaCollector.fetchInfo({ path: "test", id: "d_216826" }),
    ).toBeUndefined();
  });

  it("상품처럼 보이는 응답도 URL이 로그인으로 바뀌면 거부", async () => {
    const response = new Response(html);
    Object.defineProperty(response, "url", {
      value: "https://accounts.dmm.co.jp/service/login/password",
    });
    vi.mocked(politeFetch).mockResolvedValue(response);
    expect(
      await FanzaCollector.fetchInfo({ path: "test", id: "d_216826" }),
    ).toBeUndefined();
  });

  it("네트워크 실패는 기존 핸들러에 전달", async () => {
    vi.mocked(politeFetch).mockRejectedValue(new Error("네트워크 오류"));
    await expect(
      FanzaCollector.fetchInfo({ path: "test", id: "d_216826" }),
    ).rejects.toThrow("네트워크 오류");
  });
});
