<script setup lang="ts">
import { Check, Edit2, XCircle } from "lucide-vue-next";
import { ref, watch } from "vue";
import { toast } from "vue-sonner";
import { useUpdateMetadata } from "../../composables/useGameDetail";
import type { GameDetailItem } from "../../types";
import { Button } from "../ui/button";

interface Props {
  game: GameDetailItem | undefined;
  gamePath: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: "updated"): void }>();

// 편집 모드 상태
const isEditingMemo = ref(false);
const editedMemo = ref("");

const updateMetadata = useUpdateMetadata();

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
function cancelEdit() {
  isEditingMemo.value = false;
  editedMemo.value = props.game?.memo || "";
}

function resetState() {
  isEditingMemo.value = false;
  editedMemo.value = props.game?.memo || "";
}

defineExpose({ resetState });
</script>

<template>
  <!-- 메모 -->
  <div>
    <label class="text-muted-foreground text-sm font-medium">메모</label>
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
        <Button size="sm" variant="ghost" @click="cancelEdit">
          <XCircle :size="14" />
        </Button>
      </div>
    </div>
    <div v-else class="mt-1 flex items-start justify-between">
      <p class="text-sm whitespace-pre-wrap">
        {{ game?.memo || "메모 없음" }}
      </p>
      <Button size="icon" variant="ghost" @click="isEditingMemo = true">
        <Edit2 :size="16" />
      </Button>
    </div>
  </div>
</template>
