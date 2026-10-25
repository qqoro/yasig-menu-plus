import type { IpcMainEventMap } from "@main/events";
import { defineStore } from "pinia";
import { ref } from "vue";

export type DeleteFailure = IpcMainEventMap["gamesDeleted"]["failed"][number];

/**
 * 게임 삭제 실패 모달 상태
 * 삭제는 여러 화면에서 일어나므로 모달은 App.vue에 하나만 두고 이 스토어로 띄운다
 */
export const useDeleteFailureStore = defineStore("deleteFailure", () => {
  const open = ref(false);
  const failed = ref<DeleteFailure[]>([]);
  // 함께 성공한 게임 수 (모달 요약에 표시)
  const deletedCount = ref(0);
  // 영구 삭제였는지 — 영구 삭제까지 실패했다면 더 시도할 방법이 없다
  const permanent = ref(false);

  function show(
    result: IpcMainEventMap["gamesDeleted"],
    wasPermanent: boolean,
  ) {
    failed.value = result.failed;
    deletedCount.value = result.deletedCount;
    permanent.value = wasPermanent;
    open.value = true;
  }

  return { open, failed, deletedCount, permanent, show };
});
