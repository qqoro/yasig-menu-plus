<script setup lang="ts">
import { computed } from "vue";
import VChart from "vue-echarts";
import { use } from "echarts/core";
import { TreemapChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { DashboardStats } from "../../composables/useDashboard";

use([TreemapChart, TooltipComponent, CanvasRenderer]);

const props = defineProps<{
  data: DashboardStats["tagDistribution"];
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
    formatter: (params: any) => `${params.name}: ${params.value}개`,
  },
  series: [
    {
      type: "treemap",
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      data: props.data.map((d) => ({
        name: d.name,
        value: d.count,
      })),
      breadcrumb: { show: false },
      label: {
        show: true,
        formatter: "{b}",
      },
      levels: [
        {
          itemStyle: {
            borderWidth: 1,
            borderColor: "rgba(128,128,128,0.3)",
            gapWidth: 2,
          },
        },
      ],
    },
  ],
}));
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="text-sm font-medium">태그 분포</CardTitle>
    </CardHeader>
    <CardContent>
      <div
        v-if="data.length === 0"
        class="flex h-[350px] items-center justify-center"
      >
        <p class="text-muted-foreground text-sm">데이터가 없습니다</p>
      </div>
      <div v-else class="h-[350px] w-full">
        <VChart :option="option" :theme="theme" autoresize />
      </div>
    </CardContent>
  </Card>
</template>
