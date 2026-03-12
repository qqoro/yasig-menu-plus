<script setup lang="ts">
import {
  AlertTriangle,
  ArrowLeft,
  CheckSquare,
  FolderOpen,
  Loader2,
  Square,
  Trash2,
} from "lucide-vue-next";
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { Button } from "../components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { useDeleteGames, useDuplicates } from "../composables/useDuplicates";
import type { DuplicateGroup, GameItem } from "../types";

const router = useRouter();

// 중복 게임 데이터
const { data: duplicateGroups, isLoading, error, refetch } = useDuplicates();
const deleteGamesMutation = useDeleteGames();

// 선택된 게임 경로들
const selectedPaths = ref<Set<string>>(new Set());

// 삭제 확인 다이얼로그
const showDeleteDialog = ref(false);
const isDeleting = ref(false);

// 통계 계산
const stats = computed(() => {
  const groups = duplicateGroups.value || [];
  const totalGames = groups.reduce((sum, g) => sum + g.games.length, 0);
  return {
    groupCount: groups.length,
    totalGames,
    selectedCount: selectedPaths.value.size,
  };
});

// 게임 선택 토글
function toggleSelection(path: string) {
  if (selectedPaths.value.has(path)) {
    selectedPaths.value.delete(path);
  } else {
    selectedPaths.value.add(path);
  }
}

// 그룹 전체 선택/해제
function toggleGroupSelection(games: GameItem[], select: boolean) {
  for (const game of games) {
    if (select) {
      selectedPaths.value.add(game.path);
    } else {
      selectedPaths.value.delete(game.path);
    }
  }
}

// 삭제 확인 다이얼로그 열기
function openDeleteDialog() {
  if (selectedPaths.value.size === 0) return;
  showDeleteDialog.value = true;
}

// 삭제 실행
async function confirmDelete() {
  if (selectedPaths.value.size === 0) return;

  isDeleting.value = true;
  try {
    await deleteGamesMutation.mutateAsync([...selectedPaths.value]);
    selectedPaths.value.clear();
    showDeleteDialog.value = false;
  } finally {
    isDeleting.value = false;
  }
}

// 뒤로 가기
function goBack() {
  router.push("/");
}

// 날짜 포맷팅
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ko-KR");
}

// 폴더 열기
function openFolder(path: string) {
  window.api.invoke("openFolder", { path });
}

// 선택된 게임 목록 (다이얼로그용)
const selectedGames = computed(() => {
  const groups = duplicateGroups.value || [];
  const result: { title: string; path: string }[] = [];
  for (const group of groups) {
    for (const game of group.games) {
      if (selectedPaths.value.has(game.path)) {
        result.push({ title: game.title, path: game.path });
      }
    }
  }
  return result;
});
</script>

