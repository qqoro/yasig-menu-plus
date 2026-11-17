import { extractFanzaId } from "../lib/external-id.js";
import { politeFetch } from "../utils/polite-fetch.js";
import { parseFanzaDoujinPage, parseFanzaPcPage } from "./fanza-parser.js";
import type { Collector } from "./registry.js";

function validId(id: string): boolean {
  return /^[a-z][a-z0-9]*_[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id);
}

function storeUrl(id: string): string {
  return /^d_\d+$/.test(id)
    ? `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${id}/`
    : `https://dlsoft.dmm.co.jp/detail/${id}/`;
}

export const FanzaCollector: Collector = {
  name: "FANZA",
  getId: async (path) => extractFanzaId(path),
  getUrl: (id) => storeUrl(id.toLowerCase()),
  fetchInfo: async ({ id: rawId }) => {
    const id = rawId.toLowerCase();
    if (!validId(id)) return undefined;
    const response = await politeFetch(storeUrl(id), {
      headers: {
        "User-Agent":
          "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok || (response.url && extractFanzaId(response.url) !== id)) {
      await response.body?.cancel();
      return undefined;
    }
    const html = await response.text();
    return /^d_\d+$/.test(id)
      ? parseFanzaDoujinPage(html, id)
      : parseFanzaPcPage(html, id);
  },
};
