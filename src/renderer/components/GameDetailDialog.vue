<script setup lang="ts">
import {
  Check,
  Clock,
  Edit2,
  Eye,
  EyeOff,
  File,
  Flag,
  FlagOff,
  Folder,
  FolderOpen,
  Globe,
  Image as ImageIcon,
  Languages,
  Link2,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Star,
  StarOff,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { useSelectFile } from "../composables/useAllInOneRefresh";
import { useRunCollector } from "../composables/useCollector";
import { useAddExcludedExecutable } from "../composables/useExcludedExecutables";
import {
  useAddCategory,
  useAddMaker,
  useAddTag,
  useGameDetail,
  useHideThumbnail,
  useOpenFolderMutation,
  useOpenOriginalSite,
  useRemoveCategory,
  useRemoveMaker,
  useRemoveTag,
  useSelectExecutableFile,
  useSetExecutablePath,
  useSetThumbnailFromFile,
  useSetThumbnailFromUrl,
  useToggleClear,
  useToggleFavorite,
  useToggleHidden,
  useUpdateMetadata,
  useUpdateRating,
} from "../composables/useGameDetail";
import { usePlayGame } from "../composables/useGames";
import {
  formatPlayTime,
  usePlayTime,
  usePlayTimeListener,
} from "../composables/usePlayTime";
import { useTranslateTitleMutation } from "../composables/useTranslation";
import StarRating from "./StarRating.vue";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";

interface Props {
  open?: boolean;
  gamePath?: string | null;
}

interface Emits {
  (e: "update:open", value: boolean): void;
  (e: "updated"): void;
}

const props = withDefaults(defineProps<Props>(), {
  open: false,
  gamePath: null,
});

const emit = defineEmits<Emits>();

// 썸네일 관리 상태
const showThumbnailMenu = ref(false);
const thumbnailUrlInput = ref("");
const isSettingThumbnail = ref(false);
const isDragOver = ref(false);

// 컬렉터 실행 상태
const isRunningCollector = ref(false);

// 편집 모드 상태
const isEditingOriginalTitle = ref(false);
const isEditingTitle = ref(false);
const isEditingTranslatedTitle = ref(false);
const isEditingPublishDate = ref(false);
const isEditingMemo = ref(false);
const editedOriginalTitle = ref("");
const editedTitle = ref("");
const editedTranslatedTitle = ref("");
const editedPublishDate = ref("");
const editedMemo = ref("");

// 관계 데이터 추가 상태
const newMaker = ref("");
const newCategory = ref("");
const newTag = ref("");

// 별점 관련
const updateRating = useUpdateRating();

// 게임 경로를 ref로 변환
const gamePathRef = computed(() => props.gamePath || "");

// 쿼리
const { data: gameDetail, isLoading } = useGameDetail(gamePathRef);
const { data: playTimeData } = usePlayTime(gamePathRef);
const updateMetadata = useUpdateMetadata();
const addMaker = useAddMaker();
const removeMaker = useRemoveMaker();
const addCategory = useAddCategory();
const removeCategory = useRemoveCategory();
const addTag = useAddTag();
const removeTag = useRemoveTag();
const setThumbnailFromUrl = useSetThumbnailFromUrl();
const setThumbnailFromFile = useSetThumbnailFromFile();
const hideThumbnail = useHideThumbnail();
const toggleFavorite = useToggleFavorite();
const toggleHidden = useToggleHidden();
const toggleClear = useToggleClear();
const setExecutablePath = useSetExecutablePath();
const addExcludedExecutable = useAddExcludedExecutable();
const runCollectorMutation = useRunCollector();
const playGameMutation = usePlayGame();
const openFolderMutation = useOpenFolderMutation();
const selectExecutableFileMutation = useSelectExecutableFile();
const translateTitle = useTranslateTitleMutation();
const openOriginalSite = useOpenOriginalSite();
const selectFileMutation = useSelectFile();

// 번역 진행 상태
const isTranslating = computed(() => translateTitle.isPending.value);

// 플레이 타임 이벤트 리스너
usePlayTimeListener(gamePathRef);

// 포맷팅된 플레이 타임
const formattedPlayTime = computed(() => {
  if (!playTimeData.value?.totalPlayTime) return null;
  return formatPlayTime(playTimeData.value.totalPlayTime);
});

// 게임 데이터
const game = computed(() => gameDetail.value);

// 썸네일 URL (updatedAt으로 캐시 무효화)
const thumbnailUrl = computed(() => {
  if (!game.value?.thumbnail) return undefined;
  const cacheKey = game.value.updatedAt?.getTime() ?? 0;
  return `file:///${game.value.thumbnail.replace(/\\/g, "/")}?v=${cacheKey}`;
});

// 발매일 포맷팅
const formattedPublishDate = computed(() => {
  if (!game.value?.publishDate) return null;
  const date = new Date(game.value.publishDate);
  return date.toISOString().split("T")[0]; // YYYY-MM-DD 형식
});

// 다이얼로그 열릴 때 초기화
watch(
  () => props.open,
  (open) => {
    if (open && props.gamePath) {
      resetEditStates();
    }
  },
);

// 게임 데이터 변경 시 편집 상태 초기화
watch(
  game,
  (newGame) => {
    if (newGame) {
      resetEditStates();
    }
  },
  { immediate: true },
);

function resetEditStates() {
  isEditingOriginalTitle.value = false;
  isEditingTitle.value = false;
  isEditingTranslatedTitle.value = false;
  isEditingPublishDate.value = false;
  isEditingMemo.value = false;
  editedOriginalTitle.value = game.value?.originalTitle || "";
  editedTitle.value = game.value?.title || "";
  editedTranslatedTitle.value = game.value?.translatedTitle || "";
  editedPublishDate.value = formattedPublishDate.value || "";
  editedMemo.value = game.value?.memo || "";
  thumbnailUrlInput.value = "";
  showThumbnailMenu.value = false;
  newMaker.value = "";
  newCategory.value = "";
  newTag.value = "";
}

// 다이얼로그 닫기
function closeDialog() {
  emit("update:open", false);
}

// 게임 실행
async function handlePlay() {
  if (!props.gamePath) return;

  try {
    const executablePath = await playGameMutation.mutateAsync(props.gamePath);

    // 실행 파일명만 추출
    const fileName = executablePath.split(/[/\\]/).pop() || executablePath;

    toast.success(`게임을 실행했습니다.`, {
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

    // 다이얼로그 닫기
    closeDialog();
  } catch (err) {
    console.error("게임 실행 실패:", err);
    toast.error(
      err instanceof Error ? err.message : "게임 실행에 실패했습니다.",
    );
  }
}

// 폴더 열기
async function handleOpenFolder() {
  if (!props.gamePath) return;
  await openFolderMutation.mutateAsync(props.gamePath);
}

// 컬렉터 재실행
async function handleRunCollector() {
  if (!props.gamePath) return;

  isRunningCollector.value = true;
  try {
    await runCollectorMutation.mutateAsync({
      gamePath: props.gamePath,
      force: true,
    });
    toast.success("정보를 다시 수집했습니다.");
    emit("updated");
  } catch {
    toast.error("정보 수집에 실패했습니다.");
  } finally {
    isRunningCollector.value = false;
  }
}

// 즐겨찾기 토글
async function handleToggleFavorite() {
  if (!props.gamePath) return;
  try {
    const result = (await toggleFavorite.mutateAsync(props.gamePath)) as {
      value: boolean;
    };
    // onSuccess에서 invalidateQueries가 이미 refetch를 트리거하므로 별도 refetch 불필요
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
    // onSuccess에서 invalidateQueries가 이미 refetch를 트리거하므로 별도 refetch 불필요
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
    // onSuccess에서 invalidateQueries가 이미 refetch를 트리거하므로 별도 refetch 불필요
    toast.success(
      result.value
        ? "클리어 표시를 추가했습니다."
        : "클리어 표시를 제거했습니다.",
    );
  } catch {
    toast.error("클리어 설정에 실패했습니다.");
  }
}

// 원본 제목 저장
async function saveOriginalTitle() {
  if (!props.gamePath || !editedOriginalTitle.value.trim()) return;

  try {
    await updateMetadata.mutateAsync({
      path: props.gamePath,
      metadata: { originalTitle: editedOriginalTitle.value.trim() },
    });
    isEditingOriginalTitle.value = false;
    toast.success("원본 제목이 수정되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("원본 제목 수정에 실패했습니다.");
  }
}

// 원문 제목 저장
async function saveTitle() {
  if (!props.gamePath || !editedTitle.value.trim()) return;

  try {
    await updateMetadata.mutateAsync({
      path: props.gamePath,
      metadata: { title: editedTitle.value.trim() },
    });
    isEditingTitle.value = false;
    toast.success("원문 제목이 수정되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("원문 제목 수정에 실패했습니다.");
  }
}

// 번역 제목 저장
async function saveTranslatedTitle() {
  if (!props.gamePath) return;

  try {
    await updateMetadata.mutateAsync({
      path: props.gamePath,
      metadata: { translatedTitle: editedTranslatedTitle.value.trim() || null },
    });
    isEditingTranslatedTitle.value = false;
    toast.success("번역 제목이 수정되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("번역 제목 수정에 실패했습니다.");
  }
}

// 발매일 저장
async function savePublishDate() {
  if (!props.gamePath) return;

  try {
    const date = editedPublishDate.value
      ? new Date(editedPublishDate.value)
      : null;
    await updateMetadata.mutateAsync({
      path: props.gamePath,
      metadata: { publishDate: date },
    });
    isEditingPublishDate.value = false;
    toast.success("발매일이 수정되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("발매일 수정에 실패했습니다.");
  }
}

// 메모 저장
async function saveMemo() {
  if (!props.gamePath) return;

  try {
    await updateMetadata.mutateAsync({
      path: props.gamePath,
      metadata: { memo: editedMemo.value.trim() || null },
    });
    isEditingMemo.value = false;
    toast.success("메모가 저장되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("메모 저장에 실패했습니다.");
  }
}

// 편집 취소
function cancelEdit(
  field: "originalTitle" | "title" | "translatedTitle" | "publishDate" | "memo",
) {
  if (field === "originalTitle") {
    isEditingOriginalTitle.value = false;
    editedOriginalTitle.value = game.value?.originalTitle || "";
  } else if (field === "title") {
    isEditingTitle.value = false;
    editedTitle.value = game.value?.title || "";
  } else if (field === "translatedTitle") {
    isEditingTranslatedTitle.value = false;
    editedTranslatedTitle.value = game.value?.translatedTitle || "";
  } else if (field === "publishDate") {
    isEditingPublishDate.value = false;
    editedPublishDate.value = formattedPublishDate.value || "";
  } else if (field === "memo") {
    isEditingMemo.value = false;
    editedMemo.value = game.value?.memo || "";
  }
}

// 제작사 추가
async function handleAddMaker() {
  if (!props.gamePath || !newMaker.value.trim()) return;

  try {
    await addMaker.mutateAsync({
      path: props.gamePath,
      name: newMaker.value.trim(),
    });
    newMaker.value = "";
    toast.success("제작사가 추가되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("제작사 추가에 실패했습니다.");
  }
}

// 제작사 제거
async function handleRemoveMaker(name: string) {
  if (!props.gamePath) return;

  try {
    await removeMaker.mutateAsync({
      path: props.gamePath,
      name,
    });
    toast.success("제작사가 제거되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("제작사 제거에 실패했습니다.");
  }
}

// 카테고리 추가
async function handleAddCategory() {
  if (!props.gamePath || !newCategory.value.trim()) return;

  try {
    await addCategory.mutateAsync({
      path: props.gamePath,
      name: newCategory.value.trim(),
    });
    newCategory.value = "";
    toast.success("카테고리가 추가되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("카테고리 추가에 실패했습니다.");
  }
}

// 카테고리 제거
async function handleRemoveCategory(name: string) {
  if (!props.gamePath) return;

  try {
    await removeCategory.mutateAsync({
      path: props.gamePath,
      name,
    });
    toast.success("카테고리가 제거되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("카테고리 제거에 실패했습니다.");
  }
}

// 태그 추가
async function handleAddTag() {
  if (!props.gamePath || !newTag.value.trim()) return;

  try {
    await addTag.mutateAsync({
      path: props.gamePath,
      name: newTag.value.trim(),
    });
    newTag.value = "";
    toast.success("태그가 추가되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("태그 추가에 실패했습니다.");
  }
}

// 태그 제거
async function handleRemoveTag(name: string) {
  if (!props.gamePath) return;

  try {
    await removeTag.mutateAsync({
      path: props.gamePath,
      name,
    });
    toast.success("태그가 제거되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("태그 제거에 실패했습니다.");
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

// Enter 키로 태그 추가
function handleTagKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleAddTag();
  }
}

// Enter 키로 제작사 추가
function handleMakerKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleAddMaker();
  }
}

// Enter 키로 카테고리 추가
function handleCategoryKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleAddCategory();
  }
}

// 실행 파일 선택 다이얼로그 열기
async function handleSelectExecutableFile() {
  if (!props.gamePath) return;

  try {
    const filePath = await selectExecutableFileMutation.mutateAsync(
      props.gamePath,
    );
    if (filePath) {
      await setExecutablePath.mutateAsync({
        path: props.gamePath,
        executablePath: filePath,
      });
      toast.success("실행 파일이 설정되었습니다.");
      emit("updated");
    }
  } catch (error) {
    toast.error("실행 파일 선택에 실패했습니다.");
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

// 실행 파일 경로 초기화 (자동 감지로 되돌리기)
async function handleResetExecutablePath() {
  if (!props.gamePath) return;

  try {
    await setExecutablePath.mutateAsync({
      path: props.gamePath,
      executablePath: "",
    });
    toast.success("실행 파일이 자동 감지로 초기화되었습니다.");
    emit("updated");
  } catch (error) {
    toast.error("실행 파일 초기화에 실패했습니다.");
  }
}

// 제목 번역
async function handleTranslateTitle() {
  if (!props.gamePath) return;

  try {
    await translateTitle.mutateAsync({ path: props.gamePath, force: true });
    emit("updated");
  } catch {}
}

// 별점 변경
async function handleRatingChange(rating: number | null) {
  if (!props.gamePath) return;

  try {
    await updateRating.mutateAsync({ path: props.gamePath, rating });
    if (rating !== null) {
      toast.success(`별점을 ${rating}점으로 설정했습니다.`);
    } else {
      toast.success("별점을 제거했습니다.");
    }
    emit("updated");
  } catch {
    toast.error("별점 설정에 실패했습니다.");
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent
      class="flex max-h-[90vh] !max-w-3xl flex-col overflow-hidden"
    >
      <DialogHeader>
        <DialogTitle>게임 상세 정보</DialogTitle>
      </DialogHeader>

      <div v-if="isLoading" class="flex flex-1 items-center justify-center">
        <Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
      </div>

      <div v-else-if="game" class="-mx-6 flex-1 overflow-y-auto px-6">
        <div class="flex flex-col gap-6 md:flex-row">
          <!-- 썸네일 영역 -->
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
                  v-if="game.thumbnail"
                  :src="thumbnailUrl"
                  :alt="game.title"
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
                :class="{ 'bg-primary/10': game.isFavorite }"
                @click="handleToggleFavorite"
              >
                <Star v-if="game.isFavorite" :size="16" class="fill-current" />
                <StarOff v-else :size="16" />
                즐겨찾기 {{ game.isFavorite ? "설정됨" : "해제됨" }}
              </Button>
              <Button
                variant="outline"
                class="justify-start"
                :class="{ 'bg-primary/10': game.isClear }"
                @click="handleToggleClear"
              >
                <Flag v-if="game.isClear" :size="16" class="fill-current" />
                <FlagOff v-else :size="16" />
                클리어 {{ game.isClear ? "설정됨" : "해제됨" }}
              </Button>
              <Button
                variant="outline"
                class="justify-start"
                :class="{ 'bg-destructive/10': game.isHidden }"
                @click="handleToggleHidden"
              >
                <Eye v-if="!game.isHidden" :size="16" />
                <EyeOff v-else :size="16" />
                {{ game.isHidden ? "숨김 해제" : "숨김" }}
              </Button>
              <Button
                v-if="game.provider && game.externalId"
                variant="outline"
                class="w-full justify-start"
                @click="handleOpenOriginalSite"
              >
                <Globe :size="16" />
                원본 사이트
              </Button>
            </div>
          </div>

          <!-- 정보 영역 -->
          <div class="flex-1 space-y-4">
            <!-- 원문 제목 (정보 수집) - 가장 강조 -->
            <div>
              <label class="text-muted-foreground text-sm font-medium"
                >원문 (정보 수집)</label
              >
              <div v-if="isEditingTitle" class="mt-1 flex gap-2">
                <Input v-model="editedTitle" @keydown.enter="saveTitle" />
                <Button size="sm" @click="saveTitle">
                  <Check :size="14" />
                </Button>
                <Button size="sm" variant="ghost" @click="cancelEdit('title')">
                  <XCircle :size="14" />
                </Button>
              </div>
              <div v-else class="mt-1 flex items-center justify-between">
                <p class="text-lg font-semibold">{{ game.title }}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  @click="isEditingTitle = true"
                >
                  <Edit2 :size="16" />
                </Button>
              </div>
            </div>

            <!-- 원본 제목 (폴더명) -->
            <div>
              <label class="text-muted-foreground text-sm font-medium"
                >원본 (폴더명)</label
              >
              <div v-if="isEditingOriginalTitle" class="mt-1 flex gap-2">
                <Input
                  v-model="editedOriginalTitle"
                  @keydown.enter="saveOriginalTitle"
                />
                <Button size="sm" @click="saveOriginalTitle">
                  <Check :size="14" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  @click="cancelEdit('originalTitle')"
                >
                  <XCircle :size="14" />
                </Button>
              </div>
              <div v-else class="mt-1 flex items-center justify-between">
                <p class="text-sm">{{ game.originalTitle }}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  @click="isEditingOriginalTitle = true"
                >
                  <Edit2 :size="16" />
                </Button>
              </div>
            </div>

            <!-- 번역된 제목 -->
            <div>
              <label class="text-muted-foreground text-sm font-medium">
                번역된 제목
                <span
                  v-if="game.translationSource"
                  class="text-muted-foreground/70 ml-1 text-xs"
                >
                  ({{
                    game.translationSource === "ollama" ? "Ollama" : "Google"
                  }})
                </span>
              </label>
              <div v-if="isEditingTranslatedTitle" class="mt-1 flex gap-2">
                <Input
                  v-model="editedTranslatedTitle"
                  placeholder="번역 제목 입력"
                  @keydown.enter="saveTranslatedTitle"
                />
                <Button size="sm" @click="saveTranslatedTitle">
                  <Check :size="14" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  @click="cancelEdit('translatedTitle')"
                >
                  <XCircle :size="14" />
                </Button>
              </div>
              <div v-else class="mt-1 flex items-center justify-between">
                <p class="text-sm">
                  {{ game.translatedTitle || "없음" }}
                </p>
                <Button
                  size="icon"
                  variant="ghost"
                  @click="isEditingTranslatedTitle = true"
                >
                  <Edit2 :size="16" />
                </Button>
              </div>
            </div>

            <!-- 번역 버튼 -->
            <div>
              <Button
                variant="outline"
                class="w-full"
                :disabled="isTranslating"
                @click="handleTranslateTitle"
              >
                <Loader2
                  v-if="isTranslating"
                  :size="16"
                  class="mr-2 animate-spin"
                />
                <Languages v-else :size="16" class="mr-2" />
                {{ isTranslating ? "번역 중..." : "제목 번역" }}
              </Button>
            </div>

            <!-- 발매일 -->
            <div>
              <label class="text-muted-foreground text-sm font-medium"
                >발매일</label
              >
              <div v-if="isEditingPublishDate" class="mt-1 flex gap-2">
                <Input
                  v-model="editedPublishDate"
                  type="date"
                  @keydown.enter="savePublishDate"
                />
                <Button size="sm" @click="savePublishDate">
                  <Check :size="14" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  @click="cancelEdit('publishDate')"
                >
                  <XCircle :size="14" />
                </Button>
              </div>
              <div v-else class="mt-1 flex items-center justify-between">
                <p class="text-sm">{{ formattedPublishDate || "미정" }}</p>
                <Button
                  size="icon"
                  variant="ghost"
                  @click="isEditingPublishDate = true"
                >
                  <Edit2 :size="16" />
                </Button>
              </div>
            </div>

            <!-- 플레이 타임 -->
            <div v-if="formattedPlayTime">
              <label
                class="text-muted-foreground flex items-center gap-1 text-sm font-medium"
              >
                <Clock :size="14" />
                플레이 타임
              </label>
              <p class="mt-1 text-sm">{{ formattedPlayTime }}</p>
            </div>

            <!-- 별점 -->
            <div>
              <div class="flex items-center gap-2">
                <label class="text-muted-foreground text-sm font-medium"
                  >별점</label
                >
              </div>
              <div class="mt-1 flex items-center gap-1">
                <StarRating
                  :model-value="game.rating ?? null"
                  @update:model-value="handleRatingChange"
                  size="md"
                />
                <Button
                  v-if="game.rating !== null"
                  size="icon"
                  variant="ghost"
                  @click="handleRatingChange(null)"
                  title="별점 제거"
                >
                  <RotateCcw :size="14" />
                </Button>
              </div>
            </div>

            <!-- 제작사 -->
            <div>
              <label class="text-muted-foreground text-sm font-medium"
                >제작사</label
              >
              <div class="mt-1 flex flex-wrap gap-2">
                <span
                  v-for="maker in game.makers"
                  :key="maker"
                  class="bg-muted flex items-center gap-1 rounded-md px-2 py-1 text-sm"
                >
                  🏢 {{ maker }}
                  <button
                    @click="handleRemoveMaker(maker)"
                    class="hover:text-destructive transition-colors"
                  >
                    <X :size="12" />
                  </button>
                </span>
                <div class="flex gap-1">
                  <Input
                    v-model="newMaker"
                    placeholder="제작사 추가"
                    class="w-32"
                    @keydown="handleMakerKeydown"
                  />
                  <Button size="icon" @click="handleAddMaker">
                    <Plus :size="16" />
                  </Button>
                </div>
              </div>
            </div>

            <!-- 카테고리 -->
            <div>
              <label class="text-muted-foreground text-sm font-medium"
                >카테고리</label
              >
              <div class="mt-1 flex flex-wrap gap-2">
                <span
                  v-for="category in game.categories"
                  :key="category"
                  class="bg-secondary text-secondary-foreground flex items-center gap-1 rounded-md px-2 py-1 text-sm"
                >
                  {{ category }}
                  <button
                    @click="handleRemoveCategory(category)"
                    class="hover:text-destructive transition-colors"
                  >
                    <X :size="12" />
                  </button>
                </span>
                <div class="flex gap-1">
                  <Input
                    v-model="newCategory"
                    placeholder="카테고리 추가"
                    class="w-32"
                    @keydown="handleCategoryKeydown"
                  />
                  <Button size="icon" @click="handleAddCategory">
                    <Plus :size="16" />
                  </Button>
                </div>
              </div>
            </div>

            <!-- 태그 -->
            <div>
              <label class="text-muted-foreground text-sm font-medium"
                >태그</label
              >
              <div class="mt-1 flex flex-wrap gap-2">
                <span
                  v-for="tag in game.tags"
                  :key="tag"
                  class="bg-muted flex items-center gap-1 rounded-md px-2 py-1 text-sm"
                >
                  #{{ tag }}
                  <button
                    @click="handleRemoveTag(tag)"
                    class="hover:text-destructive transition-colors"
                  >
                    <X :size="12" />
                  </button>
                </span>
                <div class="flex gap-1">
                  <Input
                    v-model="newTag"
                    placeholder="태그 추가"
                    class="w-32"
                    @keydown="handleTagKeydown"
                  />
                  <Button size="icon" @click="handleAddTag">
                    <Plus :size="16" />
                  </Button>
                </div>
              </div>
            </div>

            <!-- 메모 -->
            <div>
              <label class="text-muted-foreground text-sm font-medium"
                >메모</label
              >
              <div v-if="isEditingMemo" class="mt-1 space-y-2">
                <textarea
                  v-model="editedMemo"
                  class="bg-background min-h-[100px] w-full resize-y rounded-md border p-2 text-sm"
                  placeholder="메모를 입력하세요..."
                />
                <div class="flex gap-2">
                  <Button size="sm" @click="saveMemo">
                    <Check :size="14" />
                  </Button>
                  <Button size="sm" variant="ghost" @click="cancelEdit('memo')">
                    <XCircle :size="14" />
                  </Button>
                </div>
              </div>
              <div v-else class="mt-1 flex items-start justify-between">
                <p class="text-sm whitespace-pre-wrap">
                  {{ game.memo || "메모 없음" }}
                </p>
                <Button
                  size="icon"
                  variant="ghost"
                  @click="isEditingMemo = true"
                >
                  <Edit2 :size="16" />
                </Button>
              </div>
            </div>

            <!-- 실행 파일 -->
            <div class="border-t pt-2">
              <label class="text-muted-foreground text-sm font-medium"
                >실행 파일</label
              >
              <div class="mt-1 flex items-center justify-between">
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <File :size="14" class="text-muted-foreground shrink-0" />
                  <p class="truncate font-mono text-sm">
                    {{ game.executablePath || "자동 감지" }}
                  </p>
                </div>
                <div class="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    @click="handleSelectExecutableFile"
                    title="파일 선택"
                  >
                    <Folder :size="14" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    @click="handleResetExecutablePath"
                    title="자동 감지로 초기화"
                    :disabled="!game.executablePath"
                  >
                    <RotateCcw :size="14" />
                  </Button>
                </div>
              </div>
            </div>

            <!-- 경로 정보 -->
            <div class="space-y-1 border-t pt-2">
              <p class="text-muted-foreground text-xs">
                <span class="font-medium">경로:</span> {{ game.path }}
              </p>
              <p class="text-muted-foreground text-xs">
                <span class="font-medium">소스:</span> {{ game.source }}
              </p>
              <p v-if="game.provider" class="text-muted-foreground text-xs">
                <span class="font-medium">제공자:</span> {{ game.provider }}
              </p>
              <p v-if="game.externalId" class="text-muted-foreground text-xs">
                <span class="font-medium">외부 ID:</span> {{ game.externalId }}
              </p>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter class="p-0 pt-6">
        <Button variant="outline" @click="closeDialog"> 닫기 </Button>
        <Button
          variant="secondary"
          :disabled="isRunningCollector"
          @click="handleRunCollector"
        >
          <Loader2 v-if="isRunningCollector" :size="16" class="animate-spin" />
          <RefreshCw v-else :size="16" />
          정보 재수집
        </Button>
        <Button variant="secondary" @click="handleOpenFolder">
          <FolderOpen :size="16" />
          폴더 열기
        </Button>
        <Button @click="handlePlay">
          <Play :size="16" />
          실행
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
