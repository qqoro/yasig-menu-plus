import { basename } from "path";
import type { Page } from "puppeteer-core";
import { Collector, type CollectorResult } from "./registry.js";

// 봇 차단 감지 결과 타입
export interface BotBlockResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Google 봇 차단 감지
 * URL 리다이렉트와 CAPTCHA DOM 요소만 검사한다.
 * 텍스트 키워드 검사는 Google 검색 결과 페이지의 i18n 번들에 동일 문구가 포함되어 있어
 * 오탐(매 게임마다 차단 감지)을 유발하므로 제거됨.
 */
export async function detectBotBlock(page: Page): Promise<BotBlockResult> {
  try {
    const url = page.url();

    // 1. URL 기반 감지
    const blockedUrls = ["/sorry/", "/recaptcha/"];
    const matchedUrl = blockedUrls.find((blocked) => url.includes(blocked));
    if (matchedUrl) {
      console.log(
        `[BotBlock] URL 매칭: pattern="${matchedUrl}", url="${url}"`,
      );
      return { blocked: true, reason: "차단 페이지로 리다이렉트됨" };
    }

    // 2. CAPTCHA 요소 감지
    const captchaSelectors = [
      'iframe[src*="recaptcha"]',
      ".g-recaptcha",
      "#captcha-form",
      "#recaptcha",
      'form[action*="sorry"]',
    ];
    for (const selector of captchaSelectors) {
      const element = await page.$(selector);
      if (element) {
        const outerHtml = await page
          .evaluate((el) => el.outerHTML.slice(0, 300), element)
          .catch(() => "(outerHTML 추출 실패)");
        console.log(
          `[BotBlock] DOM 셀렉터 매칭: selector="${selector}", url="${url}", outerHTML(앞 300자)="${outerHtml}"`,
        );
        return { blocked: true, reason: "CAPTCHA 요소 감지됨" };
      }
    }

    return { blocked: false };
  } catch (error) {
    console.error("[GoogleCollector] 봇 차단 감지 중 오류:", error);
    return { blocked: false };
  }
}

export const GoogleCollector: Collector = {
  name: "Google",

  getId: async (path) => {
    return basename(path);
  },

  fetchInfo: async ({ id, page }) => {
    if (!page) {
      return {
        title: null,
        thumbnailUrl: null,
        images: [],
        publishDate: null,
        makers: [],
        categories: [],
        tags: [],
        externalId: null,
        provider: null,
      } satisfies CollectorResult;
    }

    const params = new URLSearchParams({
      q: id,
      udm: "2",
    });
    const searchUrl = "https://www.google.com/search?" + params;
    await page.goto(searchUrl, { waitUntil: "networkidle2" });

    try {
      await page.waitForSelector("#center_col img", { timeout: 5000 });

      // 실제 썸네일 이미지만 수집 (파비콘 등 작은 아이콘 제외)
      // 최소 크기 50px 이상인 이미지만 필터링
      const thumbnailSrcs = await page.$$eval("#center_col img", (imgs) =>
        imgs
          .filter((img) => img.naturalWidth >= 50 && img.naturalHeight >= 50)
          .map((img) => img.src)
          .filter((src) => src != null),
      );

      // 첫 번째 이미지 클릭하여 고화질 이미지 획득
      await page.click("#center_col img:first-child");

      try {
        await page.waitForSelector("img.sFlh5c.FyHeAf.iPVvYb", {
          timeout: 3000,
        });

        // 이미지를 canvas에 그려서 base64 데이터 추출
        const base64Data = await page.$eval(
          "img.sFlh5c.FyHeAf.iPVvYb",
          (img) => {
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              return canvas.toDataURL("image/jpeg");
            }
            return null;
          },
        );

        if (base64Data) {
          return {
            title: null,
            thumbnailUrl: base64Data,
            images: thumbnailSrcs.slice(0, 5),
            publishDate: null,
            makers: [],
            categories: [],
            tags: [],
            externalId: null,
            provider: null,
          } satisfies CollectorResult;
        }
      } catch {
        // 고화질 이미지 실패 시 썸네일 사용
      }

      // fallback: 썸네일 이미지 사용
      const thumbnailSrc = await page.$eval(
        "#center_col img:first-child",
        (img) => img.src,
      );
      return {
        title: null,
        thumbnailUrl: thumbnailSrc,
        images: thumbnailSrcs.slice(0, 5),
        publishDate: null,
        makers: [],
        categories: [],
        tags: [],
        externalId: null,
        provider: null,
      } satisfies CollectorResult;
    } catch {
      return {
        title: null,
        thumbnailUrl: null,
        images: [],
        publishDate: null,
        makers: [],
        categories: [],
        tags: [],
        externalId: null,
        provider: null,
      } satisfies CollectorResult;
    }
  },
};
