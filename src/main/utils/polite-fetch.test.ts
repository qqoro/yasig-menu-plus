import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

const D = "https://www.dlsite.com/x";
const S = "https://store.steampowered.com/x";

const tooMany = (headers: Record<string, string> = {}) =>
  new Response("", { status: 429, headers });

describe("politeFetch", () => {
  const fetchMock = vi.fn();
  let politeFetch: typeof import("./polite-fetch.js").politeFetch;

  beforeEach(async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    // 사이트별 상태(모듈 변수)가 테스트끼리 섞이지 않도록 매번 새로 로드
    vi.resetModules();
    ({ politeFetch } = await import("./polite-fetch.js"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("한도 미만이면 기다리지 않는다", async () => {
    await Promise.all(Array.from({ length: 80 }, () => politeFetch(D)));
    expect(fetchMock).toHaveBeenCalledTimes(80);
  });

  it("85개 동시 호출 → 80개만 즉시, 나머지는 첫 요청 60초 뒤", async () => {
    const all = Array.from({ length: 85 }, () => politeFetch(D));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(80);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(fetchMock).toHaveBeenCalledTimes(80);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(85);
    await Promise.all(all);
  });

  it("설정 없는 사이트는 제한 없음", async () => {
    await Promise.all(Array.from({ length: 300 }, () => politeFetch(S)));
    expect(fetchMock).toHaveBeenCalledTimes(300);
  });

  it("사이트끼리 영향 없음", async () => {
    const dl = Array.from({ length: 81 }, () => politeFetch(D));
    await vi.advanceTimersByTimeAsync(0);
    await politeFetch(S);
    expect(fetchMock).toHaveBeenCalledTimes(81); // DLsite 80 + Steam 1
    await vi.runAllTimersAsync();
    await Promise.all(dl);
  });

  it("429면 Retry-After만큼 기다렸다 재시도해 성공 응답을 돌려준다", async () => {
    fetchMock
      .mockResolvedValueOnce(tooMany({ "Retry-After": "300" }))
      .mockResolvedValueOnce(new Response("ok"));
    const p = politeFetch(D);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await p).status).toBe(200);
  });

  it("429로 멈춘 동안 같은 사이트의 다른 요청도 기다린다", async () => {
    fetchMock.mockResolvedValueOnce(tooMany({ "Retry-After": "10" }));
    const first = politeFetch(D);
    await vi.advanceTimersByTimeAsync(0);
    const second = politeFetch(D);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.all([first, second]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("계속 429면 3번 재시도 후 429 응답을 그대로 돌려준다", async () => {
    fetchMock.mockImplementation(async () => tooMany());
    const p = politeFetch(S);
    await vi.runAllTimersAsync();
    expect((await p).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("마지막 시도의 429도 같은 사이트를 멈춘다", async () => {
    fetchMock.mockImplementation(async () => tooMany({ "Retry-After": "10" }));
    const first = politeFetch(S);
    await vi.advanceTimersByTimeAsync(30_000); // 재시도 3번(10초씩) 소진
    expect((await first).status).toBe(429);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const next = politeFetch(S);
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    await vi.runAllTimersAsync();
    await next;
  });

  it("Retry-After가 없으면 5초·10초·15초 간격으로 재시도", async () => {
    fetchMock.mockImplementation(async () => tooMany());
    const p = politeFetch(S);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    await p;
  });

  it("Retry-After 값이 이상하면 기본 대기로 처리", async () => {
    fetchMock
      .mockResolvedValueOnce(tooMany({ "Retry-After": "abc" }))
      .mockResolvedValueOnce(new Response("ok"));
    const p = politeFetch(S);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await p).status).toBe(200);
  });

  it("Retry-After HTTP 날짜 형식", async () => {
    vi.setSystemTime(new Date("2026-11-15T00:00:00Z"));
    fetchMock
      .mockResolvedValueOnce(
        tooMany({ "Retry-After": "Sun, 15 Nov 2026 00:00:30 GMT" }),
      )
      .mockResolvedValueOnce(new Response("ok"));
    const p = politeFetch(S);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await p).status).toBe(200);
  });

  it("Retry-After는 최대 10분까지만 기다린다", async () => {
    fetchMock
      .mockResolvedValueOnce(tooMany({ "Retry-After": "99999" }))
      .mockResolvedValueOnce(new Response("ok"));
    const p = politeFetch(S);
    await vi.advanceTimersByTimeAsync(599_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await p).status).toBe(200);
  });

  it("네트워크 오류는 재시도 없이 그대로 던진다", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(politeFetch(S)).rejects.toThrow("fetch failed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
