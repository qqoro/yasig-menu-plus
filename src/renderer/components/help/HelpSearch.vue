<script setup lang="ts">
import { Search, X } from "lucide-vue-next";
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { Input } from "@/components/ui/input";
import {
  buildSearchIndex,
  searchEntries,
  type SearchEntry,
  type SearchResult,
} from "@/lib/helpSearch";

const query = ref("");
const isFocused = ref(false);
const activeIndex = ref(0);
const inputRef = ref<InstanceType<typeof Input> | null>(null);

let searchIndex: SearchEntry[] = [];
let blurTimeout: ReturnType<typeof setTimeout> | null = null;

onMounted(async () => {
  await nextTick();
  const contentEl = document.getElementById("help-content");
  if (contentEl) {
    searchIndex = buildSearchIndex(contentEl);
  }
});

const results = computed<SearchResult[]>(() => {
  if (!query.value.trim()) return [];
  return searchEntries(searchIndex, query.value);
});

watch(results, () => {
  activeIndex.value = 0;
});

const showDropdown = computed(() => {
  return isFocused.value && query.value.trim().length > 0;
});

function scrollToResult(index: number) {
  const result = results.value[index];
  if (!result) return;

  const el = document.getElementById(result.cardId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-primary/50");
    setTimeout(() => {
      el.classList.remove("ring-2", "ring-primary/50");
    }, 1500);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    query.value = "";
    (inputRef.value?.$el as HTMLInputElement)?.blur();
    return;
  }

  if (!showDropdown.value || results.value.length === 0) return;

  if (e.key === "Enter") {
    e.preventDefault();
    if (e.shiftKey) {
      activeIndex.value =
        (activeIndex.value - 1 + results.value.length) % results.value.length;
    } else {
      activeIndex.value = (activeIndex.value + 1) % results.value.length;
    }
    scrollToResult(activeIndex.value);
  }
}

function selectResult(index: number) {
  if (blurTimeout) clearTimeout(blurTimeout);
  activeIndex.value = index;
  scrollToResult(index);
  isFocused.value = false;
}

function handleBlur() {
  blurTimeout = setTimeout(() => {
    isFocused.value = false;
  }, 200);
}

function handleFocus() {
  if (blurTimeout) clearTimeout(blurTimeout);
  isFocused.value = true;
}

function clearQuery() {
  query.value = "";
  const el = inputRef.value?.$el as HTMLInputElement | null;
  el?.focus();
}
</script>

<template>
  <div class="relative">
    <div class="relative">
      <Search
        class="text-muted-foreground pointer-events-none absolute top-1/2 left-2 -translate-y-1/2"
        :size="14"
      />
      <Input
        ref="inputRef"
        v-model="query"
        placeholder="도움말 검색..."
        class="h-7 w-48 pr-7 pl-7 text-xs"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeydown"
      />
      <button
        v-if="query"
        class="text-muted-foreground hover:text-foreground absolute top-1/2 right-1.5 -translate-y-1/2"
        tabindex="-1"
        @mousedown.prevent="clearQuery"
      >
        <X :size="12" />
      </button>
    </div>

    <!-- 검색 결과 드롭다운 -->
    <div
      v-if="showDropdown"
      class="bg-popover text-popover-foreground absolute top-full right-0 z-50 mt-1 w-72 rounded-md border shadow-md"
    >
      <!-- 결과 헤더 -->
      <div
        class="text-muted-foreground flex items-center justify-between border-b px-3 py-1.5 text-xs"
      >
        <span v-if="results.length > 0">{{ results.length }}개 결과</span>
        <span v-else>검색 결과 없음</span>
        <span v-if="results.length > 0"
          >{{ activeIndex + 1 }} / {{ results.length }}</span
        >
      </div>

      <!-- 결과 목록 -->
      <div v-if="results.length > 0" class="max-h-64 overflow-y-auto p-1">
        <button
          v-for="(result, index) in results"
          :key="result.cardId"
          class="hover:bg-accent w-full cursor-pointer rounded-sm px-3 py-2 text-left text-xs transition-colors"
          :class="{ 'bg-accent': index === activeIndex }"
          @click="selectResult(index)"
          @mouseenter="activeIndex = index"
        >
          <div class="font-medium">{{ result.title }}</div>
          <div class="text-muted-foreground mt-0.5 truncate text-[11px]">
            {{ result.sectionLabel }}
            <span v-if="result.snippet" class="ml-1">
              · {{ result.snippet }}
            </span>
          </div>
        </button>
      </div>

      <!-- 결과 없음 -->
      <div v-else class="text-muted-foreground px-3 py-4 text-center text-xs">
        "{{ query }}"에 대한 결과가 없습니다
      </div>
    </div>
  </div>
</template>
