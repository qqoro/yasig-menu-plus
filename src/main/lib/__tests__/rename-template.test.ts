import { describe, expect, it } from "vitest";
import { applyTemplate, type TemplateContext } from "../rename-template.js";

/**
 * 파일명 리네임 템플릿 치환 함수 테스트
 * 실행: pnpm test -- src/main/lib/__tests__/rename-template.test.ts
 */

/** 테스트용 기본 컨텍스트 (모든 필드 채움) */
function createFullContext(): TemplateContext {
  return {
    externalId: "RJ123456",
    title: "어떤게임",
    originalTitle: "あるゲーム",
    translatedTitle: "어떤 게임",
    maker: "서클A",
    makers: ["서클A", "서클B"],
    category: "RPG",
    categories: ["RPG", "어드벤처"],
    publishDate: "2024-06-15",
    publishYear: "2024",
    tag: "판타지",
    tags: ["판타지", "모험"],
    provider: "DLSite",
  };
}

// ============================================
// 기본 변수 치환
// ============================================
describe("기본 변수 치환", () => {
  it("외부ID와 제목 치환: '[{externalId}] {title}'", () => {
    const result = applyTemplate("[{externalId}] {title}", createFullContext());
    expect(result).toBe("[RJ123456] 어떤게임");
  });

  it("Steam 외부ID (숫자 문자열): '[{externalId}] {title}'", () => {
    const ctx = { ...createFullContext(), externalId: "123456" };
    const result = applyTemplate("[{externalId}] {title}", ctx);
    expect(result).toBe("[123456] 어떤게임");
  });

  it("제목만 치환: '{title}'", () => {
    const result = applyTemplate("{title}", createFullContext());
    expect(result).toBe("어떤게임");
  });

  it("여러 변수 조합: '{maker} - {title}'", () => {
    const result = applyTemplate("{maker} - {title}", createFullContext());
    expect(result).toBe("서클A - 어떤게임");
  });
});

// ============================================
// 모든 13개 변수 치환
// ============================================
describe("모든 13개 변수 치환", () => {
  it("모든 변수가 정상 치환됨 (구분자 |는 금지 문자라 제거됨)", () => {
    const template =
      "{externalId}|{title}|{originalTitle}|{translatedTitle}|" +
      "{maker}|{makers}|{category}|{categories}|" +
      "{publishDate}|{publishYear}|{tag}|{tags}|{provider}";

    const result = applyTemplate(template, createFullContext());

    expect(result).toBe(
      "RJ123456어떤게임あるゲーム어떤 게임" +
        "서클A서클A, 서클BRPGRPG, 어드벤처" +
        "2024-06-152024판타지판타지, 모험DLSite",
    );
  });

  it("배열 변수(makers, categories, tags)는 쉼표+공백으로 결합", () => {
    const ctx = createFullContext();
    expect(applyTemplate("{makers}", ctx)).toBe("서클A, 서클B");
    expect(applyTemplate("{categories}", ctx)).toBe("RPG, 어드벤처");
    expect(applyTemplate("{tags}", ctx)).toBe("판타지, 모험");
  });
});

