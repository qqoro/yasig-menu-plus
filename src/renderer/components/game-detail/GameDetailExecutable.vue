<script setup lang="ts">
import { File, Folder, RotateCcw } from "lucide-vue-next";
import { toast } from "vue-sonner";
import {
  useSelectExecutableFile,
  useSetExecutablePath,
} from "../../composables/useGameDetail";
import type { GameDetailItem } from "../../types";
import { Button } from "../ui/button";

interface Props {
  game: GameDetailItem | undefined;
  gamePath: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ (e: "updated"): void }>();

const setExecutablePath = useSetExecutablePath();
const selectExecutableFileMutation = useSelectExecutableFile();

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
</script>

<template>
  <div class="flex flex-col gap-0">
    <!-- 비게임 콘텐츠: 미디어 재생 표시 -->
    <div v-if="game?.hasExecutable === false" class="border-t pt-2">
      <div class="flex items-center gap-2">
        <p class="text-muted-foreground text-sm">미디어 재생</p>
      </div>
    </div>

    <!-- 게임: 기존 실행 파일 UI -->
    <div v-else class="border-t pt-2">
      <label class="text-muted-foreground text-sm font-medium">실행 파일</label>
      <div class="mt-1 flex items-center justify-between">
        <div class="flex min-w-0 flex-1 items-center gap-2">
          <File :size="14" class="text-muted-foreground shrink-0" />
          <p class="truncate font-mono text-sm">
            {{ game?.executablePath || "자동 감지" }}
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
            :disabled="!game?.executablePath"
          >
            <RotateCcw :size="14" />
          </Button>
        </div>
      </div>
    </div>

    <!-- 경로 정보 -->
    <div class="space-y-1 border-t pt-2">
      <p class="text-muted-foreground text-xs">
        <span class="font-medium">경로:</span> {{ game?.path }}
      </p>
      <p class="text-muted-foreground text-xs">
        <span class="font-medium">소스:</span> {{ game?.source }}
      </p>
      <p v-if="game?.provider" class="text-muted-foreground text-xs">
        <span class="font-medium">제공자:</span> {{ game?.provider }}
      </p>
      <p v-if="game?.externalId" class="text-muted-foreground text-xs">
        <span class="font-medium">외부 ID:</span> {{ game?.externalId }}
      </p>
    </div>
  </div>
</template>
