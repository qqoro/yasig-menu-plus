<script setup lang="ts">
import {
  ChevronDown,
  ChevronUp,
  FolderOpen,
  Image,
  Languages,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  useAllSettings,
  useOpenDataFolder,
  useUpdateSettings,
} from "@/composables/useAllSettings";
import { useCleanThumbnails } from "@/composables/useCleanThumbnails";
import { useConvertImagesToWebp } from "@/composables/useConvertImagesToWebp";
import { useCollector, useRunAllCollectors } from "@/composables/useCollector";
import {
  useTranslateAllTitlesMutation,
  useTranslationProgress,
} from "@/composables/useTranslation";
import {
  useSetTranslationSettings,
  useTranslationSettings,
  type TitleDisplayMode,
} from "@/composables/useTranslationSettings";
import { formatBytes } from "@/utils/format";

// 컬렉터 관련
const { progress } = useCollector();
const runAllCollectorsMutation = useRunAllCollectors();

// 번역 설정
const { data: translationSettings } = useTranslationSettings();
const setTranslationSettingsMutation = useSetTranslationSettings();

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

function handleDragStart(index: number): void {
  draggedIndex.value = index;
}

function handleDragOver(event: DragEvent, index: number): void {
  event.preventDefault();
  dragOverIndex.value = index;
}

function handleDrop(index: number): void {
  if (draggedIndex.value === null || draggedIndex.value === index) return;
  movePriorityItem(draggedIndex.value, index);
  draggedIndex.value = null;
  dragOverIndex.value = null;
}

function handleDragEnd(): void {
  draggedIndex.value = null;
  dragOverIndex.value = null;
}

function movePriorityItem(fromIndex: number, toIndex: number): void {
  const current = [...titleDisplayPriority.value];
  const [removed] = current.splice(fromIndex, 1);
  current.splice(toIndex, 0, removed);
  titleDisplayPriority.value = current;
}

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

// 썸네일 블러
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

// 썸네일 정리
const cleanThumbnailsMutation = useCleanThumbnails();

// 이미지 WebP 변환
const convertImagesMutation = useConvertImagesToWebp();

// 데이터 폴더 열기
const openDataFolderMutation = useOpenDataFolder();

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
 * 번역 실행
 */
function handleTranslate(force: boolean): void {
  translateAllMutation.mutate({ force });
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
 * 이미지 WebP 변환 핸들러
 */
async function handleConvertImagesToWebp(): Promise<void> {
  try {
    const result = await convertImagesMutation.mutateAsync(undefined);
    toast.success(
      `${result.converted}개 이미지 변환 완료 (${formatBytes(result.freedBytes)} 절약)`,
    );
  } catch {
    toast.error("변환에 실패했습니다.");
  }
}

/**
 * 데이터 폴더 열기 핸들러
 */
async function handleOpenDataFolder(): Promise<void> {
  try {
    await openDataFolderMutation.mutateAsync(undefined);
  } catch {
    toast.error("폴더를 열지 못했습니다.");
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 섹션 헤더 -->
    <div class="flex items-center gap-2">
      <RefreshCw :size="20" class="text-muted-foreground" />
      <h2 class="text-lg font-semibold">데이터 처리</h2>
    </div>

    <!-- 카드 그리드 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
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
            v-if="runAllCollectorsMutation.isPending.value"
            class="bg-muted/50 flex items-center gap-2 rounded-md p-3"
          >
            <Loader2 :size="16" class="text-muted-foreground animate-spin" />
            <span class="text-muted-foreground text-sm">
              수집 중... ({{ progress.current }}/{{ progress.total }})
            </span>
          </div>
          <p
            v-if="
              runAllCollectorsMutation.isPending.value && progress.gameTitle
            "
            class="text-muted-foreground ml-1 text-xs"
          >
            {{ progress.gameTitle }}
          </p>

          <!-- 수집 버튼 그리드 -->
          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              @click="() => handleCollect(false)"
              :disabled="runAllCollectorsMutation.isPending.value"
              variant="secondary"
              class="w-full"
            >
              <Loader2
                v-if="runAllCollectorsMutation.isPending.value"
                :size="18"
                class="animate-spin"
              />
              <RefreshCw v-else :size="18" />
              {{
                runAllCollectorsMutation.isPending.value
                  ? "수집 중..."
                  : "미수집 게임 수집"
              }}
            </Button>
            <Button
              @click="() => handleCollect(true)"
              :disabled="runAllCollectorsMutation.isPending.value"
              variant="default"
              class="w-full"
            >
              <Loader2
                v-if="runAllCollectorsMutation.isPending.value"
                :size="18"
                class="animate-spin"
              />
              <RefreshCw v-else :size="18" />
              {{
                runAllCollectorsMutation.isPending.value
                  ? "수집 중..."
                  : "강제 전체 재수집"
              }}
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
                    class="shrink-0 cursor-pointer"
                    @click.stop="movePriorityItem(index, index - 1)"
                    title="위로 이동"
                  >
                    <ChevronUp :size="14" />
                  </button>
                  <button
                    v-if="index < titleDisplayPriority.length - 1"
                    type="button"
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

          <div class="border-t pt-2">
            <div class="space-y-0.5">
              <label class="text-sm leading-none font-medium"
                >이미지 WebP 변환</label
              >
              <p class="text-muted-foreground text-xs">
                기존 JPG/PNG 이미지를 WebP로 변환하여 용량을 절약합니다
              </p>
            </div>
            <Button
              @click="handleConvertImagesToWebp"
              :disabled="convertImagesMutation.isPending.value"
              variant="outline"
              class="mt-2 w-full"
            >
              <Loader2
                v-if="convertImagesMutation.isPending.value"
                :size="18"
                class="animate-spin"
              />
              <Image v-else :size="18" />
              {{
                convertImagesMutation.isPending.value
                  ? "변환 중..."
                  : "기존 이미지 WebP로 변환"
              }}
            </Button>
            <p
              v-if="convertImagesMutation.data.value"
              class="text-muted-foreground mt-1 text-xs"
            >
              {{ convertImagesMutation.data.value.converted }}개 변환됨 ({{
                formatBytes(convertImagesMutation.data.value.freedBytes)
              }}
              절약)
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- 데이터 폴더 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">데이터 폴더</CardTitle>
          <CardDescription class="text-sm">
            앱 데이터가 저장된 폴더를 엽니다 (데이터베이스, 썸네일, 설정)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            @click="handleOpenDataFolder"
            variant="outline"
            class="w-full"
          >
            <FolderOpen :size="18" />
            폴더 열기
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
