<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import { use } from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { DashboardStats } from "../../composables/useDashboard";

use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{
  data: DashboardStats["hourlyPattern"];
  theme?: string;
}>();

const FONT = "Pretendard Variable, system-ui, sans-serif";
const COLORS = [
  "#93B5E1",
  "#E8A0B4",
  "#8DC9A0",
  "#B5A3D8",
  "#F2C078",
  "#7BC4BB",
  "#E09A8E",
  "#A0C4E8",
  "#D1A0D9",
  "#9DD4A8",
];

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`;
}

const option = computed(() => {
  const hourMap = new Map(props.data.map((d) => [d.hour, d]));
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const values = hours.map((h) => hourMap.get(h)?.totalSeconds ?? 0);
  const sessions = hours.map((h) => hourMap.get(h)?.sessionCount ?? 0);

  return {
    backgroundColor: "transparent",
    color: COLORS,
    textStyle: { fontFamily: FONT },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const d = params[0];
        return `${d.name}시<br/>플레이 시간: ${formatHours(d.value)}<br/>세션 수: ${sessions[d.dataIndex]}회`;
      },
    },
    grid: { left: "10%", right: "5%", bottom: "10%", top: "5%" },
    xAxis: {
      type: "category",
      data: hours.map((h) => `${h}`),
    },
    yAxis: {
      type: "value",
      axisLabel: { formatter: (v: number) => formatHours(v) },
    },
    series: [
      {
        type: "bar",
        data: values,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
        label: {
          show: true,
          position: "top",
          formatter: (p: any) => (p.value > 0 ? formatHours(p.value) : ""),
          fontSize: 10,
          fontFamily: FONT,
        },
      },
    ],
  };
});
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-sm font-medium">시간대별 플레이 패턴</CardTitle>
    </CardHeader>
    <CardContent>
      <div
        v-if="data.length === 0"
        class="flex h-[250px] items-center justify-center"
      >
        <p class="text-muted-foreground text-sm">데이터가 없습니다</p>
      </div>
      <div v-else class="h-[250px] w-full">
        <VChart :option="option" :theme="theme" autoresize />
      </div>
    </CardContent>
  </Card>
</template>
