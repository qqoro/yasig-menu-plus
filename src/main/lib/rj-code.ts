/**
 * DLSite 작품 코드 (RJ/BJ/VJ) 관련 유틸리티
 */

/** RJ/BJ/VJ 코드 정규식 */
export const RJ_CODE_REGEX = /[RBV]J\d{6,8}/i;

/**
 * 문자열에서 RJ/BJ/VJ 코드 추출
 * @returns 매칭된 코드 또는 undefined
 */
export function extractRjCode(input: string): string | undefined {
  return RJ_CODE_REGEX.exec(input)?.[0];
}

/**
 * 문자열에 RJ/BJ/VJ 코드가 포함되어 있는지 확인
 */
export function hasRjCode(input: string): boolean {
  return RJ_CODE_REGEX.test(input);
}
