<script setup lang="ts">
import { ArrowLeft, Home } from "lucide-vue-next";
import type { RouteLocationRaw } from "vue-router";
import { Button } from "./ui/button";

/**
 * 화면 상단 공통 헤더 — 라이브러리 툴바와 같은 높이·제목 크기
 * - 메인에서 바로 들어오는 화면: 맨 끝에 홈 버튼
 * - 하위 화면(back 지정): 맨 앞에 뒤로 버튼, 홈 버튼 없음
 */
interface Props {
  title: string;
  /** 하위 화면이면 돌아갈 화면 */
  back?: RouteLocationRaw;
  /** 홈 버튼 표시 (라이브러리 화면 자신은 끔) */
  home?: boolean;
}

withDefaults(defineProps<Props>(), { back: undefined, home: true });
</script>

<template>
  <header
    class="flex min-h-13 items-center justify-between gap-4 border-b px-4 py-2"
  >
    <div class="flex min-w-0 items-center gap-3">
      <RouterLink v-if="back" :to="back">
        <Button variant="ghost" size="icon" class="shrink-0" title="뒤로">
          <ArrowLeft :size="18" />
        </Button>
      </RouterLink>
      <h1 class="text-base font-semibold whitespace-nowrap">{{ title }}</h1>
      <slot name="meta" />
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <slot name="actions" />
      <RouterLink v-if="home && !back" to="/">
        <Button variant="ghost" size="icon" class="shrink-0" title="홈">
          <Home :size="18" />
        </Button>
      </RouterLink>
    </div>
  </header>
</template>
