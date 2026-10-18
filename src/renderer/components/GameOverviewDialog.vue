<script setup lang="ts">
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FolderOpen,
  Image as ImageIcon,
  ImageOff,
  Link2,
  Loader2,
  Plus,
  Star,
  Trash2,
  Upload,
} from "lucide-vue-next";
import { useElementSize } from "@vueuse/core";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { useSelectFile } from "../composables/useAllInOneRefresh";
import { useDetectRpgMaker } from "../composables/useCheat";
import { useGameDetail, useToggleFavorite } from "../composables/useGameDetail";
import {
  useAddGameImageFromUrl,
  useAddGameImagesFromFiles,
  useDeleteGameImage,
  useGameImages,
  useSetThumbnailFromImage,
} from "../composables/useGameImages";
import { formatPlayTime, usePlayTime } from "../composables/usePlayTime";
import { useTranslationSettings } from "../composables/useTranslationSettings";
import type { GameDetailItem } from "../types";
import CheatPlayButton from "./CheatPlayButton.vue";
import StarRating from "./StarRating.vue";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";

const props = defineProps<{
  open: boolean;
  gamePath: string;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
  (e: "play", game: GameDetailItem): void;
  (e: "play-cheat", game: GameDetailItem): void;
  (e: "open-folder", game: GameDetailItem): void;
}>();

const gamePathRef = computed(() => props.gamePath);

// 데이터 조회 (모두 기존 컴포저블 재사용)
const { data: game, isLoading } = useGameDetail(gamePathRef);
const { data: gameImages } = useGameImages(gamePathRef);
const { data: playTimeData } = usePlayTime(gamePathRef);
const rpgMakerDetection = useDetectRpgMaker(gamePathRef);
const isRpgMaker = computed(
  () => rpgMakerDetection.data.value?.isRpgMaker ?? false,
);
// 제목 표시 우선순위 설정 (GameCard와 동일 설정 사용)
const { data: translationSettings } = useTranslationSettings();

// 즐겨찾기 토글 (gameDetail 캐시까지 무효화하는 mutation 사용)
const toggleFavoriteMutation = useToggleFavorite();

// 캐러셀 상태
const currentIndex = ref(0);

// 캐러셀 이미지 목록: 추가 이미지가 없으면 썸네일로 폴백
const carouselImages = computed<string[]>(() => {
  const images = (gameImages.value ?? []).map((image) => image.path);
  if (images.length > 0) return images;
  if (game.value?.thumbnail) return [game.value.thumbnail];
  return [];
});

const currentImage = computed(() => carouselImages.value[currentIndex.value]);

// 다이얼로그가 열릴 때 캐러셀 인덱스 초기화
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      currentIndex.value = 0;
      closeImageMenus();
    }
  },
);

// 이미지 목록 변경(삭제 등)으로 인덱스가 범위를 벗어나면 마지막 이미지로 보정
watch(carouselImages, (images) => {
  if (currentIndex.value >= images.length) {
    currentIndex.value = Math.max(images.length - 1, 0);
  }
});

// 다른 이미지로 넘어가면 삭제 확인은 취소
watch(currentIndex, () => {
  confirmingDelete.value = false;
});

// ========== 이미지 관리 ==========

const addImageFromUrl = useAddGameImageFromUrl();
const addImagesFromFiles = useAddGameImagesFromFiles();
const deleteImage = useDeleteGameImage();
const setThumbnail = useSetThumbnailFromImage();
const selectFile = useSelectFile();

const showAddMenu = ref(false);
const confirmingDelete = ref(false);
const urlInput = ref("");
const isDragOver = ref(false);

const isMutating = computed(
  () =>
    addImageFromUrl.isPending.value ||
    addImagesFromFiles.isPending.value ||
    deleteImage.isPending.value ||
    setThumbnail.isPending.value,
);

// 실제로 그려진 이미지 크기 (object-contain 기준)
// 이미지 비율이 영역과 다르면 위아래나 좌우가 비므로, 배지·툴바를 이미지 모서리에 맞추는 데 쓴다
const imageAreaRef = ref<HTMLElement>();
const { width: areaWidth, height: areaHeight } = useElementSize(imageAreaRef);
const naturalSize = ref<{ width: number; height: number } | null>(null);

function handleImageLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  naturalSize.value = { width: img.naturalWidth, height: img.naturalHeight };
}

const imageFrameStyle = computed(() => {
  const size = naturalSize.value;
  if (!currentImage.value || !size || !size.width || !size.height) {
    return { inset: "0" };
  }
  const scale = Math.min(
    areaWidth.value / size.width,
    areaHeight.value / size.height,
  );
  return {
    width: `${size.width * scale}px`,
    height: `${size.height * scale}px`,
  };
});

// 썸네일 위치 (이미지 목록과 썸네일 모두 메인에서 절대 경로로 변환된 값)
const thumbnailIndex = computed(() => {
  const thumbnail = game.value?.thumbnail;
  return thumbnail ? carouselImages.value.indexOf(thumbnail) : -1;
});
const isCurrentThumbnail = computed(
  () =>
    thumbnailIndex.value >= 0 && thumbnailIndex.value === currentIndex.value,
);

function closeImageMenus() {
  showAddMenu.value = false;
  confirmingDelete.value = false;
  urlInput.value = "";
}

// 이미지 영역 클릭: 열린 메뉴가 있으면 메뉴만 닫고, 없으면 다이얼로그 닫기
function handleImageAreaClick() {
  if (showAddMenu.value || confirmingDelete.value) {
    closeImageMenus();
    return;
  }
  emit("update:open", false);
}

// ESC: 열린 메뉴가 있으면 메뉴만 닫기
function handleEscapeKeyDown(e: KeyboardEvent) {
  if (showAddMenu.value || confirmingDelete.value) {
    e.preventDefault();
    closeImageMenus();
  }
}

function moveToImage(path: string | undefined) {
  if (!path) return;
  const index = carouselImages.value.indexOf(path);
  if (index >= 0) currentIndex.value = index;
}

// 추가한 이미지는 보고 있던 이미지 바로 뒤에 들어가고, 첫 이미지로 이동
async function handleAddFromUrl() {
  const url = urlInput.value.trim();
  if (!url) return;
  try {
    const result = await addImageFromUrl.mutateAsync({
      gamePath: props.gamePath,
      url,
      afterPath: currentImage.value ?? null,
    });
    closeImageMenus();
    moveToImage(result.paths[0]);
    toast.success("이미지를 추가했습니다.");
  } catch {
    toast.error("이미지를 추가하지 못했습니다.");
  }
}

/**
 * @param skipped 드롭 단계에서 이미지가 아니라 걸러낸 파일 수
 */
async function addFiles(filePaths: string[], skipped = 0) {
  try {
    const result = await addImagesFromFiles.mutateAsync({
      gamePath: props.gamePath,
      filePaths,
      afterPath: currentImage.value ?? null,
    });
    closeImageMenus();
    moveToImage(result.paths[0]);
    const failed = result.failed + skipped;
    if (failed > 0) {
      toast.warning(`이미지 ${result.paths.length}장을 추가했습니다.`, {
        description: `${failed}장은 추가하지 못했습니다.`,
      });
    } else {
      toast.success(`이미지 ${result.paths.length}장을 추가했습니다.`);
    }
  } catch {
    toast.error("이미지를 추가하지 못했습니다.");
  }
}

async function handleSelectFiles() {
  const filePaths = await selectFile.mutateAsync(true);
  if (!filePaths || filePaths.length === 0) return;
  await addFiles(filePaths);
}

function handleDragEnter(e: DragEvent) {
  if (e.dataTransfer?.types.includes("Files")) {
    isDragOver.value = true;
  }
}

async function handleDrop(e: DragEvent) {
  isDragOver.value = false;
  const dropped = Array.from(e.dataTransfer?.files ?? []);
  const files = dropped.filter((file) => file.type.startsWith("image/"));
  if (files.length === 0) {
    toast.error("이미지 파일만 추가할 수 있습니다.");
    return;
  }
  await addFiles(
    files.map((file) => window.api.getPathForFile(file)),
    dropped.length - files.length,
  );
}

async function handleSetThumbnail() {
  if (!currentImage.value) return;
  try {
    await setThumbnail.mutateAsync({
      gamePath: props.gamePath,
      imagePath: currentImage.value,
    });
    toast.success("썸네일로 지정했습니다.");
  } catch {
    toast.error("썸네일로 지정하지 못했습니다.");
  }
}

