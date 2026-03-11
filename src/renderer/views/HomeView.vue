<script setup lang="ts">
import { useIntersectionObserver } from "@vueuse/core";
import {
  Loader2,
  Minus,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Settings,
  Shuffle,
} from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { toast } from "vue-sonner";
import FilterPanelComponent from "../components/FilterPanel.vue";
import GameCard from "../components/GameCard.vue";
import GameDetailDialog from "../components/GameDetailDialog.vue";
import ImageCarouselDialog from "../components/ImageCarouselDialog.vue";
import GameContextMenu from "../components/GameContextMenu.vue";
import BatchActionBar from "../components/BatchActionBar.vue";
import { useMultiSelect } from "../composables/useMultiSelect";
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
import { useDeleteGames } from "../composables/useDuplicates";
import SearchBar from "../components/SearchBar.vue";
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
import { useAddExcludedExecutable } from "../composables/useExcludedExecutables";
import { useOpenOriginalSite } from "../composables/useGameDetail";
import { useGameImages } from "../composables/useGameImages";
import {
  useAutoScanListener,
  useOpenFolder,
  usePlayGame,
  useRandomGameMutation,
} from "../composables/useGames";
import { useSearch } from "../composables/useSearch";
import {
  useLibraryPaths,
  useDisabledLibraryPaths,
  useToggleLibraryPathVisibility,
} from "../composables/useSettings";
import { useUIStore } from "../stores/uiStore";
import type { GameItem, SearchQuery } from "../types";

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
const addExcludedExecutable = useAddExcludedExecutable();
const playGameMutation = usePlayGame();
const openFolderMutation = useOpenFolder();
const randomGameMutation = useRandomGameMutation();

// 자동 스캔 완료 리스너 (포커스/시작 시 스캔 후 캐시 무효화)
useAutoScanListener();
const openOriginalSite = useOpenOriginalSite();

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

// 게임 상세 다이얼로그 상태
const showGameDetail = ref(false);
const selectedGamePath = ref<string | null>(null);

// 이미지 캐러셀 상태
const carouselOpen = ref(false);
const carouselGamePath = ref<string>("");
const { data: gameImages } = useGameImages(carouselGamePath);

// 게임 삭제 상태
const deleteTargetGame = ref<GameItem | null>(null);
const showDeleteConfirm = ref(false);
const showBatchDeleteConfirm = ref(false);
const deleteGamesMutation = useDeleteGames();

/**
 * 게임 삭제 요청 핸들러 (확인 다이얼로그 표시)
 */
function handleDeleteRequest(game: GameItem): void {
  deleteTargetGame.value = game;
  showDeleteConfirm.value = true;
}

/**
 * 게임 삭제 확정 핸들러
 * AlertDialogAction이 다이얼로그를 자동으로 닫으므로 별도 닫기 불필요
 */
async function handleDeleteConfirm(): Promise<void> {
  if (!deleteTargetGame.value) return;

  const path = deleteTargetGame.value.path;
  deleteTargetGame.value = null;

  try {
    await deleteGamesMutation.mutateAsync([path]);
  } catch (err) {
    console.error("게임 삭제 실패:", err);
  }
}

// useSearch composable로 검색 상태 관리
const searchState = useSearch(() => activeLibraryPaths.value);

// 무한 스크롤 트리거용 ref
const loadMoreTrigger = ref<HTMLElement | null>(null);

// 검색창 ref
const searchBarRef = ref<InstanceType<typeof SearchBar> | null>(null);

// Intersection Observer로 무한 스크롤 구현
const { stop } = useIntersectionObserver(
  loadMoreTrigger,
  ([{ isIntersecting }]) => {
    if (
      isIntersecting &&
      searchState.hasNextPage.value &&
      !searchState.isFetchingNextPage.value
    ) {
      searchState.fetchNextPage();
    }
  },
  {
    threshold: 0.1, // 10%가 보이면 트리거
    rootMargin: "100px", // 미리 100px 전에 로드
  },
);

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

/**
 * 게임 실행 핸들러
 */
