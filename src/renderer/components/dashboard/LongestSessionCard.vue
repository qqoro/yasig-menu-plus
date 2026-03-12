<script setup lang="ts">
import { Trophy } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { DashboardStats } from "../../composables/useDashboard";
import { formatPlayTime } from "../../composables/usePlayTime";

defineProps<{
  data: DashboardStats["longestSession"];
}>();
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-sm font-medium">최장 단일 세션</CardTitle>
    </CardHeader>
    <CardContent>
      <div v-if="!data" class="flex h-[100px] items-center justify-center">
        <p class="text-muted-foreground text-sm">플레이 기록이 없습니다</p>
      </div>
      <div
        v-else
        class="flex flex-col items-center justify-center py-4 text-center"
      >
        <div class="bg-chart-4/10 mb-3 rounded-full p-3">
          <Trophy :size="24" class="text-chart-4" />
        </div>
        <p class="text-muted-foreground max-w-full truncate text-sm">
          {{ data.gameTitle }}
        </p>
        <p class="text-chart-4 mt-1 text-3xl font-bold tabular-nums">
          {{ formatPlayTime(data.durationSeconds) }}
        </p>
        <p class="text-muted-foreground mt-1 text-xs">
          {{ new Date(data.startedAt).toLocaleDateString("ko-KR") }}
        </p>
      </div>
    </CardContent>
  </Card>
</template>
