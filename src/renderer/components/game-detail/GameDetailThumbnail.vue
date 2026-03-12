<script setup lang="ts">
import {
  Eye,
  EyeOff,
  Flag,
  FlagOff,
  Globe,
  Image as ImageIcon,
  Link2,
  Loader2,
  Star,
  StarOff,
  Trash2,
  Upload,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import { useSelectFile } from "../../composables/useAllInOneRefresh";
import {
  useHideThumbnail,
  useOpenOriginalSite,
  useSetThumbnailFromFile,
  useSetThumbnailFromUrl,
  useToggleClear,
  useToggleFavorite,
  useToggleHidden,
} from "../../composables/useGameDetail";
import type { GameDetailItem } from "../../types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface Props {
  game: GameDetailItem | undefined;
  gamePath: string;
  isLoading: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: "updated"): void }>();

// 썸네일 관리 상태
const showThumbnailMenu = ref(false);
const thumbnailUrlInput = ref("");
const isSettingThumbnail = ref(false);
const isDragOver = ref(false);

const setThumbnailFromUrl = useSetThumbnailFromUrl();
const setThumbnailFromFile = useSetThumbnailFromFile();
const hideThumbnail = useHideThumbnail();
const toggleFavorite = useToggleFavorite();
const toggleHidden = useToggleHidden();
const toggleClear = useToggleClear();
const openOriginalSite = useOpenOriginalSite();
const selectFileMutation = useSelectFile();

// 썸네일 URL (updatedAt으로 캐시 무효화)
const thumbnailUrl = computed(() => {
  if (!props.game?.thumbnail) return undefined;
  const cacheKey = props.game.updatedAt?.getTime() ?? 0;
  return `file:///${props.game.thumbnail.replace(/\\/g, "/")}?v=${cacheKey}`;
});

// 즐겨찾기 토글
async function handleToggleFavorite() {
  if (!props.gamePath) return;
  try {
    const result = (await toggleFavorite.mutateAsync(props.gamePath)) as {
      value: boolean;
    };
    toast.success(
      result.value ? "즐겨찾기에 추가했습니다." : "즐겨찾기에서 제거했습니다.",
    );
  } catch {
    toast.error("즐겨찾기 설정에 실패했습니다.");
  }
}

// 숨김 토글
async function handleToggleHidden() {
  if (!props.gamePath) return;
  try {
    const result = (await toggleHidden.mutateAsync(props.gamePath)) as {
      value: boolean;
    };
    toast.success(
      result.value ? "게임을 숨김 처리했습니다." : "게임 숨김을 해제했습니다.",
    );
  } catch {
    toast.error("숨김 설정에 실패했습니다.");
  }
}

// 클리어 토글
async function handleToggleClear() {
  if (!props.gamePath) return;
  try {
    const result = (await toggleClear.mutateAsync(props.gamePath)) as {
      value: boolean;
    };
    toast.success(
      result.value
        ? "클리어 표시를 추가했습니다."
        : "클리어 표시를 제거했습니다.",
    );
  } catch {
    toast.error("클리어 설정에 실패했습니다.");
  }
}

// URL에서 썸네일 설정
async function handleSetThumbnailFromUrl() {
  if (!props.gamePath || !thumbnailUrlInput.value.trim()) return;

  isSettingThumbnail.value = true;
  try {
    await setThumbnailFromUrl.mutateAsync({
      path: props.gamePath,
      url: thumbnailUrlInput.value.trim(),
    });
    thumbnailUrlInput.value = "";
    showThumbnailMenu.value = false;
    toast.success("썸네일이 설정되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("썸네일 설정에 실패했습니다.");
  } finally {
    isSettingThumbnail.value = false;
  }
}

// 파일에서 썸네일 설정
async function handleSetThumbnailFromFile() {
  if (!props.gamePath) return;

  try {
    const filePaths = await selectFileMutation.mutateAsync(undefined);
    if (!filePaths || filePaths.length === 0) return;

    const filePath = filePaths[0];
    isSettingThumbnail.value = true;

    await setThumbnailFromFile.mutateAsync({
      path: props.gamePath,
      filePath,
    });
    showThumbnailMenu.value = false;
    toast.success("썸네일이 설정되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("썸네일 설정에 실패했습니다.");
  } finally {
    isSettingThumbnail.value = false;
  }
}

// 썸네일 삭제
async function handleHideThumbnail() {
  if (!props.gamePath) return;

  try {
    await hideThumbnail.mutateAsync({ path: props.gamePath });
    showThumbnailMenu.value = false;
    toast.success("썸네일이 삭제되었습니다.");
  } catch (error) {
    toast.error("썸네일 삭제에 실패했습니다.");
  }
}

// 드래그 앤 드롭 핸들러
function handleDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer?.types.includes("Files")) {
    isDragOver.value = true;
  }
}

function handleDragLeave(event: DragEvent) {
  event.preventDefault();
  isDragOver.value = false;
}