async function handlePlayGame(game: GameItem): Promise<void> {
  if (playingGamePath.value) return;

  try {
    const executablePath = await playGameMutation.mutateAsync(game.path);

    // 실행 파일명만 추출
    const fileName = executablePath.split(/[/\\]/).pop() || executablePath;

    toast.success(`${game.title} 실행했습니다.`, {
      description: fileName,
      action: {
        label: "제외 목록에 추가",
        onClick: async () => {
          try {
            await addExcludedExecutable.mutateAsync(fileName);
            toast.success(
              `"${fileName}"이(가) 실행 제외 목록에 추가되었습니다.`,
            );
          } catch {
            toast.error("실행 제외 목록 추가에 실패했습니다.");
          }
        },
      },
    });
  } catch (err) {
    console.error("게임 실행 실패:", err);
    toast.error(
      err instanceof Error ? err.message : "게임 실행에 실패했습니다.",
    );
  }
}

/**
 * 폴더 열기 핸들러
 */
async function handleOpenFolder(game: GameItem): Promise<void> {
  try {
    await openFolderMutation.mutateAsync(game.path);
    toast.success("폴더를 열었습니다.");
  } catch (err) {
    console.error("폴더 열기 실패:", err);
    toast.error(
      err instanceof Error ? err.message : "폴더 열기에 실패했습니다.",
    );
  }
}

/**
 * 즐겨찾기 토글 핸들러
 */
async function handleToggleFavorite(game: GameItem): Promise<void> {
  try {
    const result = await searchState.toggleFavorite(game.path);
    toast.success(
      result.value ? "즐겨찾기에 추가했습니다." : "즐겨찾기에서 제거했습니다.",
    );
  } catch (err) {
    console.error("즐겨찾기 토글 실패:", err);
    toast.error(
      err instanceof Error ? err.message : "즐겨찾기 토글에 실패했습니다.",
    );
  }
}

/**
 * 숨김 토글 핸들러
 */
async function handleToggleHidden(game: GameItem): Promise<void> {
  try {
    const result = await searchState.toggleHidden(game.path);
    toast.success(result.value ? "게임을 숨겼습니다." : "숨김을 해제했습니다.");
  } catch (err) {
    console.error("숨김 토글 실패:", err);
    toast.error(
      err instanceof Error ? err.message : "숨김 토글에 실패했습니다.",
    );
  }
}

/**
 * 클리어 토글 핸들러
 */
async function handleToggleClear(game: GameItem): Promise<void> {
  try {
    const result = await searchState.toggleClear(game.path);
    toast.success(
      result.value ? "클리어로 표시했습니다." : "클리어를 취소했습니다.",
    );
  } catch (err) {
    console.error("클리어 토글 실패:", err);
    toast.error(
      err instanceof Error ? err.message : "클리어 토글에 실패했습니다.",
    );
  }
}

/**
 * 태그 클릭 핸들러
 */
function handleClickTag(tag: string): void {
  searchState.toggleTag(tag);
}

/**
 * 서클 클릭 핸들러
 */
function handleClickCircle(circle: string): void {
  searchState.toggleCircle(circle);
}

/**
 * 카테고리 클릭 핸들러
 */
function handleClickCategory(category: string): void {
  searchState.toggleCategory(category);
}

/**
 * 게임 상세 보기 핸들러
 */
function handleShowDetail(game: GameItem): void {
  selectedGamePath.value = game.path;
  showGameDetail.value = true;
}

/**
 * 게임 더블클릭 핸들러 (이미지 캐러셀)
 */
function handleGameDoubleClick(game: GameItem): void {
  carouselGamePath.value = game.path;
  carouselOpen.value = true;
}

/**
 * 원본 사이트 열기 핸들러
 */
async function handleOpenOriginalSite(game: GameItem): Promise<void> {
  try {
    await openOriginalSite.mutateAsync(game.path);
  } catch (err) {
    console.error("원본 사이트 열기 실패:", err);
    toast.error(
      err instanceof Error ? err.message : "원본 사이트 열기에 실패했습니다.",
    );
  }
}

/**
 * 배치 토글 핸들러
 */
