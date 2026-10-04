<script setup lang="ts">
import { Loader2 } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  EXPORT_COLUMN_GROUP_LABELS,
  type ExportColumnGroup,
  type ExportColumnId,
} from "@main/lib/export-columns";
import { buildTsvRows, exportColumnLabels } from "@main/lib/export-format";
import {
  useExportGameList,
  useGameExportPreview,
} from "@/composables/useExportGameList";
import { createLogger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

const log = createLogger("ExportGameListDialog");

const open = defineModel<boolean>("open", { default: false });

// 열 선택 상태 (다이얼로그 열 때마다 기본값으로 초기화)
const selectedColumns = ref<ExportColumnId[]>([...DEFAULT_EXPORT_COLUMNS]);
const includeHeader = ref(true);
watch(open, (value) => {
  if (value) {
    selectedColumns.value = [...DEFAULT_EXPORT_COLUMNS];
    includeHeader.value = true;
  }
});

// 그룹별 컬럼 목록 (카탈로그 순서)
const groupedColumns = (
  Object.keys(EXPORT_COLUMN_GROUP_LABELS) as ExportColumnGroup[]
).map((group) => ({
  group,
  label: EXPORT_COLUMN_GROUP_LABELS[group],
  columns: EXPORT_COLUMNS.filter((c) => c.group === group),
}));

/** 체크 토글 — 선택 목록은 항상 카탈로그 순서를 유지한다 */
function toggleColumn(id: ExportColumnId, checked: boolean): void {
  const set = new Set(selectedColumns.value);
  if (checked) {
    set.add(id);
  } else {
    set.delete(id);
  }
  selectedColumns.value = EXPORT_COLUMNS.filter((c) => set.has(c.id)).map(
    (c) => c.id,
  );
}

/** 전체 선택 토글 — 전부 선택되어 있으면 모두 해제 */
const isAllSelected = computed(
  () => selectedColumns.value.length === EXPORT_COLUMNS.length,
);

function toggleSelectAll(): void {
  selectedColumns.value = isAllSelected.value
    ? []
    : EXPORT_COLUMNS.map((c) => c.id);
}

function resetToDefault(): void {
  selectedColumns.value = [...DEFAULT_EXPORT_COLUMNS];
}

// 미리보기 (다이얼로그 열려 있을 때만 조회)
const { data: previewData, isLoading: previewLoading } =
  useGameExportPreview(open);
const previewGames = computed(() => previewData.value?.games ?? []);
const previewRows = computed(() =>
  buildTsvRows(previewGames.value, selectedColumns.value),
);
const headerLabels = computed(() => exportColumnLabels(selectedColumns.value));

// 내보내기
const exportMutation = useExportGameList();
const canExport = computed(
  () => selectedColumns.value.length > 0 && !exportMutation.isPending.value,
);

async function handleExport(): Promise<void> {
  try {
    const result = await exportMutation.mutateAsync({
      columns: selectedColumns.value,
      includeHeader: includeHeader.value,
    });
    // 저장 다이얼로그 취소(null)는 무시 — 다이얼로그 유지
    if (result) {
      toast.success(`게임 목록을 내보냈습니다: ${result.path}`);
      open.value = false;
    }
  } catch (err) {
    log.error("게임 목록 내보내기 실패:", err);
    toast.error(
      err instanceof Error ? err.message : "내보내기에 실패했습니다.",
    );
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="flex max-h-[85vh] flex-col sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>게임 목록 내보내기</DialogTitle>
        <DialogDescription>
          전체 게임 목록(숨김 포함)을 제목 오름차순으로 TSV 파일에 저장합니다.
        </DialogDescription>
      </DialogHeader>

      <!-- 열 선택 -->
      <div class="flex flex-col gap-3 overflow-y-auto pr-1">
        <div class="flex items-center justify-between">
          <span class="text-sm leading-none font-medium">포함할 열</span>
          <div class="flex gap-2">
            <Button variant="outline" size="sm" @click="toggleSelectAll">{{
              isAllSelected ? "전체 해제" : "전체선택"
            }}</Button>
            <Button variant="outline" size="sm" @click="resetToDefault"
              >기본값</Button
            >
          </div>
        </div>

        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div
            v-for="group in groupedColumns"
            :key="group.group"
            class="flex flex-col gap-1.5"
          >
            <span class="text-muted-foreground text-xs font-medium">{{
              group.label
            }}</span>
            <div
              v-for="col in group.columns"
              :key="col.id"
              class="flex items-center gap-2"
            >
              <Checkbox
                :id="`export-col-${col.id}`"
                :model-value="selectedColumns.includes(col.id)"
                @update:model-value="toggleColumn(col.id, $event as boolean)"
              />
              <label
                :for="`export-col-${col.id}`"
                class="cursor-pointer text-sm"
                >{{ col.label }}</label
              >
            </div>
          </div>
        </div>

        <!-- 헤더 포함 -->
        <div class="flex items-center justify-between border-t pt-3">
          <label class="text-sm leading-none font-medium">헤더 포함</label>
          <Switch v-model="includeHeader" />
        </div>

        <!-- 미리보기 -->
        <div class="flex flex-col gap-1.5 border-t pt-3">
          <span class="text-muted-foreground text-xs font-medium"
            >미리보기 (상위 5개)</span
          >
          <div
            v-if="previewLoading"
            class="text-muted-foreground flex items-center gap-2 p-3 text-sm"
          >
            <Loader2 :size="16" class="animate-spin" />
            불러오는 중...
          </div>
          <div
            v-else-if="selectedColumns.length === 0"
            class="text-muted-foreground p-3 text-sm"
          >
            선택한 열이 없습니다.
          </div>
          <div v-else class="max-h-56 overflow-auto rounded-md border">
            <table class="w-full text-xs whitespace-nowrap">
              <thead v-if="includeHeader" class="bg-muted sticky top-0">
                <tr>
                  <th
                    v-for="h in headerLabels"
                    :key="h"
                    class="px-2 py-1.5 text-left font-medium"
                  >
                    {{ h }}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, i) in previewRows" :key="i" class="border-t">
                  <td v-for="(cell, j) in row" :key="j" class="px-2 py-1.5">
                    {{ cell }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="open = false">취소</Button>
        <Button :disabled="!canExport" @click="handleExport">
          <Loader2
            v-if="exportMutation.isPending.value"
            :size="16"
            class="animate-spin"
          />
          내보내기
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
