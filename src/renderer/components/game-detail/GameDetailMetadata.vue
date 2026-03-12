<script setup lang="ts">
import {
  Check,
  Clock,
  Edit2,
  Languages,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import {
  useUpdateMetadata,
  useUpdateRating,
} from "../../composables/useGameDetail";
import { formatPlayTime } from "../../composables/usePlayTime";
import { useTranslateTitleMutation } from "../../composables/useTranslation";
import type { GameDetailItem } from "../../types";
import StarRating from "../StarRating.vue";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface Props {
  game: GameDetailItem | undefined;
  gamePath: string;
  playTime: { totalPlayTime: number } | undefined;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: "updated"): void }>();

// 편집 모드 상태
const isEditingOriginalTitle = ref(false);
const isEditingTitle = ref(false);
const isEditingTranslatedTitle = ref(false);
const isEditingPublishDate = ref(false);
const editedOriginalTitle = ref("");
const editedTitle = ref("");
const editedTranslatedTitle = ref("");
const editedPublishDate = ref("");

const updateMetadata = useUpdateMetadata();
const updateRating = useUpdateRating();
const translateTitle = useTranslateTitleMutation();

// 번역 진행 상태
const isTranslating = computed(() => translateTitle.isPending.value);

// 발매일 포맷팅
const formattedPublishDate = computed(() => {
  if (!props.game?.publishDate) return null;
  const date = new Date(props.game.publishDate);
  return date.toISOString().split("T")[0]; // YYYY-MM-DD 형식
});

// 포맷팅된 플레이 타임
const formattedPlayTime = computed(() => {
  if (!props.playTime?.totalPlayTime) return null;
  return formatPlayTime(props.playTime.totalPlayTime);
});

// 게임 데이터 변경 시 편집 상태 초기화
watch(
  () => props.game,
  (newGame) => {
    if (newGame) {
      resetState();
    }
  },
  { immediate: true },
);

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

// 편집 취소
function cancelEdit(
  field: "originalTitle" | "title" | "translatedTitle" | "publishDate",
) {
  if (field === "originalTitle") {
    isEditingOriginalTitle.value = false;
    editedOriginalTitle.value = props.game?.originalTitle || "";
  } else if (field === "title") {
    isEditingTitle.value = false;
    editedTitle.value = props.game?.title || "";
  } else if (field === "translatedTitle") {
    isEditingTranslatedTitle.value = false;
    editedTranslatedTitle.value = props.game?.translatedTitle || "";
  } else if (field === "publishDate") {
    isEditingPublishDate.value = false;
    editedPublishDate.value = formattedPublishDate.value || "";
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

function resetState() {
  isEditingOriginalTitle.value = false;
  isEditingTitle.value = false;
  isEditingTranslatedTitle.value = false;
  isEditingPublishDate.value = false;
  editedOriginalTitle.value = props.game?.originalTitle || "";
  editedTitle.value = props.game?.title || "";
  editedTranslatedTitle.value = props.game?.translatedTitle || "";
  editedPublishDate.value = formattedPublishDate.value || "";
}

defineExpose({ resetState });
</script>

<template>
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
      <p class="text-lg font-semibold">{{ game?.title }}</p>
      <Button size="icon" variant="ghost" @click="isEditingTitle = true">
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
      <Input v-model="editedOriginalTitle" @keydown.enter="saveOriginalTitle" />
      <Button size="sm" @click="saveOriginalTitle">
        <Check :size="14" />
      </Button>
      <Button size="sm" variant="ghost" @click="cancelEdit('originalTitle')">
        <XCircle :size="14" />
      </Button>
    </div>
    <div v-else class="mt-1 flex items-center justify-between">
      <p class="text-sm">{{ game?.originalTitle }}</p>
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
        v-if="game?.translationSource"
        class="text-muted-foreground/70 ml-1 text-xs"
      >
        ({{ game.translationSource === "ollama" ? "Ollama" : "Google" }})
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
      <Button size="sm" variant="ghost" @click="cancelEdit('translatedTitle')">
        <XCircle :size="14" />
      </Button>
    </div>
    <div v-else class="mt-1 flex items-center justify-between">
      <p class="text-sm">
        {{ game?.translatedTitle || "없음" }}
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
      <Loader2 v-if="isTranslating" :size="16" class="mr-2 animate-spin" />
      <Languages v-else :size="16" class="mr-2" />
      {{ isTranslating ? "번역 중..." : "제목 번역" }}
    </Button>
  </div>

  <!-- 발매일 -->
  <div>
    <label class="text-muted-foreground text-sm font-medium">발매일</label>
    <div v-if="isEditingPublishDate" class="mt-1 flex gap-2">
      <Input
        v-model="editedPublishDate"
        type="date"
        @keydown.enter="savePublishDate"
      />
      <Button size="sm" @click="savePublishDate">
        <Check :size="14" />
      </Button>
      <Button size="sm" variant="ghost" @click="cancelEdit('publishDate')">
        <XCircle :size="14" />
      </Button>
    </div>
    <div v-else class="mt-1 flex items-center justify-between">
      <p class="text-sm">{{ formattedPublishDate || "미정" }}</p>
      <Button size="icon" variant="ghost" @click="isEditingPublishDate = true">
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
      <label class="text-muted-foreground text-sm font-medium">별점</label>
    </div>
    <div class="mt-1 flex items-center gap-1">
      <StarRating
        :model-value="game?.rating ?? null"
        @update:model-value="handleRatingChange"
        size="md"
      />
      <Button
        v-if="game?.rating !== null"
        size="icon"
        variant="ghost"
        @click="handleRatingChange(null)"
        title="별점 제거"
      >
        <RotateCcw :size="14" />
      </Button>
    </div>
  </div>
</template>
