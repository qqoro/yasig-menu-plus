<script setup lang="ts">
import { Search, Filter, Ban } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsNewCard } from "@/composables/useHelpRedDot";

const isNewCard = useIsNewCard();

const specialQueries = [
  { prefix: "tag:", description: "태그명으로 검색", example: "tag:RPG" },
  {
    prefix: "circle:",
    description: "서클명으로 검색",
    example: "circle:서클명",
  },
  {
    prefix: "category:",
    description: "카테고리로 검색",
    example: "category:액션",
  },
  {
    prefix: "provider:",
    description: "수집 제공자로 검색",
    example: "provider:steam",
  },
  { prefix: "id:", description: "외부 ID로 검색", example: "id:RJ123456" },
];
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">검색과 필터링</h2>
    <p class="text-muted-foreground text-sm">
      다양한 검색 방법과 필터로 게임을 빠르게 찾을 수 있습니다.
    </p>

    <!-- 기본 검색 -->
    <Card id="search-filter--basic-search" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Search :size="16" />
          기본 검색
          <span
            v-if="isNewCard('search-filter--basic-search')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            검색창에 텍스트를 입력하면 게임 제목, 번역 제목, 원본명에서
            검색합니다.
          </li>
          <li>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >Ctrl+F</kbd
            >
            단축키로 검색창에 포커스를 맞출 수 있습니다.
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 특별 검색어 -->
    <Card id="search-filter--special-query" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Search :size="16" />
          특별 검색어
          <span
            v-if="isNewCard('search-filter--special-query')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground mb-3 text-sm">
          접두어를 사용해 특정 필드로 검색할 수 있습니다. 일반 검색어와 조합도
          가능합니다.
        </p>
        <div class="flex flex-col gap-2.5">
          <div
            v-for="query in specialQueries"
            :key="query.prefix"
            class="flex items-center justify-between"
          >
            <div class="flex flex-col">
              <span class="text-sm">{{ query.description }}</span>
              <span class="text-muted-foreground text-xs"
                >예: {{ query.example }}</span
              >
            </div>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-16 items-center justify-center rounded border px-2 py-0.5 text-xs font-medium"
            >
              {{ query.prefix }}
            </kbd>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 자동완성 -->
    <Card id="search-filter--autocomplete" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Search :size="16" />
          자동완성
          <span
            v-if="isNewCard('search-filter--autocomplete')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
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
              >Ctrl+Space</kbd
            >
            자동완성 목록을 표시합니다.
          </li>
          <li>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >Tab</kbd
            >
            다음 항목으로 이동합니다.
          </li>
          <li>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >Enter</kbd
            >
            선택된 항목을 검색어에 반영합니다.
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 제외 검색 -->
    <Card id="search-filter--exclude-search" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Ban :size="16" />
          제외 검색
          <span
            v-if="isNewCard('search-filter--exclude-search')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          태그, 서클명, 카테고리를 우클릭하면 해당 항목이 포함된 게임을 검색
          결과에서 제외할 수 있습니다. 다시 우클릭하면 제외가 해제됩니다.
        </p>
      </CardContent>
    </Card>

    <!-- 필터 패널 -->
    <Card id="search-filter--filter-panel" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Filter :size="16" />
          필터 패널
          <span
            v-if="isNewCard('search-filter--filter-panel')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground mb-2 text-sm">
          화면 좌측 필터 패널에서 상태별 필터를 적용할 수 있습니다. 각 버튼을
          반복 클릭하면 필터가 순환합니다:
        </p>
        <ul class="text-muted-foreground flex flex-col gap-1 text-sm">
          <li>
            <strong class="text-foreground">즐겨찾기</strong> → 즐겨찾기만 →
            비즐겨찾기만 → 전체
          </li>
          <li>
            <strong class="text-foreground">클리어</strong> → 클리어만 →
            미클리어만 → 전체
          </li>
          <li>
            <strong class="text-foreground">압축</strong> → 압축만 → 일반만 →
            전체
          </li>
          <li>
            <strong class="text-foreground">외부 ID</strong> → ID 있음 → ID 없음
            → 전체
          </li>
          <li>
            <strong class="text-foreground">숨김</strong>: 숨김 처리된 게임 표시
            토글
          </li>
        </ul>
        <p class="text-muted-foreground mt-2 text-sm">
          라이브러리 경로가 2개 이상일 경우, 경로별 활성화/비활성화도
          가능합니다.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
