<script setup lang="ts">
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Flag,
  FlagOff,
  FolderOpen,
  Globe,
  Info,
  Loader2,
  Play,
  Star,
  StarOff,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { useAllSettings } from "../composables/useAllSettings";
import { useTranslationSettings } from "../composables/useTranslationSettings";
import type { GameItem } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";

interface Props {
  game: GameItem;
  isActiveTag?: (tag: string) => boolean;
  isActiveCircle?: (circle: string) => boolean;
  isActiveCategory?: (category: string) => boolean;
  isPlaying?: boolean;
  isToggling?: boolean;
}

interface Emits {
  (e: "play", game: GameItem): void;
  (e: "open-folder", game: GameItem): void;
  (e: "toggle-favorite", game: GameItem): void;
  (e: "toggle-hidden", game: GameItem): void;
  (e: "toggle-clear", game: GameItem): void;
  (e: "click-tag", tag: string): void;
  (e: "click-circle", circle: string): void;
  (e: "click-category", category: string): void;
  (e: "show-detail", game: GameItem): void;
  (e: "open-original-site", game: GameItem): void;
}

const props = withDefaults(defineProps<Props>(), {
  isPlaying: false,
  isToggling: false,
});

const emit = defineEmits<Emits>();

// 번역 설정 조회
const { data: translationSettings } = useTranslationSettings();

// 통합 설정 조회
const { data: settings } = useAllSettings();

// 태그 전체 보기 상태
const showAllTags = ref(false);

// 발매일 포맷팅
const formattedPublishDate = computed(() => {
  if (!props.game.publishDate) return null;
  const date = new Date(props.game.publishDate);
  return date
    .toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replaceAll(".", "-");
});

// 썸네일 URL (updatedAt으로 캐시 무효화)
const thumbnailUrl = computed(() => {
  if (!props.game.thumbnail) return undefined;
  const cacheKey = props.game.updatedAt?.getTime() ?? 0;
  return `file:///${props.game.thumbnail.replaceAll("\\", "/")}?v=${cacheKey}`;
});

// 이미지 로드 실패 처리
function handleImageError(event: Event): void {
  (event.target as HTMLImageElement).style.display = "none";
}

// 표시할 제목 (우선순위에 따라 선택)
const displayTitle = computed(() => {
  const priority = translationSettings.value?.titleDisplayPriority ?? [
    "translated",
    "collected",
    "original",
  ];

  for (const mode of priority) {
    if (mode === "translated" && props.game.translatedTitle) {
      return props.game.translatedTitle;
    }
    if (mode === "collected" && props.game.title) {
      return props.game.title;
    }
    if (mode === "original" && props.game.originalTitle) {
      return props.game.originalTitle;
    }
  }

  // 폴백: 모든 제목이 없으면 원본 제목 반환 (항상 존재)
  return props.game.originalTitle;
});

// 제목 툴팁 (모든 제목 표시)
const titleTooltip = computed(() => {
  const lines: string[] = [];

  // 원본 (폴더명)
  if (
    props.game.originalTitle &&
    props.game.originalTitle !== props.game.title
  ) {
    lines.push(`원본: ${props.game.originalTitle}`);
  }

  // 원문 (정보 수집)
  lines.push(`원문: ${props.game.title}`);

  // 번역
  if (props.game.translatedTitle) {
    lines.push(`번역: ${props.game.translatedTitle}`);
  }

  return lines.join("\n");
});

// 플레이 핸들러
function handlePlay(): void {
  emit("play", props.game);
}

// 폴더 열기 핸들러
function handleOpenFolder(event: MouseEvent): void {
  event.stopPropagation();
  emit("open-folder", props.game);
}

// 즐겨찾기 토글
function handleToggleFavorite(event: MouseEvent): void {
  event.stopPropagation();
  emit("toggle-favorite", props.game);
}

// 숨김 토글
function handleToggleHidden(event: MouseEvent): void {
  event.stopPropagation();
  emit("toggle-hidden", props.game);
}

