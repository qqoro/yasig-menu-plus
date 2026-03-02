import dayjs from "dayjs";
import { parse } from "node-html-parser";
import { Collector, type CollectorResult } from "./registry.js";

export const CienCollector: Collector = {
  name: "Ci-en",
  getId: async (path) => {
    const id = /(?:CE|CIEN|CI-EN)(\d+-\d+|(creator)?\d+article\d+)/i
      .exec(path)?.[1]
      ?.replace("creator", "")
      .replace("article", "-");
    return id;
  },
  fetchInfo: async ({ id }) => {
    const [creatorId, articleId] = id
      .split("-")
      .map((s) => s.replace(/^0+/, ""));
    const html = await fetch(
      `https://ci-en.net/creator/${creatorId}/article/${articleId}`,
    ).then((res) => res.text());

    const body = parse(html, {
      blockTextElements: {
        script: false,
        noscript: false,
        style: false,
        pre: false,
      },
    });

    // 게시물 찾기
    const article = body.getElementById(`article-${articleId}`);

    // 모든 이미지 수집 (vue-l-image 태그의 src 또는 data-actual 속성)
    const vueImages = article?.querySelectorAll("vue-l-image") ?? [];

    const allImages = Array.from(vueImages)
      .map(
        (img) =>
          img.getAttribute("data-actual") ?? img.getAttribute("src") ?? null,
      )
      .filter((src): src is string => src !== null)
      .map((src) => (src.startsWith("http") ? src : `https:${src}`));

    const thumbnailUrl = allImages.length > 0 ? allImages[0] : null;

    // 제목 수집
    const title = article?.querySelector(".article-title")?.textContent ?? null;

    // 발매일 수집
    const publishDateString =
      article?.parentNode.parentNode.querySelector(".e-date")?.innerText;
    const date = dayjs(publishDateString);
    const publishDate = date.isValid() ? date.toDate() : null;

    // 제작사 수집
    const makerName =
      article?.parentNode.parentNode.querySelector(".e-userName")?.innerText;
    const makers = makerName ? [makerName] : [];

    return {
      title,
      thumbnailUrl,
      images: allImages,
      publishDate,
      makers,
      categories: [],
      tags: [],
      externalId: id,
      provider: "cien",
    } satisfies CollectorResult;
  },
  getUrl: (id) => {
    const [creatorId, articleId] = id.split("-");
    return `https://ci-en.net/creator/${creatorId}/article/${articleId}`;
  },
};
