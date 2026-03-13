import dayjs from "dayjs";
import { createRequire } from "module";
import { parse } from "node-html-parser";
import { Collector, type CollectorResult } from "./registry.js";

const require = createRequire(import.meta.url);
const iconv = require("iconv-lite");

export const GetchuCollector: Collector = {
  name: "Getchu",
  getId: async (path) => {
    const [, id] = /\b(?:GC|GETCHU)(\d{1,7})\d*\b/i.exec(path) ?? [];
    return id;
  },
  fetchInfo: async ({ id }) => {
    const response = await fetch(`https://www.getchu.com/item/${id}/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "ja,en-US;q=0.7,en;q=0.3",
        Referer: "https://www.getchu.com/",
        cookie: "getchu_adalt_flag=getchu.com",
      },
    });

    const html = iconv.decode(
      Buffer.from(await response.arrayBuffer()),
      "EUC-JP",
    ) as string;

    const body = parse(html, {
      blockTextElements: {
        script: false,
        noscript: false,
        style: false,
        pre: false,
      },
    });

    // 작품 정보란 찾기
    const softTable = body.getElementById("soft_table");
    const softTitle = body.getElementById("soft-title");
    const softInfoRows = softTable
      ? softTable.children[1].querySelector("table")?.children
      : softTitle?.parentNode.parentNode.parentNode.children;

    // 섬네일 및 모든 이미지 수집 (highslide 링크들)
    const tableLinks = softTable
      ?.querySelectorAll("a")
      .filter((e) => e.classList.contains("highslide"));

    const rowLinks = softInfoRows
      ?.filter((e) => e.querySelector("a")?.classList.contains("highslide"))
      .map((e) => e.querySelector("a"))
      .filter((a): a is any => a !== undefined);

    const highslideLinks = tableLinks ?? rowLinks ?? [];

    const allImages = highslideLinks
      .map((a) => a.getAttribute("href"))
      .filter((href): href is string => href !== null)
      .map((href) => new URL(href, "https://www.getchu.com").href);

    const thumbnailUrl = allImages.length > 0 ? allImages[0] : null;

    // 제목 수집
    const title =
      softTitle?.childNodes
        .filter((n) => n.nodeType === 3)[0]
        .textContent.trim() ?? null;

    // 발매일 수집
    const publishDateRow = softInfoRows?.filter((e) =>
      e.textContent.trim().startsWith("発売日："),
    )[0];
    const date = dayjs(publishDateRow?.children[1].textContent.trim());
    const publishDate = date.isValid() ? date.toDate() : null;

    // 제작사 수집
    const makerRow = softInfoRows?.filter(
      (e) =>
        e.textContent.trim().startsWith("サークル：") ||
        e.textContent.trim().startsWith("ブランド："),
    )[0];
    const brandsite = makerRow?.getElementById("brandsite");
    const makerName = brandsite
      ? brandsite.textContent.trim()
      : makerRow?.children[1].firstChild?.textContent.trim();
    const makers = makerName ? [makerName] : [];

    // 카테고리 수집 (ジャンル)
    const categories: string[] = [];
    const genreRow = softInfoRows?.filter((e) =>
      e.textContent.trim().startsWith("ジャンル："),
    )[0];
    if (genreRow) {
      const genreText = genreRow.children[1]?.textContent.trim() ?? "";
      if (genreText) {
        categories.push(genreText);
      }
    }

    // 태그 수집 (サブジャンル)
    const tags: string[] = [];
    const subGenreRow = softInfoRows?.filter((e) =>
      e.textContent.trim().startsWith("サブジャンル："),
    )[0];
    if (subGenreRow) {
      const genreText = subGenreRow.children[1]?.textContent.trim() ?? "";
      // "アドベンチャー [一覧]" 형식에서 [一覧] 제거
      const genreName = genreText.replace(/\s*\[一覧\]\s*$/, "").trim();
      if (genreName) {
        tags.push(genreName);
      }
    }

    return {
      title,
      thumbnailUrl,
      images: allImages,
      publishDate,
      makers,
      categories,
      tags,
      externalId: id,
      provider: "getchu",
    } satisfies CollectorResult;
  },
  getUrl: (id) => `https://www.getchu.com/item/${id}/`,
};
