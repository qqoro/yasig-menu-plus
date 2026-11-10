import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, effectScope, nextTick } from "vue";
import type { JobStatus } from "../../../main/events.js";

/**
 * useJobEvents 테스트 — 봇 인증 대화상자를 여는 경로
 * 실행: pnpm test -- src/renderer/composables/__tests__/useJobEvents.test.ts
 *
 * 대화상자는 별도 이벤트 없이 작업 상태 스냅샷(pendingBotBlock)만 보고 열린다.
 * 그래야 새로고침 직후 받아온 스냅샷만으로도 다시 열린다.
 */

vi.mock("vue-sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  },
}));

import { queryKeys } from "../../queryKeys";
import { useJobEvents } from "../useJobEvents";
import { IDLE_JOB_STATUS } from "../useJobStatus";

const BLOCK_A = { gamePath: "/games/a", gameTitle: "가상 게임 A" };

function withBlock(block: JobStatus["pendingBotBlock"]): JobStatus {
  return { ...IDLE_JOB_STATUS, pendingBotBlock: block };
}

/** 메인이 돌려줄 첫 스냅샷 */
let initialSnapshot: JobStatus;

function setup() {
  const queryClient = new QueryClient();
  const app = createApp({});
  app.use(VueQueryPlugin, { queryClient });
  const onBotBlock = vi.fn();
  const onBotBlockCleared = vi.fn();
  const scope = effectScope();
  app.runWithContext(() =>
    scope.run(() => useJobEvents({ onBotBlock, onBotBlockCleared })),
  );
  return { queryClient, onBotBlock, onBotBlockCleared, scope };
}

/** 쿼리 응답과 watch 실행을 기다린다 */
async function settle() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

describe("useJobEvents — 봇 인증 대화상자", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    initialSnapshot = IDLE_JOB_STATUS;
    (globalThis as any).window = {
      api: {
        invoke: vi.fn(async (channel: string) => {
          if (channel === "getJobStatus") return initialSnapshot;
          throw new Error(`예상하지 못한 호출: ${channel}`);
        }),
        on: vi.fn(),
        removeListener: vi.fn(),
      },
    };
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  it("대기 상태가 생기면 대화상자를 연다", async () => {
    const { queryClient, onBotBlock, scope } = setup();
    cleanup = () => scope.stop();
    await settle();

    queryClient.setQueryData(queryKeys.jobStatus.all, withBlock(BLOCK_A));
    await settle();

    expect(onBotBlock).toHaveBeenCalledTimes(1);
    expect(onBotBlock).toHaveBeenCalledWith(BLOCK_A);
  });

  it("같은 게임이 해결 후 다시 막히면 대화상자를 다시 연다", async () => {
    const { queryClient, onBotBlock, scope } = setup();
    cleanup = () => scope.stop();
    await settle();

    queryClient.setQueryData(queryKeys.jobStatus.all, withBlock(BLOCK_A));
    await settle();
    queryClient.setQueryData(queryKeys.jobStatus.all, withBlock(null));
    await settle();
    queryClient.setQueryData(queryKeys.jobStatus.all, withBlock(BLOCK_A));
    await settle();

    expect(onBotBlock).toHaveBeenCalledTimes(2);
  });

  it("진행률만 바뀐 스냅샷으로는 대화상자를 다시 열지 않는다", async () => {
    const { queryClient, onBotBlock, scope } = setup();
    cleanup = () => scope.stop();
    await settle();

    queryClient.setQueryData(queryKeys.jobStatus.all, withBlock(BLOCK_A));
    await settle();
    queryClient.setQueryData(queryKeys.jobStatus.all, {
      ...withBlock({ ...BLOCK_A }),
      current: 3,
    });
    await settle();

    expect(onBotBlock).toHaveBeenCalledTimes(1);
  });

  it("대기 상태가 풀리면 (시간 초과 포함) 대화상자를 닫는다", async () => {
    const { queryClient, onBotBlockCleared, scope } = setup();
    cleanup = () => scope.stop();
    await settle();
    expect(onBotBlockCleared).not.toHaveBeenCalled();

    queryClient.setQueryData(queryKeys.jobStatus.all, withBlock(BLOCK_A));
    await settle();
    queryClient.setQueryData(queryKeys.jobStatus.all, withBlock(null));
    await settle();

    expect(onBotBlockCleared).toHaveBeenCalledTimes(1);
  });

  it("새로고침 직후 첫 스냅샷에 대기 상태가 있으면 대화상자를 연다", async () => {
    initialSnapshot = withBlock(BLOCK_A);

    const { onBotBlock, scope } = setup();
    cleanup = () => scope.stop();
    await settle();

    expect(onBotBlock).toHaveBeenCalledTimes(1);
    expect(onBotBlock).toHaveBeenCalledWith(BLOCK_A);
  });
});

describe("useJobEvents — 마지막 동기화 시간", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    initialSnapshot = IDLE_JOB_STATUS;
    (globalThis as any).window = {
      api: {
        invoke: vi.fn(async () => initialSnapshot),
        on: vi.fn(),
        removeListener: vi.fn(),
      },
    };
  });

  afterEach(() => {
    cleanup?.();
    cleanup = null;
  });

  const syncAt = (step: JobStatus["step"], stepIndex: number): JobStatus => ({
    ...IDLE_JOB_STATUS,
    kind: "sync",
    step,
    stepIndex,
    stepCount: 3,
  });

  it("스캔 단계가 끝나면 바로 마지막 동기화 시간을 다시 읽는다", async () => {
    const { queryClient, scope } = setup();
    cleanup = () => scope.stop();
    await settle();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    queryClient.setQueryData(queryKeys.jobStatus.all, syncAt("scan", 1));
    await settle();
    expect(invalidate).not.toHaveBeenCalledWith({
      queryKey: queryKeys.lastRefreshed.all,
    });

    queryClient.setQueryData(queryKeys.jobStatus.all, syncAt("collect", 2));
    await settle();
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: queryKeys.lastRefreshed.all,
    });
  });
});
