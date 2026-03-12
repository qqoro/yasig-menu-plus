/**
 * 대시보드 통계 컴포저블
 * Vue Query 기반 데이터 fetching
 */

import { useQuery } from "@tanstack/vue-query";
import { queryKeys } from "../queryKeys";
import type { DashboardStats, LibraryStorageInfo } from "../../main/events.js";

export type { DashboardStats, LibraryStorageInfo };

/**
 * 대시보드 통계 조회
 */
export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboard.stats,
    queryFn: async () => {
      const result = await window.api.invoke("getDashboardStats");
      return result.stats;
    },
    staleTime: 5 * 60 * 1000, // 5분
  });
}

/**
 * 라이브러리 저장공간 조회
 */
export function useLibraryStorageSize() {
  return useQuery({
    queryKey: queryKeys.dashboard.storageSize,
    queryFn: async () => {
      return await window.api.invoke("getLibraryStorageSize");
    },
    staleTime: 10 * 60 * 1000, // 10분
  });
}

/**
 * 바이트를 읽기 쉬운 단위로 변환
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}
