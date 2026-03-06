<script setup lang="ts">
import { useQueryClient } from "@tanstack/vue-query";
import { version as APP_VERSION } from "../../../package.json";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Cookie,
  Download,
  Folder,
  FolderOpen,
  Home,
  Languages,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Switch } from "../components/ui/switch";
import {
  useLibraryScanHistory,
  useSelectFolder,
} from "../composables/useAllInOneRefresh";
import {
  useAllSettings,
  useUpdateSettings,
} from "../composables/useAllSettings";
import { useCleanThumbnails } from "../composables/useCleanThumbnails";
import {
  useCollector,
  useGetNewCookie,
  useRunAllCollectors,
} from "../composables/useCollector";
import {
  useAddExcludedExecutable,
  useExcludedExecutables,
  useRemoveExcludedExecutable,
} from "../composables/useExcludedExecutables";
import {
  useLoadGames,
  useOpenFolder,
  useRefreshGames,
} from "../composables/useGames";
import {
  useAddLibraryPath,
  useLibraryPaths,
  useRemoveLibraryPath,
} from "../composables/useSettings";
import { useSetTheme, useThemeSettings } from "../composables/useTheme";
import {
  useTranslateAllTitlesMutation,
  useTranslationProgress,
} from "../composables/useTranslation";
import {
  TitleDisplayMode,
  useSetTranslationSettings,
  useTranslationSettings,
} from "../composables/useTranslationSettings";
import { useAutoUpdate } from "../composables/useAutoUpdate";
import { themeList } from "../lib/themeList";

// 라이브러리 스캔 기록 타입
interface LibraryScanInfo {
  lastScannedAt: string;
  lastGameCount: number;
}

const refreshGamesMutation = useRefreshGames();
const loadGamesMutation = useLoadGames();
const openFolderMutation = useOpenFolder();

// Vue Query 클라이언트
const queryClient = useQueryClient();

// 라이브러리 경로 관리 (electron-store)
const { data: libraryPaths, isLoading: isLoadingLibraryPaths } =
  useLibraryPaths();
const addLibraryPathMutation = useAddLibraryPath();
const removeLibraryPathMutation = useRemoveLibraryPath();

// 개별 경로 새로고침 상태
const isRefreshingPath = ref(false);

// 라이브러리 스캔 기록 (Vue Query 기반)
const { data: libraryScanHistories, isLoading: isLoadingScanHistories } =
  useLibraryScanHistory();

/**
 * 마지막 스캔 시간 포맷팅
 */
function formatLastScannedAt(timestamp: string | null): string {
  if (!timestamp) return "알 수 없음";
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "방금 전";
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  return date.toLocaleDateString("ko-KR");
}

// 실행 제외 목록 관리
const { data: excludedExecutables, isLoading: isLoadingExcluded } =
  useExcludedExecutables();
const addExcludedExecutable = useAddExcludedExecutable();
const removeExcludedExecutable = useRemoveExcludedExecutable();
const newExcludedExecutable = ref("");

// Google 쿠키 관리
const getNewCookieMutation = useGetNewCookie();

// 번역 설정 (Vue Query 기반)
const { data: translationSettings } = useTranslationSettings();

// 제목 표시 우선순위
const titleDisplayPriority = computed({
  get: (): TitleDisplayMode[] =>
    translationSettings.value?.titleDisplayPriority ?? [
      "translated",
      "collected",
      "original",
    ],
  set: (value: TitleDisplayMode[]) => {
    setTranslationSettingsMutation.mutate({
      showTranslated: translationSettings.value?.showTranslated ?? false,
      autoTranslate: translationSettings.value?.autoTranslate ?? false,
      titleDisplayPriority: value,
    });
  },
});

// 드래그 관련 상태
const draggedIndex = ref<number | null>(null);
const dragOverIndex = ref<number | null>(null);

// 드래그 시작
function handleDragStart(index: number): void {
  draggedIndex.value = index;
}

// 드래그 오버
function handleDragOver(event: DragEvent, index: number): void {
  event.preventDefault();
  dragOverIndex.value = index;
}