// 클리어 토글
function handleToggleClear(event: MouseEvent): void {
  event.stopPropagation();
  emit("toggle-clear", props.game);
}

// 태그 클릭
function handleClickTag(tag: string, event: MouseEvent): void {
  event.stopPropagation();
  emit("click-tag", tag);
}

// 서클 클릭
function handleClickCircle(circle: string, event: MouseEvent): void {
  event.stopPropagation();
  emit("click-circle", circle);
}

// 카테고리 클릭
function handleClickCategory(category: string, event: MouseEvent): void {
  event.stopPropagation();
  emit("click-category", category);
}

// 태그 활성화 상태 확인
function isTagActive(tag: string): boolean {
  return props.isActiveTag?.(tag) ?? false;
}

// 서클 활성화 상태 확인
function isCircleActive(circle: string): boolean {
  return props.isActiveCircle?.(circle) ?? false;
}

// 카테고리 활성화 상태 확인
function isCategoryActive(category: string): boolean {
  return props.isActiveCategory?.(category) ?? false;
}

// 상세 보기 핸들러
function handleShowDetail(event: MouseEvent): void {
  event.stopPropagation();
  emit("show-detail", props.game);
}

// 원본 사이트 열기 핸들러
function handleOpenOriginalSite(event: MouseEvent): void {
  event.stopPropagation();
  emit("open-original-site", props.game);
}
</script>