async function handleBatchToggle(
  field: "is_favorite" | "is_hidden" | "is_clear",
  value: boolean,
): Promise<void> {
  const paths = multiSelect.selectedPathsArray.value;
  if (paths.length === 0) return;

  try {
    const result = await searchState.batchToggle({ paths, field, value });
    const fieldNames = {
      is_favorite: value ? "즐겨찾기 추가" : "즐겨찾기 해제",
      is_hidden: value ? "숨기기" : "숨김 해제",
      is_clear: value ? "클리어 표시" : "클리어 해제",
    };
    toast.success(
      `${result.updatedCount}개의 게임을 ${fieldNames[field]}했습니다.`,
    );
    multiSelect.clearSelection();
  } catch (err) {
    console.error("배치 토글 실패:", err);
    toast.error(
      err instanceof Error ? err.message : "일괄 작업에 실패했습니다.",
    );
  }
}

/**
 * 배치 삭제 요청 핸들러
 */
function handleBatchDeleteRequest(): void {
  if (multiSelect.selectedCount.value === 0) return;
  showBatchDeleteConfirm.value = true;
}

/**
 * 배치 삭제 확정 핸들러
 */
async function handleBatchDeleteConfirm(): Promise<void> {
  const paths = multiSelect.selectedPathsArray.value;
  if (paths.length === 0) return;

  try {
    await deleteGamesMutation.mutateAsync(paths);
    multiSelect.clearSelection();
  } catch (err) {
    console.error("배치 삭제 실패:", err);
  }
}

/**
 * 게임 카드 선택 핸들러
 */
function handleGameSelect(game: GameItem, event: MouseEvent): void {
  if (event.shiftKey) {
    multiSelect.rangeSelect(game.path);
  } else {
    multiSelect.toggleSelect(game.path);
  }
}

/**
 * 전체 선택/해제 토글 핸들러
 */
function handleToggleSelectAll(): void {
  if (multiSelect.isAllSelected.value) {
    multiSelect.clearSelection();
  } else {
    multiSelect.selectAll();
  }
}

/**
 * 게임 상세 업데이트 핸들러
 */
function handleGameDetailUpdated(): void {
  // 검색 결과 자동 리페칭 (Vue Query에 의해 처리됨)
}

/**
 * 필터 포함 확인
 */
function hasTag(tag: string): boolean {
  return searchState.hasTag(tag);
}

function hasCircle(circle: string): boolean {
  return searchState.hasCircle(circle);
}

function hasCategory(category: string): boolean {
  return searchState.hasCategory(category);
}

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
 * 줌 레벨 증가 핸들러
 */
function handleIncreaseZoom(): void {
  uiStore.increaseZoom();
}

/**
 * 줌 레벨 감소 핸들러
 */
function handleDecreaseZoom(): void {
  uiStore.decreaseZoom();
}

/**
 * 그리드 컬럼 클래스 계산
 */
const gridColsClass = computed(() => {
  const level = uiStore.zoomLevel;
  switch (level) {
    case 1:
      return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3";
    case 2:
      return "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4";
    case 3:
      return "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5";
    case 4:
      return "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5";
    case 5:
      return "grid-cols-4 sm:grid-cols-5 lg:grid-cols-6";
    case 6:
      return "grid-cols-5 sm:grid-cols-6 lg:grid-cols-7";
    case 7:
      return "grid-cols-6 sm:grid-cols-7 lg:grid-cols-8";
    case 8:
      return "grid-cols-7 sm:grid-cols-8 lg:grid-cols-9";
    case 9:
      return "grid-cols-8 sm:grid-cols-9 lg:grid-cols-10";
    case 10:
      return "grid-cols-9 sm:grid-cols-10 lg:grid-cols-11";
    default:
      return "grid-cols-3 sm:grid-cols-4 lg:grid-cols-5";
  }
});

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
 * 랜덤 선택 핸들러
 */