// 드롭
function handleDrop(index: number): void {
  if (draggedIndex.value === null || draggedIndex.value === index) return;

  movePriorityItem(draggedIndex.value, index);

  // 드래그 상태 초기화
  draggedIndex.value = null;
  dragOverIndex.value = null;
}

// 드래그 종료
function handleDragEnd(): void {
  draggedIndex.value = null;
  dragOverIndex.value = null;
}

// 드래그 앤 드롭으로 순서 변경
function movePriorityItem(fromIndex: number, toIndex: number): void {
  const current = [...titleDisplayPriority.value];
  const [removed] = current.splice(fromIndex, 1);
  current.splice(toIndex, 0, removed);
  titleDisplayPriority.value = current;
}

// 제목 표시 모드 라벨 반환
function getTitleDisplayModeLabel(mode: TitleDisplayMode): string {
  const labels: Record<TitleDisplayMode, string> = {
    original: "원본 (폴더명)",
    collected: "원문 (정보 수집)",
    translated: "번역",
  };
  return labels[mode];
}

// 번역 관련
const translateAllMutation = useTranslateAllTitlesMutation();
const { current, total, gameTitle, isInProgress } = useTranslationProgress();

// 통합 설정
const { data: settings } = useAllSettings();
const updateSettingsMutation = useUpdateSettings();

// 컬렉터 관련
const { isRunning: isCollectorRunning, progress } = useCollector();
const runAllCollectorsMutation = useRunAllCollectors();

// 폴더 선택 Mutation
const selectFolderMutation = useSelectFolder();

// 번역 설정 Mutation
const setTranslationSettingsMutation = useSetTranslationSettings();

// 썸네일 블러 (computed로 설정에서 가져오기)
const blurThumbnails = computed({
  get: () => settings.value?.thumbnailSettings?.blurEnabled ?? false,
  set: (value) => {
    updateSettingsMutation.mutate({
      thumbnailSettings: {
        ...settings.value?.thumbnailSettings,
        blurEnabled: value,
      },
    });
  },
});

// 자동 스캔 설정 (computed로 설정에서 가져오기)
const autoScanOnStartup = computed({
  get: () => settings.value?.autoScanOnStartup ?? false,
  set: (value) => {
    updateSettingsMutation.mutate({
      autoScanOnStartup: value,
    });
  },
});

// 썸네일 정리
const cleanThumbnailsMutation = useCleanThumbnails();

// 테마 설정
const { data: themeSettings } = useThemeSettings();
const setThemeMutation = useSetTheme();

// 자동 업데이트 관련
const {
  status: updateStatus,
  updateInfo,
  progress: downloadProgress,
  error: updateError,
  isPortable,
  isChecking,
  isDownloading,
  isUpdateAvailable,
  isReadyToInstall,
  hasError: hasUpdateError,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  isCheckPending,
  isDownloadPending,
} = useAutoUpdate();

// 자동 업데이트 설정 (computed)
const checkOnStartup = computed({
  get: () => settings.value?.autoUpdateSettings?.checkOnStartup ?? true,
  set: (value) => {
    updateSettingsMutation.mutate({
      autoUpdateSettings: {
        ...settings.value?.autoUpdateSettings,
        checkOnStartup: value,
      },
    });
  },
});

// 현재 선택된 테마
const currentTheme = computed(
  () => themeSettings.value?.colorTheme ?? "default",
);

// 테마 변경 핸들러
function handleSetTheme(theme: string) {
  setThemeMutation.mutate(theme);
}

/**
 * 번역 실행
 */
function handleTranslate(force: boolean): void {
  translateAllMutation.mutate(
    { force },
    {
      onSuccess: () => {
        // toast는 mutation의 onSuccess에서 처리됨
      },
    },
  );
}

// 설정 폴더 선택 대화상자
const folderInput = ref("");

/**
 * 폴더 경로 추가
 */
