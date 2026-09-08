// src/main/workers/scan-worker.ts
import { parentPort, workerData } from "worker_threads";
import { scanFolderRecursive } from "../lib/scan-logic.js";
import type { GameCandidate } from "../lib/scan-logic.js";
import { DEFAULT_FILE_LOG_LEVEL, type LogLevel } from "../utils/log-level.js";
import { initWorkerLogging } from "./worker-logger.js";

/** Main → Worker (워커 생성 시 1회 전달) */
export interface ScanWorkerData {
  logFilePath: string;
  logLevel: LogLevel;
}

/** Main → Worker */
export interface ScanRequest {
  sourcePath: string;
  maxDepth: number;
  enableNonGameContent: boolean;
}

/** Worker → Main */
export type ScanResponse =
  | { type: "SCAN_COMPLETE"; sourcePath: string; candidates: GameCandidate[] }
  | { type: "SCAN_ERROR"; sourcePath: string; error: string };

const data = workerData as ScanWorkerData | null;
initWorkerLogging(
  "ScanWorker",
  data?.logFilePath,
  data?.logLevel ?? DEFAULT_FILE_LOG_LEVEL,
);

parentPort?.on("message", (request: ScanRequest) => {
  try {
    const candidates = scanFolderRecursive(
      request.sourcePath,
      request.maxDepth,
      request.enableNonGameContent,
    );
    parentPort!.postMessage({
      type: "SCAN_COMPLETE",
      sourcePath: request.sourcePath,
      candidates,
    } satisfies ScanResponse);
  } catch (error) {
    // 스캔 전체가 실패한 경우. 부모도 로그를 남기지만 스택은 여기에만 있다.
    console.error(`스캔 중단: ${request.sourcePath}`, error);
    parentPort!.postMessage({
      type: "SCAN_ERROR",
      sourcePath: request.sourcePath,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ScanResponse);
  }
});
