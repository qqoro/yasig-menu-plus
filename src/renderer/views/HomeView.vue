<script setup lang="ts">
import {
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from "lucide-vue-next";
import { computed, onMounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import BatchActionBar from "../components/BatchActionBar.vue";
import FilterPanelComponent from "../components/FilterPanel.vue";
import GameDetailDialog from "../components/GameDetailDialog.vue";
import GameGridSection from "../components/GameGridSection.vue";
import HomeToolbar from "../components/HomeToolbar.vue";
import ImageCarouselDialog from "../components/ImageCarouselDialog.vue";
import SearchBar from "../components/SearchBar.vue";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  useAllInOneRefresh,
  useAllInOneRefreshMutation,
  useLastRefreshed,
} from "../composables/useAllInOneRefresh";
import { useAutoScanListener } from "../composables/useGames";
import { useGridLayout } from "../composables/useGridLayout";
import { useHomeActions } from "../composables/useHomeActions";
import { useHomeBatchActions } from "../composables/useHomeBatchActions";
import { useHomeKeyboard } from "../composables/useHomeKeyboard";
import { useMultiSelect } from "../composables/useMultiSelect";
import { useRandomSelect } from "../composables/useRandomSelect";
import { useSearch } from "../composables/useSearch";
import {
  useLibraryPaths,
  useDisabledLibraryPaths,
  useToggleLibraryPathVisibility,
} from "../composables/useSettings";
import { useUIStore } from "../stores/uiStore";
import type { SearchQuery } from "../types";

// 라이브러리 경로 관리 (electron-store)
const { data: libraryPaths } = useLibraryPaths();
const { data: disabledLibraryPaths } = useDisabledLibraryPaths();
const toggleLibraryPathMutation = useToggleLibraryPathVisibility();

// 활성화된 라이브러리 경로만 필터링
const activeLibraryPaths = computed(() => {
  const all = libraryPaths.value ?? [];
  const disabled = disabledLibraryPaths.value ?? [];
  return all.filter((path) => !disabled.includes(path));
});

const uiStore = useUIStore();

// 자동 스캔 완료 리스너 (포커스/시작 시 스캔 후 캐시 무효화)
useAutoScanListener();

// 전체 동기화 composable
const {
  currentStep: allInOneStep,
  stepLabel: allInOneStepLabel,
  collectorProgress: allInOneCollectorProgress,
  translationProgress: allInOneTranslationProgress,
} = useAllInOneRefresh();
const allInOneRefreshMutation = useAllInOneRefreshMutation();

// 마지막 갱신 시간
const lastRefreshedAt = ref<Date | null>(null);

// 현재 실행 중인 게임 경로
const playingGamePath = computed(() => null as string | null);

// useSearch composable로 검색 상태 관리
const searchState = useSearch(() => activeLibraryPaths.value);

// 검색창 ref
const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);

// 검색 상태
const searchQuery = computed({
  get: () => searchState.searchQuery.value,
  set: (value) => {
    searchState.searchQuery.value = value;
  },
});

// 필터 (기본값 포함)
const filters = computed<Required<SearchQuery["filters"]>>(() => ({
  showHidden: searchState.filters.value.showHidden ?? false,
  showFavorites: searchState.filters.value.showFavorites ?? false,
  showNotFavorites: searchState.filters.value.showNotFavorites ?? false,
  showCleared: searchState.filters.value.showCleared ?? false,
  showNotCleared: searchState.filters.value.showNotCleared ?? false,
  showCompressed: searchState.filters.value.showCompressed ?? false,
  showNotCompressed: searchState.filters.value.showNotCompressed ?? false,
  showWithExternalId: searchState.filters.value.showWithExternalId ?? false,
  showWithoutExternalId:
    searchState.filters.value.showWithoutExternalId ?? false,
}));

// 정렬 (기본값 포함)
const sortBy = computed<SearchQuery["sortBy"]>(
  () => (searchState.sortBy.value ?? "title") as SearchQuery["sortBy"],
);
const sortOrder = computed<SearchQuery["sortOrder"]>(
  () => (searchState.sortOrder.value ?? "desc") as SearchQuery["sortOrder"],
);

// 게임 목록 등
const games = computed(() => searchState.games.value);

