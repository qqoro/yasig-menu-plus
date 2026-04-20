<script setup lang="ts">
import { Keyboard, Mouse } from "lucide-vue-next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsNewCard } from "@/composables/useHelpRedDot";

const isNewCard = useIsNewCard();

// 키보드 단축키
const keyboardShortcuts = [
  { key: "F1", description: "도움말 열기 (치트시트)" },
  { key: "ESC", description: "모달이 없을 때 창 최소화 / 다중 선택 해제" },
  { key: "Ctrl+F", description: "검색창 포커스" },
  { key: "Ctrl+A", description: "전체 선택 / 해제 (검색창 외)" },
  { key: "Ctrl+휠", description: "게임 카드 줌 인/아웃 (1~10단계)" },
  { key: "Ctrl+Space", description: "검색 자동완성 표시" },
  { key: "Tab", description: "자동완성 다음 항목 선택" },
  { key: "Enter", description: "자동완성 선택" },
  { key: "← / →", description: "이미지 캐러셀 네비게이션" },
];

// 마우스 인터랙션
const mouseInteractions = [
  {
    action: "게임 카드 더블클릭",
    description: "이미지 캐러셀 다이얼로그 열기",
  },
  { action: "게임 카드 휠 클릭", description: "게임 상세 정보 모달 열기" },
  { action: "Ctrl+클릭", description: "다중 선택 모드 진입 / 개별 선택·해제" },
  { action: "Shift+클릭", description: "범위 선택 (마지막 선택~현재)" },
  { action: "우클릭", description: "컨텍스트 메뉴" },
  { action: "태그·서클·카테고리 우클릭", description: "제외 검색 토글" },
  { action: "이미지 캐러셀 클릭", description: "다이얼로그 닫기" },
  { action: "이미지 캐러셀 휠", description: "이전/다음 이미지 이동" },
];
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">단축키 참조</h2>
    <p class="text-muted-foreground text-sm">
      빠른 조작을 위한 단축키와 마우스 인터랙션 목록입니다.
    </p>

    <!-- 키보드 단축키 -->
    <Card id="shortcuts--keyboard" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Keyboard :size="16" />
          키보드 단축키
          <span
            v-if="isNewCard('shortcuts--keyboard')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="flex flex-col gap-2">
          <div
            v-for="shortcut in keyboardShortcuts"
            :key="shortcut.key"
            class="flex items-center justify-between"
          >
            <span class="text-muted-foreground text-sm">{{
              shortcut.description
            }}</span>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-12 items-center justify-center rounded border px-2 py-0.5 text-xs font-medium"
            >
              {{ shortcut.key }}
            </kbd>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- 마우스 인터랙션 -->
    <Card id="shortcuts--mouse" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Mouse :size="16" />
          마우스 인터랙션
          <span
            v-if="isNewCard('shortcuts--mouse')"
            class="bg-primary/15 text-primary rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div class="flex flex-col gap-2">
          <div
            v-for="interaction in mouseInteractions"
            :key="interaction.action"
            class="flex items-center justify-between"
          >
            <span class="text-muted-foreground text-sm">{{
              interaction.description
            }}</span>
            <kbd
              class="bg-muted text-muted-foreground inline-flex min-w-12 items-center justify-center rounded border px-2 py-0.5 text-xs font-medium"
            >
              {{ interaction.action }}
            </kbd>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
