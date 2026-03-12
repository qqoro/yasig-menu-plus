<script setup lang="ts">
import {
  BarChart3,
  Minus,
  Plus,
  RefreshCw,
  Settings,
  Shuffle,
} from "lucide-vue-next";
import { Button } from "./ui/button";

interface Props {
  zoomLevel: number;
  isSyncing: boolean;
  isSearching: boolean;
  specialOnlyTotalCount: number;
}

interface Emits {
  (e: "zoomIn"): void;
  (e: "zoomOut"): void;
  (e: "sync"): void;
  (e: "randomSelect"): void;
}

defineProps<Props>();
defineEmits<Emits>();
</script>

<template>
  <div class="flex items-center justify-between border-b px-4 py-2">
    <h1 class="text-base font-semibold">게임 라이브러리</h1>
    <div class="flex items-center gap-2">
      <!-- 줌 컨트롤 -->
      <div class="mr-2 flex items-center gap-1 border-r pr-2">
        <Button
          @click="$emit('zoomOut')"
          variant="ghost"
          size="icon"
          :disabled="zoomLevel <= 1"
          class="h-7 w-7"
          title="축소"
        >
          <Minus :size="14" />
        </Button>
        <span class="text-muted-foreground min-w-4 text-center text-xs">
          {{ zoomLevel }}
        </span>
        <Button
          @click="$emit('zoomIn')"
          variant="ghost"
          size="icon"
          :disabled="zoomLevel >= 10"
          class="h-7 w-7"
          title="확대"
        >
          <Plus :size="14" />
        </Button>
      </div>

      <!-- 전체 동기화 버튼 -->
      <Button
        @click="$emit('sync')"
        :disabled="isSyncing || isSearching"
        variant="default"
        size="sm"
        title="폴더 스캔 + 정보 수집 + 번역"
      >
        <RefreshCw
          :size="14"
          :class="{
            'animate-spin': isSyncing,
          }"
        />
        <span class="hidden sm:inline">전체 동기화</span>
      </Button>

      <!-- 랜덤 선택 버튼 -->
      <Button
        @click="$emit('randomSelect')"
        :disabled="specialOnlyTotalCount === 0 || isSyncing"
        variant="secondary"
        size="sm"
        title="랜덤 선택"
      >
        <Shuffle :size="14" />
        <span class="hidden sm:inline">랜덤</span>
      </Button>

      <!-- 대시보드 버튼 -->
      <RouterLink to="/dashboard">
        <Button variant="ghost" size="icon" class="shrink-0" title="대시보드">
          <BarChart3 :size="18" />
        </Button>
      </RouterLink>

      <RouterLink to="/settings">
        <Button variant="ghost" size="icon" class="shrink-0" title="설정">
          <Settings :size="18" />
        </Button>
      </RouterLink>
    </div>
  </div>
</template>
