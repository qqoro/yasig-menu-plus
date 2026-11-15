/**
 * 수집기 공통 요청 함수 — 사이트별 요청 속도 제한 + 429 대기·재시도
 *
 * DLsite는 Cloudflare 규칙으로 "최근 60초 100회"를 넘기면 5분간 429를 돌려준다(2026-11 실측).
 * 사이트마다 최근 windowMs 동안 보낸 요청 수를 세어 max를 넘지 않을 때만 보내고,
 * 429를 받으면 Retry-After만큼 그 사이트 요청 전체를 멈춘 뒤 다시 시도한다.
 */
import { createLogger } from "./logger.js";

const log = createLogger("PoliteFetch");

/** 측정·공식 문서로 확인된 사이트만 등록. 없는 사이트는 제한 없이 바로 보낸다 */
export const HOST_LIMITS: Readonly<
  Record<string, { max: number; windowMs: number }>
> = {
  // 실제 한도 100회. 사용자의 브라우저 접속과 기준 변경에 대비해 여유를 둔다
  "www.dlsite.com": { max: 80, windowMs: 60_000 },
  // 공식 한도 5분 200회
  "api.vndb.org": { max: 180, windowMs: 300_000 },
};

const MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 600_000;

interface HostState {
  /** 한도 계산용 발송 시각(오래된 순) */
  sent: number[];
  /** 429로 멈춘 경우 재개 시각 */
  pausedUntil: number;
}

const states = new Map<string, HostState>();

function getState(host: string): HostState {
  let state = states.get(host);
  if (!state) {
    state = { sent: [], pausedUntil: 0 };
    states.set(host, state);
  }
  return state;
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 보낼 차례가 될 때까지 기다린 뒤 자리를 예약한다.
 * await 뒤에 확인과 예약을 동기적으로 처리하므로 동시에 불려도 한도를 넘지 않는다
 */
async function acquire(host: string): Promise<void> {
  const state = getState(host);
  const limit = HOST_LIMITS[host];
  for (;;) {
    const now = Date.now();
    if (state.pausedUntil > now) {
      await sleep(state.pausedUntil - now);
      continue;
    }
    if (!limit) return;
    while (state.sent.length > 0 && state.sent[0] <= now - limit.windowMs) {
      state.sent.shift();
    }
    if (state.sent.length < limit.max) {
      state.sent.push(now);
      return;
    }
    await sleep(state.sent[0] + limit.windowMs - now);
  }
}

/** Retry-After(초 또는 HTTP 날짜)를 대기 시간으로 변환. 없거나 이상하면 점점 길게 */
function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get("Retry-After");
  let delay = Number.NaN;
  if (header) {
    const seconds = Number(header);
    delay = Number.isNaN(seconds)
      ? Date.parse(header) - Date.now()
      : seconds * 1000;
  }
  if (!(delay > 0)) delay = DEFAULT_RETRY_DELAY_MS * (attempt + 1);
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

/** fetch와 같은 사용법. 사이트별 속도 제한과 429 재시도를 거쳐 요청한다 */
export async function politeFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const host = new URL(input).hostname;
  for (let attempt = 0; ; attempt++) {
    await acquire(host);
    const res = await fetch(input, init);
    if (res.status !== 429) return res;

    // 마지막 시도라도 멈춤은 걸어서, 차단 중에 대기하던 요청이 몰려 나가지 않게 한다
    const delay = retryDelayMs(res, attempt);
    const state = getState(host);
    state.pausedUntil = Math.max(state.pausedUntil, Date.now() + delay);
    if (attempt === MAX_RETRIES) return res;

    await res.body?.cancel();
    log.warn(`요청 한도 초과(${host}), ${delay}ms 후 재시도`);
  }
}
