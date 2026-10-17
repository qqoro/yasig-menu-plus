/**
 * 게임 목록 관련 Composable
 *
 * Phase 1 MVP:
 * - 게임 목록 로드
 * - 게임 실행
 * - 폴더 열기
 *
 * Phase 3:
 * - 검색 및 필터링
 * - 토글 기능
 * - 자동완성
 */

import { onMounted, onUnmounted } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { Ref } from "vue";
import type { GameItem, SearchQuery } from "../types";
import { createLogger } from "../lib/logger";
import { queryKeys } from "../queryKeys";
import { toast } from "vue-sonner";

const log = createLogger("Games");

/**
 * 게임 목록 새로고침 Mutation (Vue Query 기반)
 */
export function useRefreshGames() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (sourcePaths: string[]) => {
      const paths = [...sourcePaths];
      const result = await window.api.invoke("refreshList", {
        sourcePaths: paths,
      });
      return result as {
        games: GameItem[];
        addedCount: number;
        deletedCount: number;
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.libraryScanHistory.all,
      });

      // 삭제된 게임이 있으면 알림
      if (result.deletedCount > 0) {
        toast.info(`${result.deletedCount}개의 게임이 삭제되었습니다.`);
      }
    },
  });
}

/**
 * 용량순 정렬 선택 시 용량 미측정 게임 안내 (토스트 + 스캔 버튼)
 */
export function useSizeSortNotice() {
  const queryClient = useQueryClient();
  const refreshGames = useRefreshGames();

  async function notifyUnmeasuredSize(sourcePaths: string[]): Promise<void> {
    const paths = [...sourcePaths];
    if (paths.length === 0) return;

    try {
      const { count } = await queryClient.fetchQuery({
        queryKey: [...queryKeys.games.all, "unmeasuredSize", paths],
        queryFn: () =>
          window.api.invoke("countUnmeasuredSize", { sourcePaths: paths }),
        staleTime: 0,
      });
      if (count === 0) return;

      toast.warning(`용량이 측정되지 않은 게임이 ${count}개 있습니다.`, {
        description: "재스캔이 필요합니다.",
        action: {
          label: "스캔",
          onClick: () => {
            toast.promise(refreshGames.mutateAsync(paths), {
              loading: "폴더 스캔 중...",
              success: "스캔이 완료되었습니다.",
              error: "스캔에 실패했습니다.",
            });
          },
        },
      });
    } catch (err) {
      log.error("용량 미측정 게임 수 조회 오류:", err);
    }
  }

  return { notifyUnmeasuredSize };
}

/**
 * 게임 실행 Mutation (Vue Query 기반)
 */
export function usePlayGame() {
  return useMutation({
    mutationFn: async (path: string) => {
      const result = await window.api.invoke("playGame", { path });
      return (result as { executablePath: string }).executablePath;
    },
  });
}

/**
 * 폴더 열기 Mutation (Vue Query 기반)
 */
export function useOpenFolder() {
  return useMutation({
    mutationFn: async (path: string) => {
      await window.api.invoke("openFolder", { path });
    },
  });
}

/**
 * 게임 목록 Composable 반환
 */
export function useGames() {
  // 빈 dummy 값 반환 (기존 코드와의 호환성 유지)
  return {
    games: [] as GameItem[],
    isLoading: false,
    error: null as string | null,
  };
}

// ========== Phase 3: 검색 및 필터링 ==========

/**
 * 자동완성 제안 Query (Vue Query 기반)
 */
export function useAutocompleteSuggestions(
  prefix: Ref<"tag" | "circle" | "category" | "provider" | "id" | null> | null,
  query: Ref<string> | string,
) {
  const prefixValue =
    prefix instanceof Object && "value" in prefix ? prefix.value : prefix;
  const queryValue =
    query instanceof Object && "value" in query ? query.value : query;

  return useQuery({
    queryKey: [...queryKeys.autocomplete.all, prefixValue, queryValue],
    queryFn: async () => {
      const p =
        prefix instanceof Object && "value" in prefix ? prefix.value : prefix;
      const q =
        query instanceof Object && "value" in query ? query.value : query;
      if (!p) {
        return { prefix: "", query: q, suggestions: [] };
      }
      const result = await window.api.invoke("getAutocompleteSuggestions", {
        prefix: p,
        query: q,
      });
      return result as { prefix: string; query: string; suggestions: string[] };
    },
    enabled: !!queryValue && queryValue.length > 0,
    staleTime: 1000 * 60 * 5, // 5분
  });
}

