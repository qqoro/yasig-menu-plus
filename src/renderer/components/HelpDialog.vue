<script setup lang="ts">
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CircleHelp, Keyboard, Mouse, Package, Search } from "lucide-vue-next";

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: "update:open", value: boolean): void;
}>();

// 사용법
const usageSteps = [
  "설정에서 게임이 있는 폴더를 라이브러리 경로로 추가하세요",
  "폴더명에 접두어를 포함하면 자동으로 썸네일·메타데이터를 수집합니다",
  "게임 카드를 더블클릭하면 이미지 캐러셀을 볼 수 있습니다",
  "우클릭 메뉴로 게임 실행, 정보 수정, 새로고침 등을 할 수 있습니다",
];

// 키보드 단축키
const keyboardShortcuts = [
  { key: "F1", description: "도움말 열기" },
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

// 콜렉터 정보
const collectors = [
  { prefix: "ST", description: "Steam" },
  { prefix: "RJ, BJ, VJ", description: "DLSite" },
  { prefix: "GC, GETCHU", description: "Getchu" },
  { prefix: "CE, CIEN", description: "Ci-en" },
];
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="max-h-[80vh] max-w-2xl overflow-y-auto">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <CircleHelp class="size-5" />
          도움말
        </DialogTitle>
      </DialogHeader>

      <div class="flex flex-col gap-4">
        <!-- 사용법 -->
        <Card>
          <CardHeader class="pb-0">
            <CardTitle class="flex items-center gap-2 text-base">
              <Package class="size-4" />
              사용법
            </CardTitle>
          </CardHeader>
          <CardContent class="pt-0">
            <ol class="text-muted-foreground flex flex-col gap-1.5 text-sm">
              <li v-for="(step, index) in usageSteps" :key="index">
                {{ index + 1 }}. {{ step }}
              </li>
            </ol>
          </CardContent>
        </Card>

        <!-- 정보 자동 수집 -->
        <Card>
          <CardHeader class="pb-0">
            <CardTitle class="flex items-center gap-2 text-base">
              <Search class="size-4" />
              정보 자동 수집
            </CardTitle>
          </CardHeader>
          <CardContent class="pt-0">
            <p class="text-muted-foreground mb-3 text-sm">
              폴더/파일명에 아래 접두어가 포함되면 자동으로 정보를 수집합니다
            </p>
            <div class="flex flex-col gap-2">
              <div
                v-for="collector in collectors"
                :key="collector.prefix"
                class="flex items-center justify-between"
              >
                <span class="text-muted-foreground text-sm">{{
                  collector.description
                }}</span>
                <kbd
                  class="bg-muted text-muted-foreground inline-flex min-w-12 items-center justify-center rounded border px-2 py-0.5 text-xs font-medium"
                >
                  {{ collector.prefix }}
                </kbd>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 키보드 단축키 -->
        <Card>
          <CardHeader class="pb-0">
            <CardTitle class="flex items-center gap-2 text-base">
              <Keyboard class="size-4" />
              키보드 단축키
            </CardTitle>
          </CardHeader>
          <CardContent class="pt-0">
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
        <Card>
          <CardHeader class="pb-0">
            <CardTitle class="flex items-center gap-2 text-base">
              <Mouse class="size-4" />
              마우스 인터랙션
            </CardTitle>
          </CardHeader>
          <CardContent class="pt-0">
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

      <div class="flex justify-end">
        <Button @click="emit('update:open', false)"> 확인 </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
