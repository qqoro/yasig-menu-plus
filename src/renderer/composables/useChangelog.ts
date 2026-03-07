/**
 * 체인지로그 조회 Composable
 *
 * GitHub Releases에서 체인지로그 정보를 조회
 */

import { useQuery } from "@tanstack/vue-query";
import { computed, ref, toValue, type MaybeRef } from "vue";
import { queryKeys } from "../queryKeys";

export interface ReleaseInfo {
  version: string;
  name: string;
  body: string;
  publishedAt: string;
  htmlUrl: string;
}

/**
 * 체인지로그 조회
 *
 * mode:
 * - "afterVersion": 현재 버전 이후 릴리즈 (업데이트 알림용)
 * - "recent": 최근 10개 릴리즈 (업데이트 후 첫 실행용)
 */
export function useChangelog(
  currentVersion: MaybeRef<string> | string,
  mode: "afterVersion" | "recent" = "afterVersion",
) {
  // Vue Query의 queryKey는 반응형 값을 사용해야 함
  const versionRef =
    typeof currentVersion === "string" ? ref(currentVersion) : currentVersion;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: queryKeys.changelog(toValue(versionRef), mode),
    queryFn: async (): Promise<ReleaseInfo[]> => {
      const result = await window.api.invoke("getChangelog", {
        currentVersion: toValue(versionRef),
        mode,
      });
      return result.releases;
    },
    staleTime: 5 * 60 * 1000, // 5분
    gcTime: 30 * 60 * 1000, // 30분
  });

  const releases = computed(() => data.value ?? []);
  const hasReleases = computed(() => releases.value.length > 0);

  return {
    releases,
    isLoading,
    error,
    hasReleases,
    refetch,
  };
}