async function handleDeleteImage() {
  if (!currentImage.value) return;
  try {
    await deleteImage.mutateAsync({
      gamePath: props.gamePath,
      imagePath: currentImage.value,
    });
    confirmingDelete.value = false;
    toast.success("이미지를 삭제했습니다.");
  } catch {
    toast.error("이미지를 삭제하지 못했습니다.");
  }
}

function toFileUrl(path: string): string {
  return `file:///${path.replaceAll("\\", "/")}`;
}

function nextImage() {
  if (currentIndex.value < carouselImages.value.length - 1) {
    currentIndex.value++;
  }
}

function prevImage() {
  if (currentIndex.value > 0) {
    currentIndex.value--;
  }
}

// 키보드 네비게이션
function handleKeydown(e: KeyboardEvent) {
  if (!props.open) return;
  // URL 입력 중 커서 이동은 캐러셀로 넘기지 않음
  if (e.target instanceof HTMLInputElement) return;
  if (e.key === "ArrowLeft") prevImage();
  if (e.key === "ArrowRight") nextImage();
}

// 휠 네비게이션
function handleWheel(e: WheelEvent) {
  if (e.deltaY > 0) nextImage();
  else prevImage();
}

// 표시할 메인 제목 (설정 titleDisplayPriority 우선순위 존중 — GameCard와 동일 로직)
const displayTitle = computed(() => {
  const g = game.value;
  if (!g) return "";
  const priority = translationSettings.value?.titleDisplayPriority ?? [
    "translated",
    "collected",
    "original",
  ];
  for (const mode of priority) {
    if (mode === "translated" && g.translatedTitle) return g.translatedTitle;
    if (mode === "collected" && g.title) return g.title;
    if (mode === "original" && g.originalTitle) return g.originalTitle;
  }
  return g.originalTitle ?? g.title;
});

// 서브 제목 (메인이 번역명이 아닐 때만 번역명 표시 — 중복 방지)
const subTitle = computed(() => {
  const g = game.value;
  if (!g?.translatedTitle) return null;
  if (displayTitle.value === g.translatedTitle) return null;
  return g.translatedTitle;
});

// 원본 사이트 URL (provider + externalId 기반 — collectors의 getUrl과 동일 매핑)
const siteUrl = computed(() => {
  const g = game.value;
  if (!g?.provider || !g?.externalId) return null;
  const id = g.externalId;
  switch (g.provider.toLowerCase()) {
    case "dlsite":
      return `https://www.dlsite.com/maniax/work/=/product_id/${id}.html`;
    case "steam":
      return `https://store.steampowered.com/app/${id}/`;
    case "getchu":
      return `https://www.getchu.com/item/${id}/`;
    case "vndb":
      return `https://vndb.org/v${id}`;
    default:
      return null;
  }
});

// 원본 사이트를 외부 브라우저로 열기
function openSite() {
  if (siteUrl.value) window.open(siteUrl.value, "_blank");
}

// 출시일 표시 텍스트
const publishDateText = computed(() => {
  const date = game.value?.publishDate;
  if (!date) return null;
  return new Date(date).toLocaleDateString("ko-KR");
});

// 총 플레이 시간 표시 텍스트
const playTimeText = computed(() => {
  const seconds = playTimeData.value?.totalPlayTime ?? 0;
  if (seconds <= 0) return null;
  return formatPlayTime(seconds);
});

// 최근 플레이 시각 표시 텍스트
const lastPlayedText = computed(() => {
  const date = game.value?.lastPlayedAt;
  if (!date) return null;
  return new Date(date).toLocaleDateString("ko-KR");
});

// 실행 후 다이얼로그 닫기 (GameDetailDialog와 동일한 UX)
function handlePlay() {
  if (!game.value) return;
  emit("play", game.value);
  emit("update:open", false);
}

function handlePlayCheat() {
  if (!game.value) return;
  emit("play-cheat", game.value);
  emit("update:open", false);
}

function handleOpenFolder() {
  if (!game.value) return;
  emit("open-folder", game.value);
}

