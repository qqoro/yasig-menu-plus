import { basename } from "path";
import { Collector, type CollectorResult } from "./registry.js";

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
