<script setup lang="ts">
import {
  ArrowUpDown,
  Check,
  Eye,
  EyeOff,
  File,
  FileArchive,
  RotateCcw,
  Star,
  StarOff,
  X,
} from "lucide-vue-next";
import { computed } from "vue";
import type { SearchQuery } from "../types";
import { Button } from "./ui/button";

interface Props {
  filters: Partial<SearchQuery["filters"]>;
  sortBy?: SearchQuery["sortBy"];
  sortOrder?: SearchQuery["sortOrder"];
}

interface Emits {
  (e: "update:filters", value: Partial<SearchQuery["filters"]>): void;
  (e: "update:sortBy", value: SearchQuery["sortBy"]): void;
  (e: "update:sortOrder", value: SearchQuery["sortOrder"]): void;
  (e: "reset"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 기본값이 포함된 필터 객체
const filters = computed<Required<SearchQuery["filters"]>>(() => ({
  showHidden: props.filters.showHidden ?? false,
  showFavorites: props.filters.showFavorites ?? false,
  showCleared: props.filters.showCleared ?? false,
  showNotCleared: props.filters.showNotCleared ?? false,
  showCompressed: props.filters.showCompressed ?? false,
  showNotCompressed: props.filters.showNotCompressed ?? false,
  showWithExternalId: props.filters.showWithExternalId ?? false,
  showWithoutExternalId: props.filters.showWithoutExternalId ?? false,
}));

// 필터 토글 헬퍼
function toggleFilter<K extends keyof SearchQuery["filters"]>(
  key: K,
  value: boolean,
): void {
  emit("update:filters", {
    ...props.filters,
    [key]: value,
  });
}

// 정렬 토글
function toggleSortOrder(): void {
  emit("update:sortOrder", props.sortOrder === "asc" ? "desc" : "asc");
}

// 정렬 기준 변경
function setSortBy(sortBy: SearchQuery["sortBy"]): void {
  if (props.sortBy === sortBy) {
    toggleSortOrder();
  } else {
    emit("update:sortBy", sortBy);
    emit("update:sortOrder", "desc");
  }
}

// 즐겨찾기 필터 토글
function toggleFavorites(): void {
  const currentValue = filters.value.showFavorites;
  toggleFilter("showFavorites", !currentValue);
}

// 클리어 필터 토글
function toggleCleared(only: "cleared" | "notCleared" | "both"): void {
  const { showCleared, showNotCleared } = filters.value;
  let newCleared = showCleared;
  let newNotCleared = showNotCleared;

  if (only === "cleared") {
    if (showCleared && showNotCleared) {
      // 둘 다 true면 클리어만 true
      newCleared = true;
      newNotCleared = false;
    } else if (showCleared && !showNotCleared) {
      // 클리어만 true면 둘 다 false
      newCleared = false;
      newNotCleared = false;
    } else {
      // 그 외에는 클리어만 true
      newCleared = true;
      newNotCleared = false;
    }
  } else if (only === "notCleared") {
    if (showCleared && showNotCleared) {
      // 둘 다 true면 미클리어만 true
      newCleared = false;
      newNotCleared = true;
    } else if (!showCleared && showNotCleared) {
      // 미클리어만 true면 둘 다 false
      newCleared = false;
      newNotCleared = false;
    } else {
      // 그 외에는 미클리어만 true
      newCleared = false;
      newNotCleared = true;
    }
  } else {
    // 둘 다 true
    newCleared = true;
    newNotCleared = true;
  }

  emit("update:filters", {
    ...filters.value,
    showCleared: newCleared,
    showNotCleared: newNotCleared,
  });
}

// 압축 파일 필터 토글
function toggleCompressed(only: "compressed" | "notCompressed" | "both"): void {
  const { showCompressed, showNotCompressed } = filters.value;
  let newCompressed = showCompressed;
  let newNotCompressed = showNotCompressed;

  if (only === "compressed") {
    if (showCompressed && showNotCompressed) {
      newCompressed = true;
      newNotCompressed = false;
    } else if (showCompressed && !showNotCompressed) {
      newCompressed = false;
      newNotCompressed = false;
    } else {
      newCompressed = true;
      newNotCompressed = false;
    }
  } else if (only === "notCompressed") {
    if (showCompressed && showNotCompressed) {
      newCompressed = false;
      newNotCompressed = true;
    } else if (!showCompressed && showNotCompressed) {
      newCompressed = false;
      newNotCompressed = false;
    } else {
      newCompressed = false;
      newNotCompressed = true;
    }
  } else {
    newCompressed = true;
    newNotCompressed = true;
  }

  emit("update:filters", {
    ...filters.value,
    showCompressed: newCompressed,
    showNotCompressed: newNotCompressed,
  });
}

// 외부 ID 필터 토글
function toggleExternalId(only: "with" | "without" | "both"): void {
  const { showWithExternalId, showWithoutExternalId } = filters.value;
  let newWithExternalId = showWithExternalId;
  let newWithoutExternalId = showWithoutExternalId;

  if (only === "with") {
    if (showWithExternalId && showWithoutExternalId) {
      newWithExternalId = true;
      newWithoutExternalId = false;
    } else if (showWithExternalId && !showWithoutExternalId) {
      newWithExternalId = false;
      newWithoutExternalId = false;
    } else {
      newWithExternalId = true;
      newWithoutExternalId = false;
    }
  } else if (only === "without") {
    if (showWithExternalId && showWithoutExternalId) {
      newWithExternalId = false;
      newWithoutExternalId = true;
    } else if (!showWithExternalId && showWithoutExternalId) {
      newWithExternalId = false;
      newWithoutExternalId = false;
    } else {
      newWithExternalId = false;
      newWithoutExternalId = true;
    }
  } else {
    newWithExternalId = true;
    newWithoutExternalId = true;
  }

  emit("update:filters", {
    ...filters.value,
    showWithExternalId: newWithExternalId,
    showWithoutExternalId: newWithoutExternalId,
  });
}

// 숨김 게임 표시 토글
function toggleShowHidden(): void {
  toggleFilter("showHidden", !filters.value.showHidden);
}

// 필터 초기화
function resetFilters(): void {
  emit("reset");
}

// 활성 필터 개수 계산
const activeFilterCount = computed(() => {
  let count = 0;
  if (filters.value.showFavorites) count++;
  if (filters.value.showCleared && !filters.value.showNotCleared) count++;
  if (!filters.value.showCleared && filters.value.showNotCleared) count++;
  if (filters.value.showCompressed && !filters.value.showNotCompressed) count++;
  if (!filters.value.showCompressed && filters.value.showNotCompressed) count++;
  if (filters.value.showWithExternalId && !filters.value.showWithoutExternalId)
    count++;
  if (!filters.value.showWithExternalId && filters.value.showWithoutExternalId)
    count++;
  if (filters.value.showHidden) count++;
  return count;
});

// 정렬 버튼 스타일
function getSortButtonStyle(sortBy: SearchQuery["sortBy"]) {
  return props.sortBy === sortBy
    ? "bg-primary text-primary-foreground hover:bg-primary/90"
    : "bg-secondary text-secondary-foreground hover:bg-secondary/80";
}
</script>

<template>
  <div class="bg-card flex flex-col gap-3 rounded-lg border p-4">
    <!-- 필터 헤더 -->
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium">필터</h3>
      <div class="flex items-center gap-2">
        <span
          v-if="activeFilterCount > 0"
          class="text-muted-foreground text-xs"
        >
          {{ activeFilterCount }}개 활성화
        </span>
        <Button
          v-if="activeFilterCount > 0"
          variant="ghost"
          size="sm"
          class="h-7 px-2"
          @click="resetFilters"
        >
          <RotateCcw :size="14" />
          초기화
        </Button>
      </div>
    </div>

    <!-- 필터 그룹 -->
    <div class="flex flex-col gap-2">
      <!-- 즐겨찾기 -->
      <div class="flex gap-1">
        <Button
          :variant="filters.showFavorites ? 'default' : 'outline'"
          size="sm"
          class="flex-1"
          @click="toggleFavorites"
        >
          <Star v-if="filters.showFavorites" :size="14" class="fill-current" />
          <StarOff v-else :size="14" />
          즐겨찾기
        </Button>
        <Button
          :variant="filters.showHidden ? 'default' : 'outline'"
          size="sm"
          class="flex-1"
          @click="toggleShowHidden"
        >
          <EyeOff v-if="filters.showHidden" :size="14" />
          <Eye v-else :size="14" />
          숨김
        </Button>
      </div>

      <!-- 클리어 상태 -->
      <div class="flex gap-1">
        <Button
          :variant="
            filters.showCleared && !filters.showNotCleared
              ? 'default'
              : 'outline'
          "
          size="sm"
          class="flex-1"
          @click="toggleCleared('cleared')"
        >
          <Check :size="14" />
          클리어
        </Button>
        <Button
          :variant="
            !filters.showCleared && filters.showNotCleared
              ? 'default'
              : 'outline'
          "
          size="sm"
          class="flex-1"
          @click="toggleCleared('notCleared')"
        >
          <X :size="14" />
          미클리어
        </Button>
      </div>

      <!-- 압축 파일 -->
      <div class="flex gap-1">
        <Button
          :variant="
            filters.showCompressed && !filters.showNotCompressed
              ? 'default'
              : 'outline'
          "
          size="sm"
          class="flex-1"
          @click="toggleCompressed('compressed')"
        >
          <FileArchive :size="14" />
          압축
        </Button>
        <Button
          :variant="
            !filters.showCompressed && filters.showNotCompressed
              ? 'default'
              : 'outline'
          "
          size="sm"
          class="flex-1"
          @click="toggleCompressed('notCompressed')"
        >
          <File :size="14" />
          일반
        </Button>
      </div>

      <!-- 외부 ID -->
      <div class="flex gap-1">
        <Button
          :variant="
            filters.showWithExternalId && !filters.showWithoutExternalId
              ? 'default'
              : 'outline'
          "
          size="sm"
          class="flex-1"
          @click="toggleExternalId('with')"
        >
          ID 있음
        </Button>
        <Button
          :variant="
            !filters.showWithExternalId && filters.showWithoutExternalId
              ? 'default'
              : 'outline'
          "
          size="sm"
          class="flex-1"
          @click="toggleExternalId('without')"
        >
          ID 없음
        </Button>
      </div>
    </div>

    <!-- 정렬 -->
    <div class="flex flex-col gap-2 border-t pt-2">
      <h4 class="text-muted-foreground text-xs font-medium">정렬</h4>
      <div class="grid grid-cols-2 gap-1">
        <Button
          :class="getSortButtonStyle('title')"
          size="sm"
          variant="secondary"
          @click="setSortBy('title')"
        >
          제목
          <ArrowUpDown v-if="sortBy === 'title'" :size="14" />
        </Button>
        <Button
          :class="getSortButtonStyle('publishDate')"
          size="sm"
          variant="secondary"
          @click="setSortBy('publishDate')"
        >
          발매일
          <ArrowUpDown v-if="sortBy === 'publishDate'" :size="14" />
        </Button>
        <Button
          :class="getSortButtonStyle('lastPlayedAt')"
          size="sm"
          variant="secondary"
          @click="setSortBy('lastPlayedAt')"
        >
          최근 플레이
          <ArrowUpDown v-if="sortBy === 'lastPlayedAt'" :size="14" />
        </Button>
        <Button
          :class="getSortButtonStyle('createdAt')"
          size="sm"
          variant="secondary"
          @click="setSortBy('createdAt')"
        >
          등록일
          <ArrowUpDown v-if="sortBy === 'createdAt'" :size="14" />
        </Button>
        <Button
          :class="getSortButtonStyle('rating')"
          size="sm"
          variant="secondary"
          @click="setSortBy('rating')"
        >
          별점
          <ArrowUpDown v-if="sortBy === 'rating'" :size="14" />
        </Button>
        <Button
          :class="getSortButtonStyle('playTime')"
          size="sm"
          variant="secondary"
          @click="setSortBy('playTime')"
        >
          플레이 시간
          <ArrowUpDown v-if="sortBy === 'playTime'" :size="14" />
        </Button>
      </div>
      <Button
        variant="outline"
        size="sm"
        class="w-full"
        @click="toggleSortOrder"
      >
        {{ sortOrder === "asc" ? "오름차순" : "내림차순" }}
      </Button>
    </div>
  </div>
</template>
