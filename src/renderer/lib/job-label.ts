/**
 * 백그라운드 작업 진행 문구
 */

import type { JobStatus, JobStep, SyncResult } from "../../main/events.js";

export const STEP_LABELS: Record<JobStep, string> = {
  scan: "폴더 스캔 중",
  collect: "정보 수집 중",
  translate: "번역 중",
};

/** "[2/3] 정보 수집 중 (37/250)" — 전체 수를 모르면 진행 수 생략 */
export function formatSyncProgress(status: JobStatus): string {
  // 작업 시작 직후 첫 단계가 정해지기 전 스냅샷
  if (status.stepIndex === 0) return "동기화 준비 중";
  const label = status.step ? STEP_LABELS[status.step] : "";
  const head = `[${status.stepIndex}/${status.stepCount}] ${label}`;
  return status.total > 0
    ? `${head} (${status.current}/${status.total})`
    : head;
}

/** 완료 토스트 설명 "수집: 3/4, 번역: 4/4" — 처리한 게임이 없으면 null */
export function formatSyncSummary(result: SyncResult): string | null {
  const parts: string[] = [];
  const add = (label: string, step: SyncResult["collect"]) => {
    if (!step.ok) return;
    const total = step.success + step.failed;
    if (total > 0) parts.push(`${label}: ${step.success}/${total}`);
  };
  add("수집", result.collect);
  add("번역", result.translate);
  return parts.length > 0 ? parts.join(", ") : null;
}
