<script setup lang="ts">
import { Shuffle, WifiOff, ZoomIn, Clock, HardDrive } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">특별 기능</h2>
    <p class="text-muted-foreground text-sm">
      편리한 부가 기능들을 소개합니다.
    </p>

    <!-- 오프라인 경로 -->
    <Card class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <WifiOff :size="16" />
          오프라인 라이브러리 경로
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>
            외장 하드나 네트워크 드라이브 등 항상 연결되어 있지 않은 경로를
            <strong class="text-foreground">오프라인 경로</strong>로 설정할 수
            있습니다.
          </p>
          <div class="bg-muted/50 rounded-md p-3">
            <p class="font-medium">오프라인 경로의 특징</p>
            <ul class="mt-1 flex flex-col gap-1">
              <li>
                <strong class="text-foreground">자동 스캔에서 제외</strong>: 앱
                시작 시 또는 새로고침 시 스캔하지 않습니다.
              </li>
              <li>
                <strong class="text-foreground">게임 목록에는 유지</strong>:
                이전에 스캔한 게임 정보는 그대로 남습니다.
              </li>
              <li>
                <strong class="text-foreground">연결 시 수동 스캔</strong>: 외장
                드라이브를 연결한 후 개별 경로를 수동으로 스캔할 수 있습니다.
              </li>
            </ul>
          </div>
          <p>
            설정 → 라이브러리 경로에서 각 경로 우측의
            <strong class="text-foreground">오프라인</strong> 토글로 설정합니다.
          </p>
        </div>
      </CardContent>
    </Card>

    <!-- 랜덤 선택 -->
    <Card class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Shuffle :size="16" />
          랜덤 선택
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>
            툴바의
            <strong class="text-foreground">주사위 아이콘</strong>을 클릭하면
            현재 검색/필터 결과에서 무작위로 게임을 하나 선택합니다.
          </p>
          <ul class="flex flex-col gap-1">
            <li>
              특별 검색어(
              <kbd
                class="bg-muted text-muted-foreground inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
                >tag:</kbd
              >,
              <kbd
                class="bg-muted text-muted-foreground inline-flex items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
                >circle:</kbd
              >
              등)와 조합하면 특정 조건에서만 랜덤 선택할 수 있습니다.
            </li>
            <li>선택된 게임이 검색창에 표시됩니다.</li>
          </ul>
        </div>
      </CardContent>
    </Card>

    <!-- 줌 레벨 -->
    <Card class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <ZoomIn :size="16" />
          줌 레벨
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >Ctrl+마우스 휠</kbd
            >
            로 게임 카드의 크기를 조절할 수 있습니다. 1(최소)~10(최대) 단계로
            확대/축소가 가능합니다.
          </p>
          <p>툴바의 +/- 버튼으로도 줌 레벨을 조절할 수 있습니다.</p>
        </div>
      </CardContent>
    </Card>

    <!-- 플레이 시간 추적 -->
    <Card class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Clock :size="16" />
          플레이 시간 추적
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="text-muted-foreground flex flex-col gap-2 text-sm">
          <p>게임을 실행하면 자동으로 플레이 시간이 기록됩니다.</p>
          <ul class="flex flex-col gap-1">
            <li>
              <strong class="text-foreground">상세 정보</strong>: 총 플레이
              시간을 확인할 수 있습니다.
            </li>
            <li>
              <strong class="text-foreground">정렬</strong>: 플레이 시간순으로
              게임을 정렬할 수 있습니다.
            </li>
            <li>
              <strong class="text-foreground">대시보드</strong>: 시간대별,
              요일별 플레이 패턴을 분석할 수 있습니다.
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
