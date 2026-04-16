<script setup lang="ts">
import { RefreshCw, Search, Database } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// 콜렉터 정보
const collectors = [
  {
    prefix: "ST",
    description: "Steam",
    example: "ST Game Title",
  },
  {
    prefix: "RJ, BJ, VJ",
    description: "DLSite",
    example: "RJ123456 Game Title",
  },
  {
    prefix: "GC, GETCHU",
    description: "Getchu",
    example: "GC1234 Game Title",
  },
  {
    prefix: "CE, CIEN",
    description: "Ci-en",
    example: "CE1234 Creator Title",
  },
];
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">썸네일 / 메타데이터 수집</h2>
    <p class="text-muted-foreground text-sm">
      폴더/파일명에 접두어가 포함되면 스캔 시 자동으로 썸네일과 메타데이터를
      수집합니다.
    </p>

    <!-- 자동 수집 규칙 -->
    <Card class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Search :size="16" />
          자동 수집 규칙
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground mb-3 text-sm">
          폴더명이나 파일명에 아래 접두어가 포함되면 해당 사이트에서 정보를
          자동으로 수집합니다. 접두어는 폴더명의 시작 부분에 있는 것이 가장 잘
          인식됩니다.
        </p>
        <div class="flex flex-col gap-3">
          <div
            v-for="collector in collectors"
            :key="collector.prefix"
            class="flex flex-col gap-1"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium">{{
                collector.description
              }}</span>
              <kbd
                class="bg-muted text-muted-foreground inline-flex min-w-12 items-center justify-center rounded border px-2 py-0.5 text-xs font-medium"
              >
                {{ collector.prefix }}
              </kbd>
            </div>
            <span class="text-muted-foreground text-xs"
              >예: {{ collector.example }}</span
            >
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 수동 새로고침 -->
    <Card class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <RefreshCw :size="16" />
          수동 새로고침
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            <strong class="text-foreground">개별 새로고침</strong>: 게임 카드
            우클릭 → <em>정보 새로고침</em>
          </li>
          <li>
            <strong class="text-foreground">전체 새로고침</strong>: 홈 툴바의
            새로고침 버튼 → 모든 게임의 정보를 다시 수집
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 수집 결과 -->
    <Card class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Database :size="16" />
          수집 결과
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          수집 완료 시 다음 정보가 자동으로 등록됩니다:
        </p>
        <ul class="text-muted-foreground mt-2 flex flex-col gap-1 text-sm">
          <li>썸네일 이미지</li>
          <li>게임 제목</li>
          <li>서클/제작자명</li>
          <li>카테고리</li>
          <li>발매일</li>
          <li>외부 ID (RJ번호, Steam ID 등)</li>
        </ul>
        <p class="text-muted-foreground mt-2 text-sm">
          수집된 정보는 게임 상세 정보 모달에서 확인하고 수정할 수 있습니다.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
