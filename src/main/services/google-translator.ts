/**
 * 구글 번역 서비스
 *
 * 무료 구글 번역 API (client=dict-chrome-ex) 사용
 */

import type { TranslationResult, Translator } from "./translator.js";

/**
 * 구글 번역기 구현
 */
export class GoogleTranslator implements Translator {
  private readonly baseUrl =
    "https://translate.googleapis.com/translate_a/single";

  /**
   * 구글 번역 API를 사용한 번역
   */
  async translate(text: string): Promise<TranslationResult> {
    const params = new URLSearchParams({
      // client=gtx는 구글이 429로 차단하므로 사용하지 않는다
      client: "dict-chrome-ex",
      sl: "auto",
      tl: "ko",
      dt: "t",
      q: text,
    });

    const url = `${this.baseUrl}?${params.toString()}`;

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(
        `구글 번역 API 오류: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    const translatedText = extractTranslatedText(data);

    if (translatedText === null) {
      throw new Error("구글 번역 응답 형식 오류");
    }

    return { translatedText, source: "google" };
  }

  /**
   * 구글 번역 서비스는 항상 사용 가능
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(this.baseUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

/**
 * 번역 응답에서 번역문 추출
 *
 * 구글은 긴 문장을 여러 세그먼트로 나누어 반환한다.
 * (예: "A。B。C。" → [["A。"], ["B。"], ["C。"]])
 * 첫 세그먼트만 읽으면 뒷부분이 잘리므로 전체를 이어붙인다.
 */
export function extractTranslatedText(data: unknown): string | null {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    return null;
  }

  const segments = data[0]
    .map((segment) =>
      Array.isArray(segment) && typeof segment[0] === "string"
        ? segment[0]
        : null,
    )
    .filter((segment): segment is string => segment !== null);

  if (segments.length === 0) {
    return null;
  }

  return segments.join("");
}
