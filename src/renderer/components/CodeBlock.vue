<script setup lang="ts">
import { Check, Copy } from "lucide-vue-next";
import { onBeforeUnmount, ref } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";

/**
 * 복사 버튼이 달린 코드 블록.
 * 명령어·설정 조각처럼 사용자가 그대로 붙여 넣을 내용을 보여 줄 때 쓴다.
 */
const props = withDefaults(
  defineProps<{
    /** 표시하고 복사할 내용 */
    code: string;
    /** 복사 성공 토스트 문구 */
    copiedMessage?: string;
  }>(),
  { copiedMessage: "복사했습니다." },
);

const copied = ref(false);
let resetTimer: ReturnType<typeof setTimeout> | undefined;

async function copy() {
  try {
    await navigator.clipboard.writeText(props.code);
    copied.value = true;
    toast.success(props.copiedMessage);
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => (copied.value = false), 1500);
  } catch {
    toast.error("클립보드에 복사하지 못했습니다.");
  }
}

onBeforeUnmount(() => clearTimeout(resetTimer));
</script>

<template>
  <div class="bg-muted relative rounded">
    <pre
      class="overflow-x-auto py-1.5 pr-9 pl-2.5 font-mono text-xs leading-relaxed"
      >{{ code }}</pre>
    <Button
      variant="ghost"
      size="icon-sm"
      class="text-muted-foreground hover:text-foreground absolute top-0.5 right-0.5 size-7"
      :title="copied ? '복사됨' : '복사'"
      @click="copy"
    >
      <Check v-if="copied" :size="14" />
      <Copy v-else :size="14" />
    </Button>
  </div>
</template>
