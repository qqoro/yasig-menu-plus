// src/main/workers/run-scan-worker.ts
import { app } from "electron";
import { join } from "path";
import { Worker } from "worker_threads";
import type { GameCandidate } from "../lib/scan-logic.js";
import type { ScanRequest, ScanResponse } from "./scan-worker.js";

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
  maxDepth = 10,
): Promise<GameCandidate[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(getWorkerPath());
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`스캔 타임아웃: ${sourcePath} (5분 초과)`));
    }, TIMEOUT_MS);

    worker.on("message", (response: ScanResponse) => {
      clearTimeout(timer);
      worker.terminate();
      if (response.type === "SCAN_COMPLETE") {
        resolve(response.candidates);
      } else {
        reject(new Error(response.error));
      }
    });

    worker.on("error", (error) => {
      clearTimeout(timer);
      worker.terminate();
      reject(error);
    });

    worker.postMessage({ sourcePath, maxDepth } satisfies ScanRequest);
  });
}
