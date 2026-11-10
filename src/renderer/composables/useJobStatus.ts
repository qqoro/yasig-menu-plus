/**
 * 백그라운드 작업 상태 조회
 *
 * 상태의 원본은 메인 프로세스다. 화면이 뜰 때 스냅샷을 받아오고, 이후로는
 * useJobEvents가 jobStatusChanged로 캐시를 덮어쓴다. 그래서 새로고침이나
 * 화면 이동 뒤에도 진행 중인 작업이 그대로 보인다.
 */

import { useQuery } from "@tanstack/vue-query";
import { computed } from "vue";
import type { JobStatus } from "../../main/events.js";
import { queryKeys } from "../queryKeys";

export const IDLE_JOB_STATUS: JobStatus = {
  kind: null,
  step: null,
  stepIndex: 0,
  stepCount: 0,
  current: 0,
  total: 0,
  gameTitle: "",
  pendingBotBlock: null,
};

export function useJobStatus() {
  const query = useQuery({
    queryKey: queryKeys.jobStatus.all,
    queryFn: () => window.api.invoke("getJobStatus"),
    // 이벤트로 갱신되므로 다시 가져올 필요가 없다
    staleTime: Infinity,
  });

  const status = computed<JobStatus>(() => query.data.value ?? IDLE_JOB_STATUS);
  const isBusy = computed(() => status.value.kind !== null);

  return { status, isBusy };
}
