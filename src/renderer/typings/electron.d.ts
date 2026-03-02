/**
 * Electron API 타입 정의
 *
 * main/preload.ts와 일치하도록 타입 안전성 제공
 * invoke 호출 시 컴파일 시점에 타입 오류를 감지
 */

import type { ElectronApi } from "../types/api.js";

declare global {
  interface Window {
    api: ElectronApi;
  }
}

// 이 파일은 모듈로 처리되지 않도록 빈 export 추가
export {};
