<script setup lang="ts">
import { FolderPlus, RefreshCw, FolderTree, Sparkles } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsNewCard } from "@/composables/useHelpRedDot";

const isNewCard = useIsNewCard();
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">시작하기</h2>
    <p class="text-muted-foreground text-sm">
      야식메뉴판 Plus를 처음 사용할 때 필요한 기본 설정을 안내합니다.
    </p>

    <!-- 1단계: 라이브러리 경로 추가 -->
    <Card id="getting-started--library-path" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <FolderPlus :size="16" />
          1. 라이브러리 경로 추가
          <span
            v-if="isNewCard('getting-started--library-path')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            화면 우측 상단의
            <strong class="text-foreground">설정 아이콘</strong>을 클릭합니다.
          </li>
          <li>
            <strong class="text-foreground">라이브러리 경로</strong> 섹션에서
            <strong class="text-foreground">경로 추가</strong> 버튼을 누릅니다.
          </li>
          <li>게임이 있는 폴더를 선택합니다.</li>
          <li>여러 폴더를 추가할 수 있습니다.</li>
        </ol>
      </CardContent>
    </Card>

    <!-- 2단계: 첫 스캔 -->
    <Card id="getting-started--first-scan" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <RefreshCw :size="16" />
          2. 첫 스캔 실행
          <span
            v-if="isNewCard('getting-started--first-scan')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          홈 화면 상단 툴바의
          <strong class="text-foreground">새로고침 버튼</strong>을 누르면 추가된
          경로에서 게임을 자동으로 스캔합니다. 설정에서
          <strong class="text-foreground">시작 시 자동 스캔</strong>을
          활성화하면 앱 실행 시마다 자동으로 스캔합니다.
        </p>
      </CardContent>
    </Card>

    <!-- 3단계: 폴더 구조 -->
    <Card id="getting-started--folder-structure" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <FolderTree :size="16" />
          3. 폴더 구조 권장사항
          <span
            v-if="isNewCard('getting-started--folder-structure')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            <strong class="text-foreground">게임별 개별 폴더</strong> 구조를
            권장합니다.
          </li>
          <li>
            폴더명에 접두어(예:
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-8 items-center justify-center rounded border px-1.5 py-0.5 text-xs font-medium"
              >RJ123456</kbd
            >)를 포함하면 자동으로 정보를 수집합니다.
          </li>
          <li>압축 파일도 인식됩니다 (ZIP, RAR, 7z 등).</li>
          <li>
            설정에서 <strong class="text-foreground">스캔 깊이</strong>를 조절할
            수 있습니다 (기본값: 5).
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 4단계: 자동 수집 -->
    <Card id="getting-started--auto-collect" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Sparkles :size="16" />
          4. 자동 정보 수집
          <span
            v-if="isNewCard('getting-started--auto-collect')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p class="text-muted-foreground text-sm">
          스캔 시 폴더/파일명에서 접두어를 인식하여 썸네일과 메타데이터를
          자동으로 수집합니다. 자세한 내용은
          <strong class="text-foreground">썸네일 수집</strong> 섹션을
          참고하세요.
        </p>
      </CardContent>
    </Card>
  </div>
</template>
