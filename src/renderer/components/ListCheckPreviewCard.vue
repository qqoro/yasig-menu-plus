<script setup lang="ts">
import type { ListCheckPreviewInfo } from "@main/events";
import { ImageOff, Loader2, Star, Tag } from "lucide-vue-next";
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useListCheckImage } from "@/composables/useListCheck";

/** 미리보기 한 장 — 바로 표시 가능한 src 또는 받아와야 하는 원격 url */
export type PreviewSlide = { src: string } | { url: string };

interface Props {
  slides: PreviewSlide[];
  info: ListCheckPreviewInfo | null;
  /** 정보·이미지 목록을 아직 불러오는 중 */
  loading?: boolean;
  blur?: boolean;
  /** 미리보기가 떠 있는 동안만 키보드(A/D/T) 조작 */
  active?: boolean;
}

const props = defineProps<Props>();

const index = ref(0);
const tagsOpen = ref(false);

// 다른 작품으로 바뀌면 처음부터
watch(
  () => props.slides,
  () => {
    if (index.value >= props.slides.length) index.value = 0;
  },
);

const total = computed(() => props.slides.length);

function remoteUrlAt(i: number): string | null {
  const slide = props.slides[i];
  return slide && "url" in slide ? slide.url : null;
}

const currentRemoteUrl = computed(() => remoteUrlAt(index.value));
// 다음 장을 미리 받아 넘길 때 기다리지 않게 함
const nextRemoteUrl = computed(() =>
  total.value > 1 ? remoteUrlAt((index.value + 1) % total.value) : null,
);
const currentImage = useListCheckImage(currentRemoteUrl);
useListCheckImage(nextRemoteUrl);

const currentSrc = computed(() => {
  const slide = props.slides[index.value];
  if (!slide) return null;
  return "src" in slide ? slide.src : (currentImage.data.value ?? null);
});

const isImageLoading = computed(
  () =>
    (props.loading && total.value === 0) ||
    (!!currentRemoteUrl.value && currentImage.isPending.value),
);

function move(step: number): void {
  if (total.value < 2) return;
  index.value = (index.value + step + total.value) % total.value;
}

/** 터치패드처럼 한 번에 휠 이벤트가 여러 개 오는 경우 한 장씩만 넘기기 위한 간격 */
const WHEEL_COOLDOWN_MS = 150;
let lastWheelAt = 0;

function handleWheel(event: WheelEvent): void {
  const delta =
    Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
  if (delta === 0) return;

  const now = performance.now();
  if (now - lastWheelAt < WHEEL_COOLDOWN_MS) return;
  lastWheelAt = now;
  move(delta > 0 ? 1 : -1);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA"
  );
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (isEditableTarget(event.target)) return;

  const key = event.key.toLowerCase();
  if (key === "a" || key === "arrowleft") move(-1);
  else if (key === "d" || key === "arrowright") move(1);
  else if (key === "t") tagsOpen.value = !tagsOpen.value;
  else return;
  event.preventDefault();
}

watch(
  () => props.active,
  (active) => {
    if (active) window.addEventListener("keydown", handleKeydown);
    else window.removeEventListener("keydown", handleKeydown);
  },
  { immediate: true },
);
onBeforeUnmount(() => window.removeEventListener("keydown", handleKeydown));

const publishDate = computed(() => {
  const value = props.info?.publishDate;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
});

const tags = computed(() => props.info?.tags ?? []);
const makers = computed(() => props.info?.makers.join(", ") ?? "");
</script>

<template>
  <div
    class="bg-background relative w-md overflow-hidden rounded-md"
    @wheel.prevent="handleWheel"
  >
    <!-- 이미지 -->
    <div
      class="bg-muted relative flex aspect-4/3 items-center justify-center overflow-hidden"
    >
      <Loader2
        v-if="isImageLoading"
        class="text-muted-foreground animate-spin"
        :size="24"
      />
      <template v-else-if="currentSrc">
        <!-- 비율이 다른 이미지의 여백을 같은 이미지를 흐리게 깔아 채운다 -->
        <img
          :src="currentSrc"
          alt=""
          aria-hidden="true"
          class="absolute inset-0 h-full w-full scale-125 object-cover opacity-80 blur-xl"
        />
        <img
          :src="currentSrc"
          alt=""
          class="relative h-full w-full object-contain"
          :class="{ 'blur-md': blur }"
        />
      </template>
      <ImageOff v-else class="text-muted-foreground" :size="24" />
    </div>

    <!-- 정보 (이미지 아래쪽에 겹침) -->
    <div
      class="from-background via-background/80 text-foreground absolute inset-x-0 bottom-0 flex flex-col gap-1.5 bg-linear-to-t to-transparent p-3 pt-10"
    >
      <div v-if="tagsOpen && tags.length > 0" class="flex flex-wrap gap-1">
        <span
          v-for="tag in tags"
          :key="tag"
          class="bg-secondary text-secondary-foreground rounded-sm px-1.5 py-0.5 text-[11px]"
          >{{ tag }}</span
        >
      </div>

      <div class="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
        <span
          v-if="info?.rating != null"
          class="bg-background/90 flex items-center gap-1 rounded-md border px-2 py-0.5"
        >
          <Star :size="12" class="fill-current" />
          {{ info.rating.toFixed(2) }}
          <span v-if="info.reviewCount != null" class="text-muted-foreground"
            >({{ info.reviewCount.toLocaleString() }})</span
          >
        </span>
        <span
          v-if="info?.downloadCount != null"
          class="bg-background/90 rounded-md border px-2 py-0.5"
          >판매 {{ info.downloadCount.toLocaleString() }}건</span
        >
        <span
          v-if="publishDate"
          class="bg-background/90 rounded-md border px-2 py-0.5"
          >{{ publishDate }}</span
        >
        <Loader2
          v-if="loading && !info"
          :size="14"
          class="text-muted-foreground animate-spin"
        />
      </div>

      <div class="flex items-center gap-2 text-[11px]">
        <span v-if="makers" class="truncate font-medium">{{ makers }}</span>
        <span
          v-if="tags.length > 0"
          class="text-muted-foreground flex shrink-0 items-center gap-1"
        >
          <Tag :size="11" />
          태그 {{ tags.length }}개 · T {{ tagsOpen ? "접기" : "펼치기" }}
        </span>
        <span class="flex-1" />
        <span v-if="total > 1" class="text-muted-foreground shrink-0 font-mono"
          >{{ index + 1 }}/{{ total }} ← → A·D · 휠</span
        >
      </div>
    </div>
  </div>
</template>
