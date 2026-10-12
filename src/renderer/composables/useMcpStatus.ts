/**
 * AI 연동(MCP 서버) 상태 조회
 *
 * 최초 1회 invoke로 가져오고, 이후에는 메인이 보내는 mcpStatusChanged로 갱신한다.
 */

import { useQuery, useQueryClient } from "@tanstack/vue-query";
import { onMounted, onUnmounted } from "vue";
import type { McpStatus } from "../../main/events.js";
import { queryKeys } from "../queryKeys";

export function useMcpStatus() {
  const queryClient = useQueryClient();

  function onStatusChanged(status: McpStatus) {
    queryClient.setQueryData(queryKeys.mcpStatus.all, status);
  }

  onMounted(() => {
    window.api.on("mcpStatusChanged", onStatusChanged);
  });

  onUnmounted(() => {
    window.api.removeListener("mcpStatusChanged", onStatusChanged);
  });

  return useQuery({
    queryKey: queryKeys.mcpStatus.all,
    queryFn: async (): Promise<McpStatus> => {
      return await window.api.invoke("getMcpStatus");
    },
    staleTime: Infinity, // 이벤트로만 갱신
  });
}
