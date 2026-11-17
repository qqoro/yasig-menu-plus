import { parse, type HTMLElement } from "node-html-parser";
import { extractFanzaId } from "../lib/external-id.js";
import type { CollectorResult } from "./registry.js";

interface Product {
  name?: string;
  sku?: string;
  image?: string | string[];
  brand?: { name?: string };
  aggregateRating?: { ratingValue?: unknown; ratingCount?: unknown };
}

function text(element: HTMLElement | null | undefined): string {
  return element?.textContent.replace(/\s+/g, " ").trim() ?? "";
}

function number(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).replace(/,/g, "").trim();
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return null;
  const result = Number(raw);
  return Number.isFinite(result) ? result : null;
}

function imageUrl(value: string | undefined, base: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim(), base);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function date(value: string): Date | null {
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s|$)/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const result = new Date(year, month - 1, day);
  return result.getFullYear() === year &&
    result.getMonth() === month - 1 &&
    result.getDate() === day
    ? result
    : null;
}

function findProduct(root: HTMLElement): Product | undefined {
  for (const script of root.querySelectorAll(
    'script[type="application/ld+json"]',
  )) {
    try {
      const data = JSON.parse(script.textContent);
      const candidates = Array.isArray(data)
        ? data
        : (data?.["@graph"] ?? [data]);
      const product = candidates.find(
        (entry: { "@type"?: string } | null) => entry?.["@type"] === "Product",
      );
      if (product) return product;
    } catch {
      // 깨진 JSON-LD가 있어도 다음 Product 블록을 확인
    }
  }
  return undefined;
}

function parsePage(
  html: string,
  rawId: string,
  doujin: boolean,
): CollectorResult | undefined {
  const id = rawId.toLowerCase();
  const base = doujin ? "https://www.dmm.co.jp" : "https://dlsoft.dmm.co.jp";
  const root = parse(html);
  const heading = root.querySelector(
    doujin
      ? "h1.productTitle__txt"
      : "h1.productTitle__item--headline, h1.productTitle__headline",
  );
  if (!heading) return undefined;
  const product = findProduct(root);
  if (product?.sku && product.sku.toLowerCase() !== id) return undefined;
  const canonical = root
    .querySelector('link[rel="canonical"]')
    ?.getAttribute("href");
  if (canonical && extractFanzaId(canonical) !== id) return undefined;
  heading
    .querySelectorAll('[class*="--campaign"]')
    .forEach((node) => node.remove());
  const title = (
    typeof product?.name === "string" ? product.name : text(heading)
  )
    .replace(/^\s*【\d+%OFF】\s*/i, "")
    .trim();
  if (!title) return undefined;

  const rows = new Map<string, HTMLElement>();
  for (const row of root.querySelectorAll(
    doujin
      ? ".informationList"
      : ".contentsDetailTop__tableRow, .contentsDetailBottom__tableRow",
  )) {
    const label = row.querySelector(
      doujin
        ? ".informationList__ttl"
        : ".contentsDetailTop__tableDataLeft, .contentsDetailBottom__tableDataLeft",
    );
    const value = row.querySelector(
      doujin
        ? ".informationList__txt, .informationList__item, dd"
        : ".contentsDetailTop__tableDataRight, .contentsDetailBottom__tableDataRight",
    );
    if (label && value) rows.set(text(label), value);
  }
  const maker = doujin
    ? text(root.querySelector(".circleName__txt")) ||
      (typeof product?.brand?.name === "string"
        ? product.brand.name.trim()
        : "")
    : text(rows.get("ブランド"));
  const tags = (rows.get("ジャンル")?.querySelectorAll("a") ?? [])
    .filter(
      (a) =>
        !/campaign|キャンペーン|ポイント還元|%OFF/i.test(
          `${a.getAttribute("href") ?? ""} ${text(a)}`,
        ),
    )
    .map(text)
    .filter(Boolean);
  const cover = product?.image;
  const thumbnailUrl =
    imageUrl(
      typeof cover === "string"
        ? cover
        : Array.isArray(cover)
          ? cover[0]
          : undefined,
      base,
    ) ??
    imageUrl(
      root.querySelector('meta[property="og:image"]')?.getAttribute("content"),
      base,
    );
  const imageNodes = root.querySelectorAll(
    doujin ? ".productPreview__item a[href]" : "img",
  );
  const images: string[] = [];
  for (const node of imageNodes) {
    const url = imageUrl(
      doujin
        ? node.getAttribute("href")
        : node.getAttribute("data-src") || node.getAttribute("src"),
      base,
    );
    if (!url || !/\.(?:jpe?g|png|webp)(?:[?#]|$)/i.test(url)) continue;
    if (
      !doujin &&
      !new URL(url).pathname.startsWith(`/digital/pcgame/${id}/${id}`)
    )
      continue;
    const original = doujin ? url : url.replace(/js-(\d+)\./, "jp-$1.");
    if (!doujin && !/jp-\d+\./.test(original)) continue;
    images.push(original);
  }
  const count = number(product?.aggregateRating?.ratingCount);
  const rating = number(product?.aggregateRating?.ratingValue);
  const sales = number(text(root.querySelector(".numberOfSales__txt")));
  const category = text(rows.get("ゲームジャンル"));
  return {
    title,
    thumbnailUrl,
    images: [...new Set(images)],
    publishDate: date(
      text(rows.get(doujin ? "配信開始日" : "ダウンロード版配信開始日")),
    ),
    makers: maker ? [maker] : [],
    categories: category ? [category] : [],
    tags: [...new Set(tags)],
    rating:
      count && rating !== null && rating >= 0 && rating <= 5 ? rating : null,
    reviewCount:
      count !== null && count > 0 && Number.isInteger(count) ? count : null,
    downloadCount:
      doujin && sales !== null && Number.isInteger(sales) ? sales : null,
    externalId: id,
    provider: "fanza",
  };
}

export function parseFanzaDoujinPage(
  html: string,
  id: string,
): CollectorResult | undefined {
  return parsePage(html, id, true);
}

export function parseFanzaPcPage(
  html: string,
  id: string,
): CollectorResult | undefined {
  return parsePage(html, id, false);
}