// 다중 선택 상태 관리
const multiSelect = useMultiSelect(games);
const totalCount = computed(() => searchState.totalCount.value);
const specialOnlyTotalCount = computed(
  () => searchState.specialOnlyTotalCount.value,
);
const isSearching = computed(() => searchState.isSearching.value);
const searchError = computed(() => searchState.searchError.value);
const activeFilterCount = computed(() => searchState.activeFilterCount.value);

// 게임 액션 composable
const {
  showGameDetail,
  selectedGamePath,
  carouselOpen,
  carouselGamePath,
  gameImages,
  deleteTargetGame,
  showDeleteConfirm,
  handlePlayGame,
  handleOpenFolder,
  handleToggleFavorite,
  handleToggleHidden,
  handleToggleClear,
  handleDeleteRequest,
  handleDeleteConfirm,
  handleOpenOriginalSite,
  handleShowDetail,
  handleGameDoubleClick,
} = useHomeActions({ searchState });

// 배치 액션 composable
const {
  showBatchDeleteConfirm,
  handleBatchToggle,
  handleBatchDeleteRequest,
  handleBatchDeleteConfirm,
  handleGameSelect,
  handleToggleSelectAll,
} = useHomeBatchActions({ searchState, multiSelect });

// 그리드 레이아웃 composable
const { gridColsClass, handleIncreaseZoom, handleDecreaseZoom } =
  useGridLayout();

// 랜덤 선택 composable
const { handleRandomSelect } = useRandomSelect({
  activeLibraryPaths,
  searchQuery: searchState.searchQuery,
  filters,
  sortBy,
  sortOrder,
});

/**
 * 필터 패널 표시 토글
 */
const showFilterPanel = computed(() => !uiStore.sidebarCollapsed);

/**
 * 사이드바 토글 핸들러
 */
function handleToggleSidebar(): void {
  uiStore.toggleSidebar();
}

/**
 * 필터 업데이트 핸들러
 */
function updateFilters(newFilters: Partial<SearchQuery["filters"]>): void {
  searchState.filters.value = { ...searchState.filters.value, ...newFilters };
}

/**
 * 정렬 업데이트 핸들러
 */
function updateSortBy(newSortBy: SearchQuery["sortBy"]): void {
  (searchState.sortBy.value as SearchQuery["sortBy"]) = newSortBy;
}

/**
 * 정렬 순서 업데이트 핸들러
 */
function updateSortOrder(newSortOrder: SearchQuery["sortOrder"]): void {
  (searchState.sortOrder.value as SearchQuery["sortOrder"]) = newSortOrder;
}

/**
 * 필터 초기화 핸들러
 */
function handleResetFilters(): void {
  searchState.resetFilters();
}

/**
 * 라이브러리 경로 표시 토글
 */
async function handleToggleLibraryPath(path: string): Promise<void> {
  try {
    await toggleLibraryPathMutation.mutateAsync(path);
  } catch (err) {
    console.error("라이브러리 경로 토글 실패:", err);
    toast.error("표시 설정 변경에 실패했습니다.");
  }
}

/**
 * 날짜 포맷 함수 (상대적 시간 표시)
 */
function formatLastRefreshed(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return date.toLocaleDateString("ko-KR");
}

/**
 * 전체 동기화 핸들러 (폴더 스캔 → 정보 수집 → 번역)
 */
async function handleAllInOneRefresh(): Promise<void> {
  if (!activeLibraryPaths.value || activeLibraryPaths.value.length === 0) {
    toast.warning("라이브러리 경로가 없습니다.");
    return;
  }

  await allInOneRefreshMutation.mutateAsync(activeLibraryPaths.value);
}

/**
 * 무한 스크롤 로드 핸들러
 */
function handleLoadMore(): void {
  if (searchState.hasNextPage.value && !searchState.isFetchingNextPage.value) {
    searchState.fetchNextPage();
  }
}

// 게임 목록 변경 시 store 업데이트
watch(
  () => totalCount.value,
  (count) => {
    uiStore.setGameCount(count);
  },
  { immediate: true },
);

// 키보드 및 마우스 이벤트 핸들링
useHomeKeyboard({
  searchBarRef,
  multiSelect: {
    selectAll: multiSelect.selectAll,
    clearSelection: multiSelect.clearSelection,
    isSelectionMode: multiSelect.isSelectionMode,
  },
  toggleSelectAll: handleToggleSelectAll,
  zoomIn: handleIncreaseZoom,
  zoomOut: handleDecreaseZoom,
  zoomLevel: computed(() => uiStore.zoomLevel),
});

