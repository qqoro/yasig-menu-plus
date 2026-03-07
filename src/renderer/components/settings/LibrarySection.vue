<script setup lang="ts">
import {
  Clock,
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-vue-next";
import { ref } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  useLibraryScanHistory,
  useSelectFolder,
} from "@/composables/useAllInOneRefresh";
import {
  useExcludedExecutables,
  useAddExcludedExecutable,
  useRemoveExcludedExecutable,
} from "@/composables/useExcludedExecutables";
import { useOpenFolder, useRefreshGames } from "@/composables/useGames";
import {
  useAddLibraryPath,
  useLibraryPaths,
  useRemoveLibraryPath,
} from "@/composables/useSettings";
import { useRouter } from "vue-router";
import { formatLastScannedAt } from "@/utils/format";

const router = useRouter();

const refreshGamesMutation = useRefreshGames();
const openFolderMutation = useOpenFolder();

// 라이브러리 경로 관리
const { data: libraryPaths } = useLibraryPaths();
const addLibraryPathMutation = useAddLibraryPath();
const removeLibraryPathMutation = useRemoveLibraryPath();

// 개별 경로 새로고침 상태
const isRefreshingPath = ref(false);

// 라이브러리 스캔 기록
const { data: libraryScanHistories } = useLibraryScanHistory();

// 폴더 선택
const selectFolderMutation = useSelectFolder();
const folderInput = ref("");

// 실행 제외 목록 관리
const { data: excludedExecutables } = useExcludedExecutables();
const addExcludedExecutable = useAddExcludedExecutable();
const removeExcludedExecutable = useRemoveExcludedExecutable();
const newExcludedExecutable = ref("");

/**
 * 폴더 경로 추가
 */
function handleAddPath(): void {
  const path = folderInput.value.trim();
  if (!path) return;

  if (libraryPaths.value?.includes(path)) {
    toast.warning("이미 추가된 경로입니다.");
    return;
  }

  addLibraryPathMutation.mutate(path, {
    onSuccess: () => {
      folderInput.value = "";
      toast.success("경로가 추가되었습니다.");
    },
    onError: () => {
      toast.error("경로 추가에 실패했습니다.");
    },
  });
}

/**
 * 폴더 경로 제거
 */
function handleRemovePath(path: string): void {
  removeLibraryPathMutation.mutate(path, {
    onSuccess: () => {
      toast.success("경로가 제거되었습니다.");
    },
    onError: () => {
      toast.error("경로 제거에 실패했습니다.");
    },
  });
}

/**
 * 폴더 선택 다이얼로그 열기
 */
async function handleSelectFolder(): Promise<void> {
  try {
    const filePaths = await selectFolderMutation.mutateAsync(undefined);

    if (filePaths && filePaths.length > 0) {
      const selectedPath = filePaths[0];

      if (libraryPaths.value?.includes(selectedPath)) {
        toast.warning("이미 추가된 경로입니다.");
        return;
      }

      addLibraryPathMutation.mutate(selectedPath, {
        onSuccess: () => {
          toast.success("경로가 추가되었습니다.");
        },
        onError: () => {
          toast.error("경로 추가에 실패했습니다.");
        },
      });
    }
  } catch (err) {
    console.error("폴더 선택 오류:", err);
  }
}

/**
 * 폴더 열기
 */
async function handleOpenPath(path: string): Promise<void> {
  try {
    await openFolderMutation.mutateAsync(path);
  } catch {
    toast.error("폴더를 열 수 없습니다.");
  }
}

/**
 * 개별 경로 새로고침 핸들러
 */
async function handleRefreshSinglePath(path: string): Promise<void> {
  isRefreshingPath.value = true;
  try {
    await refreshGamesMutation.mutateAsync([path]);
    toast.success(`"${path}" 경로를 스캔했습니다.`);
  } catch (err) {
    console.error("경로 새로고침 오류:", err);
    toast.error(
      err instanceof Error ? err.message : "새로고침에 실패했습니다.",
    );
  } finally {
    isRefreshingPath.value = false;
  }
}

/**
 * 실행 제외 목록에 추가
 */
async function handleAddExcludedExecutable(): Promise<void> {
  const executable = newExcludedExecutable.value.trim();
  if (!executable) return;

  if (
    excludedExecutables.value?.some(
      (e) => e.toLowerCase() === executable.toLowerCase(),
    )
  ) {
    toast.warning("이미 등록된 실행 파일입니다.");
    return;
  }

  try {
    await addExcludedExecutable.mutateAsync(executable);
    newExcludedExecutable.value = "";
    toast.success("실행 제외 목록에 추가되었습니다.");
  } catch {
    toast.error("추가에 실패했습니다.");
  }
}

/**
 * 실행 제외 목록에서 제거
 */
