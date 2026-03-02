<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-vue-next";
import { computed, ref, watch } from "vue";

const props = defineProps<{
  open: boolean;
  images: string[]; // 로컬 경로 배열
  initialIndex?: number;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

const currentIndex = ref(props.initialIndex ?? 0);

// 다이얼로그가 열릴 때 인덱스 초기화
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      currentIndex.value = props.initialIndex ?? 0;
    }
  },
);

const currentImage = computed(() => props.images[currentIndex.value]);

const nextImage = () => {
  if (currentIndex.value < props.images.length - 1) {
    currentIndex.value++;
  }
};

const prevImage = () => {
  if (currentIndex.value > 0) {
    currentIndex.value--;
  }
};

// 키보드 네비게이션
const handleKeydown = (e: KeyboardEvent) => {
  if (!props.open) return;
  if (e.key === "ArrowLeft") prevImage();
  if (e.key === "ArrowRight") nextImage();
  if (e.key === "Escape") emit("update:open", false);
};

// 휠 네비게이션
const handleWheel = (e: WheelEvent) => {
  if (!props.open) return;
  e.preventDefault();
  if (e.deltaY > 0) nextImage();
  else prevImage();
};
</script>

<template>
  <Dialog
    :open="open"
    @update:open="emit('update:open', $event)"
    @keydown="handleKeydown"
  >
    <DialogContent
      class="max-w-screen! cursor-zoom-out border-0 bg-transparent p-0 shadow-none"
      @click="emit('update:open', false)"
    >
      <div
        class="relative flex h-screen max-h-[100dvh] items-center justify-center p-6"
        @wheel="handleWheel"
      >
        <img
          v-if="currentImage"
          :src="`file:///${currentImage.replaceAll('\\', '/')}`"
          class="h-full w-full rounded-xl object-contain"
        />

        <!-- 이미지 없음 -->
        <div v-else class="text-muted-foreground">표시할 이미지가 없습니다</div>

        <!-- 이전/다음 버튼 -->
        <Button
          v-if="currentIndex > 0"
          @click="prevImage"
          class="bg-primary/30 hover:bg-primary-foreground/20 absolute left-2 aspect-square size-20 backdrop-blur-xs"
        >
          <ChevronLeft class="size-12" />
        </Button>
        <Button
          v-if="currentIndex < images.length - 1"
          @click="nextImage"
          class="bg-primary/30 hover:bg-primary-foreground/20 absolute right-2 aspect-square size-20 backdrop-blur-xs"
        >
          <ChevronRight class="size-12" />
        </Button>

        <!-- 인디케이터 -->
        <div v-if="images.length > 1" class="absolute bottom-4 flex gap-2">
          <span
            v-for="(_, i) in images"
            :key="i"
            :class="[
              'h-2 w-2 rounded-full transition-colors',
              i === currentIndex ? 'bg-foreground' : 'bg-foreground/50',
            ]"
          />
        </div>

        <!-- 이미지 카운터 -->
        <div
          v-if="images.length > 1"
          class="bg-popover/80 text-popover-foreground absolute top-4 right-4 rounded px-2 py-1 text-sm"
        >
          {{ currentIndex + 1 }} / {{ images.length }}
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
