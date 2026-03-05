/**
 * 게임 상세 정보 관리 컴포저블
 * Vue Query 기반 데이터 fetching 및 mutations
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { Ref } from "vue";
import { queryKeys } from "../queryKeys";
import type { GameDetailItem } from "../types";

/**
 * 게임 상세 정보 조회
 */
export function useGameDetail(path: string | Ref<string>) {
  return useQuery({
    queryKey: queryKeys.gameDetail(path),
    queryFn: async () => {
      const pathValue = typeof path === "string" ? path : path.value;
      const result = await window.api.invoke("getGameDetail", {
        path: pathValue,
      });
      return (result as { game: GameDetailItem | null }).game;
    },
    enabled: typeof path === "string" ? !!path : () => !!path.value,
  });
}

/**
 * 메타데이터 수정
 */
export function useUpdateMetadata() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      path: string;
      metadata: {
        title?: string;
        originalTitle?: string;
        translatedTitle?: string | null;
        publishDate?: Date | null;
        memo?: string | null;
      };
    }) => {
      return await window.api.invoke("updateGameMetadata", payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 별점 수정
 */
export function useUpdateRating() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string; rating: number | null }) => {
      return await window.api.invoke("updateRating", payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 제작사 추가
 */
export function useAddMaker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string; name: string }) => {
      return await window.api.invoke("addMaker", payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 제작사 제거
 */
export function useRemoveMaker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string; name: string }) => {
      return await window.api.invoke("removeMaker", payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 카테고리 추가
 */
export function useAddCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string; name: string }) => {
      return await window.api.invoke("addCategory", payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 카테고리 제거
 */
export function useRemoveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string; name: string }) => {
      return await window.api.invoke("removeCategory", payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 태그 추가
 */
export function useAddTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string; name: string }) => {
      return await window.api.invoke("addTag", payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 태그 제거
 */
export function useRemoveTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string; name: string }) => {
      return await window.api.invoke("removeTag", payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * URL에서 썸네일 설정
 */
export function useSetThumbnailFromUrl() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string; url: string }) => {
      return await window.api.invoke("setThumbnailFromUrl", payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 로컬 파일에서 썸네일 설정
 */
export function useSetThumbnailFromFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string; filePath: string }) => {
      return await window.api.invoke("setThumbnailFromFile", payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 썸네일 삭제
 */
export function useHideThumbnail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string }) => {
      return await window.api.invoke("hideThumbnail", payload);
    },
    onSuccess: (_, variables) => {
      // 목록과 해당 게임 상세 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 즐겨찾기 토글
 */
export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      return await window.api.invoke("toggleFavorite", { path });
    },
    onSuccess: (_, path) => {
      // 목록과 해당 게임 상세 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.gameDetail(path) });
    },
  });
}

/**
 * 숨김 토글
 */
export function useToggleHidden() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      return await window.api.invoke("toggleHidden", { path });
    },
    onSuccess: (_, path) => {
      // 목록과 해당 게임 상세 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.gameDetail(path) });
    },
  });
}

/**
 * 클리어 토글
 */
export function useToggleClear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      return await window.api.invoke("toggleClear", { path });
    },
    onSuccess: (_, path) => {
      // 목록과 해당 게임 상세 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.gameDetail(path) });
    },
  });
}

/**
 * 게임 실행 Mutation
 */
export function usePlayGameMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (path: string) => {
      const result = await window.api.invoke("playGame", { path });
      return (result as { executablePath: string }).executablePath;
    },
    onSuccess: (_, path) => {
      // lastPlayedAt 변경으로 관련 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.gameDetail(path) });
    },
  });
}

/**
 * 폴더 열기 Mutation
 */
export function useOpenFolderMutation() {
  return useMutation({
    mutationFn: async (path: string) => {
      await window.api.invoke("openFolder", { path });
    },
  });
}

/**
 * 실행 파일 경로 설정
 */
export function useSetExecutablePath() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { path: string; executablePath: string }) => {
      return await window.api.invoke("setExecutablePath", payload);
    },
    onSuccess: (_, variables) => {
      // 목록과 해당 게임 상세 쿼리 무효화
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(variables.path),
      });
    },
  });
}

/**
 * 실행 파일 선택 Mutation
 */
export function useSelectExecutableFile() {
  return useMutation({
    mutationFn: async (gamePath: string) => {
      const result = await window.api.invoke("selectExecutableFile", {
        gamePath,
      });
      const filePaths = (result as { filePaths?: string[] | undefined })
        .filePaths;
      return filePaths && filePaths.length > 0 ? filePaths[0] : undefined;
    },
  });
}

/**
 * 원본 사이트 열기
 */
export function useOpenOriginalSite() {
  return useMutation({
    mutationKey: queryKeys.openOriginalSite.all,
    mutationFn: async (path: string) => {
      return await window.api.invoke("openOriginalSite", { path });
    },
  });
}
