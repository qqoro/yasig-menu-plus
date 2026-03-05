import { describe, expect, it } from "vitest";
import {
  ENGLISH_PREFIXES,
  KOREAN_PREFIXES,
  KOREAN_TO_ENGLISH,
  ENGLISH_TO_KOREAN,
  ALL_VALID_PREFIXES,
  normalizeToEnglish,
  KOREAN_PREFIX_PARTIALS,
} from "./search-prefix.js";

/**
 * search-prefix 유틸리티 테스트
 * 실행: pnpm test
 */

// ============================================
// 상수 테스트
// ============================================
describe("검색 prefix 상수", () => {
  it("ENGLISH_PREFIXES가 올바른 값을 포함", () => {
    expect(ENGLISH_PREFIXES).toContain("tag");
    expect(ENGLISH_PREFIXES).toContain("circle");
    expect(ENGLISH_PREFIXES).toContain("category");
    expect(ENGLISH_PREFIXES).toContain("provider");
    expect(ENGLISH_PREFIXES).toContain("id");
    expect(ENGLISH_PREFIXES.length).toBe(5);
  });

  it("KOREAN_PREFIXES가 올바른 값을 포함", () => {
    expect(KOREAN_PREFIXES).toContain("태그");
    expect(KOREAN_PREFIXES).toContain("서클");
    expect(KOREAN_PREFIXES).toContain("카테고리");
    expect(KOREAN_PREFIXES).toContain("제공자");
    expect(KOREAN_PREFIXES).toContain("아이디");
    expect(KOREAN_PREFIXES.length).toBe(5);
  });

  it("KOREAN_TO_ENGLISH 매핑이 올바름", () => {
    expect(KOREAN_TO_ENGLISH["태그"]).toBe("tag");
    expect(KOREAN_TO_ENGLISH["서클"]).toBe("circle");
    expect(KOREAN_TO_ENGLISH["카테고리"]).toBe("category");
    expect(KOREAN_TO_ENGLISH["제공자"]).toBe("provider");
    expect(KOREAN_TO_ENGLISH["아이디"]).toBe("id");
  });

  it("ENGLISH_TO_KOREAN 매핑이 올바름", () => {
    expect(ENGLISH_TO_KOREAN["tag"]).toBe("태그");
    expect(ENGLISH_TO_KOREAN["circle"]).toBe("서클");
    expect(ENGLISH_TO_KOREAN["category"]).toBe("카테고리");
    expect(ENGLISH_TO_KOREAN["provider"]).toBe("제공자");
    expect(ENGLISH_TO_KOREAN["id"]).toBe("아이디");
  });

  it("ALL_VALID_PREFIXES가 한글과 영문 모두 포함", () => {
    expect(ALL_VALID_PREFIXES).toContain("tag");
    expect(ALL_VALID_PREFIXES).toContain("태그");
    expect(ALL_VALID_PREFIXES.length).toBe(10); // 5 영문 + 5 한글
  });

  it("한글-영문 매핑이 서로 일치", () => {
    KOREAN_PREFIXES.forEach((korean) => {
      const english = KOREAN_TO_ENGLISH[korean];
      const backToKorean = ENGLISH_TO_KOREAN[english];
      expect(backToKorean).toBe(korean);
    });
  });
});

// ============================================
// normalizeToEnglish 테스트
// ============================================
describe("normalizeToEnglish", () => {
  describe("영문 prefix 입력", () => {
    const testCases: [string, string | null, string][] = [
      ["tag", "tag", "tag"],
      ["circle", "circle", "circle"],
      ["category", "category", "category"],
      ["provider", "provider", "provider"],
      ["id", "id", "id"],
    ];

    it.each(testCases)("%s → %s (%s)", (input, expected, _desc) => {
      expect(normalizeToEnglish(input)).toBe(expected);
    });
  });

  describe("한글 prefix 입력", () => {
    const testCases: [string, string | null, string][] = [
      ["태그", "tag", "태그 → tag"],
      ["서클", "circle", "서클 → circle"],
      ["카테고리", "category", "카테고리 → category"],
      ["제공자", "provider", "제공자 → provider"],
      ["아이디", "id", "아이디 → id"],
    ];

    it.each(testCases)("%s → %s (%s)", (input, expected, _desc) => {
      expect(normalizeToEnglish(input)).toBe(expected);
    });
  });

  describe("유효하지 않은 prefix", () => {
    const testCases: [string, string, string][] = [
      ["unknown", "존재하지 않는 영문", "unknown → null"],
      ["알수없", "존재하지 않는 한글", "알수없 → null"],
      ["", "빈 문자열", "빈 문자열 → null"],
      ["TAG", "대문자 (case-sensitive)", "TAG → null"],
      ["Tag", "대소문자 혼합", "Tag → null"],
      ["태  그", "공백 포함", "공백 포함 → null"],
    ];

    it.each(testCases)("%s → null (%s)", (input, _desc1, _desc2) => {
      expect(normalizeToEnglish(input)).toBe(null);
    });
  });
});

// ============================================
// KOREAN_PREFIX_PARTIALS 테스트
// ============================================
describe("KOREAN_PREFIX_PARTIALS", () => {
  it("각 한글 prefix에 대한 부분 매칭 배열이 존재", () => {
    expect(KOREAN_PREFIX_PARTIALS["태그"]).toBeDefined();
    expect(KOREAN_PREFIX_PARTIALS["서클"]).toBeDefined();
    expect(KOREAN_PREFIX_PARTIALS["카테고리"]).toBeDefined();
    expect(KOREAN_PREFIX_PARTIALS["제공자"]).toBeDefined();
    expect(KOREAN_PREFIX_PARTIALS["아이디"]).toBeDefined();
  });

  it("태그 부분 매칭에 올바른 값 포함", () => {
    const partials = KOREAN_PREFIX_PARTIALS["태그"];
    expect(partials).toContain("ㅌ"); // 초성
    expect(partials).toContain("태"); // 첫 글자
    expect(partials).toContain("태ㄱ"); // 첫 글자 + 받침 초성
    expect(partials).toContain("태그"); // 완성
  });

  it("카테고리 부분 매칭에 올바른 값 포함", () => {
    const partials = KOREAN_PREFIX_PARTIALS["카테고리"];
    expect(partials).toContain("ㅋ"); // 초성
    expect(partials).toContain("카"); // 첫 글자
    expect(partials).toContain("카테"); // 두 글자
    expect(partials).toContain("카테고리"); // 완성
  });

  it("모든 부분 매칭의 마지막 값은 완성된 단어", () => {
    Object.entries(KOREAN_PREFIX_PARTIALS).forEach(([key, partials]) => {
      const lastPartial = partials[partials.length - 1];
      expect(lastPartial).toBe(key);
    });
  });
});
