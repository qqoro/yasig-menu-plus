<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { DashboardStats } from "../../composables/useDashboard";

const props = defineProps<{
  data: DashboardStats["topMakers"];
}>();

const router = useRouter();

const maxCount = computed(() => Math.max(...props.data.map((m) => m.count), 1));

function searchMaker(name: string) {
  const stored = localStorage.getItem("searchFilter");
  const state = stored ? JSON.parse(stored) : {};
  state.searchQuery = `circle:${name.replaceAll(" ", "_")}`;
  localStorage.setItem("searchFilter", JSON.stringify(state));
  router.push("/");
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-sm font-medium">제작사 TOP 10</CardTitle>
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
          v-for="(maker, index) in data"
          :key="maker.name"
          class="group relative flex cursor-pointer items-center gap-3 overflow-hidden rounded-md px-2 py-1.5"
          @click="searchMaker(maker.name)"
        >
          <!-- 프로그레스 배경 -->
          <div
            class="bg-chart-3/10 group-hover:bg-chart-3/20 absolute inset-y-0 left-0 rounded-md transition-colors"
            :style="{ width: `${(maker.count / maxCount) * 100}%` }"
          />
          <!-- 순위 -->
          <span
            class="relative z-10 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs font-bold"
            :class="
              index < 3 ? 'bg-chart-3/20 text-chart-3' : 'text-muted-foreground'
            "
          >
            {{ index + 1 }}
          </span>
          <!-- 이름 -->
          <span class="relative z-10 flex-1 truncate text-sm">
            {{ maker.name }}
          </span>
          <!-- 작품 수 -->
          <span
            class="text-muted-foreground relative z-10 shrink-0 text-xs tabular-nums"
          >
            {{ maker.count }}개
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
