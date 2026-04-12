import { describe, it, expect } from "vitest";
import { RJ_CODE_REGEX, extractRjCode, hasRjCode } from "../rj-code";

describe("extractRjCode", () => {
  it("RJ 코드를 추출한다 (RJ123456)", () => {
    expect(extractRjCode("RJ123456")).toBe("RJ123456");
  });

  it("BJ 코드를 추출한다 (BJ12345678)", () => {
    expect(extractRjCode("BJ12345678")).toBe("BJ12345678");
  });

  it("VJ 코드를 추출한다 (VJ123456)", () => {
    expect(extractRjCode("VJ123456")).toBe("VJ123456");
  });

  it("소문자로 입력해도 대소문자 구분 없이 추출한다 (rj123456)", () => {
    expect(extractRjCode("rj123456")).toBe("rj123456");
  });

  it("소문자로 입력해도 대소문자 구분 없이 추출한다 (bj123456)", () => {
    expect(extractRjCode("bj123456")).toBe("bj123456");
  });

  it("코드가 없으면 undefined를 반환한다", () => {
    expect(extractRjCode("게임 타이틀")).toBeUndefined();
  });

  it("문자열 중간에 코드가 있어도 추출한다", () => {
    expect(extractRjCode("멋진 게임 [RJ123456] 특별판")).toBe("RJ123456");
  });
});

describe("hasRjCode", () => {
  it("코드가 포함되어 있으면 true를 반환한다", () => {
    expect(hasRjCode("RJ123456")).toBe(true);
  });

  it("코드가 포함되어 있지 않으면 false를 반환한다", () => {
    expect(hasRjCode("일반 게임 타이틀")).toBe(false);
  });
});

describe("RJ_CODE_REGEX", () => {
  it("6자리 숫자와 매칭된다", () => {
    expect(RJ_CODE_REGEX.test("RJ123456")).toBe(true);
  });

  it("7자리 숫자와 매칭된다", () => {
    expect(RJ_CODE_REGEX.test("RJ1234567")).toBe(true);
  });

  it("8자리 숫자와 매칭된다", () => {
    expect(RJ_CODE_REGEX.test("RJ12345678")).toBe(true);
  });

  it("5자리 숫자는 매칭되지 않는다", () => {
    expect(RJ_CODE_REGEX.test("RJ12345")).toBe(false);
  });
});
