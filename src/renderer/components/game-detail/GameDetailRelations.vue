<script setup lang="ts">
import { ChevronRight, Plus, X } from "lucide-vue-next";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import {
  useAddCategory,
  useAddMaker,
  useAddTag,
  useRemoveCategory,
  useRemoveMaker,
  useRemoveTag,
} from "../../composables/useGameDetail";
import { useHiddenTags } from "../../composables/useHiddenTags";
import type { GameDetailItem } from "../../types";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

interface Props {
  game: GameDetailItem | undefined;
  gamePath: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: "updated"): void }>();

// 관계 데이터 추가 상태
const newMaker = ref("");
const newCategory = ref("");
const newTag = ref("");

const addMaker = useAddMaker();
const removeMaker = useRemoveMaker();
const addCategory = useAddCategory();
const removeCategory = useRemoveCategory();
const addTag = useAddTag();
const removeTag = useRemoveTag();

// 태그 숨기기: 숨긴 태그는 접힘 영역 안에서만 보여준다.
// 접힘 버튼은 숨긴 태그가 없는 게임에도 똑같이 표시해, 버튼 유무로 스포일러가 새지 않게 한다.
const { hideAll, visibleTags, hiddenTags } = useHiddenTags();
const shownTags = computed(() => visibleTags(props.game?.tags));
const concealedTags = computed(() => hiddenTags(props.game?.tags));
const showHiddenTags = ref(false);

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

// Enter 키로 태그 추가
function handleTagKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleAddTag();
  }
}

function resetState() {
  newMaker.value = "";
  newCategory.value = "";
  newTag.value = "";
  showHiddenTags.value = false;
}

defineExpose({ resetState });
</script>

<template>
  <!-- 제작사 -->
  <div>
    <label class="text-muted-foreground text-sm font-medium">제작사</label>
    <div class="mt-1 flex flex-wrap gap-2">
      <span
        v-for="maker in game?.makers"
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
    <label class="text-muted-foreground text-sm font-medium">카테고리</label>
    <div class="mt-1 flex flex-wrap gap-2">
      <span
        v-for="category in game?.categories"
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
    <label class="text-muted-foreground text-sm font-medium">태그</label>
    <div class="mt-1 flex flex-wrap gap-2">
      <span
        v-for="tag in shownTags"
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

    <!-- 숨긴 태그 (태그 숨기기 설정) -->
    <div class="mt-2 flex flex-col gap-2">
      <button
        type="button"
        class="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs transition-colors"
        @click="showHiddenTags = !showHiddenTags"
      >
        <ChevronRight
          :size="14"
          class="transition-transform"
          :class="{ 'rotate-90': showHiddenTags }"
        />
        {{ showHiddenTags ? "숨긴 태그 접기" : "숨긴 태그 보기" }}
        <span v-if="hideAll" class="text-muted-foreground/70"
          >· 모든 태그 숨김 켜짐</span
        >
      </button>
      <div
        v-if="showHiddenTags"
        class="border-border flex flex-wrap gap-2 rounded-md border border-dashed p-3"
      >
        <span
          v-for="tag in concealedTags"
          :key="tag"
          class="bg-muted/50 text-muted-foreground flex items-center gap-1 rounded-md px-2 py-1 text-sm"
        >
          #{{ tag }}
          <button
            @click="handleRemoveTag(tag)"
            class="hover:text-destructive transition-colors"
          >
            <X :size="12" />
          </button>
        </span>
        <span
          v-if="concealedTags.length === 0"
          class="text-muted-foreground text-xs"
        >
          이 게임에는 숨긴 태그가 없습니다
        </span>
      </div>
    </div>
  </div>
</template>