// ============================================
// null/빈값 → 빈 문자열
// ============================================
describe("null/빈값 처리", () => {
  it("externalId가 null → 빈 문자열로 치환", () => {
    const ctx = { ...createFullContext(), externalId: null };
    const result = applyTemplate("[{externalId}] {title}", ctx);
    expect(result).toBe("[] 어떤게임");
  });

  it("translatedTitle이 null → 빈 문자열로 치환", () => {
    const ctx = { ...createFullContext(), translatedTitle: null };
    const result = applyTemplate("{title} ({translatedTitle})", ctx);
    expect(result).toBe("어떤게임 ()");
  });

  it("maker가 null → 빈 문자열로 치환 (앞 공백은 트리밍됨)", () => {
    const ctx = { ...createFullContext(), maker: null };
    const result = applyTemplate("{maker} - {title}", ctx);
    expect(result).toBe("- 어떤게임");
  });

  it("모든 값이 null/빈 배열인 컨텍스트", () => {
    const emptyCtx: TemplateContext = {
      externalId: null,
      title: "게임명",
      originalTitle: "",
      translatedTitle: null,
      maker: null,
      makers: [],
      category: null,
      categories: [],
      publishDate: null,
      publishYear: null,
      tag: null,
      tags: [],
      provider: null,
    };
    const template =
      "[{externalId}] {title} ({originalTitle}) [{maker}] " +
      "<{category}> {publishDate} {provider}";

    const result = applyTemplate(template, emptyCtx);

    // <>는 금지 문자라 제거되고, 연속 공백은 정리되며 끝 공백은 트리밍됨
    expect(result).toBe("[] 게임명 () []");
  });

  it("빈 문자열도 빈 문자열로 치환", () => {
    const ctx = { ...createFullContext(), originalTitle: "" };
    const result = applyTemplate("{originalTitle}", ctx);
    expect(result).toBe("");
  });
});

// ============================================
// 템플릿에 변수 없음 → 원본 그대로 반환
// ============================================
describe("변수 없는 템플릿", () => {
  it("변수가 없으면 원본 문자열 그대로 반환", () => {
    const result = applyTemplate("고정 파일명", createFullContext());
    expect(result).toBe("고정 파일명");
  });

  it("빈 템플릿 → 빈 문자열 반환", () => {
    const result = applyTemplate("", createFullContext());
    expect(result).toBe("");
  });

  it("중괄호가 불완전한 템플릿 → 치환하지 않고 그대로", () => {
    const result = applyTemplate("{title 텍스트", createFullContext());
    expect(result).toBe("{title 텍스트");
  });

  it("닫는 중괄호만 있는 템플릿 → 그대로 반환", () => {
    const result = applyTemplate("텍스트} 더 텍스트", createFullContext());
    expect(result).toBe("텍스트} 더 텍스트");
  });
});

// ============================================
// 동일 변수 여러 번 사용
// ============================================
describe("동일 변수 반복 사용", () => {
  it("같은 변수가 여러 번 나오면 모두 치환", () => {
    const result = applyTemplate("{title} - {title}", createFullContext());
    expect(result).toBe("어떤게임 - 어떤게임");
  });

  it("{title} 3회 반복 (구분자 /는 금지 문자라 제거됨)", () => {
    const result = applyTemplate(
      "{title}/{title}/{title}",
      createFullContext(),
    );
    expect(result).toBe("어떤게임어떤게임어떤게임");
  });
});

// ============================================
// 파일명 정제 (sanitize)
// ============================================
describe("파일명 정제", () => {
  it('Windows 금지 문자(\\ / : * ? " < > |)를 모두 제거', () => {
    const result = applyTemplate('a\\b/c:d*e?f"g<h>i|j', createFullContext());
    expect(result).toBe("abcdefghij");
  });

  it("변수 값에 포함된 금지 문자도 제거", () => {
    const ctx = { ...createFullContext(), title: "어떤: 게임?" };
    const result = applyTemplate("{title}", ctx);
    expect(result).toBe("어떤 게임");
  });

  it("연속 공백은 단일 공백으로 정리", () => {
    const result = applyTemplate("{maker}    {title}", createFullContext());
    expect(result).toBe("서클A 어떤게임");
  });

  it("앞뒤 공백은 트리밍", () => {
    const result = applyTemplate(" {title} ", createFullContext());
    expect(result).toBe("어떤게임");
  });
});

// ============================================
// 배열 필드 단일값
// ============================================
describe("배열 필드 단일값", () => {
  it("makers 배열 요소가 1개면 쉼표 없이 출력", () => {
    const ctx = { ...createFullContext(), makers: ["서클A"] };
    expect(applyTemplate("{makers}", ctx)).toBe("서클A");
  });

  it("makers 배열이 빈 배열이면 빈 문자열", () => {
    const ctx = { ...createFullContext(), makers: [] };
    expect(applyTemplate("{makers}", ctx)).toBe("");
  });
});
