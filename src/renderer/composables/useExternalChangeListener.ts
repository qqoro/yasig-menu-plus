/**
 * MCP 툴이 데이터를 바꿨을 때 vue-query 캐시 무효화
 *
 * useAutoScanListener와 같은 패턴. App.vue에서 한 번만 마운트한다.
 * 토스트는 띄우지 않는다(AI가 연속 수정하면 알림이 쏟아진다).
 */

import { useQueryClient } from "@tanstack/vue-query";
import { onMounted, onUnmounted } from "vue";
import type { ExternalDataChangedPayload } from "../../main/events.js";
import { queryKeys } from "../queryKeys";

export function useExternalChangeListener() {
  const queryClient = useQueryClient();

  function invalidateGames(paths?: string[]) {
    queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.duplicates.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.autocomplete.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    if (paths && paths.length > 0) {
      for (const path of paths) {
        queryClient.invalidateQueries({ queryKey: queryKeys.gameDetail(path) });
        queryClient.invalidateQueries({ queryKey: queryKeys.gameImages(path) });
      }
    } else {
      // 어떤 게임이 바뀌었는지 모르면(재스캔) 상세·이미지 캐시를 통째로 비운다
      queryClient.invalidateQueries({ queryKey: queryKeys.gameDetailAll });
      queryClient.invalidateQueries({ queryKey: queryKeys.gameImagesAll });
    }
  }

  function onExternalDataChanged(payload: ExternalDataChangedPayload) {
    switch (payload.scope) {
      case "games":
        invalidateGames(payload.paths);
        break;
      case "library":
        queryClient.invalidateQueries({ queryKey: queryKeys.libraryPaths.all });
        queryClient.invalidateQueries({
          queryKey: queryKeys.disabledLibraryPaths.all,
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.offlineLibraryPaths.all,
        });
        queryClient.invalidateQueries({
          queryKey: queryKeys.libraryScanHistory.all,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
        break;
      case "excludedExecutables":
        queryClient.invalidateQueries({
          queryKey: queryKeys.excludedExecutables.all,
        });
        break;
    }
  }

  onMounted(() => {
    window.api.on("externalDataChanged", onExternalDataChanged);
  });

  onUnmounted(() => {
    window.api.removeListener("externalDataChanged", onExternalDataChanged);
  });
}