<template>
  <Card
    class="group hover:border-primary/50 -py-6 flex flex-col overflow-hidden transition-colors"
    :class="{ 'pointer-events-none opacity-75': isPlaying }"
  >
    <!-- 썸네일 영역 -->
    <div class="bg-muted relative aspect-4/3 overflow-hidden">
      <!-- 썸네일 이미지 -->
      <img
        v-if="game.thumbnail"
        :src="thumbnailUrl"
        :alt="game.title"
        class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
        :class="{ 'blur-md': settings?.thumbnailSettings?.blurEnabled }"
        @error="handleImageError"
      />
      <!-- 썸네일 없을 때 플레이스홀더 -->
      <div
        v-else
        class="bg-muted text-muted-foreground flex h-full w-full items-center justify-center"
      >
        <Play :size="48" class="opacity-20" />
      </div>
      <!-- 압축 파일 배지 -->
      <div v-if="game.isCompressFile" class="absolute top-2 right-2">
        <span
          class="bg-popover/80 text-popover-foreground rounded px-2 py-0.5 text-xs"
        >
          압축
        </span>
      </div>
      <!-- 별점 배지 -->
      <div
        v-if="game.rating"
        class="bg-popover/80 absolute right-2 bottom-2 flex items-center gap-1 rounded-md px-2 py-1 backdrop-blur-sm"
      >
        <Star :size="12" class="shrink-0 fill-yellow-400 text-yellow-400" />
        <span class="text-popover-foreground text-xs font-medium">{{
          game.rating
        }}</span>
      </div>
      <!-- 오버레이 버튼들 (hover 시 표시) -->
      <div
        class="bg-popover/60 absolute inset-0 flex flex-wrap content-center justify-center gap-1.5 p-2 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Button
          size="icon"
          variant="secondary"
          :disabled="isPlaying || isToggling"
          class="shrink-0"
          @click="handleToggleFavorite"
          :title="game.isFavorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'"
        >
          <Star v-if="game.isFavorite" :size="14" class="fill-current" />
          <StarOff v-else :size="14" />
        </Button>
        <Button
          size="icon"
          variant="secondary"
          :disabled="isPlaying || isToggling"
          class="shrink-0"
          @click="handleToggleClear"
          :title="game.isClear ? '클리어 취소' : '클리어 표시'"
        >
          <Flag v-if="game.isClear" :size="14" class="fill-current" />
          <FlagOff v-else :size="14" />
        </Button>
        <Button
          v-if="game.provider && game.externalId"
          size="icon"
          variant="secondary"
          class="shrink-0"
          @click="handleOpenOriginalSite"
          title="원본 사이트"
        >
          <Globe :size="14" />
        </Button>
        <Button
          size="icon"
          variant="destructive"
          :disabled="isPlaying || isToggling"
          class="shrink-0"
          @click="handleToggleHidden"
          :title="game.isHidden ? '숨김 해제' : '숨기기'"
        >
          <EyeOff v-if="game.isHidden" :size="14" />
          <Eye v-else :size="14" />
        </Button>
        <Button
          size="icon"
          variant="default"
          class="shrink-0"
          @click="handleShowDetail"
          title="상세 정보"
        >
          <Info :size="14" />
        </Button>
      </div>
    </div>

    <!-- 정보 영역 -->
    <CardContent class="flex flex-1 flex-col gap-2 p-3 pt-0">
      <!-- 게임 제목 -->
      <h3 class="truncate text-sm font-medium" :title="titleTooltip">
        {{ displayTitle }}
      </h3>

      <!-- 메타데이터 -->
      <div class="flex flex-col gap-1 text-xs">
        <!-- 발매일 -->
        <span
          v-if="formattedPublishDate"
          class="text-muted-foreground truncate"
        >
          📅 {{ formattedPublishDate }}
        </span>

        <!-- 제작사 (클릭 가능) -->
        <div
          v-if="game.makers && game.makers.length > 0"
          class="flex flex-wrap gap-1"
        >
          <span
            v-for="circle in game.makers"
            :key="circle"
            class="max-w-full cursor-pointer truncate rounded px-1.5 py-0.5 transition-colors"
            :class="
              isCircleActive(circle)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
            "
            :title="circle"
            @click="handleClickCircle(circle, $event)"
          >
            🏢 {{ circle }}
          </span>
        </div>

        <!-- 카테고리 (클릭 가능) -->
        <div
          v-if="game.categories && game.categories.length > 0"
          class="flex flex-wrap gap-1"
        >
          <span
            v-for="category in game.categories"
            :key="category"
            class="max-w-full cursor-pointer truncate rounded px-1.5 py-0.5 transition-colors"
            :class="
              isCategoryActive(category)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
            "
            :title="category"
            @click="handleClickCategory(category, $event)"
          >
            {{ category }}
          </span>
        </div>

        <!-- 태그 (클릭 가능) -->
        <div
          v-if="game.tags && game.tags.length > 0"
          class="flex flex-col gap-1"
        >
          <div class="flex flex-wrap gap-1">
            <span
              v-for="tag in showAllTags ? game.tags : game.tags.slice(0, 3)"
              :key="tag"
              class="max-w-full cursor-pointer truncate rounded px-1.5 py-0.5 transition-colors"
              :class="
                isTagActive(tag)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
              "
              :title="tag"
              @click="handleClickTag(tag, $event)"
            >
              #{{ tag }}
            </span>
          </div>
          <!-- 더보기/접기 버튼 -->
          <button
            v-if="game.tags.length > 3"
            @click.stop="showAllTags = !showAllTags"
            class="text-muted-foreground hover:text-foreground flex w-fit items-center gap-0.5 text-xs transition-colors"
            :title="showAllTags ? '태그 접기' : '태그 더보기'"
          >
            <template v-if="showAllTags">
              <ChevronUp :size="12" />
              접기
            </template>
            <template v-else>
              <ChevronDown :size="12" />
              더보기 (+{{ game.tags.length - 3 }})
            </template>
          </button>
        </div>
      </div>

      <!-- 액션 버튼들 -->
      <div class="mt-auto flex gap-1" @click.stop>
        <Button
          @click="handlePlay"
          :disabled="isPlaying"
          size="sm"
          class="flex-1"
          title="게임 실행"
        >
          <Loader2 v-if="isPlaying" :size="12" class="animate-spin" />
          <Play v-else :size="12" />
          {{ isPlaying ? "실행 중..." : "실행" }}
        </Button>
        <Button
          @click="handleOpenFolder"
          size="sm"
          variant="secondary"
          title="폴더 열기"
        >
          <FolderOpen :size="16" />
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
