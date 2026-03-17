// src/main/workers/scan-worker.ts
import { parentPort } from "worker_threads";
import { scanFolderRecursive } from "../lib/scan-logic.js";
import type { GameCandidate } from "../lib/scan-logic.js";

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
    parentPort!.postMessage({
      type: "SCAN_ERROR",
      sourcePath: request.sourcePath,
      error: error instanceof Error ? error.message : String(error),
    } satisfies ScanResponse);
  }
});
