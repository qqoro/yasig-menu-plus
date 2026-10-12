import { describe, expect, it, vi } from "vitest";

vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

import { errorResult, okResult, runTool } from "./tool-result.js";

describe("tool-result", () => {
  it("okResult는 JSON 텍스트 content를 만들어야 한다", () => {
    expect(okResult({ a: 1 })).toEqual({
      content: [{ type: "text", text: '{"a":1}' }],
    });
  });

  it("errorResult는 isError와 메시지를 담아야 한다", () => {
    expect(errorResult("boom")).toEqual({
      isError: true,
      content: [{ type: "text", text: "boom" }],
    });
  });

  it("runTool은 성공 결과를 okResult로 감싸야 한다", async () => {
    const result = await runTool("t", "ctx", async () => ({ ok: true }));
    expect(result.isError).toBeUndefined();
    expect(result.content[0]).toEqual({ type: "text", text: '{"ok":true}' });
  });

  it("runTool은 예외를 던지지 않고 isError 응답으로 바꿔야 한다", async () => {
    const result = await runTool("t", "ctx", async () => {
      throw new Error("실패했습니다");
    });
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: "text", text: "실패했습니다" });
  });
});