async function handleToggleFavorite() {
  if (!game.value) return;
  const wasFavorite = game.value.isFavorite;
  try {
    await toggleFavoriteMutation.mutateAsync(game.value.path);
    toast.success(
      wasFavorite ? "즐겨찾기에서 제거했습니다." : "즐겨찾기에 추가했습니다.",
    );
  } catch {
    toast.error("즐겨찾기 토글에 실패했습니다.");
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <!-- 카드 박스(배경/테두리/그림자/라운드) 제거: dim 오버레이 위에 콘텐츠만 노출.
         닫기 버튼은 숨김 — 이미지 클릭 / ESC / 외부 dim 클릭으로 닫기 -->
    <DialogContent
      :show-close-button="false"
      class="flex h-[85vh] max-h-[90vh] !max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-transparent p-0 px-4 shadow-none sm:px-6"
      @keydown="handleKeydown"
      @escape-key-down="handleEscapeKeyDown"
    >
      <!-- 로딩 -->
      <div v-if="isLoading" class="flex flex-1 items-center justify-center">
        <Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
      </div>

      <div v-else class="flex min-h-0 flex-1 flex-col gap-6 md:flex-row">
        <!-- 좌측: 이미지 캐러셀 -->
        <!-- 이미지 영역은 카드 배경 없이 dim 위에 바로 노출 (lightbox 느낌) -->
        <!-- 이미지 영역 전체 클릭 시 다이얼로그 닫기 (이미지 유무 무관) -->
        <!-- 이미지 파일을 끌어다 놓으면 보고 있는 이미지 뒤에 추가 -->
        <div
          ref="imageAreaRef"
          class="group relative flex min-h-0 flex-1 cursor-pointer items-center justify-center md:basis-2/3"
          @wheel.prevent="handleWheel"
          @click="handleImageAreaClick"
          @dragenter.prevent="handleDragEnter"
          @dragover.prevent
          @drop.prevent="handleDrop"
        >
          <img
            v-if="currentImage"
            :src="toFileUrl(currentImage)"
            class="h-full w-full object-contain"
            @load="handleImageLoad"
          />

          <!-- 이미지 없음 -->
          <div v-else class="flex flex-col items-center gap-2 text-white/60">
            <ImageOff class="size-8" />
            표시할 이미지가 없습니다
            <Button
              size="sm"
              class="mt-1 border border-white/15 bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
              @click.stop="showAddMenu = !showAddMenu"
            >
              <Plus :size="16" />
              이미지 추가
            </Button>
          </div>

          <!-- 실제로 그려진 이미지 크기의 틀: 배지·툴바를 이미지 모서리에 붙인다 -->
          <div
            class="pointer-events-none absolute *:pointer-events-auto"
            :style="imageFrameStyle"
          >
            <!-- 썸네일 배지 -->
            <div
              v-if="isCurrentThumbnail"
              class="absolute top-3 left-3 inline-flex items-center gap-1 rounded-md bg-sky-500/90 px-2 py-1 text-xs font-semibold text-white shadow"
            >
              <ImageIcon :size="14" />
              썸네일
            </div>

            <!-- 이미지 관리 툴바 (호버 시 표시) -->
            <div
              v-if="currentImage && !confirmingDelete"
              class="absolute top-3 right-3 flex items-center gap-2 transition-opacity"
              :class="
                showAddMenu || isMutating
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              "
              @click.stop
            >
              <Button
                size="sm"
                class="border border-white/15 bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
                @click="showAddMenu = !showAddMenu"
              >
                <Plus :size="16" />
                추가
              </Button>
              <Button
                v-if="!isCurrentThumbnail"
                size="sm"
                class="border border-white/15 bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
                :disabled="isMutating"
                @click="handleSetThumbnail"
              >
                <ImageIcon :size="16" />
                썸네일로 지정
              </Button>
              <Button
                size="sm"
                class="hover:bg-destructive border border-white/15 bg-black/50 text-white backdrop-blur-sm"
                :disabled="isMutating"
                @click="
                  showAddMenu = false;
                  confirmingDelete = true;
                "
              >
                <Trash2 :size="16" />
                삭제
              </Button>
            </div>

            <!-- 삭제 확인 (툴바 자리) -->
            <div
              v-if="confirmingDelete"
              class="bg-popover text-popover-foreground absolute top-3 right-3 flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm shadow-lg"
              @click.stop
            >
              이 이미지를 삭제할까요?
              <Button
                size="sm"
                variant="destructive"
                :disabled="isMutating"
                @click="handleDeleteImage"
              >
                <Loader2
                  v-if="deleteImage.isPending.value"
                  class="animate-spin"
                />
                삭제
              </Button>
              <Button
                size="sm"
                variant="ghost"
                @click="confirmingDelete = false"
              >
                취소
              </Button>
            </div>

            <!-- 이미지 추가 메뉴 -->
            <div
              v-if="showAddMenu"
              class="bg-popover text-popover-foreground absolute flex w-80 cursor-default flex-col gap-2 rounded-lg border p-3 shadow-xl"
              :class="
                currentImage
                  ? 'top-14 right-3'
                  : 'top-1/2 left-1/2 mt-16 -translate-x-1/2'
              "
              @click.stop
              @wheel.stop
            >
              <span class="text-sm font-medium">이미지 추가</span>
              <form class="flex gap-2" @submit.prevent="handleAddFromUrl">
                <Input
                  v-model="urlInput"
                  placeholder="이미지 URL 입력"
                  :disabled="isMutating"
                />
                <Button
                  type="submit"
                  size="icon"
                  :disabled="isMutating || !urlInput.trim()"
                  title="URL로 추가"
                >
                  <Loader2
                    v-if="addImageFromUrl.isPending.value"
                    class="animate-spin"
                  />
                  <Link2 v-else />
                </Button>
              </form>
              <Button
                variant="secondary"
                size="sm"
                :disabled="isMutating"
                @click="handleSelectFiles"
              >
                <Loader2
                  v-if="addImagesFromFiles.isPending.value"
                  class="animate-spin"
                />
                <Upload v-else />
                파일에서 선택 (여러 장 가능)
              </Button>
              <p class="text-muted-foreground text-center text-xs">
                또는 이미지 영역에 파일을 끌어다 놓기
              </p>
            </div>
          </div>

          <!-- 드래그 오버레이 (자식 요소에서 dragleave가 튀지 않도록 내용은 pointer-events 차단) -->
          <div
            v-if="isDragOver"
            class="absolute inset-0 flex items-center justify-center rounded-lg border-2 border-dashed border-sky-400 bg-sky-500/20"
            @dragleave.prevent="isDragOver = false"
          >
            <span class="pointer-events-none font-medium text-white">
              여기에 놓으면 이미지로 추가됩니다
            </span>
          </div>

          <!-- 이전/다음 버튼 (2장 이상일 때만) -->
          <Button
            v-if="currentIndex > 0"
            @click.stop="prevImage"
            class="bg-primary/30 hover:bg-primary-foreground/20 absolute left-2 aspect-square size-10 backdrop-blur-xs"
          >
            <ChevronLeft class="size-6" />
          </Button>
          <Button
            v-if="currentIndex < carouselImages.length - 1"
            @click.stop="nextImage"
            class="bg-primary/30 hover:bg-primary-foreground/20 absolute right-2 aspect-square size-10 backdrop-blur-xs"
          >
            <ChevronRight class="size-6" />
          </Button>

          <!-- 인디케이터 -->
          <div
            v-if="carouselImages.length > 1"
            class="absolute bottom-3 flex gap-2"
          >
            <!-- 썸네일 위치는 하늘색 테두리로 표시 -->
            <span
              v-for="(_, i) in carouselImages"
              :key="i"
              :class="[
                'h-2 w-2 rounded-full transition-colors',
                i === currentIndex ? 'bg-white' : 'bg-white/50',
                i === thumbnailIndex &&
                  'ring-2 ring-sky-400 ring-offset-1 ring-offset-black',
              ]"
            />
          </div>
        </div>

        <!-- 글래스 블러 패널: dim 위에서 가독성을 위해 항상 어두운 반투명 배경 + 흰색 텍스트 (테마 무관 고정 컨텍스트) -->
        <div
          class="@container flex min-h-0 flex-col gap-4 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl md:basis-1/3"
        >
          <!-- 제목 / 서클 -->
          <div class="flex flex-col gap-1 text-white">
            <DialogTitle class="text-xl leading-tight font-bold">
              {{ displayTitle }}
            </DialogTitle>
            <p v-if="subTitle" class="text-sm text-white/60">
              {{ subTitle }}
            </p>
            <p
              v-if="game?.makers?.length"
              class="text-sm font-medium text-white/80"
            >
              {{ game.makers.join(", ") }}
            </p>
          </div>

          <div class="h-px shrink-0 bg-white/10" />

          <!-- 메타데이터 (값 없는 항목은 행 숨김) -->
          <div class="flex flex-col gap-3 text-sm text-white">
            <div v-if="publishDateText" class="flex gap-3">
              <span class="w-16 shrink-0 text-white/50">출시일</span>
              <span>{{ publishDateText }}</span>
            </div>

            <div v-if="game?.categories?.length" class="flex gap-3">
              <span class="w-16 shrink-0 text-white/50">장르</span>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="category in game.categories"
                  :key="category"
                  class="rounded bg-white/10 px-1.5 py-0.5 text-white/70"
                >
                  {{ category }}
                </span>
              </div>
            </div>

            <div v-if="game?.tags?.length" class="flex gap-3">
              <span class="w-16 shrink-0 text-white/50">태그</span>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="tag in game.tags"
                  :key="tag"
                  class="rounded bg-white/10 px-1.5 py-0.5 text-white/70"
                >
                  {{ tag }}
                </span>
              </div>
            </div>

            <div v-if="game?.rating" class="flex items-center gap-3">
              <span class="w-16 shrink-0 text-white/50">내 별점</span>
              <StarRating :model-value="game.rating" readonly size="sm" />
            </div>

            <div
              v-if="game?.externalRating != null"
              class="flex items-center gap-3"
            >
              <span class="w-16 shrink-0 text-white/50">평점</span>
              <span class="flex items-center gap-1">
                <Star class="size-4 fill-sky-400 text-sky-400" />
                <span>{{ game.externalRating.toFixed(2) }}</span>
                <span
                  v-if="game.externalReviewCount != null"
                  class="text-white/50"
                >
                  · 리뷰 {{ game.externalReviewCount.toLocaleString() }}건
                </span>
                <span v-if="game.downloadCount != null" class="text-white/50">
                  · 다운로드 {{ game.downloadCount.toLocaleString() }}건
                </span>
              </span>
            </div>

            <div v-if="playTimeText || lastPlayedText" class="flex gap-3">
              <span class="w-16 shrink-0 text-white/50">플레이</span>
              <div class="flex flex-col">
                <span v-if="playTimeText">{{ playTimeText }}</span>
                <span v-if="lastPlayedText" class="text-xs text-white/50">
                  최근 {{ lastPlayedText }}
                </span>
              </div>
            </div>
          </div>

          <!-- 메모 (값 있을 때만 표시) -->
          <div v-if="game?.memo" class="flex flex-col gap-1">
            <span class="text-sm text-white/50">메모</span>
            <p class="text-sm whitespace-pre-wrap text-white/90">
              {{ game.memo }}
            </p>
          </div>

          <!-- 액션 버튼 -->
          <div class="mt-auto flex shrink-0 flex-col gap-2 pt-4">
            <CheatPlayButton
              :game-path="gamePath"
              :is-rpg-maker="isRpgMaker"
              :has-executable="game?.hasExecutable"
              @play="handlePlay"
              @play-cheat="handlePlayCheat"
            />
            <div class="flex flex-col gap-2 @sm:flex-row">
              <Button
                variant="secondary"
                class="@sm:flex-1"
                @click="handleOpenFolder"
              >
                <FolderOpen :size="16" />
                폴더 열기
              </Button>
              <Button
                v-if="siteUrl"
                variant="secondary"
                class="@sm:flex-1"
                title="원본 사이트 열기"
                @click="openSite"
              >
                <ExternalLink :size="16" />
                사이트 열기
              </Button>
              <Button
                variant="secondary"
                size="icon"
                :disabled="toggleFavoriteMutation.isPending.value"
                :title="
                  game?.isFavorite ? '즐겨찾기에서 제거' : '즐겨찾기에 추가'
                "
                @click="handleToggleFavorite"
              >
                <Star
                  :size="16"
                  :class="
                    game?.isFavorite ? 'fill-yellow-400 text-yellow-400' : ''
                  "
                />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
