/**
 * 번역 설정 컴포저블
 *
 * electron-store에서 번역 설정을 읽어옵니다
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { queryKeys } from "../queryKeys";

/**
 * 제목 표시 우선순위 타입
 * 배열 순서대로 표시할 제목을 결정 (앞쪽이 우선)
 * - original: 원본 (폴더명)
 * - collected: 원문 (정보 수집 제목)
 * - translated: 번역
 */
export type TitleDisplayMode = "original" | "collected" | "translated";

interface TranslationSettings {
  showTranslated: boolean;
  autoTranslate: boolean;
  titleDisplayPriority: TitleDisplayMode[];
}

/**
 * 번역 설정 조회
 */
export function useTranslationSettings() {
  return useQuery({
    queryKey: queryKeys.translationSettings.all,
    queryFn: async (): Promise<TranslationSettings> => {
      const result = await window.api.invoke("getTranslationSettings");
      if (!result || typeof result !== "object" || !("settings" in result)) {
        throw new Error("Invalid translation settings response");
      }
      const settings = result.settings;
      if (!settings || typeof settings !== "object") {
        throw new Error("Invalid settings in response");
      }
      return settings as TranslationSettings;
    },
    staleTime: 1000 * 60,
  });
}

/**
 * 번역 설정 설정 Mutation
 */
export function useSetTranslationSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: TranslationSettings) => {
      return await window.api.invoke("setTranslationSettings", { settings });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.translationSettings.all,
      });
    },
  });
}

/**
 * 번역 설정 갱신 (캐시 무효화) - 간편 함수
 */
export function invalidateTranslationSettings() {
  const queryClient = useQueryClient();
  queryClient.invalidateQueries({
    queryKey: queryKeys.translationSettings.all,
  });
}
