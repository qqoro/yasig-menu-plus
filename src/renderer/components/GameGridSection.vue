<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import { Loader2 } from "lucide-vue-next";
import { onUnmounted, ref } from "vue";
import type { GameItem } from "../types";
import GameCard from "./GameCard.vue";
import GameContextMenu from "./GameContextMenu.vue";
import { Card, CardContent } from "./ui/card";

interface Props {
  games: GameItem[];
  isSearching: boolean;
  searchError: Error | null;
  gridColsClass: string;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isSelectionMode: boolean;
  selectedCount: number;
  playingGamePath: string | null;
  isSelected: (path: string) => boolean;
  isActiveTag: (tag: string) => boolean;
  isActiveCircle: (circle: string) => boolean;
  isActiveCategory: (category: string) => boolean;
  isExcludedTag: (tag: string) => boolean;
  isExcludedCircle: (circle: string) => boolean;
  isExcludedCategory: (category: string) => boolean;
}

interface Emits {
  (e: "gameClick", game: GameItem): void;
  (e: "gameSelect", game: GameItem, event: MouseEvent): void;
  (e: "gameDblclick", game: GameItem): void;
  (e: "play", game: GameItem): void;
  (e: "openFolder", game: GameItem): void;
  (e: "toggleFavorite", game: GameItem): void;
  (e: "toggleHidden", game: GameItem): void;
  (e: "toggleClear", game: GameItem): void;
  (e: "openOriginalSite", game: GameItem): void;
  (e: "deleteRequest", game: GameItem): void;
  (e: "clickTag", tag: string): void;
  (e: "clickCircle", circle: string): void;
  (e: "clickCategory", category: string): void;
  (e: "excludeTag", tag: string): void;
  (e: "excludeCircle", circle: string): void;
  (e: "excludeCategory", category: string): void;
  (e: "batchFavorite", value: boolean): void;
  (e: "batchClear", value: boolean): void;
  (e: "batchHidden", value: boolean): void;
  (e: "batchDelete"): void;
  (e: "loadMore"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 무한 스크롤 트리거용 ref
const loadMoreTrigger = ref<HTMLElement | null>(null);

// Intersection Observer로 무한 스크롤 구현
const { stop } = useIntersectionObserver(
  loadMoreTrigger,
  ([{ isIntersecting }]) => {
    if (isIntersecting && props.hasNextPage && !props.isFetchingNextPage) {
      emit("loadMore");
    }
  },
  {
    threshold: 0.1, // 10%가 보이면 트리거
    rootMargin: "100px", // 미리 100px 전에 로드
  },
);

// GameCard의 select 이벤트는 (game, event) 두 인자를 전달하므로 래퍼 함수 필요
function handleSelect(game: GameItem, event: MouseEvent): void {
  emit("gameSelect", game, event);
}

onUnmounted(() => {
  stop();
});
</script>

<template>
  <div class="flex-1 overflow-y-auto p-4">
    <!-- 로딩 상태 -->
    <div
      v-if="isSearching && games.length === 0"
      class="flex h-full items-center justify-center"
    >
      <div class="flex flex-col items-center gap-4">
        <Loader2 :size="32" class="text-muted-foreground animate-spin" />
        <p class="text-muted-foreground">검색 중...</p>
      </div>
    </div>

    <!-- 에러 상태 -->
    <div
      v-else-if="searchError && games.length === 0"
      class="flex h-full items-center justify-center"
    >
      <Card class="max-w-md">
        <CardContent class="pt-6">
          <p class="text-destructive text-center">{{ searchError }}</p>
        </CardContent>
      </Card>
    </div>

    <!-- 빈 결과 -->
    <div
      v-else-if="games.length === 0"
      class="flex h-full items-center justify-center"
    >
      <p class="text-muted-foreground">검색 결과가 없습니다.</p>
    </div>

    <!-- 게임 그리드 -->
    <div v-else>
      <div :class="['grid gap-4', gridColsClass]">
        <GameContextMenu
          v-for="game in games"
          :key="game.path"
          :game="game"
          :is-selection-mode="isSelectionMode"
          :selected-count="selectedCount"
          @play="emit('play', $event)"
          @open-folder="emit('openFolder', $event)"
          @toggle-favorite="emit('toggleFavorite', $event)"
          @toggle-hidden="emit('toggleHidden', $event)"
          @toggle-clear="emit('toggleClear', $event)"
          @show-detail="emit('gameClick', $event)"
          @open-original-site="emit('openOriginalSite', $event)"
          @delete="emit('deleteRequest', $event)"
          @batch-favorite="emit('batchFavorite', $event)"
          @batch-clear="emit('batchClear', $event)"
          @batch-hidden="emit('batchHidden', $event)"
          @batch-delete="emit('batchDelete')"
        >
          <GameCard
            :game="game"
            :is-playing="playingGamePath === game.path"
            :is-selected="isSelected(game.path)"
            :is-selection-mode="isSelectionMode"
            :is-active-tag="isActiveTag"
            :is-active-circle="isActiveCircle"
            :is-active-category="isActiveCategory"
            :is-excluded-tag="isExcludedTag"
            :is-excluded-circle="isExcludedCircle"
            :is-excluded-category="isExcludedCategory"
            @play="emit('play', $event)"
            @open-folder="emit('openFolder', $event)"
            @toggle-favorite="emit('toggleFavorite', $event)"
            @toggle-hidden="emit('toggleHidden', $event)"
            @toggle-clear="emit('toggleClear', $event)"
            @click-tag="emit('clickTag', $event)"
            @click-circle="emit('clickCircle', $event)"
            @click-category="emit('clickCategory', $event)"
            @exclude-tag="emit('excludeTag', $event)"
            @exclude-circle="emit('excludeCircle', $event)"
            @exclude-category="emit('excludeCategory', $event)"
            @show-detail="emit('gameClick', $event)"
            @open-original-site="emit('openOriginalSite', $event)"
            @select="handleSelect"
            @dblclick="emit('gameDblclick', game)"
          />
        </GameContextMenu>
      </div>

      <!-- 무한 스크롤 트리거 & 로딩 표시 -->
      <div
        ref="loadMoreTrigger"
        class="flex justify-center py-4"
        :class="{
          'opacity-0': !hasNextPage && !isFetchingNextPage,
        }"
      >
        <div v-if="isFetchingNextPage" class="flex items-center gap-2">
          <Loader2 :size="16" class="text-muted-foreground animate-spin" />
          <span class="text-muted-foreground text-sm">더 불러오는 중...</span>
        </div>
        <div
          v-else-if="!hasNextPage && games.length > 0"
          class="text-muted-foreground text-sm"
        >
          모든 게임을 표시했습니다
        </div>
      </div>
    </div>
  </div>
</template>
