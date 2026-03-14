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
 * URL, CAPTCHA 요소, 페이지 내용을 종합적으로 분석
 */
export async function detectBotBlock(page: Page): Promise<BotBlockResult> {
  try {
    const url = page.url();

    // 1. URL 기반 감지
    const blockedUrls = ["/sorry/", "/recaptcha/"];
    if (blockedUrls.some((blocked) => url.includes(blocked))) {
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
        return { blocked: true, reason: "CAPTCHA 요소 감지됨" };
      }
    }

    // 3. 페이지 내용 분석
    const pageContent = await page.content();
    // 실제 Google 차단 페이지에서 확인된 텍스트 기반 키워드
    const blockedKeywords = [
      // 한국어 키워드 (실제 차단 페이지에서 확인됨)
      "Google의 시스템이 컴퓨터 네트워크에서 비정상적인 트래픽을 감지했습니다",
      "로봇이 아니라 실제 사용자가 요청을 보내고 있는지를 확인하는 페이지입니다",
      "비정상적인 트래픽",
      "로봇이 아니라 실제 사용자",
      "자동 요청",
      "로봇이 아닙니다",
      "잠시 후 다시 시도",
      // 영어 키워드
      "unusual traffic",
      "not a robot",
      "CAPTCHA",
      "Our systems have detected",
    ];
    for (const keyword of blockedKeywords) {
      if (pageContent.toLowerCase().includes(keyword.toLowerCase())) {
        return { blocked: true, reason: `키워드 감지: ${keyword}` };
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