async function handleRemoveExcludedExecutable(
  executable: string,
): Promise<void> {
  try {
    await removeExcludedExecutable.mutateAsync(executable);
    toast.success("실행 제외 목록에서 제거되었습니다.");
  } catch {
    toast.error("제거에 실패했습니다.");
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 섹션 헤더 -->
    <div class="flex items-center gap-2">
      <FolderOpen :size="20" class="text-muted-foreground" />
      <h2 class="text-lg font-semibold">라이브러리</h2>
    </div>

    <!-- 카드 그리드 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <!-- 라이브러리 경로 설정 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">라이브러리 경로</CardTitle>
          <CardDescription class="text-sm">
            게임이 있는 폴더 경로를 추가하세요. 하위 폴더의 게임도 자동으로
            스캔됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 경로 추가 폼 -->
          <div class="space-y-3">
            <label
              class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              경로 추가
            </label>
            <div class="flex gap-2">
              <Input
                v-model="folderInput"
                @keyup.enter="handleAddPath"
                type="text"
                placeholder="폴더 경로 입력 (예: C:\Games)"
                class="flex-1"
              />
              <Button @click="handleAddPath" size="default">
                <Plus :size="16" />
                추가
              </Button>
            </div>
            <Button
              @click="handleSelectFolder"
              variant="outline"
              class="w-full"
            >
              <Folder :size="16" />
              폴더에서 선택
            </Button>
          </div>

          <!-- 저장된 경로 목록 -->
          <div v-if="(libraryPaths?.length ?? 0) > 0" class="space-y-3">
            <div class="flex items-center justify-between">
              <label class="text-sm leading-none font-medium">
                저장된 경로
              </label>
              <span class="text-muted-foreground text-xs"
                >{{ libraryPaths?.length ?? 0 }}개</span
              >
            </div>
            <div class="space-y-2">
              <div
                v-for="path in libraryPaths"
                :key="path"
                class="bg-muted/50 hover:bg-muted group flex flex-col gap-2 rounded-md p-3 transition-colors"
              >
                <div class="flex items-center gap-3">
                  <Folder :size="18" class="text-muted-foreground shrink-0" />
                  <span class="min-w-0 flex-1 truncate font-mono text-sm">{{
                    path
                  }}</span>
                  <Button
                    @click="handleOpenPath(path)"
                    variant="ghost"
                    size="icon"
                    class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    title="폴더 열기"
                  >
                    <FolderOpen :size="16" />
                  </Button>
                  <Button
                    @click="handleRefreshSinglePath(path)"
                    variant="ghost"
                    size="icon"
                    class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    title="새로고침"
                    :disabled="isRefreshingPath"
                  >
                    <RefreshCw
                      :size="16"
                      :class="{ 'animate-spin': isRefreshingPath }"
                    />
                  </Button>
                  <Button
                    @click="handleRemovePath(path)"
                    variant="ghost"
                    size="icon"
                    class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                    title="삭제"
                  >
                    <Trash2 :size="16" class="text-destructive" />
                  </Button>
                </div>
                <!-- 마지막 스캔 시간 표시 -->
                <div
                  v-if="libraryScanHistories?.[path]"
                  class="text-muted-foreground ml-7 flex items-center gap-1.5 text-xs"
                >
                  <Clock :size="12" />
                  <span
                    >마지막 스캔:
                    {{
                      formatLastScannedAt(
                        libraryScanHistories[path].lastScannedAt,
                      )
                    }}</span
                  >
                  <span
                    >({{ libraryScanHistories[path].lastGameCount }}개
                    게임)</span
                  >
                </div>
                <div
                  v-else
                  class="text-muted-foreground ml-7 flex items-center gap-1.5 text-xs"
                >
                  <Clock :size="12" />
                  <span>아직 스캔하지 않음</span>
                </div>
              </div>
            </div>
          </div>

          <div
            v-else
            class="flex flex-col items-center justify-center py-8 text-center"
          >
            <Folder :size="32" class="text-muted-foreground/50 mb-2" />
            <p class="text-muted-foreground text-sm">
              추가된 라이브러리 경로가 없습니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- 실행 제외 목록 설정 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">실행 제외 목록</CardTitle>
          <CardDescription class="text-sm">
            자동 감지에서 제외할 실행 파일명을 등록합니다. 등록된 파일은 게임
            실행 파일로 감지되지 않습니다.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 제외 파일 추가 폼 -->
          <div class="space-y-3">
            <label
              class="text-sm leading-none font-medium peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              실행 파일명 추가
            </label>
            <div class="flex gap-2">
              <Input
                v-model="newExcludedExecutable"
                @keyup.enter="handleAddExcludedExecutable"
                type="text"
                placeholder="실행 파일명 입력 (예: setup.exe)"
                class="flex-1"
              />
              <Button
                @click="handleAddExcludedExecutable"
                :disabled="
                  !newExcludedExecutable.trim() ||
                  addExcludedExecutable.isPending.value
                "
                size="default"
              >
                <Plus :size="16" />
                추가
              </Button>
            </div>
          </div>

          <!-- 저장된 제외 목록 -->
          <div
            v-if="excludedExecutables && excludedExecutables.length > 0"
            class="space-y-3"
          >
            <div class="flex items-center justify-between">
              <label class="text-sm leading-none font-medium">
                등록된 실행 파일
              </label>
              <span class="text-muted-foreground text-xs"
                >{{ excludedExecutables.length }}개</span
              >
            </div>
            <div class="space-y-2">
              <div
                v-for="executable in excludedExecutables"
                :key="executable"
                class="bg-muted/50 hover:bg-muted group flex items-center justify-between gap-3 rounded-md p-3 transition-colors"
              >
                <span class="flex-1 font-mono text-sm">{{ executable }}</span>
                <Button
                  @click="handleRemoveExcludedExecutable(executable)"
                  variant="ghost"
                  size="icon"
                  class="shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  :disabled="removeExcludedExecutable.isPending.value"
                >
                  <Trash2 :size="16" class="text-destructive" />
                </Button>
              </div>
            </div>
          </div>

          <div
            v-else
            class="flex flex-col items-center justify-center py-8 text-center"
          >
            <div
              class="bg-muted mb-2 flex h-8 w-8 items-center justify-center rounded-full"
            >
              <span class="text-muted-foreground/50 text-lg">×</span>
            </div>
            <p class="text-muted-foreground text-sm">
              등록된 실행 제외 목록이 없습니다.
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- 중복 게임 관리 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">중복 게임 관리</CardTitle>
          <CardDescription class="text-sm">
            중복된 게임을 찾아 정리합니다
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" @click="router.push('/duplicates')">
            중복 게임 확인
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
