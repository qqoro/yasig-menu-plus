<script setup lang="ts">
import { useRouter } from "vue-router";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { DashboardStats } from "../../composables/useDashboard";

defineProps<{
  data: DashboardStats["mostNeglectedGames"];
}>();

const router = useRouter();

function daysAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 1) return "오늘";
  if (days < 30) return `${days}일 전`;
  if (days < 365) return `${Math.floor(days / 30)}개월 전`;
  return `${Math.floor(days / 365)}년 전`;
}

function searchGame(title: string) {
  const stored = localStorage.getItem("searchFilter");
  const state = stored ? JSON.parse(stored) : {};
  state.searchQuery = title;
  localStorage.setItem("searchFilter", JSON.stringify(state));
  router.push("/");
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-sm font-medium">방치된 게임 TOP 5</CardTitle>
    </CardHeader>
    <CardContent>
      <div
        v-if="data.length === 0"
        class="flex h-[100px] items-center justify-center"
      >
        <p class="text-muted-foreground text-sm">방치된 게임이 없습니다</p>
      </div>
      <div v-else class="flex flex-col gap-1">
        <div
          v-for="game in data"
          :key="game.path"
          class="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 transition-colors"
          @click="searchGame(game.title)"
        >
          <img
            v-if="game.thumbnail"
            :src="'file://' + game.thumbnail"
            class="h-8 w-8 shrink-0 rounded object-cover"
            alt=""
          />
          <div v-else class="bg-muted h-8 w-8 shrink-0 rounded" />
          <span class="flex-1 truncate text-sm">{{ game.title }}</span>
          <span class="text-muted-foreground shrink-0 text-xs">
            {{ daysAgo(game.createdAt) }}
          </span>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
