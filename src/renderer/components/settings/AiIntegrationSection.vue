<script setup lang="ts">
import { Bot, CircleHelp } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import CodeBlock from "@/components/CodeBlock.vue";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useAllSettings,
  useUpdateSettings,
} from "@/composables/useAllSettings";
import { useMcpStatus } from "@/composables/useMcpStatus";
import {
  buildClaudeCodeCommand,
  buildCodexCommand,
  buildMcpUrl,
} from "@/lib/mcp-commands";

const MCP_DEFAULT_PORT = 38210;
const MCP_PORT_MIN = 1024;
const MCP_PORT_MAX = 65535;

const { data: settings } = useAllSettings();
const updateSettingsMutation = useUpdateSettings();
const { data: status } = useMcpStatus();

// 포트 (저장값과 입력값 분리: 범위 밖 입력은 되돌린다)
const port = computed(
  () => settings.value?.mcpSettings?.port ?? MCP_DEFAULT_PORT,
);

const portInput = ref<string | number>(port.value);
watch(port, (val) => {
  portInput.value = val;
});

/**
 * 입력 중인 포트를 검증한다. 범위 밖이면 토스트 후 저장값으로 되돌리고 null 반환
 */
function validatePortInput(): number | null {
  const num = Number(portInput.value);
  if (!Number.isInteger(num) || num < MCP_PORT_MIN || num > MCP_PORT_MAX) {
    toast.error(
      `포트는 ${MCP_PORT_MIN}~${MCP_PORT_MAX} 사이의 정수여야 합니다.`,
    );
    portInput.value = port.value;
    return null;
  }
  return num;
}

// 켜기/끄기 (입력창에 입력 중인 포트를 함께 저장)
const enabled = computed({
  get: () => settings.value?.mcpSettings?.enabled ?? false,
  set: (value: boolean) => {
    const num = validatePortInput();
    if (num === null) return;
    updateSettingsMutation.mutate({
      mcpSettings: { enabled: value, port: num },
    });
  },
});

function handlePortChange() {
  const num = validatePortInput();
  if (num === null) return;
  if (num === port.value) return;
  updateSettingsMutation.mutate({
    mcpSettings: { enabled: enabled.value, port: num },
  });
}

// 표시용 URL: 서버가 떠 있으면 실제 URL, 아니면 설정 포트 기준
const url = computed(() =>
  status.value?.running ? status.value.url : buildMcpUrl(port.value),
);

// 도움말까지 가지 않아도 바로 붙여 넣을 수 있는 등록 명령
const claudeCodeCommand = computed(() => buildClaudeCodeCommand(url.value));
const codexCommand = computed(() => buildCodexCommand(url.value));

const statusLabel = computed(() => {
  if (!enabled.value) return "꺼짐";
  if (status.value?.running) return "실행 중";
  if (status.value?.error) return `오류: ${status.value.error}`;
  return "시작 중...";
});
</script>

<template>
  <section class="flex flex-col gap-4">
    <h2 class="text-lg font-semibold">AI 연동</h2>
    <Card>
      <CardHeader class="pb-4">
        <CardTitle class="flex items-center gap-2 text-lg">
          <Bot :size="18" />
          MCP 서버
        </CardTitle>
        <CardDescription class="text-sm">
          Claude Code, Codex 같은 AI 클라이언트가 이 앱의 게임 목록을 조회하고
          메타데이터를 수정할 수 있게 합니다. 이 PC 안에서만 접속할 수 있습니다.
        </CardDescription>
      </CardHeader>
      <CardContent class="flex flex-col gap-4">
        <!-- 켜기/끄기 -->
        <div class="flex items-center justify-between">
          <div class="space-y-0.5">
            <label class="text-sm leading-none font-medium">AI 연동 켜기</label>
            <p class="text-muted-foreground text-xs">
              켜면 아래 주소로 MCP 서버가 열립니다. 필요할 때만 켜세요.
            </p>
          </div>
          <Switch v-model="enabled" />
        </div>

        <!-- 포트 -->
        <div class="flex items-center justify-between gap-4">
          <div class="space-y-0.5">
            <label class="text-sm leading-none font-medium">포트</label>
            <p class="text-muted-foreground text-xs">
              {{ MCP_PORT_MIN }}~{{ MCP_PORT_MAX }}. 바꾸면 서버가 다시
              시작됩니다.
            </p>
          </div>
          <Input
            v-model="portInput"
            type="number"
            class="w-28"
            :min="MCP_PORT_MIN"
            :max="MCP_PORT_MAX"
            @change="handlePortChange"
            @keydown.enter="handlePortChange"
          />
        </div>

        <!-- 접속 주소 -->
        <div class="flex flex-col gap-1.5">
          <label class="text-sm leading-none font-medium">접속 주소</label>
          <CodeBlock :code="url" copied-message="URL을 복사했습니다." />
        </div>

        <!-- 상태 -->
        <div class="flex items-center justify-between">
          <span class="text-sm">상태</span>
          <span
            class="text-sm"
            :class="
              status?.error && enabled
                ? 'text-destructive'
                : 'text-muted-foreground'
            "
          >
            {{ statusLabel }}
          </span>
        </div>

        <!-- 클라이언트 등록 -->
        <div class="flex flex-col gap-2">
          <div class="space-y-0.5">
            <label class="text-sm leading-none font-medium">
              클라이언트 등록
            </label>
            <p class="text-muted-foreground text-xs">
              터미널에서 아래 명령을 한 번 실행하면 연결됩니다.
            </p>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium">Claude Code</span>
            <CodeBlock :code="claudeCodeCommand" />
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs font-medium">Codex CLI</span>
            <CodeBlock :code="codexCommand" />
          </div>
          <RouterLink to="/help#ai-integration" class="self-start">
            <Button variant="link" size="sm" class="h-auto p-0">
              <CircleHelp :size="14" />
              Claude Desktop, Cursor 등 다른 클라이언트 등록 방법 보기
            </Button>
          </RouterLink>
        </div>
      </CardContent>
    </Card>
  </section>
</template>
