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
  data: DashboardStats["ratingDistribution"];
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

const option = computed(() => {
  const ratingMap = new Map(props.data.map((d) => [d.rating, d.count]));
  const ratings = [1, 2, 3, 4, 5];
  const values = ratings.map((r) => ratingMap.get(r) ?? 0);

  return {
    backgroundColor: "transparent",
    color: COLORS,
    textStyle: { fontFamily: FONT },
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const d = params[0];
        return `${d.name}: ${d.value}개`;
      },
    },
    grid: { left: "15%", right: "10%", bottom: "10%", top: "5%" },
    xAxis: { type: "value" },
    yAxis: {
      type: "category",
      data: ratings.map((r) => `${"★".repeat(r)}`),
    },
    series: [
      {
        type: "bar",
        data: values,
        itemStyle: { borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: "right",
          formatter: (p: any) => (p.value > 0 ? `${p.value}개` : ""),
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
      <CardTitle class="text-sm font-medium">별점 분포</CardTitle>
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
