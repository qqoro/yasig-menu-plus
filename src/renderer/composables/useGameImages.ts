/**
 * 게임 이미지 관리 컴포저블
 * Vue Query 기반 데이터 fetching
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type { Ref } from "vue";
import { queryKeys } from "../queryKeys";

/**
 * 게임 이미지 목록 조회
 */
export function useGameImages(gamePath: string | Ref<string>) {
  return useQuery({
    queryKey: queryKeys.gameImages(gamePath),
    queryFn: async () => {
      const gamePathValue =
        typeof gamePath === "string" ? gamePath : gamePath.value;
      const result = await window.api.invoke("getGameImages", {
        gamePath: gamePathValue,
      });
      return result.images;
    },
    enabled: typeof gamePath === "string" ? !!gamePath : () => !!gamePath.value,
  });
}

/**
 * 이미지 변경 후 무효화
 * 갱신된 목록으로 바로 이동할 수 있도록 refetch 완료까지 기다린다.
 */
function useInvalidateGameImages() {
  const queryClient = useQueryClient();
  return (gamePath: string) =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameImages(gamePath),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.gameDetail(gamePath),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all }),
    ]);
}

/**
 * URL 이미지 추가
 */
export function useAddGameImageFromUrl() {
  const invalidate = useInvalidateGameImages();
  return useMutation({
    mutationFn: (payload: {
      gamePath: string;
      url: string;
      afterPath: string | null;
    }) => window.api.invoke("addGameImageFromUrl", payload),
    onSuccess: (_, variables) => invalidate(variables.gamePath),
  });
}

/**
 * 로컬 이미지 파일 추가
 */
export function useAddGameImagesFromFiles() {
  const invalidate = useInvalidateGameImages();
  return useMutation({
    mutationFn: (payload: {
      gamePath: string;
      filePaths: string[];
      afterPath: string | null;
    }) => window.api.invoke("addGameImagesFromFiles", payload),
    onSuccess: (_, variables) => invalidate(variables.gamePath),
  });
}

/**
 * 게임 이미지 삭제
 */
export function useDeleteGameImage() {
  const invalidate = useInvalidateGameImages();
  return useMutation({
    mutationFn: (payload: { gamePath: string; imagePath: string }) =>
      window.api.invoke("deleteGameImage", payload),
    onSuccess: (_, variables) => invalidate(variables.gamePath),
  });
}

/**
 * 게임 이미지를 썸네일로 지정
 */
export function useSetThumbnailFromImage() {
  const invalidate = useInvalidateGameImages();
  return useMutation({
    mutationFn: (payload: { gamePath: string; imagePath: string }) =>
      window.api.invoke("setThumbnailFromImage", payload),
    onSuccess: (_, variables) => invalidate(variables.gamePath),
  });
}