async function handleDrop(event: DragEvent) {
  event.preventDefault();
  isDragOver.value = false;

  if (!props.gamePath) return;

  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;

  const file = files[0];
  if (!file.type.startsWith("image/")) {
    toast.error("이미지 파일만 업로드할 수 있습니다.");
    return;
  }

  isSettingThumbnail.value = true;
  try {
    // webUtils를 통해 파일 경로 가져오기
    const filePath = window.api.getPathForFile(file);
    await setThumbnailFromFile.mutateAsync({
      path: props.gamePath,
      filePath,
    });
    showThumbnailMenu.value = false;
    toast.success("썸네일이 설정되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("썸네일 설정에 실패했습니다.");
  } finally {
    isSettingThumbnail.value = false;
  }
}

// 원본 사이트 열기
async function handleOpenOriginalSite() {
  if (!props.gamePath) return;

  try {
    await openOriginalSite.mutateAsync(props.gamePath);
    toast.success("원본 사이트를 열었습니다.");
  } catch (error) {
    toast.error(
      error instanceof Error
        ? error.message
        : "원본 사이트 열기에 실패했습니다.",
    );
  }
}

function resetState() {
  showThumbnailMenu.value = false;
  thumbnailUrlInput.value = "";
  isDragOver.value = false;
  isSettingThumbnail.value = false;
}

defineExpose({ resetState });
</script>

<template>
  <div class="w-full flex-shrink-0 md:w-1/3">
    <!-- 드래그 앤 드롭 영역 -->
    <div
      class="relative"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <div
        class="bg-muted group relative aspect-[4/3] overflow-hidden rounded-lg transition-colors"
        :class="{ 'bg-primary/20': isDragOver }"
      >
        <img
          v-if="game?.thumbnail"
          :src="thumbnailUrl"
          :alt="game?.title"
          class="h-full w-full object-cover"
        />
        <div
          v-else
          class="bg-muted text-muted-foreground flex h-full w-full items-center justify-center"
        >
          <ImageIcon :size="48" class="opacity-20" />
        </div>
        <!-- 썸네일 관리 버튼 -->
        <div
          v-if="!isDragOver"
          class="bg-popover/60 absolute inset-0 flex items-center justify-center gap-2 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Button
            size="sm"
            variant="secondary"
            @click="showThumbnailMenu = !showThumbnailMenu"
          >
            <ImageIcon :size="16" />
            썸네일 관리
          </Button>
        </div>
      </div>

      <!-- 썸네일 관리 메뉴 -->
      <div
        v-if="showThumbnailMenu"
        class="bg-muted mt-2 space-y-2 rounded-lg p-3"
      >
        <div class="flex gap-2">
          <Input
            v-model="thumbnailUrlInput"
            placeholder="이미지 URL 입력"
            :disabled="isSettingThumbnail"
          />
          <Button
            size="sm"
            :disabled="isSettingThumbnail || !thumbnailUrlInput.trim()"
            @click="handleSetThumbnailFromUrl"
          >
            <Loader2
              v-if="isSettingThumbnail"
              :size="14"
              class="animate-spin"
            />
            <Link2 v-else :size="14" />
          </Button>
        </div>
        <div class="flex gap-2">
          <Button
            size="sm"
            variant="secondary"
            class="flex-1"
            :disabled="isSettingThumbnail"
            @click="handleSetThumbnailFromFile"
          >
            <Upload :size="14" />
            파일에서 선택
          </Button>
          <Button
            size="sm"
            variant="destructive"
            :disabled="isSettingThumbnail"
            @click="handleHideThumbnail"
          >
            <Trash2 :size="14" />
          </Button>
        </div>
        <p class="text-muted-foreground text-center text-xs">
          또는 이미지를 드래그하여 업로드
        </p>
      </div>

      <!-- 드래그 오버레이 (전체 영역 덮음) -->
      <div
        v-if="isDragOver"
        class="border-primary bg-primary/30 absolute inset-0 flex items-center justify-center rounded-lg border-2"
      >
        <span class="text-primary-foreground text-sm font-medium">
          여기에 이미지를 놓으세요
        </span>
      </div>
    </div>

    <!-- 토글 버튼들 -->
    <div class="mt-4 flex flex-col gap-2">
      <Button
        variant="outline"
        class="justify-start"
        :class="{ 'bg-primary/10': game?.isFavorite }"
        @click="handleToggleFavorite"
      >
        <Star v-if="game?.isFavorite" :size="16" class="fill-current" />
        <StarOff v-else :size="16" />
        즐겨찾기 {{ game?.isFavorite ? "설정됨" : "해제됨" }}
      </Button>
      <Button
        variant="outline"
        class="justify-start"
        :class="{ 'bg-primary/10': game?.isClear }"
        @click="handleToggleClear"
      >
        <Flag v-if="game?.isClear" :size="16" class="fill-current" />
        <FlagOff v-else :size="16" />
        클리어 {{ game?.isClear ? "설정됨" : "해제됨" }}
      </Button>
      <Button
        variant="outline"
        class="justify-start"
        :class="{ 'bg-destructive/10': game?.isHidden }"
        @click="handleToggleHidden"
      >
        <Eye v-if="!game?.isHidden" :size="16" />
        <EyeOff v-else :size="16" />
        {{ game?.isHidden ? "숨김 해제" : "숨김" }}
      </Button>
      <Button
        v-if="game?.provider && game?.externalId"
        variant="outline"
        class="w-full justify-start"
        @click="handleOpenOriginalSite"
      >
        <Globe :size="16" />
        원본 사이트
      </Button>
    </div>
  </div>
</template>
