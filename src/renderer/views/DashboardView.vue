<script setup lang="ts">
import { computed } from "vue";
import { Home, Loader2 } from "lucide-vue-next";
import { Button } from "../components/ui/button";
import { useUIStore } from "../stores/uiStore";
import OverviewCards from "../components/dashboard/OverviewCards.vue";
import PlayTimeChart from "../components/dashboard/PlayTimeChart.vue";
import HourlyPatternChart from "../components/dashboard/HourlyPatternChart.vue";
import WeekdayPatternChart from "../components/dashboard/WeekdayPatternChart.vue";
import RatingDistChart from "../components/dashboard/RatingDistChart.vue";
import ProviderDistChart from "../components/dashboard/ProviderDistChart.vue";
import YearDistChart from "../components/dashboard/YearDistChart.vue";
import CategoryDistChart from "../components/dashboard/CategoryDistChart.vue";
import TagDistChart from "../components/dashboard/TagDistChart.vue";
import TopPlayedList from "../components/dashboard/TopPlayedList.vue";
import TopMakersList from "../components/dashboard/TopMakersList.vue";
import LongestSessionCard from "../components/dashboard/LongestSessionCard.vue";
import NeglectedGamesList from "../components/dashboard/NeglectedGamesList.vue";
import {
  useDashboardStats,
  useLibraryStorageSize,
} from "../composables/useDashboard";

const uiStore = useUIStore();
const chartTheme = computed(() => (uiStore.isDark ? "dark" : undefined));

const { data: stats, isLoading, isError } = useDashboardStats();
const { data: storageInfo, isLoading: isStorageLoading } =
  useLibraryStorageSize();
</script>

<template>
  <div class="flex h-full flex-col">
    <!-- 헤더 -->
    <div class="flex items-center justify-between border-b px-4 py-2">
      <h1 class="text-base font-semibold">대시보드</h1>
      <RouterLink to="/">
        <Button variant="ghost" size="icon" class="shrink-0" title="홈으로">
          <Home :size="18" />
        </Button>
      </RouterLink>
    </div>

    <!-- 로딩 -->
    <div v-if="isLoading" class="flex flex-1 items-center justify-center">
      <Loader2 :size="32" class="text-muted-foreground animate-spin" />
    </div>

    <!-- 에러 -->
    <div v-else-if="isError" class="flex flex-1 items-center justify-center">
      <p class="text-muted-foreground">통계를 불러오는 데 실패했습니다.</p>
    </div>

    <!-- 콘텐츠 -->
    <div v-else-if="stats" class="flex-1 overflow-y-auto p-6">
      <div class="mx-auto flex max-w-6xl flex-col gap-10">
        <!-- 개요 -->
        <section class="dashboard-section" style="animation-delay: 0ms">
          <OverviewCards
            :overview="stats.overview"
            :storage-info="storageInfo"
            :is-storage-loading="isStorageLoading"
          />
        </section>

        <!-- 플레이 분석 -->
        <section class="dashboard-section" style="animation-delay: 80ms">
          <div class="mb-4 flex items-center gap-2">
            <div class="bg-chart-1 h-4 w-1 rounded-full" />
            <h2 class="text-sm font-semibold tracking-tight">플레이 분석</h2>
          </div>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div class="lg:col-span-2">
              <PlayTimeChart
                :data="stats.monthlyPlayTime"
                :theme="chartTheme"
              />
            </div>
            <HourlyPatternChart
              :data="stats.hourlyPattern"
              :theme="chartTheme"
            />
            <WeekdayPatternChart
              :data="stats.weekdayPattern"
              :theme="chartTheme"
            />
          </div>
        </section>

        <!-- 라이브러리 분포 -->
        <section class="dashboard-section" style="animation-delay: 160ms">
          <div class="mb-4 flex items-center gap-2">
            <div class="bg-chart-3 h-4 w-1 rounded-full" />
            <h2 class="text-sm font-semibold tracking-tight">
              라이브러리 분포
            </h2>
          </div>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RatingDistChart
              :data="stats.ratingDistribution"
              :theme="chartTheme"
            />
            <ProviderDistChart
              :data="stats.providerDistribution"
              :theme="chartTheme"
            />
            <YearDistChart :data="stats.yearDistribution" :theme="chartTheme" />
            <CategoryDistChart
              :data="stats.categoryDistribution"
              :theme="chartTheme"
            />
            <div class="lg:col-span-2">
              <TagDistChart :data="stats.tagDistribution" :theme="chartTheme" />
            </div>
          </div>
        </section>

        <!-- 랭킹 -->
        <section class="dashboard-section" style="animation-delay: 240ms">
          <div class="mb-4 flex items-center gap-2">
            <div class="bg-chart-5 h-4 w-1 rounded-full" />
            <h2 class="text-sm font-semibold tracking-tight">랭킹</h2>
          </div>
          <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TopPlayedList :data="stats.topPlayedGames" />
            <TopMakersList :data="stats.topMakers" />
            <LongestSessionCard :data="stats.longestSession" />
            <NeglectedGamesList :data="stats.mostNeglectedGames" />
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard-section {
  animation: fadeInUp 0.5s ease-out both;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
