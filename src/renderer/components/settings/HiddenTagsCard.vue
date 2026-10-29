<script setup lang="ts">
import { X } from "lucide-vue-next";
import { computed, ref } from "vue";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useHiddenTags,
  useTagSuggestions,
  useUpdateHiddenTags,
} from "@/composables/useHiddenTags";

const { hiddenTagSettings } = useHiddenTags();
const { setHideAll, addTag, removeTag } = useUpdateHiddenTags();

const hideAll = computed({
  get: () => hiddenTagSettings.value.hideAll,
  set: (value: boolean) => setHideAll(value),
});

// 태그 자동완성 상태
const query = ref("");
const showSuggestions = ref(false);
const selectedIndex = ref(0);
const { data: rawSuggestions } = useTagSuggestions(query);

// 이미 숨긴 태그는 제외하고, 입력과 정확히 같은 태그 → 앞부분 일치 순으로 올린다
// (이름순 그대로면 "반전" 입력 후 Enter 시 "대반전"이 먼저 선택되는 문제 방지)
const suggestions = computed(() => {
  const q = query.value.trim();
  const hidden = new Set(hiddenTagSettings.value.tags);
  const rank = (tag: string) => (tag === q ? 0 : tag.startsWith(q) ? 1 : 2);
  return (rawSuggestions.value ?? [])
    .filter((tag) => !hidden.has(tag))
    .sort((a, b) => rank(a) - rank(b));
});

function handleInput(value: string | number) {
  query.value = String(value);
  selectedIndex.value = 0;
  showSuggestions.value = query.value.trim().length > 0;
}

function selectTag(tag: string) {
  addTag(tag);
  query.value = "";
  showSuggestions.value = false;
  selectedIndex.value = 0;
}

function handleKeydown(event: KeyboardEvent) {
  const list = suggestions.value;
  switch (event.key) {
    case "ArrowDown":
      if (!list.length) return;
      event.preventDefault();
      selectedIndex.value = (selectedIndex.value + 1) % list.length;
      break;
    case "ArrowUp":
      if (!list.length) return;
      event.preventDefault();
      selectedIndex.value =
        selectedIndex.value === 0 ? list.length - 1 : selectedIndex.value - 1;
      break;
    case "Enter": {
      event.preventDefault();
      // 후보가 없으면 입력값 그대로 등록 (아직 수집되지 않은 태그도 미리 숨길 수 있도록)
      const tag = list[selectedIndex.value] ?? query.value.trim();
      if (tag) selectTag(tag);
      break;
    }
    case "Escape":
      showSuggestions.value = false;
      break;
  }
}
</script>

<template>
  <Card id="settings-hidden-tags" class="transition-shadow">
    <CardHeader class="pb-4">
      <CardTitle class="text-lg">태그 숨기기</CardTitle>
      <CardDescription class="text-sm">
        스포일러가 될 수 있는 태그를 화면에서 숨깁니다. 숨겼다는 표시도 남기지
        않으며, 검색(tag:)은 그대로 동작합니다.
      </CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <!-- 모든 태그 숨기기 -->
      <div class="flex items-center justify-between">
        <div class="space-y-0.5">
          <label class="text-sm leading-none font-medium"
            >모든 태그 숨기기</label
          >
          <p class="text-muted-foreground text-xs">
            게임 카드·정보 창에서 태그를 전부 숨깁니다
          </p>
        </div>
        <Switch v-model="hideAll" />
      </div>

      <!-- 숨길 태그 목록 -->
      <div
        class="border-border flex flex-col gap-3 border-t pt-3"
        :class="{ 'pointer-events-none opacity-50': hideAll }"
      >
        <div class="space-y-0.5">
          <label class="text-sm leading-none font-medium">숨길 태그</label>
          <p class="text-muted-foreground text-xs">
            이름이 정확히 같은 태그만 숨깁니다. 표기가 다른 태그는 각각
            추가하세요.
          </p>
        </div>

        <div class="relative">
          <Input
            :model-value="query"
            placeholder="태그 검색 (예: 반전)"
            :disabled="hideAll"
            @update:model-value="handleInput"
            @keydown="handleKeydown"
            @focus="showSuggestions = query.trim().length > 0"
            @blur="showSuggestions = false"
          />
          <div
            v-if="showSuggestions && suggestions.length > 0"
            class="bg-popover border-border absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border shadow-lg"
          >
            <div
              v-for="(tag, index) in suggestions"
              :key="tag"
              class="hover:bg-accent hover:text-accent-foreground cursor-pointer px-3 py-2 text-sm transition-colors"
              :class="{
                'bg-accent text-accent-foreground': index === selectedIndex,
              }"
              @mousedown.prevent="selectTag(tag)"
            >
              #{{ tag }}
            </div>
          </div>
        </div>

        <div
          v-if="hiddenTagSettings.tags.length > 0"
          class="flex flex-wrap gap-2"
        >
          <!-- 칩 전체가 해제 버튼 (작은 X만 눌러야 하던 불편 해소) -->
          <button
            v-for="tag in hiddenTagSettings.tags"
            :key="tag"
            type="button"
            class="bg-muted hover:bg-destructive/10 hover:text-destructive group flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors"
            title="클릭해서 숨김 해제"
            @click="removeTag(tag)"
          >
            #{{ tag }}
            <X :size="12" class="opacity-50 group-hover:opacity-100" />
          </button>
        </div>
        <p v-else class="text-muted-foreground text-xs">숨긴 태그가 없습니다</p>
      </div>
    </CardContent>
  </Card>
</template>