function handleAddPath(): void {
  const path = folderInput.value.trim();
  if (!path) return;

  if (libraryPaths.value?.includes(path)) {
    toast.warning("이미 추가된 경로입니다.");
    return;
  }

  addLibraryPathMutation.mutate(path, {
    onSuccess: () => {
      folderInput.value = "";
      toast.success("경로가 추가되었습니다.");
      // Vue Query가 자동으로 invalidate 처리하므로 추가 작업 불필요
    },
    onError: () => {
      toast.error("경로 추가에 실패했습니다.");
    },
  });

  // Vue Query로 인위된 게임 목록 갱신
}

/**
 * 폴더 경로 제거
 */
function handleRemovePath(path: string): void {
  removeLibraryPathMutation.mutate(path, {
    onSuccess: async () => {
      toast.success("경로가 제거되었습니다.");
      // 경로 제거 후 Vue Query로 게임 목록 갱신 (invalidate 자동 처리됨)
      const remainingPaths =
        libraryPaths.value?.filter((p) => p !== path) || [];
      // Vue Query가 자동으로 invalidate 처리하므로 별도의 로드 불필요
    },
    onError: () => {
      toast.error("경로 제거에 실패했습니다.");
    },
  });
}

/**
 * 폴더 선택 다이얼로그 열기
 */
async function handleSelectFolder(): Promise<void> {
  try {
    const filePaths = await selectFolderMutation.mutateAsync(undefined);

    if (filePaths && filePaths.length > 0) {
      const selectedPath = filePaths[0];

      // 이미 추가된 경로인지 확인
      if (libraryPaths.value?.includes(selectedPath)) {
        toast.warning("이미 추가된 경로입니다.");
        return;
      }

      addLibraryPathMutation.mutate(selectedPath, {
        onSuccess: () => {
          toast.success("경로가 추가되었습니다.");
          // 경로 추가 후 게임 목록 새로고침 (자동 스캔)
          // refreshGames는 더 이상 사용하지 않음 - Vue Query가 자동으로 invalidate 처리
        },
        onError: () => {
          toast.error("경로 추가에 실패했습니다.");
        },
      });
    }
  } catch (err) {
    console.error("폴더 선택 오류:", err);
  }
}

/**
 * 폴더 열기
 */
async function handleOpenPath(path: string): Promise<void> {
  try {
    await openFolderMutation.mutateAsync(path);
  } catch {
    toast.error("폴더를 열 수 없습니다.");
  }
}

/**
 * 개별 경로 새로고침 핸들러
 */
async function handleRefreshSinglePath(path: string): Promise<void> {
  isRefreshingPath.value = true;
  try {
    const result = await refreshGamesMutation.mutateAsync([path]);
    // Vue Query 캐시 무효화는 mutation의 onSuccess에서 자동 처리됨
    // result는 GameItem[]이며, 추가된 게임 수는 알 수 없음
    toast.success(`"${path}" 경로를 스캔했습니다.`);
  } catch (err) {
    console.error("경로 새로고침 오류:", err);
    toast.error(
      err instanceof Error ? err.message : "새로고침에 실패했습니다.",
    );
  } finally {
    isRefreshingPath.value = false;
  }
}

/**
 * 실행 제외 목록에 추가
 */
async function handleAddExcludedExecutable(): Promise<void> {
  const executable = newExcludedExecutable.value.trim();
  if (!executable) return;

  // 목록에 이미 있는지 확인
  if (
    excludedExecutables.value?.some(
      (e) => e.toLowerCase() === executable.toLowerCase(),
    )
  ) {
    toast.warning("이미 등록된 실행 파일입니다.");
    return;
  }

  try {
    await addExcludedExecutable.mutateAsync(executable);
    newExcludedExecutable.value = "";
    toast.success("실행 제외 목록에 추가되었습니다.");
  } catch {
    toast.error("추가에 실패했습니다.");
  }
}

/**
 * 실행 제외 목록에서 제거
 */
async function handleRemoveExcludedExecutable(
  executable: string,
): Promise<void> {
  try {
    await removeExcludedExecutable.mutateAsync(executable);
    toast.success("실행 제외 목록에서 제거되었습니다.");
  } catch {
    toast.error("제거에 실패했습니다.");
  }
}

/**
 * Google 쿠키 획득 (세이프서치 해제)
 */
