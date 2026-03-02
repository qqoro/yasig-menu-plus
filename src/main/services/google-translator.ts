/**
 * 구글 번역 서비스
 *
 * 무료 구글 번역 API (client=gtx) 사용
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
      client: "gtx",
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

    if (data && data[0] && data[0][0] && data[0][0][0]) {
      const translatedText = data[0][0][0] as string;
      return { translatedText, source: "google" };
    }

    throw new Error("구글 번역 응답 형식 오류");
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
