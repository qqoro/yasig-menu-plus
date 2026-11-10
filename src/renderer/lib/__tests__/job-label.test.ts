import { describe, expect, it } from "vitest";
import type { JobStatus, SyncResult } from "../../../main/events.js";
import { formatSyncProgress, formatSyncSummary } from "../job-label";

const IDLE: JobStatus = {
  kind: null,
  step: null,
  stepIndex: 0,
  stepCount: 0,
  current: 0,
  total: 0,
  gameTitle: "",
  pendingBotBlock: null,
};

const SCAN_OK: SyncResult["scan"] = { ok: true, deletedCount: 0 };

describe("formatSyncProgress", () => {
  it("단계 번호, 단계명, 진행 수를 표시", () => {
    expect(
      formatSyncProgress({
        ...IDLE,
        kind: "sync",
        step: "collect",
        stepIndex: 2,
        stepCount: 3,
        current: 37,
        total: 250,
      }),
    ).toBe("[2/3] 정보 수집 중 (37/250)");
  });

  it("전체 수가 0이면 진행 수를 생략", () => {
    expect(
      formatSyncProgress({
        ...IDLE,
        kind: "sync",
        step: "scan",
        stepIndex: 1,
        stepCount: 3,
      }),
    ).toBe("[1/3] 폴더 스캔 중");
  });

  it("첫 단계가 시작되기 전에는 준비 중으로 표시", () => {
    expect(formatSyncProgress({ ...IDLE, kind: "sync" })).toBe(
      "동기화 준비 중",
    );
  });
});

describe("formatSyncSummary", () => {
  it("수집과 번역 결과를 모두 표시", () => {
    expect(
      formatSyncSummary({
        scan: SCAN_OK,
        collect: { ok: true, success: 3, failed: 1 },
        translate: { ok: true, success: 4, failed: 0 },
      }),
    ).toBe("수집: 3/4, 번역: 4/4");
  });

  it("처리한 게임이 없으면 null", () => {
    expect(
      formatSyncSummary({
        scan: SCAN_OK,
        collect: { ok: true, success: 0, failed: 0 },
        translate: { ok: true, success: 0, failed: 0 },
      }),
    ).toBeNull();
  });

  it("실패한 단계는 요약에서 뺀다", () => {
    expect(
      formatSyncSummary({
        scan: SCAN_OK,
        collect: { ok: false, error: "Error: 실패" },
        translate: { ok: true, success: 2, failed: 0 },
      }),
    ).toBe("번역: 2/2");
  });
});
