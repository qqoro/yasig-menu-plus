<script setup lang="ts">
import { Bot, Plug, Power, TriangleAlert } from "lucide-vue-next";
import { computed } from "vue";
import CodeBlock from "@/components/CodeBlock.vue";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAllSettings } from "@/composables/useAllSettings";
import { useIsNewCard } from "@/composables/useHelpRedDot";
import {
  buildClaudeCodeCommand,
  buildClaudeDesktopConfig,
  buildCodexCommand,
  buildMcpUrl,
} from "@/lib/mcp-commands";

const isNewCard = useIsNewCard();
const { data: settings } = useAllSettings();

// 사용자 설정 포트를 예시에 그대로 넣어 복사해 쓸 수 있게 한다
const port = computed(() => settings.value?.mcpSettings?.port ?? 38210);
const url = computed(() => buildMcpUrl(port.value));
const claudeCodeCommand = computed(() => buildClaudeCodeCommand(url.value));
const codexCommand = computed(() => buildCodexCommand(url.value));
const desktopConfig = computed(() => buildClaudeDesktopConfig(url.value));
</script>

<template>
  <div class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">AI 연동</h2>
    <p class="text-muted-foreground text-sm">
      Claude Code, Codex CLI 같은 AI 클라이언트를 이 앱에 연결해 게임 목록을
      조회하고 메타데이터를 정리할 수 있습니다.
    </p>

    <!-- 개요 -->
    <Card id="ai-integration--overview" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Bot :size="16" />
          무엇을 할 수 있나
          <span
            v-if="isNewCard('ai-integration--overview')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            <strong class="text-foreground">조회</strong>: 검색, 상세 정보,
            태그·제작사·카테고리 목록, 중복 게임, TSV 내보내기
          </li>
          <li>
            <strong class="text-foreground">메타데이터 수정</strong>:
            제목·발매일·메모, 별점, 태그·제작사·카테고리 추가/제거, 실행 파일
            지정, 썸네일
          </li>
          <li>
            <strong class="text-foreground">라이브러리</strong>: 재스캔,
            라이브러리 폴더 추가, 실행 제외 목록
          </li>
          <li>
            게임 실행·삭제·이름 변경·정보 수집은 AI에게 열려 있지 않습니다.
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 켜기 -->
    <Card id="ai-integration--enable" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Power :size="16" />
          켜는 방법
          <span
            v-if="isNewCard('ai-integration--enable')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>
            설정 → <strong class="text-foreground">AI 연동</strong> → "AI 연동
            켜기"
          </li>
          <li>기본은 꺼져 있고, 켠 동안만 아래 주소가 열립니다.</li>
          <li class="flex flex-col gap-1">
            <span>현재 주소</span>
            <CodeBlock :code="url" copied-message="URL을 복사했습니다." />
          </li>
        </ul>
      </CardContent>
    </Card>

    <!-- 클라이언트 등록 -->
    <Card id="ai-integration--connect" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <Plug :size="16" />
          클라이언트 등록
          <span
            v-if="isNewCard('ai-integration--connect')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent class="flex flex-col gap-3 text-sm">
        <div class="flex flex-col gap-1">
          <strong class="text-foreground">Claude Code</strong>
          <CodeBlock :code="claudeCodeCommand" />
        </div>
        <div class="flex flex-col gap-1">
          <strong class="text-foreground">Codex CLI</strong>
          <CodeBlock :code="codexCommand" />
        </div>
        <div class="flex flex-col gap-1">
          <strong class="text-foreground"
            >Cursor 등 HTTP MCP 지원 클라이언트</strong
          >
          <span class="text-muted-foreground"
            >설정의 MCP 서버 추가에서 위 주소를 입력합니다.</span
          >
        </div>
        <div class="flex flex-col gap-1">
          <strong class="text-foreground">Claude Desktop</strong>
          <span class="text-muted-foreground">
            커스텀 커넥터(URL)는 Anthropic 서버에서 접속하므로 이 PC의 주소에
            닿지 않습니다. 대신
            <code class="bg-muted rounded px-1">claude_desktop_config.json</code
            >에 아래를 추가합니다. Node.js가 설치돼 있어야 합니다.
          </span>
          <CodeBlock :code="desktopConfig" />
        </div>
      </CardContent>
    </Card>

    <!-- 주의 -->
    <Card id="ai-integration--notes" class="gap-2">
      <CardHeader class="pb-2">
        <CardTitle class="flex items-center gap-2 text-sm">
          <TriangleAlert :size="16" />
          주의
          <span
            v-if="isNewCard('ai-integration--notes')"
            class="bg-destructive/15 text-destructive rounded px-1 text-[10px] font-semibold"
          >
            NEW
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul class="text-muted-foreground flex flex-col gap-1.5 text-sm">
          <li>앱이 켜져 있어야 동작합니다.</li>
          <li>
            재스캔은 라이브러리가 크면 AI 클라이언트 쪽에서 시간 초과가 날 수
            있지만, 스캔 자체는 끝까지 진행됩니다.
          </li>
          <li>
            이 PC 안에서만 접속할 수 있지만 같은 PC의 다른 프로그램도 접근할 수
            있으니, 쓰지 않을 때는 꺼 두세요.
          </li>
          <li>AI가 수정한 내용은 앱 화면에 바로 반영됩니다.</li>
        </ul>
      </CardContent>
    </Card>
  </div>
</template>
