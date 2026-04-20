<script setup lang="ts">
import {
  Play,
  Star,
  Check,
  EyeOff,
  MousePointerClick,
  ArrowUpDown,
} from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsNewCard } from "@/composables/useHelpRedDot";

const isNewCard = useIsNewCard();
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">게임 관리</h2>
    <p class="text-muted-foreground text-sm">
      게임을 실행하고, 상태를 관리하고, 정렬하는 방법을 설명합니다.
    </p>

    <!-- 게임 실행 -->
    <Card id="game-management--launch" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Play :size="16" />
          게임 실행
          <span
            v-if="isNewCard('game-management--launch')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            <strong class="text-foreground">더블클릭</strong>: 게임 카드를
            더블클릭하면 이미지 캐러셀이 열립니다.
          </li>
          <li>
            <strong class="text-foreground">우클릭 → 실행</strong>: 컨텍스트
            메뉴에서 게임을 실행합니다.
          </li>
          <li>실행 시 플레이 시간이 자동으로 기록됩니다.</li>
        </ul>
      </CardContent>
    </Card>

    <!-- 상태 토글 -->
    <Card id="game-management--status-toggle" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Star :size="16" />
          상태 토글
          <span
            v-if="isNewCard('game-management--status-toggle')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-2 text-sm">
          <li class="flex items-center gap-2">
            <Star :size="14" class="shrink-0" />
            <strong class="text-foreground">즐겨찾기</strong>: 우클릭 메뉴에서
            즐겨찾기를 토글합니다.
          </li>
          <li class="flex items-center gap-2">
            <Check :size="14" class="shrink-0" />
            <strong class="text-foreground">클리어</strong>: 우클릭 메뉴에서
            클리어 상태를 토글합니다.
          </li>
          <li class="flex items-center gap-2">
            <EyeOff :size="14" class="shrink-0" />
            <strong class="text-foreground">숨김</strong>: 우클릭 메뉴에서
            게임을 숨김 처리합니다. 필터 패널에서 숨김 게임을 다시 표시할 수
            있습니다.
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 다중 선택 -->
    <Card id="game-management--multi-select" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <MousePointerClick :size="16" />
          다중 선택
          <span
            v-if="isNewCard('game-management--multi-select')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >Ctrl+클릭</kbd
            >
            개별 게임을 선택/해제합니다.
          </li>
          <li>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >Shift+클릭</kbd
            >
            마지막 선택한 게임부터 현재 게임까지 범위 선택합니다.
          </li>
          <li>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >Ctrl+A</kbd
            >
            전체 선택/해제합니다.
          </li>
          <li>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >ESC</kbd
            >
            다중 선택을 해제합니다.
          </li>
        </ul>
        <p class="text-muted-foreground mt-2 text-sm">
          다중 선택 상태에서 우클릭하면 일괄 작업 메뉴가 나타납니다 (즐겨찾기,
          클리어, 숨김, 삭제).
        </p>
      </CardContent>
    </Card>

    <!-- 정렬 -->
    <Card id="game-management--sort" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <ArrowUpDown :size="16" />
          정렬
          <span
            v-if="isNewCard('game-management--sort')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          필터 패널의 정렬 섹션에서 정렬 기준을 선택할 수 있습니다. 같은 기준을
          다시 클릭하면 오름차순/내림차순이 전환됩니다.
        </p>
        <ul class="text-muted-foreground mt-2 flex flex-col gap-1 text-sm">
          <li>제목, 발매일, 최근 플레이, 등록일, 별점, 플레이 시간, 서클명</li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
