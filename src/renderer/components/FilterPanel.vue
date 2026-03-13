<script setup lang="ts">
import {
  ArrowUpDown,
  Check,
  Eye,
  EyeOff,
  File,
  FileArchive,
  Folder,
  Link,
  Unlink,
  RotateCcw,
  Star,
  StarOff,
  X,
} from "lucide-vue-next";
import { computed } from "vue";
import type { SearchQuery } from "../types";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";

interface Props {
  filters: Partial<SearchQuery["filters"]>;
  sortBy?: SearchQuery["sortBy"];
  sortOrder?: SearchQuery["sortOrder"];
  libraryPaths?: string[];
  disabledLibraryPaths?: string[];
}

interface Emits {
  (e: "update:filters", value: Partial<SearchQuery["filters"]>): void;
  (e: "update:sortBy", value: SearchQuery["sortBy"]): void;
  (e: "update:sortOrder", value: SearchQuery["sortOrder"]): void;
  (e: "reset"): void;
  (e: "toggleLibraryPath", path: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 기본값이 포함된 필터 객체
const filters = computed<Required<SearchQuery["filters"]>>(() => ({
  showHidden: props.filters.showHidden ?? false,
  showFavorites: props.filters.showFavorites ?? false,
  showNotFavorites: props.filters.showNotFavorites ?? false,
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

// 즐겨찾기 필터 사이클 (필터 없음 → 즐겨찾기만 → 비즐겨찾기만 → 필터 없음)
function cycleFavorites(): void {
  const { showFavorites, showNotFavorites } = filters.value;
  if (!showFavorites && !showNotFavorites) {
    emit("update:filters", {
      ...props.filters,
      showFavorites: true,
      showNotFavorites: false,
    });
  } else if (showFavorites && !showNotFavorites) {
    emit("update:filters", {
      ...props.filters,
      showFavorites: false,
      showNotFavorites: true,
    });
  } else {
    emit("update:filters", {
      ...props.filters,
      showFavorites: false,
      showNotFavorites: false,
    });
  }
}

// 클리어 필터 사이클 (필터 없음 → 클리어만 → 미클리어만 → 필터 없음)
function cycleCleared(): void {
  const { showCleared, showNotCleared } = filters.value;
  if (!showCleared && !showNotCleared) {
    emit("update:filters", {
      ...props.filters,
      showCleared: true,
      showNotCleared: false,
    });
  } else if (showCleared && !showNotCleared) {
    emit("update:filters", {
      ...props.filters,
      showCleared: false,
      showNotCleared: true,
    });
  } else {
    emit("update:filters", {
      ...props.filters,
      showCleared: false,
      showNotCleared: false,
    });
  }
}

// 압축 필터 사이클 (필터 없음 → 압축만 → 일반만 → 필터 없음)
function cycleCompressed(): void {
  const { showCompressed, showNotCompressed } = filters.value;
  if (!showCompressed && !showNotCompressed) {
    emit("update:filters", {
      ...props.filters,
      showCompressed: true,
      showNotCompressed: false,
    });
  } else if (showCompressed && !showNotCompressed) {
    emit("update:filters", {
      ...props.filters,
      showCompressed: false,
      showNotCompressed: true,
    });
  } else {
    emit("update:filters", {
      ...props.filters,
      showCompressed: false,
      showNotCompressed: false,
    });
  }
}

// 외부 ID 필터 사이클 (필터 없음 → ID 있음만 → ID 없음만 → 필터 없음)
function cycleExternalId(): void {
  const { showWithExternalId, showWithoutExternalId } = filters.value;
  if (!showWithExternalId && !showWithoutExternalId) {
    emit("update:filters", {
      ...props.filters,
      showWithExternalId: true,
      showWithoutExternalId: false,
    });
  } else if (showWithExternalId && !showWithoutExternalId) {
    emit("update:filters", {
      ...props.filters,
      showWithExternalId: false,
      showWithoutExternalId: true,
    });
  } else {
    emit("update:filters", {
      ...props.filters,
      showWithExternalId: false,
      showWithoutExternalId: false,
    });
  }
}

// 숨김 게임 표시 토글
function toggleShowHidden(): void {
  toggleFilter("showHidden", !filters.value.showHidden);
}

// 필터 초기화
function resetFilters(): void {
  emit("reset");
}

// 라이브러리 경로가 비활성화되었는지 확인
function isPathDisabled(path: string): boolean {
  return props.disabledLibraryPaths?.includes(path) ?? false;
}

// 라이브러리 경로 토글
function toggleLibraryPath(path: string): void {
  emit("toggleLibraryPath", path);
}

// 활성 필터 개수 계산
const activeFilterCount = computed(() => {
  let count = 0;
  if (filters.value.showFavorites && !filters.value.showNotFavorites) count++;
  if (!filters.value.showFavorites && filters.value.showNotFavorites) count++;
  if (filters.value.showCleared && !filters.value.showNotCleared) count++;
  if (!filters.value.showCleared && filters.value.showNotCleared) count++;
  if (filters.value.showCompressed && !filters.value.showNotCompressed) count++;
  if (!filters.value.showCompressed && filters.value.showNotCompressed) count++;
  if (filters.value.showWithExternalId && !filters.value.showWithoutExternalId)
    count++;
  if (!filters.value.showWithExternalId && filters.value.showWithoutExternalId)
    count++;
  if (filters.value.showHidden) count++;
  // 비활성화된 라이브러리 경로 수 추가
  if (props.disabledLibraryPaths && props.disabledLibraryPaths.length > 0) {
    count += props.disabledLibraryPaths.length;
  }
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
  <div class="flex flex-col gap-3">
    <!-- 라이브러리 카드 (경로가 2개 이상일 때만 표시) -->
    <div
      v-if="libraryPaths && libraryPaths.length > 1"
      class="bg-card flex flex-col gap-2 rounded-lg border p-3"
    >
      <h3 class="text-muted-foreground text-xs font-medium">라이브러리</h3>
      <div class="max-h-40 space-y-1 overflow-y-auto">
        <label
          v-for="path in libraryPaths"
          :key="path"
          class="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5"
        >
          <Folder :size="14" class="text-muted-foreground shrink-0" />
          <span class="min-w-0 flex-1 truncate text-xs" :title="path">
            {{ path.split(/[/\\]/).pop() || path }}
          </span>
          <Switch
            :model-value="!isPathDisabled(path)"
            @update:model-value="toggleLibraryPath(path)"
            class="shrink-0"
          />
        </label>
      </div>
    </div>

    <!-- 상태 필터 카드 -->
    <div class="bg-card flex flex-col gap-2 rounded-lg border p-3">
      <div class="flex items-center justify-between">
        <h3 class="text-muted-foreground text-xs font-medium">상태</h3>
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
            class="h-6 px-2 text-xs"
            @click="resetFilters"
          >
            <RotateCcw :size="12" />
            초기화
          </Button>
        </div>
      </div>
      <!-- 즐겨찾기 / 클리어 -->
      <div class="flex gap-1">
        <Button
          :variant="
            filters.showFavorites || filters.showNotFavorites
              ? 'default'
              : 'outline'
          "
          size="sm"
          class="flex-1"
          @click="cycleFavorites"
        >
          <Star v-if="filters.showFavorites" :size="14" class="fill-current" />
          <StarOff v-else :size="14" />
          {{
            filters.showFavorites
              ? "즐겨찾기"
              : filters.showNotFavorites
                ? "비즐겨찾기"
                : "즐겨찾기"
          }}
        </Button>
        <Button
          :variant="
            filters.showCleared || filters.showNotCleared
              ? 'default'
              : 'outline'
          "
          size="sm"
          class="flex-1"
          @click="cycleCleared"
        >
          <Check v-if="!filters.showNotCleared" :size="14" />
          <X v-else :size="14" />
          {{
            filters.showCleared
              ? "클리어"
              : filters.showNotCleared
                ? "미클리어"
                : "클리어"
          }}
        </Button>
      </div>

      <!-- 압축 / 외부 ID -->
      <div class="flex gap-1">
        <Button
          :variant="
            filters.showCompressed || filters.showNotCompressed
              ? 'default'
              : 'outline'
          "
          size="sm"
          class="flex-1"
          @click="cycleCompressed"
        >
          <FileArchive v-if="!filters.showNotCompressed" :size="14" />
          <File v-else :size="14" />
          {{
            filters.showCompressed
              ? "압축"
              : filters.showNotCompressed
                ? "일반"
                : "압축"
          }}
        </Button>
        <Button
          :variant="
            filters.showWithExternalId || filters.showWithoutExternalId
              ? 'default'
              : 'outline'
          "
          size="sm"
          class="flex-1"
          @click="cycleExternalId"
        >
          <Link v-if="!filters.showWithoutExternalId" :size="14" />
          <Unlink v-else :size="14" />
          {{
            filters.showWithExternalId
              ? "ID 있음"
              : filters.showWithoutExternalId
                ? "ID 없음"
                : "외부 ID"
          }}
        </Button>
      </div>

      <!-- 숨김 -->
      <div class="flex gap-1">
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
    </div>

    <!-- 정렬 카드 -->
    <div class="bg-card flex flex-col gap-2 rounded-lg border p-3">
      <h3 class="text-muted-foreground text-xs font-medium">정렬</h3>
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
        <Button
          :class="getSortButtonStyle('maker')"
          size="sm"
          variant="secondary"
          @click="setSortBy('maker')"
        >
          서클명
          <ArrowUpDown v-if="sortBy === 'maker'" :size="14" />
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
