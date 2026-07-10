/**
 * 증분 스캔 분류 로직 (순수 함수 — fs/DB 의존성 없음)
 *
 * DB에 저장된 게임 행과 스캔으로 발견한 후보를 비교하여 분류한다:
 * - new: DB에 없는 경로 → fingerprint 계산 후 INSERT
 * - skip: 변경 없음 → fingerprint 재계산과 UPDATE를 모두 건너뜀
 * - changed: 그 외 (mtime 불일치, 저장값 누락, stat 실패, 라이브러리 간 이동 등)
 *   → fingerprint 재계산 + UPDATE
 */

import type { GameCandidate } from "./scan-logic.js";

/** 분류에 필요한 games 테이블 컬럼 부분집합 */
export interface ExistingGameRow {
  path: string;
  source: string;
  fingerprint: string | null;
  dirMtimeMs: number | null;
  hasExecutable: 0 | 1 | boolean;
  provider: string | null;
  externalId: string | null;
}

export type CandidateClassification = "new" | "skip" | "changed";

export function classifyCandidate(
  existing: ExistingGameRow | undefined,
  candidate: GameCandidate,
  sourcePath: string,
): CandidateClassification {
  if (!existing) return "new";

  // mtime이 양쪽 모두 존재하고 일치할 때만 "변경 없음"으로 간주
  // (mtimeMs 0은 유효한 값이므로 == null 비교 사용)
  const mtimeUnchanged =
    existing.dirMtimeMs != null &&
    candidate.mtimeMs != null &&
    existing.dirMtimeMs === candidate.mtimeMs;

  if (
    mtimeUnchanged &&
    existing.fingerprint != null &&
    existing.source === sourcePath &&
    Boolean(existing.hasExecutable) === candidate.hasExecutable
  ) {
    return "skip";
  }

  return "changed";
}
