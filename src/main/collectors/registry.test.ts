import { describe, expect, it } from "vitest";

/**
 * Registry 유틸리티 함수 테스트
 * 실행: pnpm test
 */

// getCollectorUrl 로직 (실제 collector 없이 URL 패턴만 테스트)
function getCollectorUrl(
  provider: string | null,
  externalId: string | null,
): string | null {
  if (!provider || !externalId) return null;

  const urlPatterns: Record<string, (id: string) => string> = {
    dlsite: (id) =>
      `https://www.dlsite.com/maniax/work/=/product_id/${id}.html`,
    steam: (id) => `https://store.steampowered.com/app/${id}/`,
    getchu: (id) => `https://www.getchu.com/soft.phtml?id=${id}`,
    cien: (id) => {
      const [creatorId, articleId] = id.split("-");
      return `https://ci-en.net/creator/${creatorId}/article/${articleId}`;
    },
  };

  const getUrl = urlPatterns[provider.toLowerCase()];
  return getUrl?.(externalId) ?? null;
}

// ============================================
// getCollectorUrl 테스트
// ============================================
describe("getCollectorUrl", () => {
  const testCases: [string | null, string | null, string | null, string][] = [
    // ===== DLSite =====
    [
      "dlsite",
      "RJ123456",
      "https://www.dlsite.com/maniax/work/=/product_id/RJ123456.html",
      "DLSite URL",
    ],
    [
      "DLSite",
      "RJ12345678",
      "https://www.dlsite.com/maniax/work/=/product_id/RJ12345678.html",
      "DLSite 대문자",
    ],
    [
      "dlsite",
      "BJ123456",
      "https://www.dlsite.com/maniax/work/=/product_id/BJ123456.html",
      "DLSite BJ 코드",
    ],

    // ===== Steam =====
    [
      "steam",
      "123456",
      "https://store.steampowered.com/app/123456/",
      "Steam URL",
    ],
    [
      "STEAM",
      "12345678",
      "https://store.steampowered.com/app/12345678/",
      "Steam 대문자",
    ],

    // ===== Getchu =====
    [
      "getchu",
      "123456",
      "https://www.getchu.com/soft.phtml?id=123456",
      "Getchu URL",
    ],
    [
      "GETCHU",
      "1234567",
      "https://www.getchu.com/soft.phtml?id=1234567",
      "Getchu 대문자",
    ],

    // ===== Cien =====
    [
      "cien",
      "12345-67890",
      "https://ci-en.net/creator/12345/article/67890",
      "Cien URL",
    ],
    [
      "CIEN",
      "123-456",
      "https://ci-en.net/creator/123/article/456",
      "Cien 대문자",
    ],

    // ===== null/undefined 케이스 =====
    [null, "RJ123456", null, "provider null"],
    ["dlsite", null, null, "externalId null"],
    [null, null, null, "둘 다 null"],

    // ===== 지원하지 않는 provider =====
    ["unknown", "123456", null, "지원하지 않는 provider"],
    ["google", "게임이름", null, "Google은 URL 없음"],
  ];

  it.each(testCases)(
    "%s, %s → %s (%s)",
    (provider, externalId, expected, _desc) => {
      expect(getCollectorUrl(provider, externalId)).toBe(expected);
    },
  );
});
