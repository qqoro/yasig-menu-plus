<script setup lang="ts">
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  FolderOpen,
  Info,
  Loader2,
  Minus,
  RefreshCw,
} from "lucide-vue-next";
import { computed, reactive, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { usePreviewRename, useExecuteRename } from "@/composables/useRename";
import type {
  RenamePreviewItem,
  RenameExecuteItem,
} from "@/composables/useRename";
import { useAllSettings } from "@/composables/useAllSettings";
import { useOpenFolder } from "@/composables/useGames";

const router = useRouter();

// composable
const { data: settings } = useAllSettings();
const previewMutation = usePreviewRename();
const executeMutation = useExecuteRename();
const openFolderMutation = useOpenFolder();

// 로컬 상태
const template = ref("");
const previewItems = ref<RenamePreviewItem[]>([]);
const isExecuting = ref(false);

// 썸네일 호버 오버레이
const hoveredThumbnail = ref<{
  src: string;
  x: number;
  y: number;
} | null>(null);

function onThumbnailHover(e: MouseEvent, thumbnail: string) {
  hoveredThumbnail.value = { src: thumbnail, x: e.clientX, y: e.clientY };
}

function onThumbnailMove(e: MouseEvent) {
  if (!hoveredThumbnail.value) return;
  hoveredThumbnail.value = {
    ...hoveredThumbnail.value,
    x: e.clientX,
    y: e.clientY,
  };
}

// 수동 편집된 newName 보관
const editedNames = ref<Map<string, string>>(new Map());

// 사용 가능한 변수 목록
const variables = [
  "{externalId}",
  "{title}",
  "{originalTitle}",
  "{translatedTitle}",
  "{maker}",
  "{makers}",
  "{category}",
  "{categories}",
  "{publishDate}",
  "{publishYear}",
  "{tag}",
  "{tags}",
  "{provider}",
];

// 선택된 경로 Set (reactive로 Set 변이 추적)
const selectedPaths = reactive(new Set<string>());

// 편집된 이름 기반으로 상태를 재계산한 아이템 목록
const INVALID_FILENAME_CHARS = /[\\/:*?"<>|]/;

const resolvedItems = computed(() => {
  const items = previewItems.value.map((item) => {
    const effectiveName = getItemNewName(item);
    return { ...item, newName: effectiveName };
  });

  // 충돌 감지: 같은 디렉토리에서 같은 newName이 중복되면 conflict
  const newPathCount = new Map<string, number>();
  for (const item of items) {
    if (item.newName === item.currentName) continue;
    const sep = Math.max(
      item.path.lastIndexOf("/"),
      item.path.lastIndexOf("\\"),
    );
    const newPath = item.path.substring(0, sep + 1) + item.newName;
    newPathCount.set(newPath, (newPathCount.get(newPath) ?? 0) + 1);
  }

  return items.map((item) => {
    if (item.newName === item.currentName) {
      return { ...item, status: "noChange" as const };
    }
    if (INVALID_FILENAME_CHARS.test(item.newName) || !item.newName.trim()) {
      return { ...item, status: "invalid" as const };
    }
    const sep = Math.max(
      item.path.lastIndexOf("/"),
      item.path.lastIndexOf("\\"),
    );
    const newPath = item.path.substring(0, sep + 1) + item.newName;
    const isConflict = (newPathCount.get(newPath) ?? 0) > 1;
    return {
      ...item,
      status: (isConflict ? "conflict" : "ok") as "ok" | "conflict",
    };
  });
});

// 상태별 아이템 분류 (noChange 제외)
const selectableItems = computed(() =>
  resolvedItems.value.filter((item) => item.status !== "noChange"),
);

// 선택 통계
const selectionStats = computed(() => {
  const total = previewItems.value.length;
  const selected = selectedPaths.size;
  // 선택된 항목 중 ok가 아닌 것 (실행 시 제외됨)
  const excluded = resolvedItems.value.filter(
    (item) => selectedPaths.has(item.path) && item.status !== "ok",
  ).length;
  return { total, selected, excluded };
});

// 변수 칩 클릭 → 끝에 추가
function insertVariable(variable: string) {
  template.value += variable;
}

// 미리보기 실행
async function runPreview() {
  const trimmed = template.value.trim();
  if (!trimmed) return;

  // 템플릿 저장
  await window.api.invoke("updateSettings", {
    settings: { lastRenameTemplate: template.value },
  });

  const result = await previewMutation.mutateAsync(trimmed);
  previewItems.value = result;
  editedNames.value.clear();
}

// 체크박스 토글
function toggleSelect(path: string, checked: boolean) {
  if (checked) {
    selectedPaths.add(path);
  } else {
    selectedPaths.delete(path);
  }
}

// 전체 선택 (writable computed)
const allChecked = computed({
  get: () => {
    const selectable = selectableItems.value;
    if (selectable.length === 0) return false;
    const selected = selectable.filter((item) =>
      selectedPaths.has(item.path),
    ).length;
    if (selected === 0) return false;
    if (selected === selectable.length) return true;
    return "indeterminate" as const;
  },
  set: (val: boolean | "indeterminate") => {
    selectedPaths.clear();
    if (val === true) {
      for (const item of selectableItems.value) {
        selectedPaths.add(item.path);
      }
    }
  },
});

// 개별 아이템의 newName 가져오기 (수동 편집 반영)
function getItemNewName(item: RenamePreviewItem): string {
  return editedNames.value.get(item.path) ?? item.newName;
}

// 개별 아이템의 newName 업데이트
function updateItemName(item: RenamePreviewItem, name: string) {
  editedNames.value.set(item.path, name);
}

// 폴더 열기
function openFolder(path: string) {
  openFolderMutation.mutate(path);
}

// 리네임 실행
async function executeRename() {
  if (selectedPaths.size === 0) return;

  isExecuting.value = true;
  try {
    // 마지막 템플릿 저장
    await window.api.invoke("updateSettings", {
      settings: { lastRenameTemplate: template.value },
    });

    // 실행 아이템 구성: ok 상태인 항목만 실행
    const items: RenameExecuteItem[] = [];
    for (const path of selectedPaths) {
      const resolved = resolvedItems.value.find((i) => i.path === path);
      if (resolved?.status === "ok") {
        items.push({
          path: resolved.path,
          newName: resolved.newName,
        });
      }
    }

    if (items.length === 0) return;

    const executeResult = await executeMutation.mutateAsync(items);

    // 미리보기 새로고침 (선택 상태 건드리지 않음)
    const trimmed = template.value.trim();
    if (!trimmed) return;

    const result = await previewMutation.mutateAsync(trimmed);
    previewItems.value = result;
    editedNames.value.clear();

    // 성공한 항목만 해제, 실패/건너뛴 항목은 체크 유지
    const failedSet = new Set(executeResult.failedPaths);
    for (const item of items) {
      if (!failedSet.has(item.path)) {
        selectedPaths.delete(item.path);
      }
    }
  } finally {
    isExecuting.value = false;
  }
}

// 설정 로드 완료 시 템플릿 복원 및 자동 미리보기 (최초 1회만)
const hasAutoPreviewed = ref(false);

watch(
  settings,
  (newSettings) => {
    if (hasAutoPreviewed.value || !newSettings) return;
    hasAutoPreviewed.value = true;

    const lastTemplate = newSettings.lastRenameTemplate;
    if (lastTemplate) {
      template.value = lastTemplate;
    }
    if (template.value.trim()) {
      runPreview();
    }
  },
  { immediate: true },
);
</script>

<template>
  <div class="bg-background flex h-full flex-col">
    <!-- 썸네일 호버 오버레이 (scroll container 밖에서 렌더) -->
    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-100"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <img
        v-if="hoveredThumbnail"
        :src="`file:///${hoveredThumbnail.src.replace(/\\/g, '/')}`"
        class="bg-background pointer-events-none fixed z-50 max-h-[50dvh] max-w-[50dvw] -translate-y-full rounded-lg border p-0.5 shadow-2xl"
        :style="{
          left: hoveredThumbnail.x + 'px',
          top: hoveredThumbnail.y + 'px',
        }"
      />
    </Transition>

    <!-- 헤더 -->
    <header class="flex items-center gap-4 border-b px-4 py-3">
      <Button variant="ghost" size="icon" @click="router.back()">
        <ArrowLeft class="h-5 w-5" />
      </Button>
      <h1 class="flex items-center gap-2 text-lg font-semibold">
        파일명 관리
        <span
          class="rounded bg-blue-500/15 px-1.5 py-0.5 text-xs font-medium text-blue-500"
        >
          Beta
        </span>
      </h1>
    </header>

    <!-- 경고 배너 -->
    <div
      class="flex items-center gap-2 border-b bg-yellow-500/10 px-4 py-2 text-sm"
    >
      <Info class="h-4 w-4 shrink-0 text-yellow-500" />
      <span class="text-yellow-600 dark:text-yellow-400">
        파일명 변경은 복구할 수 없습니다. 한 개씩 테스트해 확인 후 사용하세요.
      </span>
    </div>

    <!-- 템플릿 입력 영역 -->
    <div class="flex flex-col gap-3 border-b p-4">
      <div class="flex gap-2">
        <Input
          v-model="template"
          placeholder="템플릿을 입력하세요 (예: [{externalId}] {title})"
          class="flex-1"
          @keydown.enter="runPreview"
        />
        <Button
          :disabled="previewMutation.isPending.value || !template.trim()"
          @click="runPreview"
        >
          <RefreshCw
            v-if="previewMutation.isPending.value"
            class="h-4 w-4 animate-spin"
          />
          미리보기
        </Button>
      </div>
      <!-- 변수 칩 -->
      <div class="flex flex-wrap gap-1.5">
        <Button
          v-for="variable in variables"
          :key="variable"
          variant="outline"
          size="sm"
          class="h-7 text-xs"
          @click="insertVariable(variable)"
        >
          {{ variable }}
        </Button>
      </div>
    </div>

    <!-- 미리보기 목록 -->
    <div class="flex-1 overflow-y-auto">
      <!-- 로딩 -->
      <div
        v-if="previewMutation.isPending.value && previewItems.length === 0"
        class="flex h-full items-center justify-center"
      >
        <Loader2 class="text-muted-foreground h-8 w-8 animate-spin" />
      </div>

      <!-- 에러 -->
      <div
        v-else-if="previewMutation.isError.value"
        class="flex h-full flex-col items-center justify-center gap-4"
      >
        <p class="text-destructive">미리보기를 불러오는데 실패했습니다.</p>
        <Button variant="outline" @click="runPreview">다시 시도</Button>
      </div>

      <!-- 결과 없음 -->
      <div
        v-else-if="previewItems.length === 0"
        class="flex h-full flex-col items-center justify-center gap-4"
      >
        <p class="text-muted-foreground">
          템플릿을 입력하고 미리보기를 실행하세요.
        </p>
      </div>

      <!-- 미리보기 테이블 -->
      <template v-else>
        <!-- sticky 헤더 -->
        <div
          class="bg-background/95 sticky top-0 z-10 border-b backdrop-blur-sm"
        >
          <div
            class="text-muted-foreground grid grid-cols-[auto_4.5rem_1fr_2rem_2rem] items-center gap-3 px-4 py-2 text-xs font-medium"
          >
            <div class="flex justify-center px-1">
              <Checkbox
                :model-value="allChecked"
                @update:model-value="allChecked = $event"
              />
            </div>
            <span class="text-center">썸네일</span>
            <span>현재 이름 → 새 이름</span>
            <span class="text-center">상태</span>
            <span></span>
          </div>
        </div>

        <!-- 아이템 행 -->
        <div class="pb-4">
          <div
            v-for="item in resolvedItems"
            :key="item.path"
            class="grid grid-cols-[auto_4.5rem_1fr_2rem_2rem] items-center gap-3 border-b px-4 py-2"
            :class="{
              'bg-yellow-500/10': item.status === 'conflict',
              'bg-red-500/10': item.status === 'invalid',
              'opacity-60': item.status === 'noChange',
            }"
          >
            <!-- 체크박스 -->
            <div class="flex justify-center px-1">
              <Checkbox
                :model-value="selectedPaths.has(item.path)"
                :disabled="item.status === 'noChange'"
                @update:model-value="toggleSelect(item.path, $event as boolean)"
              />
            </div>

            <!-- 썸네일 -->
            <div class="group/thumb relative">
              <div
                class="bg-muted aspect-square cursor-zoom-in overflow-hidden rounded"
                @mouseenter="
                  item.thumbnail && onThumbnailHover($event, item.thumbnail)
                "
                @mousemove="onThumbnailMove"
                @mouseleave="hoveredThumbnail = null"
              >
                <img
                  v-if="item.thumbnail"
                  :src="`file:///${item.thumbnail.replace(/\\/g, '/')}`"
                  :alt="item.currentName"
                  class="h-full w-full object-cover"
                />
              </div>
            </div>

            <!-- 이름 영역 (위: 현재, 아래: 새) -->
            <div class="flex min-w-0 flex-col gap-1">
              <span class="truncate text-sm" :title="item.currentName">
                {{ item.currentName }}
              </span>
              <Input
                :model-value="getItemNewName(item)"
                class="h-7 text-sm"
                @update:model-value="updateItemName(item, String($event))"
              />
            </div>

            <!-- 상태 아이콘 -->
            <div class="flex justify-center">
              <Check
                v-if="item.status === 'ok'"
                class="h-4 w-4 text-green-500"
              />
              <AlertTriangle
                v-else-if="item.status === 'conflict'"
                class="h-4 w-4 text-yellow-500"
              />
              <AlertCircle
                v-else-if="item.status === 'invalid'"
                class="h-4 w-4 text-red-500"
              />
              <Minus v-else class="text-muted-foreground h-4 w-4" />
            </div>

            <!-- 폴더 열기 -->
            <Button
              variant="ghost"
              size="icon"
              class="h-7 w-7"
              @click="openFolder(item.path)"
            >
              <FolderOpen class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </template>
    </div>

    <!-- 푸터 -->
    <footer class="flex items-center justify-between border-t p-4">
      <span class="text-muted-foreground text-sm">
        {{ selectionStats.total }}개 중 {{ selectionStats.selected }}개 선택
        <span v-if="selectionStats.excluded > 0" class="text-yellow-500">
          ({{ selectionStats.excluded }}개 제외됨)
        </span>
      </span>
      <Button
        :disabled="
          selectionStats.selected - selectionStats.excluded === 0 || isExecuting
        "
        @click="executeRename"
      >
        <Loader2 v-if="isExecuting" class="h-4 w-4 animate-spin" />
        {{ selectionStats.selected - selectionStats.excluded }}개 리네임 실행
      </Button>
    </footer>
  </div>
</template>
