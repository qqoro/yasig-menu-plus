<script setup lang="ts">
import { AlertTriangle } from "lucide-vue-next";
import { ref, watch } from "vue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const props = defineProps<{
  open: boolean;
  gameTitle: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "resolved"): void;
  (e: "cancel"): void;
  (e: "ignore", minutes: number): void;
}>();

const isResolving = ref(false);

// 다이얼로그가 닫히면 상태 리셋
watch(
  () => props.open,
  (newVal) => {
    if (!newVal) {
      isResolving.value = false;
    }
  },
);

// 해결 완료 버튼 클릭
const handleResolved = async () => {
  isResolving.value = true;
  await window.api.invoke("resolveBotBlock", { resolved: true });
  emit("resolved");
  emit("update:open", false);
};

// 취소 버튼 클릭
const handleCancel = async () => {
  await window.api.invoke("resolveBotBlock", { resolved: false });
  emit("cancel");
  emit("update:open", false);
};

// 30분 동안 무시 버튼 클릭
const handleIgnore = async () => {
  await window.api.invoke("resolveBotBlock", {
    resolved: false,
    ignoreMinutes: 30,
  });
  emit("ignore", 30);
  emit("update:open", false);
};
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="z-[100] max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <AlertTriangle class="size-5 text-amber-500" />
          Google 봇 차단 감지
        </DialogTitle>
        <DialogDescription> CAPTCHA 해결이 필요합니다 </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <p class="text-muted-foreground text-sm">
          <span class="text-foreground font-medium">{{ gameTitle }}</span>
          게임의 썸네일을 수집하는 중 Google에서 봇 차단이 감지되었습니다.
        </p>
        <p class="text-muted-foreground text-sm">
          Chrome 브라우저 창이 열렸습니다. CAPTCHA를 해결하거나, 계속해서
          차단되는 경우 시간이 좀 흐른 후 다시 시도해주세요.
        </p>
        <p class="text-muted-foreground text-xs">최대 대기 시간: 2분</p>
      </div>

      <div class="flex justify-end gap-2">
        <Button variant="outline" @click="handleCancel" :disabled="isResolving">
          취소
        </Button>
        <Button variant="outline" @click="handleIgnore" :disabled="isResolving">
          30분 무시
        </Button>
        <Button @click="handleResolved" :disabled="isResolving">
          <span v-if="isResolving">처리 중...</span>
          <span v-else>해결 완료</span>
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
