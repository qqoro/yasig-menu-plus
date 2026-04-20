<script setup lang="ts">
import { Palette, Languages, FileX, RefreshCw, Bug } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsNewCard } from "@/composables/useHelpRedDot";

const isNewCard = useIsNewCard();
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">설정 안내</h2>
    <p class="text-muted-foreground text-sm">
      설정 페이지에서 앱의 다양한 옵션을 관리할 수 있습니다.
    </p>

    <!-- 테마 -->
    <Card id="settings--theme" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Palette :size="16" />
          테마
          <span
            v-if="isNewCard('settings--theme')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            <strong class="text-foreground">라이트/다크 모드</strong>:
            타이틀바의 테마 토글 버튼으로 전환합니다.
          </li>
          <li>
            <strong class="text-foreground">컬러 테마</strong>: 설정에서 다양한
            컬러 테마를 선택할 수 있습니다.
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 번역 -->
    <Card id="settings--translation" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Languages :size="16" />
          번역 설정
          <span
            v-if="isNewCard('settings--translation')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            <strong class="text-foreground">자동 번역</strong>: Google 번역을
            통해 게임 제목을 자동으로 번역합니다.
          </li>
          <li>
            <strong class="text-foreground">번역 언어</strong>: 번역할 대상
            언어를 설정할 수 있습니다.
          </li>
          <li>
            <strong class="text-foreground">전체 번역</strong>: 홈 툴바나 우클릭
            메뉴에서 모든 게임의 제목을 일괄 번역할 수 있습니다.
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 제외 실행파일 -->
    <Card id="settings--excluded-exe" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <FileX :size="16" />
          제외 실행파일
          <span
            v-if="isNewCard('settings--excluded-exe')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          스캔 시 특정 실행파일을 제외할 수 있습니다. 설정에서 제외할 파일명을
          추가하면 해당 파일은 게임으로 인식되지 않습니다.
        </p>
      </CardContent>
    </Card>

    <!-- 자동 업데이트 -->
    <Card id="settings--auto-update" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <RefreshCw :size="16" />
          자동 업데이트
          <span
            v-if="isNewCard('settings--auto-update')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>새 버전이 출시되면 자동으로 감지하고 알림을 표시합니다.</li>
          <li>
            <strong class="text-foreground">인스톨러 버전</strong>: 알림에서
            설치하기를 누르면 자동 다운로드 후 재시작합니다.
          </li>
          <li>
            <strong class="text-foreground">포터블 버전</strong>: GitHub
            Releases 페이지로 안내합니다.
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 디버그 데이터 내보내기 -->
    <Card id="settings--debug-export" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Bug :size="16" />
          디버그 데이터 내보내기
          <span
            v-if="isNewCard('settings--debug-export')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          설정 → 시스템에서
          <strong class="text-foreground">디버그 데이터 내보내기</strong>로 진단
          정보를 파일로 저장할 수 있습니다. 버그 제보 시 첨부하면 문제 해결에
          도움이 됩니다.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
