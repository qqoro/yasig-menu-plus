/**
 * 윈도우 제어 Composable
 * Vue Query 기반 윈도우 제어
 */

import { useMutation } from "@tanstack/vue-query";
import { ref } from "vue";

// 윈도우 상태
const isMaximized = ref(false);

/**
 * 윈도우 최소화 Mutation
 */
export function useMinimizeWindow() {
  return useMutation({
    mutationFn: async () => {
      await window.api.invoke("minimizeWindow");
    },
  });
}

/**
 * 윈도우 최대화/복원 토글 Mutation
 */
export function useToggleMaximizeWindow() {
  return useMutation({
    mutationFn: async () => {
      await window.api.invoke("maximizeWindow");
    },
  });
}

/**
 * 윈도우 닫기 Mutation
 */
export function useCloseWindow() {
  return useMutation({
    mutationFn: async () => {
      await window.api.invoke("closeWindow");
    },
  });
}

/**
 * 윈도우 상태 이벤트 리스너 등록
 */
export function setupWindowListeners(): void {
  window.api.on("windowMaximized" as any, () => {
    isMaximized.value = true;
  });

  window.api.on("windowUnmaximized" as any, () => {
    isMaximized.value = false;
  });
}

/**
 * 윈도우 제어 Composable 반환
 */
export function useWindow() {
  const minimizeMutation = useMinimizeWindow();
  const maximizeMutation = useToggleMaximizeWindow();
  const closeMutation = useCloseWindow();

  return {
    isMaximized,
    minimizeWindow: () => minimizeMutation.mutate(),
    toggleMaximizeWindow: () => maximizeMutation.mutate(),
    closeWindow: () => closeMutation.mutate(),
    setupWindowListeners,
  };
}
