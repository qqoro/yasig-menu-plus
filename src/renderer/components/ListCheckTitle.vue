<script setup lang="ts">
import { computed, ref } from "vue";
import { useListCheckPreview } from "@/composables/useListCheck";

interface Props {
  /** 붙여넣은 원문 줄 */
  line: string;
  /** 미보유 작품 — 썸네일이 받아 온 미리보기 정보에서 원제를 읽음 */
  remote?: { provider: string; externalId: string } | null;
  /** 보유 게임 제목 (제목 표시 설정을 따름) */
  ownedTitle?: string | null;
}

const props = defineProps<Props>();

// 요청은 썸네일이 보일 때 하므로 여기서는 같은 캐시를 읽기만 한다
const remoteQuery = props.remote
  ? useListCheckPreview(
      props.remote.provider,
      props.remote.externalId,
      ref(false),
    )
  : null;

function compact(text: string): string {
  return text.replace(/\s+/g, "").toLowerCase();
}

const originalTitle = computed(() => {
  const title = props.ownedTitle ?? remoteQuery?.data.value?.info?.title;
  if (!title?.trim()) return null;
  // 붙여넣은 줄에 이미 원제가 들어 있으면 반복하지 않음
  return compact(props.line).includes(compact(title)) ? null : title;
});
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <span>{{ line }}</span>
    <span v-if="originalTitle" class="text-muted-foreground text-xs">{{
      originalTitle
    }}</span>
  </div>
</template>
