import { describe, expect, it } from "vitest";
import { expandErrorsHook } from "./log-error-format.js";

/**
 * Node fetch 실패와 같은 모양의 에러 (stack은 메시지 한 줄, 원인은 cause에만 있음)
 */
function createFetchLikeError(): TypeError {
  const cause = Object.assign(
    new Error("getaddrinfo ENOTFOUND example.invalid"),
    {
      code: "ENOTFOUND",
      syscall: "getaddrinfo",
    },
  );
  const error = new TypeError("fetch failed", { cause });
  error.stack = "TypeError: fetch failed";
  return error;
}

describe("expandErrorsHook", () => {
  it("Error 인자를 cause와 추가 속성까지 담은 문자열로 바꾼다", () => {
    const result = expandErrorsHook({
      data: ["에러: C:\\games\\RJ000000", createFetchLikeError()],
    });

    const text = result.data[1];
    expect(typeof text).toBe("string");
    expect(text).toContain("fetch failed");
    expect(text).toContain("getaddrinfo ENOTFOUND example.invalid");
    expect(text).toContain("ENOTFOUND");
    expect(text).toContain("getaddrinfo");
  });

  it("stack 프레임이 있으면 그대로 남긴다", () => {
    const error = new Error("boom");
    const result = expandErrorsHook({ data: [error] });

    expect(result.data[0]).toContain("Error: boom");
    expect(result.data[0]).toContain("    at ");
  });

  it("AggregateError의 하위 에러도 남긴다", () => {
    const error = new AggregateError(
      [new Error("connect ECONNREFUSED 127.0.0.1:443")],
      "연결 실패",
    );
    const result = expandErrorsHook({ data: [error] });

    expect(result.data[0]).toContain("connect ECONNREFUSED 127.0.0.1:443");
  });

  it("Error가 아닌 인자는 건드리지 않는다", () => {
    const payload = { count: 3 };
    const result = expandErrorsHook({ data: ["메시지", 42, payload] });

    expect(result.data).toEqual(["메시지", 42, payload]);
    expect(result.data[2]).toBe(payload);
  });

  it("원본 메시지를 변경하지 않는다", () => {
    const error = createFetchLikeError();
    const message = { data: [error], level: "error" };
    const result = expandErrorsHook(message);

    expect(message.data[0]).toBe(error);
    expect(result).not.toBe(message);
    expect(result.level).toBe("error");
  });
});
