<script setup lang="ts">
import { FolderOpen, Loader2, Play, RefreshCw } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { useRunCollector } from "../composables/useCollector";
import { useAddExcludedExecutable } from "../composables/useExcludedExecutables";
import {
  useGameDetail,
  useOpenFolderMutation,
} from "../composables/useGameDetail";
import { usePlayGame } from "../composables/useGames";
import { usePlayTime, usePlayTimeListener } from "../composables/usePlayTime";
import GameDetailExecutable from "./game-detail/GameDetailExecutable.vue";
import GameDetailMemo from "./game-detail/GameDetailMemo.vue";
import GameDetailMetadata from "./game-detail/GameDetailMetadata.vue";
import GameDetailRelations from "./game-detail/GameDetailRelations.vue";
import GameDetailThumbnail from "./game-detail/GameDetailThumbnail.vue";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

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

// 컬렉터 실행 상태
const isRunningCollector = ref(false);

// 자식 컴포넌트 refs
const thumbnailRef = ref<InstanceType<typeof GameDetailThumbnail>>();
const metadataRef = ref<InstanceType<typeof GameDetailMetadata>>();
const relationsRef = ref<InstanceType<typeof GameDetailRelations>>();
const memoRef = ref<InstanceType<typeof GameDetailMemo>>();

// 게임 경로를 ref로 변환
const gamePathRef = computed(() => props.gamePath || "");

// 쿼리
const { data: gameDetail, isLoading } = useGameDetail(gamePathRef);
const { data: playTimeData } = usePlayTime(gamePathRef);
const addExcludedExecutable = useAddExcludedExecutable();
const runCollectorMutation = useRunCollector();
const playGameMutation = usePlayGame();
const openFolderMutation = useOpenFolderMutation();

// 플레이 타임 이벤트 리스너
usePlayTimeListener(gamePathRef);

// 게임 데이터
const game = computed(() => gameDetail.value);

// 다이얼로그 열릴 때 초기화
watch(
  () => props.open,
  (open) => {
    if (open && props.gamePath) {
      resetChildStates();
    }
  },
);

function resetChildStates() {
  thumbnailRef.value?.resetState();
  metadataRef.value?.resetState();
  relationsRef.value?.resetState();
  memoRef.value?.resetState();
}

// 다이얼로그 닫기
function closeDialog() {
  emit("update:open", false);
}

// 자식 컴포넌트에서 데이터 변경 시
function handleChildUpdated() {
  emit("updated");
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
          <GameDetailThumbnail
            ref="thumbnailRef"
            :game="game"
            :game-path="gamePathRef"
            :is-loading="isLoading"
            @updated="handleChildUpdated"
          />

          <!-- 정보 영역 -->
          <div class="flex-1 space-y-4">
            <GameDetailMetadata
              ref="metadataRef"
              :game="game"
              :game-path="gamePathRef"
              :play-time="playTimeData"
              @updated="handleChildUpdated"
            />
            <GameDetailRelations
              ref="relationsRef"
              :game="game"
              :game-path="gamePathRef"
              @updated="handleChildUpdated"
            />
            <GameDetailMemo
              ref="memoRef"
              :game="game"
              :game-path="gamePathRef"
              @updated="handleChildUpdated"
            />
            <GameDetailExecutable
              :game="game"
              :game-path="gamePathRef"
              @updated="handleChildUpdated"
            />
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
