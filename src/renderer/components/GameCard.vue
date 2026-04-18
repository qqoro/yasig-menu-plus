<script setup lang="ts">
import {
  Clock,
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
  Unplug,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { useAllSettings } from "../composables/useAllSettings";
import { useDetectRpgMaker } from "../composables/useCheat";
import { formatPlayTime } from "../composables/usePlayTime";
import { useTranslationSettings } from "../composables/useTranslationSettings";
import type { GameItem } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import CheatPlayButton from "./CheatPlayButton.vue";

interface Props {
  game: GameItem;
  isActiveTag?: (tag: string) => boolean;
  isActiveCircle?: (circle: string) => boolean;
  isActiveCategory?: (category: string) => boolean;
  isExcludedTag?: (tag: string) => boolean;
  isExcludedCircle?: (circle: string) => boolean;
  isExcludedCategory?: (category: string) => boolean;
  isPlaying?: boolean;
  isPlayingCheat?: boolean;
  isToggling?: boolean;
  isSelected?: boolean;
  isSelectionMode?: boolean;
}

interface Emits {
  (e: "play", game: GameItem): void;
  (e: "play-cheat", game: GameItem): void;
  (e: "open-folder", game: GameItem): void;
  (e: "toggle-favorite", game: GameItem): void;
  (e: "toggle-hidden", game: GameItem): void;
  (e: "toggle-clear", game: GameItem): void;
  (e: "click-tag", tag: string): void;
  (e: "click-circle", circle: string): void;
  (e: "click-category", category: string): void;
  (e: "exclude-tag", tag: string): void;
  (e: "exclude-circle", circle: string): void;
  (e: "exclude-category", category: string): void;
  (e: "show-detail", game: GameItem): void;
  (e: "open-original-site", game: GameItem): void;
  (e: "select", game: GameItem, event: MouseEvent): void;
}

const props = withDefaults(defineProps<Props>(), {
  isPlaying: false,
  isPlayingCheat: false,
  isToggling: false,
  isSelected: false,
  isSelectionMode: false,
});

const emit = defineEmits<Emits>();

// RPG Maker 감지
const rpgMakerDetection = useDetectRpgMaker(computed(() => props.game.path));
const isRpgMaker = computed(
  () => rpgMakerDetection.data.value?.isRpgMaker ?? false,
);

// 번역 설정 조회
const { data: translationSettings } = useTranslationSettings();

// 통합 설정 조회
const { data: settings } = useAllSettings();

// 태그 전체 보기 상태
const showAllTags = ref(false);

// 플레이 시간 포맷팅
const formattedPlayTime = computed(() => {
  if (!props.game.totalPlayTime) return null;
  return formatPlayTime(props.game.totalPlayTime);
});

// 발매일 포맷팅
const formattedPublishDate = computed(() => {
  if (!props.game.publishDate) return null;
  const date = new Date(props.game.publishDate);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
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

// 제외 태그 우클릭
function handleExcludeTag(tag: string, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  emit("exclude-tag", tag);
}

function handleExcludeCircle(circle: string, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  emit("exclude-circle", circle);
}

function handleExcludeCategory(category: string, event: MouseEvent): void {
  event.preventDefault();
  event.stopPropagation();
  emit("exclude-category", category);
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

// 제외 상태 확인
function isTagExcluded(tag: string): boolean {
  return props.isExcludedTag?.(tag) ?? false;
}

function isCircleExcluded(circle: string): boolean {
  return props.isExcludedCircle?.(circle) ?? false;
}

function isCategoryExcluded(category: string): boolean {
  return props.isExcludedCategory?.(category) ?? false;
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

// 카드 클릭 핸들러 (선택 모드 또는 Ctrl/Meta 클릭)
function handleCardClick(event: MouseEvent): void {
  if (props.isSelectionMode || event.ctrlKey || event.metaKey) {
    event.stopPropagation();
    event.preventDefault();
    emit("select", props.game, event);
  }
}

// 휠 클릭(중간 버튼) 핸들러 - 디테일 모달 열기
function handleMouseDown(event: MouseEvent): void {
  // 휠 클릭 (button === 1)이면 디테일 모달 열기
  if (event.button === 1 && !props.isSelectionMode) {
    event.preventDefault();
    emit("show-detail", props.game);
  }
}
</script>

<template>
  <Card
    class="hover:border-primary/50 -py-6 flex flex-col gap-3 overflow-hidden transition-colors"
    :class="{
      'pointer-events-none opacity-75': isPlaying,
      'opacity-75 hover:opacity-100': game.isOffline && !isPlaying,
      'ring-primary border-primary ring-2': isSelected,
      'cursor-pointer': isSelectionMode,
    }"
    @click="handleCardClick"
    @mousedown="handleMouseDown"
  >
    <!-- 썸네일 영역 -->
    <div class="group/thumb bg-muted relative aspect-4/3 overflow-hidden">
      <!-- 선택 체크박스 (선택 모드 시 표시) -->
      <div v-if="isSelectionMode" class="absolute top-2 left-2 z-10">
        <div
          class="flex h-5 w-5 items-center justify-center rounded border-2 transition-colors"
          :class="
            isSelected
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-muted-foreground/50 bg-background/80'
          "
        >
          <svg
            v-if="isSelected"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="h-3 w-3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>
      </div>
      <!-- 즐겨찾기/클리어 배지 (선택 모드가 아닐 때) -->
      <div
        v-if="!isSelectionMode && (game.isFavorite || game.isClear)"
        class="absolute top-2 left-2 z-10 flex gap-1"
      >
        <div
          v-if="game.isFavorite"
          class="bg-popover/80 flex items-center rounded-md p-1 backdrop-blur-sm"
          title="즐겨찾기"
        >
          <Star :size="12" class="shrink-0 fill-yellow-400 text-yellow-400" />
        </div>
        <div
          v-if="game.isClear"
          class="bg-popover/80 flex items-center rounded-md p-1 backdrop-blur-sm"
          title="클리어"
        >
          <Flag :size="12" class="shrink-0 fill-green-400 text-green-400" />
        </div>
      </div>
      <!-- 썸네일 이미지 -->
      <img
        v-if="game.thumbnail"
        :src="thumbnailUrl"
        :alt="game.title"
        class="h-full w-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
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
      <!-- 플레이 시간 배지 -->
      <div
        v-if="formattedPlayTime"
        class="bg-popover/80 absolute bottom-2 left-2 flex items-center gap-1 rounded-md px-2 py-1 backdrop-blur-sm"
      >
        <Clock :size="12" class="text-popover-foreground shrink-0" />
        <span class="text-popover-foreground text-xs font-medium">{{
          formattedPlayTime
        }}</span>
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
      <!-- 오프라인 표시 -->
      <div
        v-if="game.isOffline"
        class="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-black/60 px-2 py-1 text-xs text-white"
      >
        <Unplug class="h-3 w-3" />
        <span>연결 안 됨</span>
      </div>
      <!-- 오버레이 버튼들 (hover 시 표시, 선택 모드에서 비활성화) -->
      <div
        v-if="!isSelectionMode"
        class="bg-popover/60 absolute inset-0 flex flex-wrap content-center justify-center gap-1.5 p-2 opacity-0 transition-opacity group-hover/thumb:opacity-100"
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
                : isCircleExcluded(circle)
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
            "
            :title="circle"
            @click="handleClickCircle(circle, $event)"
            @contextmenu="handleExcludeCircle(circle, $event)"
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
                : isCategoryExcluded(category)
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
            "
            :title="category"
            @click="handleClickCategory(category, $event)"
            @contextmenu="handleExcludeCategory(category, $event)"
          >
            {{ category }}
          </span>
        </div>

        <!-- 태그 (클릭 가능) -->
        <div
          v-if="game.tags && game.tags.length > 0"
          class="flex items-center gap-1"
          :class="{ 'flex-wrap': showAllTags }"
        >
          <div
            class="flex min-w-0 flex-1 gap-1"
            :class="showAllTags ? 'flex-wrap' : 'flex-nowrap overflow-hidden'"
          >
            <span
              v-for="tag in game.tags"
              :key="tag"
              class="shrink-0 cursor-pointer truncate rounded px-1.5 py-0.5 transition-colors"
              :class="
                isTagActive(tag)
                  ? 'bg-primary text-primary-foreground'
                  : isTagExcluded(tag)
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
              "
              :title="tag"
              @click="handleClickTag(tag, $event)"
              @contextmenu="handleExcludeTag(tag, $event)"
            >
              #{{ tag }}
            </span>
          </div>
          <!-- 더보기/접기 버튼 -->
          <button
            v-if="game.tags.length > 1"
            @click.stop="showAllTags = !showAllTags"
            class="text-muted-foreground hover:text-foreground shrink-0 text-xs transition-colors"
            :title="showAllTags ? '태그 접기' : '모든 태그 보기'"
          >
            <template v-if="showAllTags">접기</template>
            <template v-else>+</template>
          </button>
        </div>
      </div>

      <!-- 액션 버튼들 -->
      <div class="mt-auto flex gap-1" @click.stop>
        <CheatPlayButton
          class="min-w-0 flex-1"
          :game-path="game.path"
          :is-rpg-maker="isRpgMaker"
          :is-playing="isPlaying"
          :is-playing-cheat="isPlayingCheat"
          :has-executable="game.hasExecutable"
          :disabled="game.isOffline"
          size="sm"
          @play="handlePlay"
          @play-cheat="emit('play-cheat', game)"
        />
        <Button
          @click="handleOpenFolder"
          :disabled="game.isOffline"
          size="sm"
          variant="secondary"
          class="shrink-0 disabled:pointer-events-auto disabled:cursor-not-allowed"
          title="폴더 열기"
        >
          <FolderOpen :size="16" />
        </Button>
      </div>
    </CardContent>
  </Card>
</template>
