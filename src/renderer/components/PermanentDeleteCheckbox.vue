<script setup lang="ts">
/**
 * 삭제 확인 다이얼로그의 "영구 삭제" 체크박스 (모든 삭제 다이얼로그가 상태를 공유)
 */
import { Checkbox } from "./ui/checkbox";
import { usePermanentDelete } from "../composables/usePermanentDelete";

const { permanentDelete } = usePermanentDelete();
</script>

<template>
  <label class="flex cursor-pointer items-center gap-2 text-sm">
    <Checkbox
      :model-value="permanentDelete"
      @update:model-value="permanentDelete = $event === true"
    />
    휴지통을 거치지 않고 영구 삭제
  </label>
</template>
