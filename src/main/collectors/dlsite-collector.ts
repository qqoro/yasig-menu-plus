import dayjs from "dayjs";
import { parse } from "node-html-parser";
import { Collector, type CollectorResult } from "./registry.js";

export const DLSiteCollector: Collector = {
  name: "DLSite",
  getId: async (path) => {
    const rjCode = /[RBV]J\d{6,8}/i.exec(path)?.[0];
    return rjCode;
  },
  fetchInfo: async ({ id }) => {
    const html = await fetch(
      `https://www.dlsite.com/maniax/work/=/product_id/${id}.html`,
      {
        headers: {
          cookie: "locale=ko-kr",
        },
      },
    ).then((res) => res.text());

    const body = parse(html, {
      blockTextElements: {
        script: false,
        noscript: false,
        style: false,
        pre: false,
      },
    });

    const title = body.querySelector("#work_name")?.textContent ?? null;

    // product-slider-data 내의 모든 이미지 수집
    const sliderDivs = body.querySelectorAll(".product-slider-data > div");
    const allImages = Array.from(sliderDivs)
      .map((div) => div.getAttribute("data-src"))
      .filter((src): src is string => src !== null)
      .map((src) => "https:" + src);

    // 첫 번째는 thumbnailUrl, 전체는 images 배열
    const thumbnailUrl = allImages.length > 0 ? allImages[0] : null;
    const images = allImages; // 모든 이미지 (썸네일 포함)

    const date = dayjs(
      body.querySelector("#work_outline > tr:nth-child(1) > td > a")
        ?.textContent ?? null,
      `YYYY년 MM월 DD일`,
    );
    const publishDate = date.isValid() ? date.toDate() : null;
    const maker = body.querySelector("#work_maker > tr > td > span > a");
    const makerName = maker?.textContent ?? "";
    const makers = makerName ? [makerName] : [];

    const category =
      body.querySelector("#category_type > a:nth-child(1) > span")
        ?.textContent ?? "";
    const categories = category ? [category] : [];

    const tags =
      body
        .querySelector(".main_genre")
        ?.querySelectorAll("a")
        .filter((e) => /genre\/(\d+)\/from/.test(e.getAttribute("href") ?? ""))
        .map((e) => e.textContent ?? "")
        .filter((name): name is string => name !== "") ?? [];

    return {
      title,
      thumbnailUrl,
      images,
      publishDate,
      makers,
      categories,
      tags,
      externalId: id,
      provider: "dlsite",
    } satisfies CollectorResult;
  },
  getUrl: (id) => `https://www.dlsite.com/maniax/work/=/product_id/${id}.html`,
};
