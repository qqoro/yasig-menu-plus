/**
 * 백그라운드 작업 상태 저장소
 *
 * 전체 동기화 / 전체 수집 / 전체 번역의 진행 상태를 메인 프로세스가 들고 있는다.
 * 렌더러 메모리에만 두면 새로고침·화면 이동 때 날아가고, 그 사이 버튼이 다시
 * 살아나 같은 작업이 겹쳐 돈다. 렌더러는 getJobStatus로 스냅샷을 받아오고
 * jobStatusChanged로 갱신한다.
 *
 * 작업은 한 번에 하나만 돈다. 수집이 제목을 바꾸고 번역이 그 제목을 읽으므로
 * 둘을 동시에 돌릴 이유가 없고, 상태도 하나로 단순해진다.
 */

import type {
  JobFinishedPayload,
  JobKind,
  JobStartResult,
  JobStatus,
  PendingBotBlock,
} from "../events.js";
import { broadcast } from "../utils/broadcast.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("JobRegistry");

/** 수집·번역 본체가 진행 상황을 알리는 콜백 */
export type ProgressFn = (p: {
  current: number;
  total: number;
  gameTitle: string;
}) => void;

/** 작업 함수가 상태를 갱신할 때 쓰는 핸들 */
export interface JobContext {
  update(
    patch: Partial<
      Pick<
        JobStatus,
        "step" | "stepIndex" | "stepCount" | "current" | "total" | "gameTitle"
      >
    >,
  ): void;
}

type JobOutcome<K extends JobKind> = Extract<
  JobFinishedPayload,
  { kind: K; ok: true }
>["result"];

const IDLE_FIELDS = {
  kind: null,
  step: null,
  stepIndex: 0,
  stepCount: 0,
  current: 0,
  total: 0,
  gameTitle: "",
} as const satisfies Omit<JobStatus, "pendingBotBlock">;

let status: JobStatus = { ...IDLE_FIELDS, pendingBotBlock: null };

function setStatus(next: JobStatus): void {
  status = next;
  broadcast("jobStatusChanged", { ...status });
}

/** 현재 상태 스냅샷 */
export function getJobStatus(): JobStatus {
  return { ...status };
}

export function isJobRunning(): boolean {
  return status.kind !== null;
}

/**
 * 작업 시작
 *
 * 응답은 즉시 돌려주고 작업은 기다리지 않는다. 오래 걸리는 invoke는 렌더러가
 * 새로고침되면 응답을 받을 곳이 사라지므로, 결과는 jobFinished로 알린다.
 * done은 테스트와 내부 호출자가 완료를 기다릴 때 쓴다.
 */
export function startJob<K extends JobKind>(
  kind: K,
  fn: (ctx: JobContext) => Promise<JobOutcome<K>>,
): { started: true; done: Promise<void> } | { started: false; reason: "busy" } {
  if (isJobRunning()) {
    log.info(`작업 시작 거부 (${status.kind} 실행 중): ${kind}`);
    return { started: false, reason: "busy" };
  }

  setStatus({ ...IDLE_FIELDS, kind, pendingBotBlock: status.pendingBotBlock });

  const ctx: JobContext = {
    update(patch) {
      setStatus({ ...status, ...patch });
    },
  };

  const done = (async () => {
    let finished: JobFinishedPayload;
    try {
      const result = await fn(ctx);
      finished = { kind, ok: true, result } as JobFinishedPayload;
    } catch (error) {
      log.error(`작업 실패: ${kind}`, error);
      finished = { kind, ok: false, error: String(error) };
    } finally {
      setStatus({ ...IDLE_FIELDS, pendingBotBlock: status.pendingBotBlock });
    }
    broadcast("jobFinished", finished);
  })();

  return { started: true, done };
}

/** IPC 응답용으로 done을 떼어낸 시작 결과 */
export function toStartResult(
  result: ReturnType<typeof startJob>,
): JobStartResult {
  return result.started ? { started: true } : result;
}

/** CAPTCHA 해결 대기 상태 설정 (작업 종류와 무관) */
export function setPendingBotBlock(value: PendingBotBlock | null): void {
  setStatus({ ...status, pendingBotBlock: value });
}

export const getJobStatusHandler = wrapIpcHandler(
  "getJobStatus",
  async (): Promise<JobStatus> => getJobStatus(),
);

export function resetJobRegistryForTest(): void {
  status = { ...IDLE_FIELDS, pendingBotBlock: null };
}
