<script setup lang="ts">
import { computed } from "vue";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { DashboardStats } from "../../composables/useDashboard";
import { formatPlayTime } from "../../composables/usePlayTime";

const props = defineProps<{
  data: DashboardStats["topPlayedGames"];
}>();

const maxPlayTime = computed(() =>
  Math.max(...props.data.map((g) => g.totalPlayTime), 1),
);
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-sm font-medium">플레이 시간 TOP 10</CardTitle>
    </CardHeader>
    <CardContent>
      <div
        v-if="data.length === 0"
        class="flex h-[200px] items-center justify-center"
      >
        <p class="text-muted-foreground text-sm">데이터가 없습니다</p>
      </div>
      <div v-else class="flex flex-col gap-1">
        <div
          v-for="(game, index) in data"
          :key="game.path"
          class="group relative flex items-center gap-3 overflow-hidden rounded-md px-2 py-1.5"
        >
          <!-- 프로그레스 배경 -->
          <div
            class="bg-chart-1/10 group-hover:bg-chart-1/20 absolute inset-y-0 left-0 rounded-md transition-colors"
            :style="{
              width: `${(game.totalPlayTime / maxPlayTime) * 100}%`,
            }"
          />
          <!-- 순위 -->
          <span
            class="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold"
            :class="
              index < 3 ? 'bg-chart-1/20 text-chart-1' : 'text-muted-foreground'
            "
          >
            {{ index + 1 }}
          </span>
          <!-- 썸네일 -->
          <img
            v-if="game.thumbnail"
            :src="'file://' + game.thumbnail"
            class="relative z-10 h-8 w-8 shrink-0 rounded object-cover"
            alt=""
          />
          <div v-else class="bg-muted relative z-10 h-8 w-8 shrink-0 rounded" />
          <!-- 제목 -->
          <span class="relative z-10 flex-1 truncate text-sm">
            {{ game.title }}
          </span>
          <!-- 플레이 시간 -->
          <span
            class="text-muted-foreground relative z-10 shrink-0 text-xs tabular-nums"
          >
            {{ formatPlayTime(game.totalPlayTime) }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
