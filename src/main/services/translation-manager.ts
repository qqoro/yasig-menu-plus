/**
 * 번역 매니저
 *
 * 구글 번역만 사용
 */

import { GoogleTranslator } from "./google-translator.js";
import type { TranslationResult } from "./translator.js";

/**
 * 번역 매니저 클래스
 */
export class TranslationManager {
  private readonly googleTranslator: GoogleTranslator;

  constructor() {
    this.googleTranslator = new GoogleTranslator();
  }

  /**
   * 텍스트 번역 (구글 번역만 사용)
   */
  async translate(text: string): Promise<TranslationResult> {
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error("번역할 텍스트가 비어있습니다.");
    }
    return this.googleTranslator.translate(trimmedText);
  }

  /**
   * 연결 상태 확인 (구글 번역은 항상 사용 가능)
   */
  async checkConnection(): Promise<{
    available: boolean;
    modelExists: boolean;
  }> {
    return { available: true, modelExists: true };
  }

  /**
   * 사용 가능한 모델 목록 조회 (구글 번역은 모델 없음)
   */
  async getAvailableModels(): Promise<string[]> {
    return [];
  }
}
