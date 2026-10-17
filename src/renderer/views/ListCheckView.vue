<script setup lang="ts">
import type { ListCheckStatus } from "@main/lib/list-check";
import { Copy, ListChecks, Loader2 } from "lucide-vue-next";
import { storeToRefs } from "pinia";
import { computed, ref } from "vue";
import { toast } from "vue-sonner";
import GameDetailDialog from "@/components/GameDetailDialog.vue";
import ListCheckThumbnail from "@/components/ListCheckThumbnail.vue";
import ListCheckTitle from "@/components/ListCheckTitle.vue";
import PageHeader from "@/components/PageHeader.vue";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { useAllSettings } from "@/composables/useAllSettings";
import { useCheckGameList } from "@/composables/useListCheck";
import { createLogger } from "@/lib/logger";
import {
  useListCheckStore,
  type ListCheckFilter,
} from "@/stores/listCheckStore";

const log = createLogger("ListCheckView");

const { data: settings } = useAllSettings();
const blurEnabled = computed(
  () => settings.value?.thumbnailSettings?.blurEnabled ?? false,
);

// 입력·결과는 스토어에 두어 상세 보기나 다른 화면에 다녀와도 유지
const store = useListCheckStore();
const { inputText, rows, filter, selected, version } = storeToRefs(store);
const checkMutation = useCheckGameList();

async function handleCheck(): Promise<void> {
  if (!inputText.value.trim() || checkMutation.isPending.value) return;
  try {
    const result = await checkMutation.mutateAsync(inputText.value);
    store.setResult(result.rows);
  } catch (err) {
    log.error("보유 확인 실패:", err);
    toast.error("보유 확인에 실패했습니다.");
  }
}

const counts = computed(() => {
  const list = rows.value ?? [];
  return {
    all: list.length,
    owned: list.filter((r) => r.status === "owned").length,
    missing: list.filter((r) => r.status === "missing").length,
    unknown: list.filter((r) => r.status === "unknown").length,
  };
});

const tabs: { id: ListCheckFilter; label: string; dot?: string }[] = [
  { id: "all", label: "전체" },
  { id: "owned", label: "보유", dot: "bg-primary" },
  { id: "missing", label: "미보유", dot: "bg-destructive" },
  { id: "unknown", label: "판별 불가", dot: "bg-muted-foreground" },
];

const visibleRows = computed(() =>
  (rows.value ?? [])
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => filter.value === "all" || row.status === filter.value),
);

const recognizedCount = computed(
  () => (rows.value ?? []).filter((r) => r.code).length,
);

// 헤더 체크박스 — 현재 탭에 보이는 줄 전체 선택/해제
const allVisibleSelected = computed(
  () =>
    visibleRows.value.length > 0 &&
    visibleRows.value.every(({ index }) => selected.value.has(index)),
);

function toggleAllVisible(checked: boolean): void {
  const next = new Set(selected.value);
  for (const { index } of visibleRows.value) {
    if (checked) next.add(index);
    else next.delete(index);
  }
  selected.value = next;
}

function toggleRow(index: number, checked: boolean): void {
  const next = new Set(selected.value);
  if (checked) next.add(index);
  else next.delete(index);
  selected.value = next;
}

/** 경로 → 폴더(파일)명 / 상위 경로 */
function splitPath(path: string): { name: string; parent: string } {
  const parts = path.split(/[\\/]/);
  const name = parts.pop() ?? path;
  return { name, parent: parts.join("\\") };
}

// 보유 게임 상세 (페이지 위에 띄워서 결과를 그대로 유지)
const detailOpen = ref(false);
const detailPath = ref<string | null>(null);

function handleOpenGame(path: string): void {
  detailPath.value = path;
  detailOpen.value = true;
}

type CopyFormat = "code" | "line" | "url";

async function copySelected(format: CopyFormat): Promise<void> {
  const picked = (rows.value ?? []).filter((_, i) => selected.value.has(i));
  const values = picked
    .map((row) =>
      format === "code" ? row.code : format === "url" ? row.url : row.line,
    )
    .filter((v): v is string => !!v);

  if (values.length === 0) {
    toast.error("복사할 항목이 없습니다.");
    return;
  }

  try {
    await navigator.clipboard.writeText(values.join("\n"));
    const skipped = picked.length - values.length;
    toast.success(
      skipped > 0
        ? `${values.length}개 복사됨 (코드 없는 ${skipped}개 제외)`
        : `${values.length}개 복사됨`,
    );
  } catch (err) {
    log.error("클립보드 복사 실패:", err);
    toast.error("클립보드 복사에 실패했습니다.");
  }
}