async function handleRandomSelect(): Promise<void> {
  if (!activeLibraryPaths.value || activeLibraryPaths.value.length === 0) {
    toast.warning("라이브러리 경로가 없습니다.");
    return;
  }

  try {
    // 현재 검색어에서 특별 검색어(tag:, circle:, category:, provider:, id:)만 추출
    const currentQuery = searchQuery.value;
    const specialFilters: string[] = [];

    const patterns = [
      /provider:\S+/g,
      /id:\S+/g,
      /circle:\S+/g,
      /tag:\S+/g,
      /category:\S+/g,
    ];

    for (const pattern of patterns) {
      const matches = currentQuery.match(pattern);
      if (matches) {
        specialFilters.push(...matches);
      }
    }

    // 특별 검색어만 포함된 검색어로 DB 조회 (텍스트 검색어 제외)
    const randomQuery =
      specialFilters.length > 0 ? specialFilters.join(" ") : "";

    const result = await randomGameMutation.mutateAsync({
      sourcePaths: activeLibraryPaths.value,
      searchQuery: {
        query: randomQuery || undefined,
        filters: filters.value,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
      },
    });

    if (!result.game) {
      toast.warning("랜덤 선택할 게임이 없습니다.");
      return;
    }

    const randomGame = result.game;

    // 번역제목 > 제목 > 원본이름 순서로 검색어 구성
    const newTitle = (
      randomGame.translatedTitle ||
      randomGame.title ||
      randomGame.originalTitle
    ).trim();
    if (specialFilters.length > 0) {
      searchQuery.value = `${specialFilters.join(" ")} ${newTitle}`;
    } else {
      searchQuery.value = newTitle;
    }

    toast.success(`${randomGame.title}을(를) 선택했습니다.`);
  } catch (err) {
    console.error("랜덤 선택 오류:", err);
    toast.error("랜덤 선택에 실패했습니다.");
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

// 게임 목록 변경 시 store 업데이트
watch(
  () => totalCount.value,
  (count) => {
    uiStore.setGameCount(count);
  },
  { immediate: true },
);

/**
 * 휠 이벤트 핸들러 (Ctrl+휠로 줌 조절)
 */
function handleWheel(event: WheelEvent): void {
  if (event.ctrlKey || event.metaKey) {
    event.preventDefault();

    if (event.deltaY < 0 && uiStore.zoomLevel > 1) {
      uiStore.decreaseZoom(); // 위로 스크롤: 축소 (내용이 더 적게 보임)
    } else if (event.deltaY > 0 && uiStore.zoomLevel < 10) {
      uiStore.increaseZoom(); // 아래로 스크롤: 확대
    }
  }
}

/**
 * 키보드 이벤트 핸들러 (Ctrl+F로 검색창 포커스)
 */
function handleKeydown(event: KeyboardEvent): void {
  if ((event.ctrlKey || event.metaKey) && event.key === "f") {
    event.preventDefault();
    searchBarRef.value?.focus();
  }
  // Ctrl+A: 전체 선택
  if ((event.ctrlKey || event.metaKey) && event.key === "a") {
    if (document.activeElement?.tagName === "INPUT") return;
    event.preventDefault();
    handleToggleSelectAll();
  }
  // Escape: 선택 해제
  if (event.key === "Escape" && multiSelect.isSelectionMode.value) {
    event.preventDefault();
    multiSelect.clearSelection();
  }
}

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

  // 휠 이벤트 리스너 등록 (Ctrl+휠 줌 조절)
  window.addEventListener("wheel", handleWheel, { passive: false });

  // 키보드 이벤트 리스너 등록 (Ctrl+F 검색창 포커스)
  window.addEventListener("keydown", handleKeydown);
});

