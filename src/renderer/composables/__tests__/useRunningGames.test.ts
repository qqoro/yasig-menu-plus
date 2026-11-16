import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, effectScope, nextTick } from "vue";
import type { RunningGame } from "../../../main/events.js";

/**
 * useRunningGames 테스트 — 실행 중 표시의 원본 목록
 * 실행: pnpm test -- src/renderer/composables/__tests__/useRunningGames.test.ts
 *
 * 화면이 뜰 때 받아온 스냅샷과, 이벤트로 덮어쓴 캐시 모두에서 실행 여부를 판정해야
 * 새로고침 뒤에도 표시가 유지된다.
 */

import { queryKeys } from "../../queryKeys";
import { useRunningGames } from "../useRunningGames";

let initialSnapshot: RunningGame[];

function setup() {
  const queryClient = new QueryClient();
  const app = createApp({});
  app.use(VueQueryPlugin, { queryClient });
  const scope = effectScope();
  const result = app.runWithContext(() => scope.run(() => useRunningGames()))!;
  return { queryClient, scope, ...result };
}

/** 쿼리 응답을 기다린다 */
async function settle() {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

describe("useRunningGames", () => {
  let cleanup: (() => void) | null = null;

  beforeEach(() => {
    initialSnapshot = [];
    (globalThis as any).window = {
      api: {
        invoke: vi.fn(async (channel: string) => {
          if (channel === "getRunningGames") return initialSnapshot;
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

  it("스냅샷이 오기 전에는 아무것도 실행 중이 아니다", () => {
    const { scope, isRunning } = setup();
    cleanup = () => scope.stop();
    expect(isRunning("/games/a")).toBe(false);
  });

  it("새로고침 직후 받아온 스냅샷으로 실행 중을 판정한다", async () => {
    initialSnapshot = [{ path: "/games/a", isCheatMode: false }];
    const { scope, isRunning } = setup();
    cleanup = () => scope.stop();
    await settle();

    expect(isRunning("/games/a")).toBe(true);
    expect(isRunning("/games/b")).toBe(false);
  });

  it("이벤트로 캐시가 바뀌면 동시에 실행한 게임을 모두 반영한다", async () => {
    const { queryClient, scope, isRunning } = setup();
    cleanup = () => scope.stop();
    await settle();

    queryClient.setQueryData(queryKeys.runningGames.all, [
      { path: "/games/a", isCheatMode: false },
      { path: "/games/b", isCheatMode: true },
    ]);
    expect(isRunning("/games/a")).toBe(true);
    expect(isRunning("/games/b")).toBe(true);

    // 종료되면 목록에서 빠진다
    queryClient.setQueryData(queryKeys.runningGames.all, [
      { path: "/games/b", isCheatMode: true },
    ]);
    expect(isRunning("/games/a")).toBe(false);
  });
});
