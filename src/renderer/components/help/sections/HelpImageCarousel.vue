<script setup lang="ts">
import { Image, Plus, Trash2, Mouse } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsNewCard } from "@/composables/useHelpRedDot";

const isNewCard = useIsNewCard();
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">이미지 캐러셀</h2>
    <p class="text-muted-foreground text-sm">
      게임의 이미지를 확인하고 관리할 수 있습니다.
    </p>

    <!-- 캐러셀 열기 -->
    <Card id="image-carousel--open" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Image :size="16" />
          캐러셀 열기
          <span
            v-if="isNewCard('image-carousel--open')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          게임 카드를 <strong class="text-foreground">더블클릭</strong>하면
          이미지 캐러셀 다이얼로그가 열립니다. 썸네일과 추가 이미지를 크게 볼 수
          있습니다.
        </p>
      </CardContent>
    </Card>

    <!-- 네비게이션 -->
    <Card id="image-carousel--navigation" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Mouse :size="16" />
          이미지 네비게이션
          <span
            v-if="isNewCard('image-carousel--navigation')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            <strong class="text-foreground">마우스 휠</strong>: 이전/다음
            이미지로 이동
          </li>
          <li>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >←</kbd
            >
            /
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >→</kbd
            >
            화살표 키로 이전/다음 이미지
          </li>
          <li>
            <strong class="text-foreground">클릭</strong>: 다이얼로그 닫기
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 이미지 관리 -->
    <Card id="image-carousel--add-delete" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Plus :size="16" />
          이미지 추가/삭제
          <span
            v-if="isNewCard('image-carousel--add-delete')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            <strong class="text-foreground">이미지 추가</strong>: 우클릭
            메뉴에서 로컬 파일을 선택하거나 URL을 입력하여 이미지를 추가합니다.
          </li>
          <li>
            <strong class="text-foreground">이미지 삭제</strong>: 캐러셀에서
            삭제 버튼으로 개별 이미지를 삭제합니다.
          </li>
          <li>
            <strong class="text-foreground">썸네일 설정</strong>: 추가 이미지를
            대표 썸네일로 설정할 수 있습니다.
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
