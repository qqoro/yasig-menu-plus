/**
 * 번역 설정 컴포저블
 *
 * electron-store에서 번역 설정을 읽어옵니다
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { queryKeys } from "../queryKeys";

interface TranslationSettings {
  showTranslated: boolean;
  autoTranslate: boolean;
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