/**
 * 랜덤 게임 가져오기 (내부 함수)
 */
async function _getRandomGame(
  sourcePaths: string[],
  searchQuery: SearchQuery,
): Promise<{ game: GameItem | null }> {
  try {
    const paths = [...sourcePaths];
    const plainQuery = structuredClone(searchQuery);
    const result = await window.api.invoke("getRandomGame", {
      sourcePaths: paths,
      searchQuery: plainQuery,
    });
    return result as { game: GameItem | null };
  } catch (err) {
    log.error("랜덤 게임 가져오기 오류:", err);
    return { game: null };
  }
}

/**
 * 랜덤 게임 Query (Vue Query 기반)
 */
export function useRandomGame(
  sourcePaths: Ref<string[]> | string[],
  searchQuery: Ref<SearchQuery> | SearchQuery,
) {
  const pathsValue = Array.isArray(sourcePaths)
    ? sourcePaths
    : sourcePaths.value;
  const queryValue =
    searchQuery instanceof Object && "value" in searchQuery
      ? searchQuery.value
      : searchQuery;

  return useQuery({
    queryKey: [...queryKeys.randomGame.all, pathsValue, queryValue],
    queryFn: async () => {
      const paths = Array.isArray(sourcePaths)
        ? [...sourcePaths]
        : [...sourcePaths.value];
      const q =
        searchQuery instanceof Object && "value" in searchQuery
          ? searchQuery.value
          : searchQuery;
      const plainQuery = structuredClone(q);
      const result = await window.api.invoke("getRandomGame", {
        sourcePaths: paths,
        searchQuery: plainQuery,
      });
      return result as { game: GameItem | null };
    },
    enabled: false, // 수동 실행용
  });
}

/**
 * 랜덤 게임 Mutation (Vue Query 기반 - 동적 query용)
 */
export function useRandomGameMutation() {
  return useMutation({
    mutationFn: async ({
      sourcePaths,
      searchQuery,
    }: {
      sourcePaths: string[];
      searchQuery: SearchQuery;
    }) => {
      const result = await window.api.invoke("getRandomGame", {
        sourcePaths: [...sourcePaths],
        searchQuery: structuredClone(searchQuery),
      });
      return result as { game: GameItem | null };
    },
  });
}

// ========== 자동 스캔 완료 리스너 ==========

/**
 * 자동 스캔 완료 시 캐시 무효화 Composable
 * 포커스/앱 시작 시 자동 스캔이 완료되면 게임 목록을 갱신
 */
export function useAutoScanListener() {
  const queryClient = useQueryClient();

  function onAutoScanDone(data: { addedCount: number; deletedCount: number }) {
    // Vue Query 캐시 무효화 → 자동으로 게임 목록 리페치
    queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
    // 중복 게임 목록도 무효화 (게임 수집 시 중복 상태가 변경될 수 있음)
    queryClient.invalidateQueries({ queryKey: queryKeys.duplicates.all });
    if (data.addedCount > 0) {
      toast.success(`${data.addedCount}개의 새 게임이 추가되었습니다.`);
    }
    if (data.deletedCount > 0) {
      toast.info(`${data.deletedCount}개의 게임이 삭제되었습니다.`);
    }
  }

  // 컴포넌트 마운트 시 리스너 등록
  onMounted(() => {
    window.api.on("autoScanDone", onAutoScanDone);
  });

  // 컴포넌트 언마운트 시 리스너 제거
  onUnmounted(() => {
    window.api.removeListener("autoScanDone", onAutoScanDone);
  });
}
