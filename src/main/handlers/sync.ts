/**
 * 전체 동기화 (폴더 스캔 → 정보 수집 → 번역)
 *
 * 렌더러가 단계를 이어 붙이면 새로고침 한 번에 다음 단계가 실행되지 않으므로
 * 메인에서 끝까지 진행한다. 각 단계는 실패해도 다음 단계로 넘어간다.
 */

import type { IpcMainInvokeEvent } from "electron";
import type {
  IpcRendererEventMap,
  JobStartResult,
  SyncResult,
} from "../events.js";
import {
  startJob,
  toStartResult,
  type JobContext,
} from "../services/job-registry.js";
import { setLastRefreshedAt } from "../store.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";
import { createLogger } from "../utils/logger.js";
import { collectAllGames } from "./collector.js";
import { scanLibraryPaths } from "./home-scan.js";
import { translateAllTitles } from "./translation.js";

const log = createLogger("Sync");

const STEP_COUNT = 3;
const RESET_PROGRESS = { current: 0, total: 0, gameTitle: "" };

export async function runFullSync(
  sourcePaths: string[],
  ctx: JobContext,
): Promise<SyncResult> {
  const result = {} as SyncResult;

  // 1단계: 폴더 스캔
  ctx.update({
    step: "scan",
    stepIndex: 1,
    stepCount: STEP_COUNT,
    ...RESET_PROGRESS,
  });
  try {
    const { deletedCount } = await scanLibraryPaths(sourcePaths);
    setLastRefreshedAt(new Date().toISOString());
    result.scan = { ok: true, deletedCount };
  } catch (error) {
    log.error("동기화 스캔 실패:", error);
    result.scan = { ok: false, error: String(error) };
  }

  // 2단계: 정보 수집 (미수집 게임만)
  ctx.update({ step: "collect", stepIndex: 2, ...RESET_PROGRESS });
  try {
    const { success, failed } = await collectAllGames(false, (p) =>
      ctx.update(p),
    );
    result.collect = { ok: true, success, failed };
  } catch (error) {
    log.error("동기화 수집 실패:", error);
    result.collect = { ok: false, error: String(error) };
  }

  // 3단계: 번역 (미번역 게임만)
  ctx.update({ step: "translate", stepIndex: 3, ...RESET_PROGRESS });
  try {
    const { success, failed } = await translateAllTitles(false, (p) =>
      ctx.update(p),
    );
    result.translate = { ok: true, success, failed };
  } catch (error) {
    log.error("동기화 번역 실패:", error);
    result.translate = { ok: false, error: String(error) };
  }

  return result;
}

/**
 * 전체 동기화 시작 핸들러
 *
 * 결과를 기다리지 않고 바로 응답한다. 결과는 jobFinished로 전달된다
 */
export const runFullSyncHandler = wrapIpcHandler(
  "runFullSync",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["runFullSync"],
  ): Promise<JobStartResult> =>
    toStartResult(
      startJob("sync", (ctx) => runFullSync(payload.sourcePaths, ctx)),
    ),
);