async function handleGetNewCookie(): Promise<void> {
  try {
    await getNewCookieMutation.mutateAsync(undefined);
    toast.success("Google 쿠키가 설정되었습니다.");
  } catch {
    toast.error("쿠키 획득에 실패했습니다.");
  }
}

/**
 * 정보 수집 핸들러
 */
async function handleCollect(force: boolean): Promise<void> {
  try {
    await runAllCollectorsMutation.mutateAsync(force);
    toast.success(
      force
        ? "모든 게임 정보 재수집이 완료되었습니다."
        : "미수집 게임 정보 수집이 완료되었습니다.",
    );
  } catch (err) {
    console.error("정보 수집 실행 실패:", err);
    toast.error(
      err instanceof Error ? err.message : "정보 수집에 실패했습니다.",
    );
  }
}

/**
 * 썸네일 정리 핸들러
 */
async function handleCleanUnusedThumbnails(): Promise<void> {
  try {
    const result = await cleanThumbnailsMutation.mutateAsync(undefined);
    toast.success(
      `${result.deletedCount}개의 사용하지 않는 썸네일이 삭제되었습니다.`,
    );
  } catch {
    toast.error("삭제에 실패했습니다.");
  }
}

/**
 * 바이트 단위를 사람이 읽기 쉬운 형식으로 변환
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
</script>

<template>
  <div class="flex h-full flex-col overflow-hidden">
    <!-- 도구 모음 -->
    <div class="flex items-center justify-between border-b px-4 py-2">
      <h1 class="text-base font-semibold">설정</h1>
      <RouterLink to="/">
        <Button variant="ghost" size="icon" class="shrink-0" title="홈">
          <Home :size="18" />
        </Button>
      </RouterLink>
    </div>

    <!-- 스크롤 영역 -->
    <div class="flex-1 overflow-y-auto p-6">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
        <!-- 라이브러리 경로 설정 -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-lg">라이브러리 경로</CardTitle>
            <CardDescription class="text-sm">
              게임이 있는 폴더 경로를 추가하세요. 하위 폴더의 게임도 자동으로
              스캔됩니다.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 경로 추가 폼 -->
            <div class="space-y-3">
              <label
                class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                경로 추가
              </label>
              <div class="flex gap-2">
                <Input
                  v-model="folderInput"
                  @keyup.enter="handleAddPath"
                  type="text"
                  placeholder="폴더 경로 입력 (예: C:\Games)"
                  class="flex-1"
                />
                <Button @click="handleAddPath" size="default">
                  <Plus :size="16" />
                  추가
                </Button>
              </div>
              <Button
                @click="handleSelectFolder"
                variant="outline"
                class="w-full"
              >
                <Folder :size="16" />
                폴더에서 선택
              </Button>
            </div>

            <!-- 저장된 경로 목록 -->
            <div v-if="(libraryPaths?.length ?? 0) > 0" class="space-y-3">
              <div class="flex items-center justify-between">
                <label class="text-sm leading-none font-medium">
                  저장된 경로
                </label>
                <span class="text-muted-foreground text-xs"
                  >{{ libraryPaths?.length ?? 0 }}개</span
                >
              </div>
              <div class="space-y-2">
                <div
                  v-for="path in libraryPaths"
                  :key="path"
                  class="bg-muted/50 hover:bg-muted group flex flex-col gap-2 rounded-md p-3 transition-colors"
                >
                  <div class="flex items-center gap-3">
                    <Folder :size="18" class="text-muted-foreground shrink-0" />
                    <span class="min-w-0 flex-1 truncate font-mono text-sm">{{
                      path
                    }}</span>
                    <Button
                      @click="handleOpenPath(path)"
                      variant="ghost"
                      size="icon"
                      class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      title="폴더 열기"
                    >
                      <FolderOpen :size="16" />
                    </Button>
                    <Button
                      @click="handleRefreshSinglePath(path)"
                      variant="ghost"
                      size="icon"
                      class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      title="새로고침"
                      :disabled="isRefreshingPath"
                    >
                      <RefreshCw
                        :size="16"
                        :class="{ 'animate-spin': isRefreshingPath }"
                      />
                    </Button>
                    <Button
                      @click="handleRemovePath(path)"
                      variant="ghost"
                      size="icon"
                      class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                      title="삭제"
                    >
                      <Trash2 :size="16" class="text-destructive" />
                    </Button>
                  </div>
                  <!-- 마지막 스캔 시간 표시 -->
                  <div
                    v-if="libraryScanHistories?.[path]"
                    class="text-muted-foreground ml-7 flex items-center gap-1.5 text-xs"
                  >
                    <Clock :size="12" />
                    <span
                      >마지막 스캔:
                      {{
                        formatLastScannedAt(
                          libraryScanHistories[path].lastScannedAt,
                        )
                      }}</span
                    >
                    <span
                      >({{ libraryScanHistories[path].lastGameCount }}개
                      게임)</span
                    >
                  </div>
                  <div
                    v-else
                    class="text-muted-foreground ml-7 flex items-center gap-1.5 text-xs"
                  >
                    <Clock :size="12" />
                    <span>아직 스캔하지 않음</span>
                  </div>
                </div>
              </div>
            </div>

            <div
              v-else
              class="flex flex-col items-center justify-center py-8 text-center"
            >
              <Folder :size="32" class="text-muted-foreground/50 mb-2" />
              <p class="text-muted-foreground text-sm">
                추가된 라이브러리 경로가 없습니다.
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- 실행 제외 목록 설정 -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-lg">실행 제외 목록</CardTitle>
            <CardDescription class="text-sm">
              자동 감지에서 제외할 실행 파일명을 등록합니다. 등록된 파일은 게임
              실행 파일로 감지되지 않습니다.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 제외 파일 추가 폼 -->
            <div class="space-y-3">
              <label
                class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                실행 파일명 추가
              </label>
              <div class="flex gap-2">
                <Input
                  v-model="newExcludedExecutable"
                  @keyup.enter="handleAddExcludedExecutable"
                  type="text"
                  placeholder="실행 파일명 입력 (예: setup.exe)"
                  class="flex-1"
                />
                <Button
                  @click="handleAddExcludedExecutable"
                  :disabled="
                    !newExcludedExecutable.trim() ||
                    addExcludedExecutable.isPending.value
                  "
                  size="default"
                >
                  <Plus :size="16" />
                  추가
                </Button>
              </div>
            </div>

            <!-- 저장된 제외 목록 -->
            <div
              v-if="
                !isLoadingExcluded &&
                excludedExecutables &&
                excludedExecutables.length > 0
              "
              class="space-y-3"
            >
              <div class="flex items-center justify-between">
                <label class="text-sm leading-none font-medium">
                  등록된 실행 파일
                </label>
                <span class="text-muted-foreground text-xs"
                  >{{ excludedExecutables.length }}개</span
                >
              </div>
              <div class="space-y-2">
                <div
                  v-for="executable in excludedExecutables"
                  :key="executable"
                  class="bg-muted/50 hover:bg-muted group flex items-center justify-between gap-3 rounded-md p-3 transition-colors"
                >
                  <span class="flex-1 font-mono text-sm">{{ executable }}</span>
                  <Button
                    @click="handleRemoveExcludedExecutable(executable)"
                    variant="ghost"
                    size="icon"
                    class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    :disabled="removeExcludedExecutable.isPending.value"
                  >
                    <Trash2 :size="16" class="text-destructive" />
                  </Button>
                </div>
              </div>
            </div>

            <div
              v-else-if="!isLoadingExcluded"
              class="flex flex-col items-center justify-center py-8 text-center"
            >
              <div
                class="bg-muted mb-2 flex h-8 w-8 items-center justify-center rounded-full"
              >
                <span class="text-muted-foreground/50 text-lg">×</span>
              </div>
              <p class="text-muted-foreground text-sm">
                등록된 실행 제외 목록이 없습니다.
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- 정보 수집 설정 -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-lg">정보 수집</CardTitle>
            <CardDescription class="text-sm">
              게임 썸네일과 메타데이터를 수집합니다. 홈 화면의 정보 수집 버튼은
              미수집 게임만 수집합니다.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 진행 상태 -->
            <div
              v-if="isCollectorRunning"
              class="bg-muted/50 flex items-center gap-2 rounded-md p-3"
            >
              <Loader2 :size="16" class="text-muted-foreground animate-spin" />
              <span class="text-muted-foreground text-sm">
                수집 중... ({{ progress.current }}/{{ progress.total }})
              </span>
            </div>
            <p
              v-if="isCollectorRunning && progress.gameTitle"
              class="text-muted-foreground ml-1 text-xs"
            >
              {{ progress.gameTitle }}
            </p>

            <!-- 수집 버튼 그리드 -->
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                @click="() => handleCollect(false)"
                :disabled="isCollectorRunning"
                variant="secondary"
                class="w-full"
              >
                <Loader2
                  v-if="isCollectorRunning"
                  :size="18"
                  class="animate-spin"
                />
                <RefreshCw v-else :size="18" />
                {{ isCollectorRunning ? "수집 중..." : "미수집 게임 수집" }}
              </Button>
              <Button
                @click="() => handleCollect(true)"
                :disabled="isCollectorRunning"
                variant="default"
                class="w-full"
              >
                <Loader2
                  v-if="isCollectorRunning"
                  :size="18"
                  class="animate-spin"
                />
                <RefreshCw v-else :size="18" />
                {{ isCollectorRunning ? "수집 중..." : "강제 전체 재수집" }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- 번역 설정 -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-lg">게임 제목 번역</CardTitle>
            <CardDescription class="text-sm">
              일본어 게임 제목을 한국어로 번역합니다.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 제목 표시 우선순위 -->
            <div class="space-y-2">
              <label class="text-sm leading-none font-medium"
                >제목 표시 우선순위</label
              >
              <p class="text-muted-foreground text-xs">
                드래그하여 순서를 변경하세요 (위에서부터 우선)
              </p>
              <div class="flex flex-col gap-1">
                <div
                  v-for="(mode, index) in titleDisplayPriority"
                  :key="mode"
                  draggable="true"
                  class="bg-muted flex cursor-grab items-center justify-between gap-2 rounded-md p-2 transition-colors active:cursor-grabbing"
                  :class="{
                    'bg-primary/20':
                      dragOverIndex === index && draggedIndex !== index,
                    'opacity-50': draggedIndex === index,
                  }"
                  @dragstart="handleDragStart(index)"
                  @dragover="handleDragOver($event, index)"
                  @drop="handleDrop(index)"
                  @dragend="handleDragEnd"
                >
                  <span class="flex-1 text-sm">{{
                    getTitleDisplayModeLabel(mode)
                  }}</span>
                  <div class="flex gap-0.5">
                    <button
                      v-if="index > 0"
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="shrink-0 cursor-pointer"
                      @click.stop="movePriorityItem(index, index - 1)"
                      title="위로 이동"
                    >
                      <ChevronUp :size="14" />
                    </button>
                    <button
                      v-if="index < titleDisplayPriority.length - 1"
                      type="button"
                      variant="ghost"
                      size="icon"
                      class="shrink-0 cursor-pointer"
                      @click.stop="movePriorityItem(index, index + 1)"
                      title="아래로 이동"
                    >
                      <ChevronDown :size="14" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 진행 상태 -->
            <div
              v-if="isInProgress"
              class="bg-muted/50 flex items-center gap-2 rounded-md p-3"
            >
              <Loader2 :size="16" class="text-muted-foreground animate-spin" />
              <span class="text-muted-foreground text-sm">
                번역 중... ({{ current }}/{{ total }})
              </span>
            </div>
            <p
              v-if="isInProgress && gameTitle"
              class="text-muted-foreground ml-1 text-xs"
            >
              {{ gameTitle }}
            </p>

            <!-- 번역 버튼 그리드 -->
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                @click="() => handleTranslate(false)"
                :disabled="translateAllMutation.isPending.value || isInProgress"
                variant="secondary"
                class="w-full"
              >
                <Loader2
                  v-if="translateAllMutation.isPending.value || isInProgress"
                  :size="18"
                  class="animate-spin"
                />
                <Languages v-else :size="18" />
                {{
                  isInProgress || translateAllMutation.isPending.value
                    ? "번역 중..."
                    : "미번역 게임 번역"
                }}
              </Button>
              <Button
                @click="() => handleTranslate(true)"
                :disabled="translateAllMutation.isPending.value || isInProgress"
                variant="default"
                class="w-full"
              >
                <Loader2
                  v-if="translateAllMutation.isPending.value || isInProgress"
                  :size="18"
                  class="animate-spin"
                />
                <Languages v-else :size="18" />
                {{
                  isInProgress || translateAllMutation.isPending.value
                    ? "번역 중..."
                    : "강제 전체 재번역"
                }}
              </Button>
            </div>
          </CardContent>
        </Card>

        <!-- 썸네일 설정 -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-lg">썸네일 설정</CardTitle>
            <CardDescription class="text-sm">
              게임 카드의 썸네일 표시 방식을 설정합니다.
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <label class="text-sm leading-none font-medium"
                  >썸네일 블러</label
                >
                <p class="text-muted-foreground text-xs">
                  민감한 이미지를 블러 처리하여 표시합니다
                </p>
              </div>
              <Switch v-model="blurThumbnails" />
            </div>

            <div class="border-t pt-2">
              <div class="space-y-0.5">
                <label class="text-sm leading-none font-medium"
                  >썸네일 정리</label
                >
                <p class="text-muted-foreground text-xs">
                  데이터베이스에서 사용하지 않는 썸네일 파일을 삭제합니다
                </p>
              </div>
              <Button
                @click="handleCleanUnusedThumbnails"
                :disabled="cleanThumbnailsMutation.isPending.value"
                variant="outline"
                class="mt-2 w-full"
              >
                <Loader2
                  v-if="cleanThumbnailsMutation.isPending.value"
                  :size="18"
                  class="animate-spin"
                />
                <Trash2 v-else :size="18" />
                {{
                  cleanThumbnailsMutation.isPending.value
                    ? "삭제 중..."
                    : "사용하지 않는 썸네일 삭제"
                }}
              </Button>
              <p
                v-if="cleanThumbnailsMutation.data.value"
                class="text-muted-foreground mt-1 text-xs"
              >
                {{ cleanThumbnailsMutation.data.value.deletedCount }}개 파일
                삭제됨 ({{
                  formatBytes(cleanThumbnailsMutation.data.value.freedSpace)
                }})
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- 자동 스캔 설정 -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-lg">자동 스캔</CardTitle>
            <CardDescription class="text-sm">
              앱 시작 시 변경된 라이브러리를 자동으로 스캔합니다.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <label class="text-sm leading-none font-medium"
                  >앱 시작 시 자동 스캔</label
                >
                <p class="text-muted-foreground text-xs">
                  변경 사항이 있는 경로만 자동 스캔합니다
                </p>
              </div>
              <Switch v-model="autoScanOnStartup" />
            </div>
          </CardContent>
        </Card>

        <!-- 테마 설정 -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-lg">테마 설정</CardTitle>
            <CardDescription class="text-sm">
              애플리케이션의 컬러 테마를 선택하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
              <button
                v-for="theme in themeList"
                :key="theme.value"
                type="button"
                @click="handleSetTheme(theme.value)"
                :class="[
                  'rounded-md border p-2 text-center text-xs transition-colors',
                  currentTheme === theme.value
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50',
                ]"
              >
                {{ theme.label }}
              </button>
            </div>
          </CardContent>
        </Card>

        <!-- Google 쿠키 설정 -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-lg">Google 검색 설정</CardTitle>
            <CardDescription class="text-sm">
              Google 이미지 검색에서 세이프서치를 해제합니다. 쿠키가 만료되면
              다시 설정하세요.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              @click="handleGetNewCookie"
              :disabled="getNewCookieMutation.isPending.value"
              variant="outline"
              class="w-full"
              size="default"
            >
              <Loader2
                v-if="getNewCookieMutation.isPending.value"
                :size="18"
                class="animate-spin"
              />
              <Cookie v-else :size="18" />
              {{
                getNewCookieMutation.isPending.value
                  ? "설정 중..."
                  : "Google 쿠키 설정"
              }}
            </Button>
          </CardContent>
        </Card>

        <!-- 업데이트 설정 -->
        <Card>
          <CardHeader class="pb-4">
            <CardTitle class="text-lg">업데이트</CardTitle>
            <CardDescription class="text-sm">
              앱 업데이트 확인 및 설치
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- 현재 버전 -->
            <div class="text-muted-foreground text-sm">
              현재 버전: {{ APP_VERSION }}
            </div>

            <!-- 자동 확인 설정 -->
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <label class="text-sm leading-none font-medium"
                  >시작 시 자동 확인</label
                >
                <p class="text-muted-foreground text-xs">
                  앱 시작 시 업데이트를 자동으로 확인합니다
                </p>
              </div>
              <Switch v-model="checkOnStartup" />
            </div>

            <!-- 상태 표시 -->
            <div
              v-if="isChecking || isCheckPending"
              class="flex items-center gap-2"
            >
              <Loader2 class="h-4 w-4 animate-spin" />
              <span class="text-sm">업데이트 확인 중...</span>
            </div>

            <div
              v-else-if="isDownloading || isDownloadPending"
              class="space-y-2"
            >
              <div class="flex items-center gap-2">
                <Loader2 class="h-4 w-4 animate-spin" />
                <span class="text-sm">다운로드 중...</span>
              </div>
              <div v-if="downloadProgress" class="space-y-1">
                <div class="bg-muted h-2 w-full overflow-hidden rounded-full">
                  <div
                    class="bg-primary h-full transition-all"
                    :style="{
                      width: `${downloadProgress.percent}%`,
                    }"
                  ></div>
                </div>
                <div class="text-muted-foreground flex justify-between text-xs">
                  <span>{{ downloadProgress.percent.toFixed(1) }}%</span>
                  <span>
                    {{ formatBytes(downloadProgress.transferred) }} /
                    {{ formatBytes(downloadProgress.total) }}
                  </span>
                </div>
              </div>
            </div>

            <div v-else-if="isReadyToInstall" class="space-y-2">
              <div class="text-sm text-green-500">
                v{{ updateInfo?.version }} 다운로드 완료
              </div>
              <Button @click="installUpdate" variant="default" class="w-full">
                지금 재시작하여 설치
              </Button>
            </div>

            <div
              v-else-if="updateStatus === 'not-available'"
              class="text-muted-foreground text-sm"
            >
              최신 버전입니다.
            </div>

            <div v-else-if="hasUpdateError" class="text-destructive text-sm">
              오류: {{ updateError }}
            </div>

            <!-- 업데이트 있음 (포터블 안내) -->
            <div
              v-if="isPortable && isUpdateAvailable"
              class="bg-muted/50 rounded-md p-3"
            >
              <p class="text-sm">
                포터블 버전은 자동 업데이트가 지원되지 않습니다.
              </p>
              <Button
                @click="downloadUpdate"
                variant="outline"
                class="mt-2 w-full"
              >
                <Download :size="16" />
                다운로드 페이지 열기
              </Button>
            </div>

            <!-- 업데이트 있음 (설치 버전) -->
            <div v-else-if="!isPortable && isUpdateAvailable" class="space-y-2">
              <div class="text-sm">
                새 버전 v{{ updateInfo?.version }}을(를) 사용할 수 있습니다.
              </div>
              <Button
                @click="downloadUpdate"
                :disabled="isDownloading || isDownloadPending"
                variant="default"
                class="w-full"
              >
                <Download :size="16" />
                다운로드
              </Button>
            </div>

            <!-- 수동 확인 버튼 -->
            <Button
              v-if="
                !isChecking &&
                !isDownloading &&
                !isReadyToInstall &&
                !isCheckPending &&
                !isDownloadPending
              "
              @click="checkForUpdates"
              variant="secondary"
              class="w-full"
            >
              <RefreshCw class="h-4 w-4" />
              업데이트 확인
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