const statusLabel: Record<ListCheckStatus, string> = {
  owned: "보유",
  missing: "미보유",
  unknown: "판별 불가",
};

const statusClass: Record<ListCheckStatus, string> = {
  owned: "bg-primary/15 text-primary",
  missing: "bg-destructive/15 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};
</script>

<template>
  <div class="bg-background flex h-full flex-col">
    <!-- 헤더 -->
    <PageHeader title="보유 확인">
      <template #meta>
        <span v-if="rows" class="text-muted-foreground text-sm">
          {{ rows.length }}줄 중 코드 인식 {{ recognizedCount }}줄
        </span>
      </template>
      <template v-if="rows" #actions>
        <span class="text-muted-foreground text-sm"
          >{{ selected.size }}개 선택됨</span
        >
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="sm" :disabled="selected.size === 0">
              <Copy :size="14" />
              선택 항목 복사
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem @click="copySelected('code')">
              코드만 복사
            </DropdownMenuItem>
            <DropdownMenuItem @click="copySelected('line')">
              원문 줄 그대로 복사
            </DropdownMenuItem>
            <DropdownMenuItem @click="copySelected('url')">
              작품 링크로 복사
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>
    </PageHeader>

    <main class="flex min-h-0 flex-1 gap-4 p-6">
      <!-- 입력 -->
      <section class="flex w-80 shrink-0 flex-col gap-2">
        <Textarea
          v-model="inputText"
          placeholder="한 줄에 하나씩 붙여넣으세요"
          class="[field-sizing:fixed] min-h-0 flex-1 resize-none font-mono text-xs"
          @keydown.ctrl.enter.prevent="handleCheck"
        />
        <!-- 사용 안내 -->
        <div class="text-muted-foreground flex flex-col gap-2 text-xs">
          <div class="flex flex-col gap-0.5">
            <span class="text-foreground font-medium">용도</span>
            <p>모아 둔 작품 목록 중 이미 가진 게 뭔지 한 번에 확인할 때</p>
          </div>
          <div class="flex flex-col gap-0.5">
            <span class="text-foreground font-medium">사용법</span>
            <ol class="flex list-inside list-decimal flex-col gap-0.5">
              <li>작품 코드나 제목이 들어간 줄을 한 줄에 하나씩 붙여넣기</li>
              <li>대조하기 (Ctrl+Enter)</li>
              <li>
                미보유 탭에서 원하는 항목을 골라 "선택 항목 복사"로 코드·링크
                복사
              </li>
            </ol>
          </div>
        </div>
        <Button
          :disabled="!inputText.trim() || checkMutation.isPending.value"
          @click="handleCheck"
        >
          <Loader2
            v-if="checkMutation.isPending.value"
            :size="14"
            class="animate-spin"
          />
          대조하기
          <span class="text-xs opacity-60">Ctrl+Enter</span>
        </Button>
      </section>

      <!-- 결과 -->
      <section class="flex min-w-0 flex-1 flex-col gap-3">
        <div
          v-if="!rows"
          class="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2 rounded-md border border-dashed text-sm"
        >
          <ListChecks :size="32" />
          왼쪽에 작품 목록을 붙여넣고 대조하기를 누르세요.
        </div>

        <template v-else>
          <div class="bg-muted flex gap-1 self-start rounded-md p-1">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="flex items-center gap-1.5 rounded-sm px-2.5 py-1 text-xs"
              :class="
                filter === tab.id
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              "
              @click="filter = tab.id"
            >
              <span
                v-if="tab.dot"
                class="size-1.5 rounded-full"
                :class="tab.dot"
              />
              {{ tab.label }}
              <span class="font-semibold">{{ counts[tab.id] }}</span>
            </button>
          </div>

          <div class="min-h-0 flex-1 overflow-auto rounded-md border">
            <table class="w-full border-collapse text-sm">
              <thead class="bg-background sticky top-0 z-10">
                <tr class="text-muted-foreground border-b text-left text-xs">
                  <th class="w-8 px-2 py-2 font-medium">
                    <Checkbox
                      :model-value="allVisibleSelected"
                      @update:model-value="toggleAllVisible($event as boolean)"
                    />
                  </th>
                  <th class="w-36 px-2 py-2 font-medium">썸네일</th>
                  <th class="w-20 px-2 py-2 font-medium">상태</th>
                  <th class="w-28 px-2 py-2 font-medium">코드</th>
                  <th class="px-2 py-2 font-medium">붙여넣은 줄</th>
                  <th class="w-[28%] px-2 py-2 font-medium">라이브러리 게임</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="{ row, index } in visibleRows"
                  :key="`${version}-${index}`"
                  class="hover:bg-muted/40 border-b last:border-b-0"
                >
                  <td class="px-2 py-2 align-middle">
                    <Checkbox
                      :model-value="selected.has(index)"
                      @update:model-value="toggleRow(index, $event as boolean)"
                    />
                  </td>
                  <td class="px-2 py-2 align-middle">
                    <a
                      v-if="row.status !== 'owned' && row.url"
                      :href="row.url"
                      target="_blank"
                      title="작품 페이지 열기"
                    >
                      <ListCheckThumbnail
                        :remote="
                          row.provider && row.externalId
                            ? {
                                provider: row.provider,
                                externalId: row.externalId,
                              }
                            : null
                        "
                        :blur="blurEnabled"
                      />
                    </a>
                    <ListCheckThumbnail
                      v-else
                      :owned="row.games[0] ?? null"
                      :blur="blurEnabled"
                    />
                  </td>
                  <td class="px-2 py-2 align-middle">
                    <div class="flex flex-col items-start gap-0.5">
                      <span
                        class="rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap"
                        :class="statusClass[row.status]"
                      >
                        {{ statusLabel[row.status] }}
                        <template v-if="row.games.length > 1">
                          ×{{ row.games.length }}
                        </template>
                      </span>
                      <span
                        v-if="row.matchedBy === 'title'"
                        class="text-muted-foreground text-[10px]"
                        >제목 일치</span
                      >
                      <span
                        v-if="row.occurrences > 1"
                        class="text-muted-foreground text-[10px]"
                        >목록 내 {{ row.occurrences }}회</span
                      >
                    </div>
                  </td>
                  <td class="px-2 py-2 align-middle font-mono text-xs">
                    <a
                      v-if="row.code && row.url"
                      :href="row.url"
                      target="_blank"
                      class="text-muted-foreground hover:text-foreground hover:underline"
                      title="작품 페이지 열기"
                      >{{ row.code }}</a
                    >
                    <span v-else class="text-muted-foreground">{{
                      row.code ?? "—"
                    }}</span>
                  </td>
                  <td class="px-2 py-2 align-middle wrap-break-word">
                    <ListCheckTitle
                      :line="row.line"
                      :remote="
                        row.status !== 'owned' && row.provider && row.externalId
                          ? {
                              provider: row.provider,
                              externalId: row.externalId,
                            }
                          : null
                      "
                      :owned-title="row.games[0]?.title ?? null"
                    />
                  </td>
                  <td class="px-2 py-2 align-middle">
                    <div
                      v-if="row.games.length > 0"
                      class="flex flex-col gap-1"
                    >
                      <div
                        v-for="game in row.games"
                        :key="game.path"
                        class="flex flex-col"
                      >
                        <button
                          type="button"
                          class="text-left text-xs break-all hover:underline"
                          title="게임 상세 열기"
                          @click="handleOpenGame(game.path)"
                        >
                          {{ splitPath(game.path).name }}
                          <span
                            v-if="game.isHidden"
                            class="text-muted-foreground ml-1 text-[10px]"
                            >(숨김)</span
                          >
                        </button>
                        <span
                          class="text-muted-foreground font-mono text-[11px] break-all"
                          >{{ splitPath(game.path).parent }}</span
                        >
                      </div>
                    </div>
                    <span
                      v-else-if="row.status === 'unknown'"
                      class="text-muted-foreground text-xs"
                      >코드가 없고 일치하는 제목도 없음</span
                    >
                    <span v-else class="text-muted-foreground">—</span>
                  </td>
                </tr>
                <tr v-if="visibleRows.length === 0">
                  <td
                    colspan="6"
                    class="text-muted-foreground px-2 py-8 text-center text-xs"
                  >
                    해당하는 줄이 없습니다.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </section>
    </main>

    <!-- 보유 게임 상세 -->
    <GameDetailDialog v-model:open="detailOpen" :game-path="detailPath" />
  </div>
</template>
