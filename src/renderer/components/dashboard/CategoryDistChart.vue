<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import { use } from "echarts/core";
import { PieChart } from "echarts/charts";
import { TooltipComponent, LegendComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { DashboardStats } from "../../composables/useDashboard";

use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer]);

const props = defineProps<{
  data: DashboardStats["categoryDistribution"];
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

const option = computed(() => ({
  backgroundColor: "transparent",
  color: COLORS,
  textStyle: { fontFamily: FONT },
  tooltip: {
    trigger: "item",
    formatter: "{b}: {c}개 ({d}%)",
  },
  legend: {
    bottom: 0,
    left: "center",
    type: "scroll",
  },
  series: [
    {
      type: "pie",
      center: ["50%", "45%"],
      radius: ["35%", "55%"],
      avoidLabelOverlap: true,
      label: {
        show: true,
        formatter: "{b}\n{d}%",
        fontSize: 11,
        fontFamily: FONT,
      },
      data: props.data.map((d) => ({
        name: d.name,
        value: d.count,
      })),
    },
  ],
}));
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-sm font-medium">카테고리별 분포</CardTitle>
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
