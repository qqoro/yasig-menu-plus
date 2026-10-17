<script setup lang="ts">
import type { ListCheckPreviewInfo } from "@main/events";
import { useIntersectionObserver } from "@vueuse/core";
import { ImageOff } from "lucide-vue-next";
import { computed, ref, useTemplateRef } from "vue";
import { useGameDetail } from "@/composables/useGameDetail";
import { useGameImages } from "@/composables/useGameImages";
import { useListCheckPreview } from "@/composables/useListCheck";
import { TooltipArrow, TooltipContent, TooltipPortal } from "reka-ui";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ListCheckPreviewCard, {
  type PreviewSlide,
} from "./ListCheckPreviewCard.vue";

interface Props {
  /** 미보유 작품 — 외부 사이트에서 이미지·정보를 가져옴 */
  remote?: { provider: string; externalId: string } | null;
  /** 보유 게임 — 라이브러리에 저장된 이미지·정보를 씀 */
  owned?: { path: string; thumbnail: string | null } | null;
  blur?: boolean;
}

const props = defineProps<Props>();

function toFileUrl(path: string): string {
  return `file:///${path.replaceAll("\\", "/")}`;
}

// 화면에 처음 보일 때부터 외부 미리보기 요청 (보이는 줄부터 불러오기)
const root = useTemplateRef<HTMLElement>("root");
const hasBeenVisible = ref(false);
const { stop } = useIntersectionObserver(root, ([entry]) => {
  if (entry?.isIntersecting) {
    hasBeenVisible.value = true;
    stop();
  }
});

const remoteEnabled = computed(() => !!props.remote && hasBeenVisible.value);
const remoteQuery = props.remote
  ? useListCheckPreview(
      props.remote.provider,
      props.remote.externalId,
      remoteEnabled,
    )
  : null;

// 보유 게임 상세·이미지는 미리보기를 처음 열 때 조회
const hoverOpen = ref(false);
const ownedRequested = ref(false);
const ownedPath = computed(() =>
  props.owned && ownedRequested.value ? props.owned.path : "",
);
const ownedDetail = useGameDetail(ownedPath);
const ownedImages = useGameImages(ownedPath);

function handleOpenChange(open: boolean): void {
  hoverOpen.value = open;
  if (open) ownedRequested.value = true;
}

const thumbnailSrc = computed(() => {
  if (props.owned) {
    return props.owned.thumbnail ? toFileUrl(props.owned.thumbnail) : null;
  }
  return remoteQuery?.data.value?.thumbnail ?? null;
});

const isThumbnailLoading = computed(
  () =>
    !!props.remote &&
    (!hasBeenVisible.value || (remoteQuery?.isPending.value ?? false)),
);

const slides = computed<PreviewSlide[]>(() => {
  if (props.owned) {
    const images = ownedImages.data.value ?? [];
    if (images.length > 0)
      return images.map((img) => ({ src: toFileUrl(img.path) }));
    return thumbnailSrc.value ? [{ src: thumbnailSrc.value }] : [];
  }
  const preview = remoteQuery?.data.value;
  if (!preview) return [];
  return [
    ...(preview.thumbnail ? [{ src: preview.thumbnail }] : []),
    ...preview.images.map((url) => ({ url })),
  ];
});

const info = computed<ListCheckPreviewInfo | null>(() => {
  if (props.owned) {
    const game = ownedDetail.data.value;
    if (!game) return null;
    return {
      title: game.title,
      rating: game.externalRating ?? null,
      reviewCount: game.externalReviewCount ?? null,
      downloadCount: game.downloadCount ?? null,
      publishDate: game.publishDate
        ? new Date(game.publishDate).toISOString()
        : null,
      makers: game.makers,
      tags: game.tags,
    };
  }
  return remoteQuery?.data.value?.info ?? null;
});

const isPreviewLoading = computed(() =>
  props.owned
    ? ownedDetail.isPending.value || ownedImages.isPending.value
    : isThumbnailLoading.value,
);
</script>

<template>
  <div ref="root" class="h-24 w-32 shrink-0">
    <div
      v-if="isThumbnailLoading"
      class="bg-muted h-full w-full animate-pulse rounded-md"
    />
    <TooltipProvider v-else-if="remote || owned" :delay-duration="150">
      <Tooltip :open="hoverOpen" @update:open="handleOpenChange">
        <TooltipTrigger as-child>
          <img
            v-if="thumbnailSrc"
            :src="thumbnailSrc"
            alt=""
            class="h-full w-full rounded-md object-cover"
            :class="{ 'blur-sm': blur }"
          />
          <div
            v-else
            class="text-muted-foreground flex h-full w-full items-center justify-center rounded-md border border-dashed"
          >
            <ImageOff :size="20" />
          </div>
        </TooltipTrigger>
        <!-- shadcn 래퍼의 화살표는 마름모(회전 사각형)가 카드 밖으로 떠 보이므로, 삼각형 화살표를 직접 단다 -->
        <TooltipPortal>
          <TooltipContent
            side="right"
            :side-offset="4"
            class="animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=right]:slide-in-from-left-2 z-50 rounded-md shadow-xl"
          >
            <ListCheckPreviewCard
              :slides="slides"
              :info="info"
              :loading="isPreviewLoading"
              :blur="blur"
              :active="hoverOpen"
            />
            <TooltipArrow
              class="fill-muted-foreground"
              :width="14"
              :height="7"
            />
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
    <div
      v-else
      class="text-muted-foreground flex h-full w-full items-center justify-center rounded-md border border-dashed"
      title="이미지 없음"
    >
      <ImageOff :size="20" />
    </div>
  </div>
</template>
