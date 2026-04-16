<script setup lang="ts">
import { BarChart3, Copy, Trash2 } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">대시보드 & 중복 관리</h2>
    <p class="text-muted-foreground text-sm">
      게임 라이브러리의 통계와 중복 게임 관리 기능을 설명합니다.
    </p>

    <!-- 대시보드 -->
    <Card class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <BarChart3 :size="16" />
          대시보드
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground mb-2 text-sm">
          홈 툴바의 <strong class="text-foreground">차트 아이콘</strong>을
          클릭하면 대시보드 페이지로 이동합니다.
        </p>
        <div class="text-muted-foreground flex flex-col gap-2 text-sm">
          <div>
            <p class="font-medium">통계 카드</p>
            <p>총 게임 수, 총 플레이 시간, 평균 별점</p>
          </div>
          <div>
            <p class="font-medium">차트 분석</p>
            <ul class="mt-0.5 flex flex-col gap-0.5">
              <li>플레이 시간 추이 (최근 30일)</li>
              <li>시간대별 플레이 패턴</li>
              <li>요일별 플레이 패턴</li>
              <li>별점 분포</li>
              <li>제공자(DLSite, Steam 등) 분포</li>
              <li>연도별 발매 분포</li>
              <li>카테고리/태그 분포</li>
            </ul>
          </div>
          <div>
            <p class="font-medium">랭킹</p>
            <ul class="mt-0.5 flex flex-col gap-0.5">
              <li>최다 플레이 게임</li>
              <li>최다 제작 서클</li>
              <li>최장 플레이 세션</li>
              <li>방치 게임 (오랫동안 실행하지 않은 게임)</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 중복 관리 -->
    <Card class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Copy :size="16" />
          중복 게임 관리
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>
            여러 라이브러리 경로에 같은 게임이 있는 경우 중복으로 탐지됩니다.
          </p>
          <ul class="flex flex-col gap-1">
            <li>중복 그룹별로 게임을 확인할 수 있습니다.</li>
            <li>유지할 게임과 삭제할 게임을 개별 선택합니다.</li>
            <li>선택 후 일괄 삭제가 가능합니다.</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
