import { afterEach, describe, it, expect, vi } from "vitest";

// logger 모듈 모킹
const mockLog = vi.hoisted(() => ({
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
  debug: vi.fn(),
}));
vi.mock("../logger.js", () => ({
  createLogger: () => mockLog,
  logger: mockLog,
}));

import { wrapIpcHandler } from "../ipc-wrapper.js";

describe("wrapIpcHandler", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

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

  it("에러 로그에 채널명과 원본 에러를 함께 남긴다", async () => {
    const error = new Error("디스크 없음");
    const wrapped = wrapIpcHandler(
      "playGame",
      vi.fn().mockRejectedValue(error),
    );

    await expect(wrapped({} as any, {})).rejects.toThrow("디스크 없음");

    // 스택트레이스를 살리려면 에러 객체를 그대로 넘겨야 한다
    expect(mockLog.error).toHaveBeenCalledWith(
      expect.stringContaining("playGame"),
      error,
    );
  });

  it("정상 호출은 로그를 남기지 않는다 (화면당 수십 회 호출되는 채널 대비)", async () => {
    const wrapped = wrapIpcHandler(
      "detectRpgMaker",
      vi.fn().mockResolvedValue({}),
    );

    await wrapped({} as any, {});

    expect(mockLog.debug).not.toHaveBeenCalled();
    expect(mockLog.info).not.toHaveBeenCalled();
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it("3초 이상 걸린 핸들러는 warn으로 남긴다", async () => {
    const nowSpy = vi.spyOn(Date, "now");
    nowSpy.mockReturnValueOnce(0).mockReturnValueOnce(3200);

    const wrapped = wrapIpcHandler(
      "refreshList",
      vi.fn().mockResolvedValue({}),
    );
    await wrapped({} as any, {});

    expect(mockLog.warn).toHaveBeenCalledWith(
      expect.stringContaining("refreshList 응답 지연: 3200ms"),
    );
  });
});
