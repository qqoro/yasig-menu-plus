import { describe, expect, it } from "vitest";
import {
  isLogLevel,
  moreVerboseLevel,
  parseLogLevelArg,
  resolveFileLogLevel,
} from "./log-level.js";

describe("isLogLevel", () => {
  it.each([
    { input: "error", expected: true, desc: "error는 유효" },
    { input: "silly", expected: true, desc: "silly는 유효" },
    { input: "DEBUG", expected: true, desc: "대문자도 유효" },
    { input: " info ", expected: true, desc: "앞뒤 공백은 무시" },
    { input: "trace", expected: false, desc: "지원하지 않는 레벨은 무효" },
    { input: "", expected: false, desc: "빈 문자열은 무효" },
    { input: undefined, expected: false, desc: "undefined는 무효" },
    { input: 3, expected: false, desc: "숫자는 무효" },
  ])("$desc", ({ input, expected }) => {
    expect(isLogLevel(input)).toBe(expected);
  });
});

describe("parseLogLevelArg", () => {
  it("--log-level=debug 형태를 인식", () => {
    expect(parseLogLevelArg(["app.exe", "--log-level=debug"])).toBe("debug");
  });

  it("--log-level debug 형태를 인식", () => {
    expect(parseLogLevelArg(["app.exe", "--log-level", "debug"])).toBe("debug");
  });

  it("대소문자를 구분하지 않음", () => {
    expect(parseLogLevelArg(["--log-level=WARN"])).toBe("warn");
  });

  it("인자가 없으면 null", () => {
    expect(parseLogLevelArg(["app.exe", "--other"])).toBeNull();
  });

  it("잘못된 레벨 값은 무시하고 null", () => {
    expect(parseLogLevelArg(["--log-level=trace"])).toBeNull();
  });

  it("값이 빠진 --log-level은 무시", () => {
    expect(parseLogLevelArg(["--log-level"])).toBeNull();
  });

  it("뒤에 다른 플래그가 오면 값으로 삼지 않음", () => {
    expect(parseLogLevelArg(["--log-level", "--enable-logging"])).toBeNull();
  });

  it("여러 번 지정되면 마지막 값이 이김", () => {
    expect(parseLogLevelArg(["--log-level=warn", "--log-level=debug"])).toBe(
      "debug",
    );
  });
});

describe("moreVerboseLevel", () => {
  it.each([
    { a: "info", b: "debug", expected: "debug", desc: "debug가 info보다 상세" },
    { a: "debug", b: "info", expected: "debug", desc: "인자 순서 무관" },
    { a: "error", b: "warn", expected: "warn", desc: "warn이 error보다 상세" },
    { a: "silly", b: "debug", expected: "silly", desc: "silly가 가장 상세" },
    { a: "info", b: "info", expected: "info", desc: "같으면 그대로" },
  ] as const)("$desc", ({ a, b, expected }) => {
    expect(moreVerboseLevel(a, b)).toBe(expected);
  });
});

describe("resolveFileLogLevel", () => {
  it("아무것도 없으면 기본값 info", () => {
    expect(resolveFileLogLevel([], {})).toBe("info");
  });

  it("환경변수 YMP_LOG_LEVEL을 사용", () => {
    expect(resolveFileLogLevel([], { YMP_LOG_LEVEL: "warn" })).toBe("warn");
  });

  it("실행 인자가 환경변수보다 우선", () => {
    expect(
      resolveFileLogLevel(["--log-level=debug"], { YMP_LOG_LEVEL: "error" }),
    ).toBe("debug");
  });

  it("잘못된 환경변수 값은 무시하고 기본값", () => {
    expect(resolveFileLogLevel([], { YMP_LOG_LEVEL: "loud" })).toBe("info");
  });

  it("잘못된 실행 인자는 환경변수로 폴백", () => {
    expect(
      resolveFileLogLevel(["--log-level=loud"], { YMP_LOG_LEVEL: "debug" }),
    ).toBe("debug");
  });

  it("기본값을 바꿀 수 있음", () => {
    expect(resolveFileLogLevel([], {}, "silly")).toBe("silly");
  });
});
