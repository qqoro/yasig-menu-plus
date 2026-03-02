/**
 * 번역 서비스 인터페이스
 *
 * 모든 번역 서비스가 구현해야 할 공통 인터페이스 정의
 */

export interface TranslationResult {
  translatedText: string;
  source: "google";
}

export interface Translator {
  /**
   * 텍스트를 한국어로 번역
   * @param text 번역할 텍스트
   * @returns 번역 결과
   */
  translate(text: string): Promise<TranslationResult>;

  /**
   * 서비스 사용 가능 여부 확인
   * @returns 사용 가능하면 true
   */
  isAvailable(): Promise<boolean> | boolean;
}

/**
 * 번역 가능한 언어 (향후 확장을 위한 enum)
 */
export enum TranslationLanguage {
  Korean = "ko",
  Japanese = "ja",
  English = "en",
}