onMounted(() => {
  // 마지막 갱신 시간 로드
  const { data } = useLastRefreshed();
  watch(
    data,
    (newData) => {
      if (newData) {
        lastRefreshedAt.value = newData;
      }
    },
    { immediate: true },
  );
});
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- 경로 설정 안내 (라이브러리 경로가 없는 경우) -->
    <div
      v-if="(libraryPaths?.length ?? 0) === 0"
      class="flex flex-1 items-center justify-center"
    >
      <Card class="max-w-md p-6 text-center">
        <CardHeader>
          <CardTitle>라이브러리 경로가 설정되지 않았습니다</CardTitle>
          <CardDescription>
            설정에서 게임 폴더 경로를 추가해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RouterLink to="/settings">
            <Button>
              <Settings :size="16" />
              설정 열기
            </Button>
          </RouterLink>
        </CardContent>
      </Card>
    </div>

    <!-- 게임 목록 -->
    <div v-else class="flex flex-1 flex-col overflow-hidden">
      <!-- 상단 도구 모음 -->
      <HomeToolbar
        :zoom-level="uiStore.zoomLevel"
        :is-syncing="allInOneRefreshMutation.isPending.value"
        :is-searching="isSearching"
        :special-only-total-count="specialOnlyTotalCount"
        @zoom-in="handleIncreaseZoom"
        @zoom-out="handleDecreaseZoom"
        @sync="handleAllInOneRefresh"
        @random-select="handleRandomSelect"
      />

      <!-- 메인 컨텐츠 영역 -->
      <div class="flex flex-1 overflow-hidden">
        <!-- 필터 패널 (왼쪽) -->
        <div
          v-if="showFilterPanel"
          class="w-68 flex-shrink-0 overflow-y-auto border-r p-4 transition-all duration-300"
        >
          <FilterPanelComponent
            :filters="filters"
            :sort-by="sortBy"
            :sort-order="sortOrder"
            :library-paths="libraryPaths"
            :disabled-library-paths="disabledLibraryPaths"
            @update:filters="updateFilters"
            @update:sort-by="updateSortBy"
            @update:sort-order="updateSortOrder"
            @reset="handleResetFilters"
            @toggle-library-path="handleToggleLibraryPath"
          />
        </div>

        <!-- 메인 컨텐츠 -->
        <div class="flex flex-1 flex-col overflow-hidden">
          <!-- 검색바 -->
          <div class="flex items-center gap-2 border-b p-4">
            <!-- 사이드바 토글 버튼 -->
            <Button
              @click="handleToggleSidebar"
              variant="ghost"
              size="icon"
              class="shrink-0"
              :title="
                uiStore.sidebarCollapsed ? '사이드바 펼치기' : '사이드바 접기'
              "
            >
              <PanelLeftClose v-if="!uiStore.sidebarCollapsed" :size="18" />
              <PanelLeftOpen v-else :size="18" />
            </Button>

            <SearchBar
              ref="searchBarRef"
              v-model="searchQuery"
              placeholder="검색어를 입력하세요 (예: tag:RPG circle:name)"
              class="flex-1"
            />
          </div>

          <!-- 검색 결과 정보 -->
          <div
            class="text-muted-foreground flex items-center justify-between gap-4 border-b px-4 py-2 text-xs"
          >
            <div class="flex items-center gap-3">
              <span>
                총 {{ totalCount }}개의 게임
                <span v-if="activeFilterCount > 0"
                  >({{ activeFilterCount }}개 필터 적용 중)</span
                >
              </span>

              <!-- 진행 상태 -->
              <template v-if="allInOneRefreshMutation.isPending.value">
                <span class="text-muted-foreground">•</span>
                <span class="flex items-center gap-1">
                  <Loader2 :size="12" class="animate-spin" />
                  {{ allInOneStepLabel }}
                  <template
                    v-if="
                      allInOneStep === 'collect' &&
                      allInOneCollectorProgress.total > 0
                    "
                  >
                    ({{ allInOneCollectorProgress.current }}/{{
                      allInOneCollectorProgress.total
                    }})
                  </template>
                  <template
                    v-else-if="
                      allInOneStep === 'translate' &&
                      allInOneTranslationProgress.total > 0
                    "
                  >
                    ({{ allInOneTranslationProgress.current }}/{{
                      allInOneTranslationProgress.total
                    }})
                  </template>
                </span>
              </template>
            </div>

            <span
              v-if="lastRefreshedAt"
              class="text-muted-foreground shrink-0 text-xs"
            >
              {{ formatLastRefreshed(lastRefreshedAt) }}
            </span>
          </div>

          <!-- 게임 그리드 -->
          <GameGridSection
            :games="games"
            :is-searching="isSearching"
            :search-error="searchError"
            :grid-cols-class="gridColsClass"
            :has-next-page="searchState.hasNextPage.value"
            :is-fetching-next-page="searchState.isFetchingNextPage.value"
            :is-selection-mode="multiSelect.isSelectionMode.value"
            :selected-count="multiSelect.selectedCount.value"
            :playing-game-path="playingGamePath"
            :is-selected="multiSelect.isSelected"
            :is-active-tag="searchState.hasTag"
            :is-active-circle="searchState.hasCircle"
            :is-active-category="searchState.hasCategory"
            @game-click="handleShowDetail"
            @game-select="handleGameSelect"
            @game-dblclick="handleGameDoubleClick"
            @play="handlePlayGame"
            @open-folder="handleOpenFolder"
            @toggle-favorite="handleToggleFavorite"
            @toggle-hidden="handleToggleHidden"
            @toggle-clear="handleToggleClear"
            @open-original-site="handleOpenOriginalSite"
            @delete-request="handleDeleteRequest"
            @click-tag="searchState.toggleTag"
            @click-circle="searchState.toggleCircle"
            @click-category="searchState.toggleCategory"
            @batch-favorite="(v) => handleBatchToggle('is_favorite', v)"
            @batch-clear="(v) => handleBatchToggle('is_clear', v)"
            @batch-hidden="(v) => handleBatchToggle('is_hidden', v)"
            @batch-delete="handleBatchDeleteRequest"
            @load-more="handleLoadMore"
          />

          <!-- 배치 작업 바 -->
          <BatchActionBar
            :selected-count="multiSelect.selectedCount.value"
            :is-all-selected="multiSelect.isAllSelected.value"
            :is-pending="searchState.isBatchToggling.value"
            @select-all="handleToggleSelectAll"
            @clear-selection="multiSelect.clearSelection"
            @batch-favorite="(v) => handleBatchToggle('is_favorite', v)"
            @batch-clear="(v) => handleBatchToggle('is_clear', v)"
            @batch-hidden="(v) => handleBatchToggle('is_hidden', v)"
            @batch-delete="handleBatchDeleteRequest"
          />
        </div>
      </div>
    </div>

    <!-- 게임 상세 다이얼로그 -->
    <GameDetailDialog
      v-model:open="showGameDetail"
      :game-path="selectedGamePath"
    />

    <!-- 이미지 캐러셀 다이얼로그 -->
    <ImageCarouselDialog
      :open="carouselOpen"
      :images="(gameImages ?? []).map((i) => i.path)"
      @update:open="carouselOpen = $event"
    />

    <!-- 게임 삭제 확인 다이얼로그 -->
    <AlertDialog v-model:open="showDeleteConfirm">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>게임을 삭제하시겠습니까?</AlertDialogTitle>
          <AlertDialogDescription>
            <span class="text-foreground font-medium">{{
              deleteTargetGame?.title ?? deleteTargetGame?.originalTitle
            }}</span>
            <br />
            게임 폴더가 휴지통으로 이동되며, 썸네일과 이미지도 삭제됩니다.
            플레이 기록은 보존됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleDeleteConfirm"
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- 배치 삭제 확인 다이얼로그 -->
    <AlertDialog v-model:open="showBatchDeleteConfirm">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ multiSelect.selectedCount.value }}개의 게임을 삭제하시겠습니까?
          </AlertDialogTitle>
          <AlertDialogDescription>
            선택한 게임의 폴더가 휴지통으로 이동되며, 썸네일과 이미지도
            삭제됩니다. 플레이 기록은 보존됩니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>취소</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleBatchDeleteConfirm"
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
