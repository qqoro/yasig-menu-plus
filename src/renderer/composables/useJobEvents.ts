/**
 * 백그라운드 작업 이벤트 처리 (App.vue에서 한 번만 마운트)
 *
 * - jobStatusChanged → 작업 상태 캐시 갱신
 * - 상태를 보고 동기화 진행 토스트와 봇 인증 대화상자를 띄운다. 이벤트가 아니라
 *   상태를 보므로 새로고침 직후 받아온 스냅샷만으로도 다시 뜬다
 * - jobFinished → 완료/실패 토스트와 캐시 무효화. 어느 화면에 있든 뜨도록
 *   화면 컴포넌트가 아닌 여기서 처리한다
 */

import { useQueryClient } from "@tanstack/vue-query";
import { onMounted, onUnmounted, watch } from "vue";
import { toast } from "vue-sonner";
import type {
  JobFinishedPayload,
  JobStatus,
  PendingBotBlock,
} from "../../main/events.js";
import { formatSyncProgress, formatSyncSummary } from "../lib/job-label";
import { queryKeys } from "../queryKeys";
import { useJobStatus } from "./useJobStatus";

const SYNC_TOAST_ID = "sync-progress";

const FAILURE_TITLES = {
  sync: "동기화 실패",
  collect: "정보 수집 실패",
  translate: "번역 실패",
} as const;

export function useJobEvents(options: {
  onBotBlock: (block: PendingBotBlock) => void;
  onBotBlockCleared: () => void;
}) {
  const queryClient = useQueryClient();
  const { status } = useJobStatus();

  function onJobStatusChanged(snapshot: JobStatus) {
    queryClient.setQueryData(queryKeys.jobStatus.all, snapshot);
  }

  function onJobFinished(payload: JobFinishedPayload) {
    if (payload.kind === "sync") toast.dismiss(SYNC_TOAST_ID);

    if (!payload.ok) {
      toast.error(FAILURE_TITLES[payload.kind], { description: payload.error });
      queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
      return;
    }

    switch (payload.kind) {
      case "sync": {
        const { scan, collect, translate } = payload.result;
        if (!scan.ok) {
          toast.error("폴더 스캔 실패", { description: scan.error });
        } else if (scan.deletedCount > 0) {
          toast.info(`${scan.deletedCount}개의 게임이 삭제되었습니다.`);
        }
        if (!collect.ok) {
          toast.error("정보 수집 실패", { description: collect.error });
        }
        if (!translate.ok) {
          toast.error("번역 실패", { description: translate.error });
        }
        const summary = formatSyncSummary(payload.result);
        if (summary) {
          toast.success("전체 동기화 완료", {
            description: summary,
            duration: 3000,
          });
        } else {
          toast.success("동기화 완료", { duration: 3000 });
        }
        // 스캔으로 목록·상세·마지막 동기화 시간이 모두 바뀔 수 있다
        queryClient.invalidateQueries();
        break;
      }
      case "collect":
        toast.success(
          payload.result.force
            ? "모든 게임 정보 재수집이 완료되었습니다."
            : "미수집 게임 정보 수집이 완료되었습니다.",
        );
        queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
        break;
      case "translate":
        toast.success("전체 번역 완료", {
          description: `성공: ${payload.result.success}, 실패: ${payload.result.failed}`,
        });
        queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
        break;
    }
  }

  // 동기화 진행 토스트 (새로고침 후 첫 스냅샷에서도 다시 뜬다)
  watch(
    status,
    (next, prev) => {
      if (next.kind === "sync") {
        toast.info("동기화 중...", {
          id: SYNC_TOAST_ID,
          description: formatSyncProgress(next),
          duration: Infinity,
        });
      } else if (prev?.kind === "sync") {
        toast.dismiss(SYNC_TOAST_ID);
      }

      // 스캔이 끝나면 마지막 동기화 시간이 저장되므로 동기화 완료를 기다리지 않고 갱신
      if (
        prev?.kind === "sync" &&
        prev.step === "scan" &&
        next.step !== "scan"
      ) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.lastRefreshed.all,
        });
      }
    },
    { immediate: true },
  );

  // 봇 인증 대기가 새로 생기면 대화상자를 열고, 풀리면(해결·취소·시간 초과) 닫는다
  watch(
    () => status.value.pendingBotBlock,
    (next, prev) => {
      if (next && next.gamePath !== prev?.gamePath) {
        options.onBotBlock(next);
      } else if (!next && prev) {
        options.onBotBlockCleared();
      }
    },
    { immediate: true },
  );

  onMounted(() => {
    window.api.on("jobStatusChanged", onJobStatusChanged);
    window.api.on("jobFinished", onJobFinished);
  });

  onUnmounted(() => {
    window.api.removeListener("jobStatusChanged", onJobStatusChanged);
    window.api.removeListener("jobFinished", onJobFinished);
  });
}
