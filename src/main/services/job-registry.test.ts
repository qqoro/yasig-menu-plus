import { beforeEach, describe, expect, it, vi } from "vitest";

// ========== 모듈 모킹 ==========

const mockBroadcast = vi.hoisted(() => vi.fn());
vi.mock("../utils/broadcast.js", () => ({
  broadcast: mockBroadcast,
}));

vi.mock("electron", () => ({
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

import {
  getJobStatus,
  isJobRunning,
  resetJobRegistryForTest,
  setPendingBotBlock,
  startJob,
  type JobContext,
} from "./job-registry.js";

/** 바깥에서 resolve/reject 할 수 있는 promise */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const IDLE = {
  kind: null,
  step: null,
  stepIndex: 0,
  stepCount: 0,
  current: 0,
  total: 0,
  gameTitle: "",
  pendingBotBlock: null,
};

const COLLECT_RESULT = { total: 1, success: 1, failed: 0, force: false };

function lastBroadcast(channel: string) {
  const calls = mockBroadcast.mock.calls.filter((c) => c[0] === channel);
  return calls[calls.length - 1]?.[1];
}

describe("job-registry", () => {
  beforeEach(() => {
    resetJobRegistryForTest();
    mockBroadcast.mockClear();
  });

  it("기본 상태는 대기", () => {
    expect(getJobStatus()).toEqual(IDLE);
    expect(isJobRunning()).toBe(false);
  });

  it("startJob은 kind를 설정하고 스냅샷을 전송", () => {
    const d = deferred<typeof COLLECT_RESULT>();
    const result = startJob("collect", () => d.promise);

    expect(result.started).toBe(true);
    expect(getJobStatus().kind).toBe("collect");
    expect(isJobRunning()).toBe(true);
    expect(mockBroadcast).toHaveBeenCalledWith(
      "jobStatusChanged",
      expect.objectContaining({ kind: "collect" }),
    );
    d.resolve(COLLECT_RESULT);
  });

  it("실행 중이면 새 작업을 거부하고 fn을 호출하지 않음", () => {
    const d = deferred<typeof COLLECT_RESULT>();
    startJob("collect", () => d.promise);

    const second = vi.fn();
    const result = startJob("translate", second);

    expect(result).toEqual({ started: false, reason: "busy" });
    expect(second).not.toHaveBeenCalled();
    d.resolve(COLLECT_RESULT);
  });

  it("ctx.update는 전체 스냅샷을 전송", () => {
    const d = deferred<typeof COLLECT_RESULT>();
    let ctx!: JobContext;
    startJob("collect", (c) => {
      ctx = c;
      return d.promise;
    });

    ctx.update({ current: 3, total: 10, gameTitle: "가상 게임" });

    expect(lastBroadcast("jobStatusChanged")).toEqual({
      ...IDLE,
      kind: "collect",
      current: 3,
      total: 10,
      gameTitle: "가상 게임",
    });
    d.resolve(COLLECT_RESULT);
  });

  it("성공하면 대기로 돌아가고 jobFinished를 전송", async () => {
    const d = deferred<typeof COLLECT_RESULT>();
    const result = startJob("collect", () => d.promise);
    if (!result.started) throw new Error("시작 실패");

    d.resolve(COLLECT_RESULT);
    await result.done;

    expect(getJobStatus()).toEqual(IDLE);
    expect(lastBroadcast("jobStatusChanged")).toEqual(IDLE);
    expect(mockBroadcast).toHaveBeenCalledWith("jobFinished", {
      kind: "collect",
      ok: true,
      result: COLLECT_RESULT,
    });
  });

  it("fn이 실패해도 대기로 돌아가고 오류를 전송하며 다음 작업을 받음", async () => {
    const result = startJob("collect", () => Promise.reject(new Error("실패")));
    if (!result.started) throw new Error("시작 실패");

    await result.done;

    expect(getJobStatus()).toEqual(IDLE);
    expect(mockBroadcast).toHaveBeenCalledWith("jobFinished", {
      kind: "collect",
      ok: false,
      error: "Error: 실패",
    });
    const next = startJob("translate", () =>
      Promise.resolve({ total: 0, success: 0, failed: 0 }),
    );
    expect(next.started).toBe(true);
  });

  it("pendingBotBlock은 kind와 무관하게 유지", () => {
    const block = { gamePath: "/g/a", gameTitle: "가상" };
    setPendingBotBlock(block);
    expect(getJobStatus()).toEqual({ ...IDLE, pendingBotBlock: block });
    expect(lastBroadcast("jobStatusChanged")).toEqual({
      ...IDLE,
      pendingBotBlock: block,
    });

    // 작업 시작으로 다른 필드가 초기화돼도 봇 인증 대기는 남는다
    const d = deferred<typeof COLLECT_RESULT>();
    startJob("collect", () => d.promise);
    expect(getJobStatus().pendingBotBlock).toEqual(block);

    setPendingBotBlock(null);
    expect(getJobStatus().pendingBotBlock).toBeNull();
    d.resolve(COLLECT_RESULT);
  });
});
