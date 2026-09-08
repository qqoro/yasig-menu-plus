// src/main/workers/run-scan-worker.ts
import { app } from "electron";
import { join } from "path";
import { Worker } from "worker_threads";
import type { GameCandidate } from "../lib/scan-logic.js";
import {
  createLogger,
  getFileLogLevel,
  getLogFilePath,
} from "../utils/logger.js";
import type {
  ScanRequest,
  ScanResponse,
  ScanWorkerData,
} from "./scan-worker.js";

const log = createLogger("Scan");

const TIMEOUT_MS = 5 * 60 * 1000; // 5분

function getWorkerPath(): string {
  if (app.isPackaged) {
    // electron-builder: build/main → main 매핑
    return join(
      process.resourcesPath,
      "app.asar",
      "main",
      "workers",
      "scan-worker.js",
    );
  }
  return join(process.cwd(), "build", "main", "workers", "scan-worker.js");
}

/**
 * Worker Thread에서 단일 폴더 스캔 실행
 */
export function runScanWorker(
  sourcePath: string,
  maxDepth = 5,
  enableNonGameContent = false,
): Promise<GameCandidate[]> {
  return new Promise((resolve, reject) => {
    // 워커는 electron 모듈을 못 쓰므로 로그 파일 경로/레벨을 넘겨줘야
    // 메인 로그와 같은 파일에 기록된다
    const worker = new Worker(getWorkerPath(), {
      workerData: {
        logFilePath: getLogFilePath(),
        logLevel: getFileLogLevel(),
      } satisfies ScanWorkerData,
    });
    const timer = setTimeout(() => {
      worker.terminate();
      log.error(`스캔 타임아웃: ${sourcePath} (5분 초과)`);
      reject(new Error(`스캔 타임아웃: ${sourcePath} (5분 초과)`));
    }, TIMEOUT_MS);

    worker.on("message", (response: ScanResponse) => {
      clearTimeout(timer);
      worker.terminate();
      if (response.type === "SCAN_COMPLETE") {
        resolve(response.candidates);
      } else {
        log.error(`스캔 실패: ${sourcePath} — ${response.error}`);
        reject(new Error(response.error));
      }
    });

    worker.on("error", (error) => {
      clearTimeout(timer);
      worker.terminate();
      log.error(`스캔 워커 오류: ${sourcePath}`, error);
      reject(error);
    });

    worker.postMessage({
      sourcePath,
      maxDepth,
      enableNonGameContent,
    } satisfies ScanRequest);
  });
}