<template>
  <div class="bg-background flex h-full flex-col">
    <!-- 헤더 -->
    <header class="flex items-center justify-between border-b p-4">
      <div class="flex items-center gap-4">
        <Button variant="ghost" size="icon" @click="goBack">
          <ArrowLeft class="h-5 w-5" />
        </Button>
        <h1 class="text-xl font-semibold">중복 게임 관리</h1>
      </div>

      <div class="flex items-center gap-4">
        <span class="text-muted-foreground text-sm">
          {{ stats.groupCount }}개 그룹, 총 {{ stats.totalGames }}개 게임
        </span>
        <Button
          variant="destructive"
          :disabled="stats.selectedCount === 0"
          @click="openDeleteDialog"
        >
          <Trash2 class="mr-2 h-4 w-4" />
          선택 삭제 ({{ stats.selectedCount }}개)
        </Button>
      </div>
    </header>

    <!-- 메인 컨텐츠 -->
    <main class="flex-1 overflow-y-auto p-4">
      <!-- 로딩 상태 -->
      <div v-if="isLoading" class="flex h-full items-center justify-center">
        <Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
      </div>

      <!-- 에러 상태 -->
      <div
        v-else-if="error"
        class="flex h-full flex-col items-center justify-center gap-4"
      >
        <p class="text-destructive">중복 게임을 불러오는데 실패했습니다.</p>
        <Button variant="outline" @click="() => refetch()">다시 시도</Button>
      </div>

      <!-- 중복 없음 -->
      <div
        v-else-if="!duplicateGroups || duplicateGroups.length === 0"
        class="flex h-full flex-col items-center justify-center gap-4"
      >
        <CheckSquare class="text-muted-foreground h-16 w-16" />
        <p class="text-muted-foreground text-lg">중복된 게임이 없습니다.</p>
      </div>

      <!-- 중복 그룹 목록 -->
      <div v-else class="space-y-4">
        <Card v-for="group in duplicateGroups" :key="group.id" class="p-4">
          <!-- 그룹 헤더 -->
          <div class="mb-4 flex items-center justify-between">
            <div>
              <CardTitle class="text-lg">
                <template v-if="group.type === 'externalId'">
                  <span class="text-muted-foreground"
                    >{{ group.provider }}:</span
                  >
                  {{ group.id.split(":")[1] }}
                </template>
                <template v-else-if="group.type === 'fingerprint'">
                  {{ group.games[0]?.title || group.id.slice(0, 12) }}
                </template>
                <template v-else>
                  {{ group.id }}
                </template>
              </CardTitle>
              <CardDescription>
                {{
                  group.type === "externalId"
                    ? "외부 ID 기준"
                    : group.type === "fingerprint"
                      ? "핑거프린트 기준"
                      : "파일/폴더명 기준"
                }}
                • {{ group.games.length }}개 중복
              </CardDescription>
            </div>
            <div class="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                @click="toggleGroupSelection(group.games, true)"
              >
                전체 선택
              </Button>
              <Button
                variant="outline"
                size="sm"
                @click="toggleGroupSelection(group.games, false)"
              >
                선택 해제
              </Button>
            </div>
          </div>

          <!-- 게임 목록 -->
          <div class="space-y-2">
            <div
              v-for="game in group.games"
              :key="game.path"
              class="hover:bg-muted/50 group flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors"
              :class="{
                'border-primary bg-primary/5': selectedPaths.has(game.path),
              }"
              @click="toggleSelection(game.path)"
            >
              <!-- 체크박스 -->
              <button class="flex-shrink-0" type="button">
                <Square
                  v-if="!selectedPaths.has(game.path)"
                  class="text-muted-foreground h-5 w-5"
                />
                <CheckSquare v-else class="text-primary h-5 w-5" />
              </button>

              <!-- 썸네일 -->
              <div
                class="bg-muted h-16 w-24 flex-shrink-0 overflow-hidden rounded"
              >
                <img
                  v-if="game.thumbnail"
                  :src="`file://${game.thumbnail}`"
                  :alt="game.title"
                  class="h-full w-full object-cover"
                />
                <div v-else class="flex h-full items-center justify-center">
                  <span class="text-muted-foreground text-xs">No Image</span>
                </div>
              </div>

              <!-- 게임 정보 -->
              <div class="flex-1 overflow-hidden">
                <p class="truncate font-medium">{{ game.title }}</p>
                <p class="text-muted-foreground truncate text-sm">
                  {{ game.path }}
                </p>
                <div
                  class="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs"
                >
                  <span>라이브러리 추가: {{ formatDate(game.createdAt) }}</span>
                  <span v-if="game.fileCreatedAt"
                    >파일 생성: {{ formatDate(game.fileCreatedAt) }}</span
                  >
                  <span v-if="game.fileModifiedAt"
                    >수정: {{ formatDate(game.fileModifiedAt) }}</span
                  >
                  <span v-if="game.isCompressFile">📦 압축</span>
                  <span v-if="game.isFavorite">⭐</span>
                  <span v-if="game.isClear">✅</span>
                </div>
              </div>

              <!-- 폴더 열기 버튼 (호버 시 표시) -->
              <Button
                variant="ghost"
                size="icon"
                class="opacity-0 transition-opacity group-hover:opacity-100"
                @click.stop="openFolder(game.path)"
              >
                <FolderOpen class="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </main>

    <!-- 삭제 확인 다이얼로그 -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle class="text-destructive flex items-center gap-2">
            <AlertTriangle class="h-5 w-5" />
            게임 삭제 확인
          </DialogTitle>
          <DialogDescription>
            다음 {{ selectedGames.length }}개 게임을 삭제합니다.
          </DialogDescription>
        </DialogHeader>

        <div class="my-4 space-y-1">
          <div
            v-for="game in selectedGames.slice(0, 10)"
            :key="game.path"
            class="truncate text-sm"
          >
            • {{ game.title }}
          </div>
          <p
            v-if="selectedGames.length > 10"
            class="text-muted-foreground text-sm"
          >
            ... 외 {{ selectedGames.length - 10 }}개
          </p>
        </div>

        <div
          class="border-destructive/50 bg-destructive/10 rounded-lg border p-4"
        >
          <p class="text-destructive flex items-start gap-2 text-sm">
            <AlertTriangle class="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>
              <strong>주의사항:</strong><br />
              • 게임 폴더와 내부 모든 파일이 휴지통으로 이동합니다.<br />
              • 이 작업은 되돌릴 수 없습니다 (휴지통 복구 제외).<br />
              • 썸네일, 플레이 기록도 함께 삭제됩니다.
            </span>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" @click="showDeleteDialog = false">
            취소
          </Button>
          <Button
            variant="destructive"
            :disabled="isDeleting"
            @click="confirmDelete"
          >
            <Loader2 v-if="isDeleting" class="mr-2 h-4 w-4 animate-spin" />
            삭제
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
