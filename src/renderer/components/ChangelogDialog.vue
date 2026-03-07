<script setup lang="ts">
import { toRef, watch } from "vue";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useChangelog, type ReleaseInfo } from "@/composables/useChangelog";

const props = defineProps<{
  open: boolean;
  currentVersion: string;
  mode?: "afterVersion" | "recent";
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

// props 반응성 유지
const currentVersionRef = toRef(() => props.currentVersion);

const { releases, isLoading, error, hasReleases, refetch } = useChangelog(
  currentVersionRef,
  props.mode ?? "recent",
);

// 다이얼로그 열릴 때 데이터 다시 불러오기
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      refetch();
    }
  },
);

// 마크다운을 HTML로 변환 (XSS 방지)
function renderMarkdown(body: string): string {
  const html = marked.parse(body) as string;
  return DOMPurify.sanitize(html);
}

// 날짜 포맷팅
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// 외부 링크 열기
function openExternal(url: string) {
  window.open(url, "_blank");
}

// 닫기
function close() {
  emit("update:open", false);
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="flex max-h-[80vh] max-w-2xl flex-col">
      <DialogHeader>
        <DialogTitle>업데이트 내역</DialogTitle>
        <DialogDescription>
          새로운 기능과 변경사항을 확인하세요
        </DialogDescription>
      </DialogHeader>

      <div class="-mx-6 flex-1 overflow-y-auto px-6">
        <div v-if="isLoading" class="text-muted-foreground py-8 text-center">
          불러오는 중...
        </div>

        <div v-else-if="error" class="text-destructive py-8 text-center">
          업데이트 내역을 불러오지 못했습니다
        </div>

        <div
          v-else-if="!hasReleases"
          class="text-muted-foreground py-8 text-center"
        >
          새로운 업데이트가 없습니다
        </div>

        <div v-else class="flex flex-col gap-6 pb-4">
          <div
            v-for="release in releases"
            :key="release.version"
            class="border-border border-b pb-6 last:border-b-0"
          >
            <div class="mb-3 flex items-center justify-between">
              <h3 class="text-foreground text-lg font-semibold">
                {{ release.name }}
              </h3>
              <span class="text-muted-foreground text-sm">
                {{ formatDate(release.publishedAt) }}
              </span>
            </div>

            <article
              class="prose prose-sm dark:prose-invert max-w-none"
              v-html="renderMarkdown(release.body)"
            />

            <Button
              variant="ghost"
              size="sm"
              class="mt-2"
              @click="openExternal(release.htmlUrl)"
            >
              GitHub에서 보기
            </Button>
          </div>
        </div>
      </div>

      <div class="border-border flex justify-end border-t pt-4">
        <Button variant="outline" @click="close"> 닫기 </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
