/**
 * 테마 관리 Composable
 *
 * - 컬러 테마 CSS 동적 로드
 * - 라이트/다크 모드 관리
 * - electron-store와 동기화
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import { queryKeys } from "../queryKeys";

const THEME_CSS_ID = "theme-css";

/**
 * 테마 CSS 파일을 동적으로 로드
 */
function loadThemeCSS(theme: string): void {
  // 기존 테마 CSS 제거
  const existingLink = document.getElementById(
    THEME_CSS_ID,
  ) as HTMLLinkElement | null;
  if (existingLink) {
    existingLink.remove();
  }

  // default 테마는 기본 style.css에 포함되어 있으므로 별도 로드 불필요
  if (theme === "default") {
    return;
  }

  // 새 테마 CSS 로드
  // 개발(http/https)/프로덕션(file) 환경에 따라 경로 설정
  const baseHref =
    window.location.protocol === "file:"
      ? window.location.pathname.replace(/index\.html$/, "")
      : "/";

  const link = document.createElement("link");
  link.id = THEME_CSS_ID;
  link.rel = "stylesheet";
  link.href = `${baseHref}assets/themes/${theme}.css`;
  document.head.appendChild(link);
}

/**
 * 다크 모드 적용
 */
function applyDarkMode(isDark: boolean): void {
  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

/**
 * 테마 설정 조회
 */
export function useThemeSettings() {
  return useQuery({
    queryKey: queryKeys.themeSettings.all,
    queryFn: async () => {
      const result = await window.api.invoke("getAllSettings");
      return {
        colorTheme: result.settings.colorTheme ?? "default",
      };
    },
    staleTime: 1000 * 60 * 5, // 5분
  });
}

/**
 * 테마 변경 Mutation
 */
export function useSetTheme() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (theme: string) => {
      return await window.api.invoke("updateSettings", {
        settings: { colorTheme: theme },
      });
    },
    onSuccess: (data) => {
      const theme = data.settings.colorTheme ?? "default";
      // 캐시 업데이트
      queryClient.setQueryData(queryKeys.themeSettings.all, {
        colorTheme: theme,
      });
      // CSS 로드
      loadThemeCSS(theme);
    },
  });
}

/**
 * 테마 초기화 (앱 시작 시 호출)
 */
export function initializeTheme(colorTheme: string, isDark: boolean): void {
  loadThemeCSS(colorTheme);
  applyDarkMode(isDark);
}