onUnmounted(() => {
  // 휠 이벤트 리스너 제거
  window.removeEventListener("wheel", handleWheel);
  // 키보드 이벤트 리스너 제거
  window.removeEventListener("keydown", handleKeydown);
  // Intersection Observer 정리
  stop();
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
      <div class="flex items-center justify-between border-b px-4 py-2">
        <h1 class="text-base font-semibold">게임 라이브러리</h1>
        <div class="flex items-center gap-2">
          <!-- 줌 컨트롤 -->
          <div class="mr-2 flex items-center gap-1 border-r pr-2">
            <Button
              @click="handleDecreaseZoom"
              variant="ghost"
              size="icon"
              :disabled="uiStore.zoomLevel <= 1"
              class="h-7 w-7"
              title="축소"
            >
              <Minus :size="14" />
            </Button>
            <span class="text-muted-foreground min-w-4 text-center text-xs">
              {{ uiStore.zoomLevel }}
            </span>
            <Button
              @click="handleIncreaseZoom"
              variant="ghost"
              size="icon"
              :disabled="uiStore.zoomLevel >= 10"
              class="h-7 w-7"
              title="확대"
            >
              <Plus :size="14" />
            </Button>
          </div>

          <!-- 전체 동기화 버튼 -->
          <Button
            @click="handleAllInOneRefresh"
            :disabled="allInOneRefreshMutation.isPending.value || isSearching"
            variant="default"
            size="sm"
            title="폴더 스캔 + 정보 수집 + 번역"
          >
            <RefreshCw
              :size="14"
              :class="{
                'animate-spin': allInOneRefreshMutation.isPending.value,
              }"
            />
            <span class="hidden sm:inline">전체 동기화</span>
          </Button>

          <!-- 랜덤 선택 버튼 -->
          <Button
            @click="handleRandomSelect"
            :disabled="
              specialOnlyTotalCount === 0 ||
              allInOneRefreshMutation.isPending.value
            "
            variant="secondary"
            size="sm"
            title="랜덤 선택"
          >
            <Shuffle :size="14" />
            <span class="hidden sm:inline">랜덤</span>
          </Button>

          <RouterLink to="/settings">
            <Button variant="ghost" size="icon" class="shrink-0" title="설정">
              <Settings :size="18" />
            </Button>
          </RouterLink>
        </div>
      </div>

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
          <div class="flex-1 overflow-y-auto p-4">
            <!-- 로딩 상태 -->
            <div
              v-if="isSearching && games.length === 0"
              class="flex h-full items-center justify-center"
            >
              <div class="flex flex-col items-center gap-4">
                <Loader2
                  :size="32"
                  class="text-muted-foreground animate-spin"
                />
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
                  :is-selection-mode="multiSelect.isSelectionMode.value"
                  :selected-count="multiSelect.selectedCount.value"
                  @play="handlePlayGame"
                  @open-folder="handleOpenFolder"
                  @toggle-favorite="handleToggleFavorite"
                  @toggle-hidden="handleToggleHidden"
                  @toggle-clear="handleToggleClear"
                  @show-detail="handleShowDetail"
                  @open-original-site="handleOpenOriginalSite"
                  @delete="handleDeleteRequest"
                  @batch-favorite="(v) => handleBatchToggle('is_favorite', v)"
                  @batch-clear="(v) => handleBatchToggle('is_clear', v)"
                  @batch-hidden="(v) => handleBatchToggle('is_hidden', v)"
                  @batch-delete="handleBatchDeleteRequest"
                >
                  <GameCard
                    :game="game"
                    :is-playing="playingGamePath === game.path"
                    :is-selected="multiSelect.isSelected(game.path)"
                    :is-selection-mode="multiSelect.isSelectionMode.value"
                    :is-active-tag="hasTag"
                    :is-active-circle="hasCircle"
                    :is-active-category="hasCategory"
                    @play="handlePlayGame"
                    @open-folder="handleOpenFolder"
                    @toggle-favorite="handleToggleFavorite"
                    @toggle-hidden="handleToggleHidden"
                    @toggle-clear="handleToggleClear"
                    @click-tag="handleClickTag"
                    @click-circle="handleClickCircle"
                    @click-category="handleClickCategory"
                    @show-detail="handleShowDetail"
                    @open-original-site="handleOpenOriginalSite"
                    @select="handleGameSelect"
                    @dblclick="handleGameDoubleClick(game)"
                  />
                </GameContextMenu>
              </div>

              <!-- 무한 스크롤 트리거 & 로딩 표시 -->
              <div
                ref="loadMoreTrigger"
                class="flex justify-center py-4"
                :class="{
                  'opacity-0':
                    !searchState.hasNextPage.value &&
                    !searchState.isFetchingNextPage.value,
                }"
              >
                <div
                  v-if="searchState.isFetchingNextPage.value"
                  class="flex items-center gap-2"
                >
                  <Loader2
                    :size="16"
                    class="text-muted-foreground animate-spin"
                  />
                  <span class="text-muted-foreground text-sm"
                    >더 불러오는 중...</span
                  >
                </div>
                <div
                  v-else-if="!searchState.hasNextPage.value && games.length > 0"
                  class="text-muted-foreground text-sm"
                >
                  모든 게임을 표시했습니다
                </div>
              </div>
            </div>
          </div>

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
      @updated="handleGameDetailUpdated"
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
