import { beforeEach, describe, expect, it, vi } from "vitest";

// ========== 모듈 모킹 ==========

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  BrowserWindow: { getAllWindows: () => [] },
}));

vi.mock("../db/db-manager.js", () => ({ db: vi.fn() }));

vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  }),
}));

const calls: string[] = [];
const mockScan = vi.hoisted(() => vi.fn());
const mockCollect = vi.hoisted(() => vi.fn());
const mockTranslate = vi.hoisted(() => vi.fn());
const mockSetLastRefreshedAt = vi.hoisted(() => vi.fn());
const mockGetLibraryPaths = vi.hoisted(() => vi.fn(() => []));

vi.mock("./home-scan.js", () => ({
  scanLibraryPaths: mockScan,
  scanFolder: vi.fn(),
}));
vi.mock("./collector.js", () => ({ collectAllGames: mockCollect }));
vi.mock("./translation.js", () => ({ translateAllTitles: mockTranslate }));
vi.mock("../store.js", () => ({
  setLastRefreshedAt: mockSetLastRefreshedAt,
  getLastRefreshedAt: vi.fn(),
  getLibraryPaths: mockGetLibraryPaths,
  getOfflineLibraryPaths: vi.fn(() => []),
}));
// 작업 상태 저장소는 실제 모듈을 쓴다 (전송만 막는다)
vi.mock("../utils/broadcast.js", () => ({ broadcast: vi.fn() }));

import { resetJobRegistryForTest, startJob } from "../services/job-registry.js";
import { autoScanLibraries } from "./home-library.js";
import { runFullSync, runFullSyncHandler } from "./sync.js";

/** 끝나지 않는 수집 작업을 하나 띄워 두고, 끝낼 함수를 돌려준다 */
function holdCollectJob() {
  let finish!: () => void;
  const pending = new Promise<{
    total: number;
    success: number;
    failed: number;
    force: boolean;
  }>((resolve) => {
    finish = () => resolve({ total: 0, success: 0, failed: 0, force: false });
  });
  const started = startJob("collect", () => pending);
  if (!started.started) throw new Error("작업 시작 실패");
  return async () => {
    finish();
    await started.done;
  };
}

function makeCtx() {
  return { update: vi.fn() };
}

describe("runFullSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.length = 0;
    mockScan.mockImplementation(async () => {
      calls.push("scan");
      return { addedCount: 0, deletedCount: 2 };
    });
    mockCollect.mockImplementation(async () => {
      calls.push("collect");
      return { total: 4, success: 3, failed: 1, force: false };
    });
    mockTranslate.mockImplementation(async () => {
      calls.push("translate");
      return { total: 4, success: 4, failed: 0 };
    });
  });

  it("스캔 → 수집 → 번역 순서로 실행하고 단계 번호를 갱신", async () => {
    const ctx = makeCtx();

    const result = await runFullSync(["/lib"], ctx);

    expect(calls).toEqual(["scan", "collect", "translate"]);
    const stepIndexes = ctx.update.mock.calls
      .map((c) => c[0].stepIndex)
      .filter((v) => v !== undefined);
    expect(stepIndexes).toEqual([1, 2, 3]);
    expect(result).toEqual({
      scan: { ok: true, deletedCount: 2 },
      collect: { ok: true, success: 3, failed: 1 },
      translate: { ok: true, success: 4, failed: 0 },
    });
  });

  it("수집은 미수집 게임만 대상 (force=false)", async () => {
    await runFullSync(["/lib"], makeCtx());

    expect(mockCollect).toHaveBeenCalledWith(false, expect.any(Function));
    expect(mockTranslate).toHaveBeenCalledWith(false, expect.any(Function));
  });

  it("스캔이 실패해도 수집과 번역은 진행하고 마지막 동기화 시간은 갱신하지 않음", async () => {
    mockScan.mockRejectedValueOnce(new Error("드라이브 없음"));

    const result = await runFullSync(["/lib"], makeCtx());

    expect(result.scan).toEqual({ ok: false, error: "Error: 드라이브 없음" });
    expect(mockCollect).toHaveBeenCalled();
    expect(mockTranslate).toHaveBeenCalled();
    expect(mockSetLastRefreshedAt).not.toHaveBeenCalled();
  });

  it("스캔이 성공하면 마지막 동기화 시간을 ISO 문자열로 저장", async () => {
    await runFullSync(["/lib"], makeCtx());

    expect(mockSetLastRefreshedAt).toHaveBeenCalledTimes(1);
    const [timestamp] = mockSetLastRefreshedAt.mock.calls[0];
    expect(new Date(timestamp).toISOString()).toBe(timestamp);
  });

  it("수집 단계의 진행률은 ctx로 전달", async () => {
    mockCollect.mockImplementationOnce(async (_force, onProgress) => {
      onProgress({ current: 1, total: 4, gameTitle: "가상 게임" });
      return { total: 4, success: 4, failed: 0, force: false };
    });
    const ctx = makeCtx();

    await runFullSync(["/lib"], ctx);

    expect(ctx.update).toHaveBeenCalledWith({
      current: 1,
      total: 4,
      gameTitle: "가상 게임",
    });
  });
});

describe("runFullSyncHandler", () => {
  beforeEach(() => {
    resetJobRegistryForTest();
    vi.clearAllMocks();
  });

  it("다른 작업이 실행 중이면 busy를 반환하고 동기화를 시작하지 않음", async () => {
    const finishCollect = holdCollectJob();

    const result = await runFullSyncHandler({ sender: {} } as any, {
      sourcePaths: ["/lib"],
    });

    expect(result).toEqual({ started: false, reason: "busy" });
    expect(mockScan).not.toHaveBeenCalled();
    await finishCollect();
  });
});

describe("autoScanLibraries", () => {
  beforeEach(() => {
    resetJobRegistryForTest();
    vi.clearAllMocks();
  });

  it("작업이 실행 중이면 포커스 자동 스캔을 건너뜀", async () => {
    const finishCollect = holdCollectJob();

    const result = await autoScanLibraries();

    expect(result).toEqual({ addedCount: 0, deletedCount: 0 });
    expect(mockGetLibraryPaths).not.toHaveBeenCalled();
    await finishCollect();
  });
});
