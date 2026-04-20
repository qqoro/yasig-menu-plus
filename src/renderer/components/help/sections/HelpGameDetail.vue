<script setup lang="ts">
import { FileText, Tag, Star, Image } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsNewCard } from "@/composables/useHelpRedDot";

const isNewCard = useIsNewCard();
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">게임 상세 정보</h2>
    <p class="text-muted-foreground text-sm">
      게임의 메타데이터를 확인하고 편집할 수 있습니다.
    </p>

    <!-- 상세 정보 열기 -->
    <Card id="game-detail--open" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <FileText :size="16" />
          상세 정보 열기
          <span
            v-if="isNewCard('game-detail--open')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          게임 카드를
          <strong class="text-foreground">마우스 휠 클릭</strong>(중간 버튼)하면
          게임 상세 정보 모달이 열립니다.
        </p>
      </CardContent>
    </Card>

    <!-- 메타데이터 편집 -->
    <Card id="game-detail--metadata-edit" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <FileText :size="16" />
          메타데이터 편집
          <span
            v-if="isNewCard('game-detail--metadata-edit')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground mb-2 text-sm">
          상세 정보 모달에서 다음 항목을 직접 편집할 수 있습니다:
        </p>
        <ul class="text-muted-foreground flex flex-col gap-1 text-sm">
          <li>게임 제목</li>
          <li>번역 제목</li>
          <li>서클/제작자명</li>
          <li>카테고리</li>
          <li>발매일</li>
          <li>외부 ID (RJ번호, Steam ID 등)</li>
        </ul>
      </CardContent>
    </Card>

    <!-- 태그 관리 -->
    <Card id="game-detail--tags" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Tag :size="16" />
          태그 관리
          <span
            v-if="isNewCard('game-detail--tags')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          상세 정보 모달에서 태그를 추가하거나 제거할 수 있습니다. 태그를
          클릭하면 해당 태그로 검색되고,
          <kbd
            class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
            >×</kbd
          >
          버튼으로 태그를 제거합니다.
        </p>
      </CardContent>
    </Card>

    <!-- 평점 -->
    <Card id="game-detail--rating" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Star :size="16" />
          평점
          <span
            v-if="isNewCard('game-detail--rating')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          별점 1~5점으로 게임을 평가할 수 있습니다. 평점은 상세 정보 모달에서
          설정하며, 필터 패널의 정렬 기준으로도 사용할 수 있습니다.
        </p>
      </CardContent>
    </Card>

    <!-- 썸네일 관리 -->
    <Card id="game-detail--thumbnail" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Image :size="16" />
          썸네일 관리
          <span
            v-if="isNewCard('game-detail--thumbnail')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            <strong class="text-foreground">URL에서 설정</strong>: 웹 이미지
            URL로 썸네일을 설정합니다.
          </li>
          <li>
            <strong class="text-foreground">파일에서 설정</strong>: 로컬 이미지
            파일로 썸네일을 설정합니다.
          </li>
          <li>
            <strong class="text-foreground">썸네일 숨김</strong>: 우클릭
            메뉴에서 썸네일을 숨김 처리합니다.
          </li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
