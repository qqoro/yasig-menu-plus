import { describe, it, expect, vi } from "vitest";

// electron-log를 main.ts와 동일한 방식으로 모킹
vi.mock("electron-log", () => ({
  default: { error: vi.fn(), initialize: vi.fn() },
}));

import { wrapIpcHandler } from "../ipc-wrapper.js";

describe("wrapIpcHandler", () => {
  it("정상 실행 시 핸들러 결과를 그대로 반환해야 한다", async () => {
    const handler = vi.fn().mockResolvedValue({ path: "/test" });
    const wrapped = wrapIpcHandler("testChannel", handler);

    const result = await wrapped({} as any, { path: "/input" });

    expect(result).toEqual({ path: "/test" });
    expect(handler).toHaveBeenCalledWith({} as any, { path: "/input" });
  });

  it("핸들러에서 에러 발생 시 에러를 로깅하고 reject 해야 한다", async () => {
    const error = new Error("디스크 없음");
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = wrapIpcHandler("testChannel", handler);

    await expect(wrapped({} as any, {})).rejects.toThrow("디스크 없음");
  });

  it("ValidationError도 reject 해야 한다 (에러 메시지 유지)", async () => {
    const error = new Error("존재하지 않는 경로입니다.");
    error.name = "ValidationError";
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = wrapIpcHandler("testChannel", handler);

    await expect(wrapped({} as any, {})).rejects.toThrow(
      "존재하지 않는 경로입니다.",
    );
  });

  it("동기 핸들러도 지원해야 한다", async () => {
    const handler = vi.fn().mockReturnValue({ ok: true });
    const wrapped = wrapIpcHandler("testChannel", handler);

    const result = await wrapped({} as any, {});
    expect(result).toEqual({ ok: true });
  });
});
