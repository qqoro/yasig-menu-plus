<script setup lang="ts">
import {
  Gamepad2,
  Heart,
  Trophy,
  Star,
  Clock,
  CalendarClock,
  CalendarRange,
  HardDrive,
  Loader2,
} from "lucide-vue-next";
import { Card, CardContent } from "../ui/card";
import type {
  DashboardStats,
  LibraryStorageInfo,
} from "../../composables/useDashboard";
import { formatPlayTime } from "../../composables/usePlayTime";
import { formatBytes } from "../../composables/useDashboard";

interface Props {
  overview: DashboardStats["overview"];
  storageInfo?: LibraryStorageInfo;
  isStorageLoading: boolean;
}

defineProps<Props>();
</script>

<template>
  <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
    <!-- 총 게임 수 -->
    <Card class="gap-0 py-0">
      <CardContent class="flex items-start justify-between p-4">
        <div>
          <p class="text-muted-foreground text-xs font-medium">총 게임 수</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">
            {{ overview.totalGames.toLocaleString() }}
          </p>
        </div>
        <div class="bg-chart-1/10 rounded-lg p-2">
          <Gamepad2 :size="18" class="text-chart-1" />
        </div>
      </CardContent>
    </Card>

    <!-- 즐겨찾기 -->
    <Card class="gap-0 py-0">
      <CardContent class="flex items-start justify-between p-4">
        <div>
          <p class="text-muted-foreground text-xs font-medium">즐겨찾기</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">
            {{ overview.favoriteCount.toLocaleString() }}
          </p>
        </div>
        <div class="bg-chart-2/10 rounded-lg p-2">
          <Heart :size="18" class="text-chart-2" />
        </div>
      </CardContent>
    </Card>

    <!-- 클리어율 -->
    <Card class="gap-0 py-0">
      <CardContent class="flex items-start justify-between p-4">
        <div>
          <p class="text-muted-foreground text-xs font-medium">클리어율</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">
            {{ overview.clearedRate }}%
          </p>
        </div>
        <div class="bg-chart-3/10 rounded-lg p-2">
          <Trophy :size="18" class="text-chart-3" />
        </div>
      </CardContent>
    </Card>

    <!-- 평균 별점 -->
    <Card class="gap-0 py-0">
      <CardContent class="flex items-start justify-between p-4">
        <div>
          <p class="text-muted-foreground text-xs font-medium">평균 별점</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">
            {{
              overview.averageRating !== null
                ? `${overview.averageRating}★`
                : "-"
            }}
          </p>
        </div>
        <div class="bg-chart-4/10 rounded-lg p-2">
          <Star :size="18" class="text-chart-4" />
        </div>
      </CardContent>
    </Card>

    <!-- 총 플레이 시간 -->
    <Card class="gap-0 py-0">
      <CardContent class="flex items-start justify-between p-4">
        <div>
          <p class="text-muted-foreground text-xs font-medium">총 플레이</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">
            {{ formatPlayTime(overview.totalPlayTime) }}
          </p>
        </div>
        <div class="bg-chart-5/10 rounded-lg p-2">
          <Clock :size="18" class="text-chart-5" />
        </div>
      </CardContent>
    </Card>

    <!-- 이번 주 -->
    <Card class="gap-0 py-0">
      <CardContent class="flex items-start justify-between p-4">
        <div>
          <p class="text-muted-foreground text-xs font-medium">이번 주</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">
            {{ formatPlayTime(overview.thisWeekPlayTime) }}
          </p>
        </div>
        <div class="bg-chart-1/10 rounded-lg p-2">
          <CalendarClock :size="18" class="text-chart-1" />
        </div>
      </CardContent>
    </Card>

    <!-- 이번 달 -->
    <Card class="gap-0 py-0">
      <CardContent class="flex items-start justify-between p-4">
        <div>
          <p class="text-muted-foreground text-xs font-medium">이번 달</p>
          <p class="mt-1 text-2xl font-bold tabular-nums">
            {{ formatPlayTime(overview.thisMonthPlayTime) }}
          </p>
        </div>
        <div class="bg-chart-2/10 rounded-lg p-2">
          <CalendarRange :size="18" class="text-chart-2" />
        </div>
      </CardContent>
    </Card>

    <!-- 저장공간 -->
    <Card class="gap-0 py-0">
      <CardContent class="flex items-start justify-between p-4">
        <div>
          <p class="text-muted-foreground text-xs font-medium">저장공간</p>
          <p
            v-if="!isStorageLoading && storageInfo"
            class="mt-1 text-2xl font-bold tabular-nums"
          >
            {{ formatBytes(storageInfo.totalSize) }}
          </p>
          <Loader2
            v-else
            :size="24"
            class="text-muted-foreground mt-1 animate-spin"
          />
        </div>
        <div class="bg-chart-3/10 rounded-lg p-2">
          <HardDrive :size="18" class="text-chart-3" />
        </div>
      </CardContent>
    </Card>
  </div>
</template>
