<script setup lang="ts">
import { version as APP_VERSION } from "../../package.json";
import { CircleHelp, Minus, Moon, Square, Sun, X } from "lucide-vue-next";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast, Toaster } from "vue-sonner";
import BotBlockDialog from "./components/BotBlockDialog.vue";
import { Button } from "./components/ui/button";
import ChangelogDialog from "./components/ChangelogDialog.vue";
import HelpDialog from "./components/HelpDialog.vue";
import { initializeTheme } from "./composables/useTheme";
import { useWindow } from "./composables/useWindow";
import { queryKeys } from "./queryKeys";
import { useQueryClient } from "@tanstack/vue-query";
import { useUIStore } from "./stores/uiStore";

const {
  isMaximized,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
  setupWindowListeners,
} = useWindow();

const route = useRoute();
const router = useRouter();
const queryClient = useQueryClient();
const uiStore = useUIStore();

// 현재 경로가 홈인지 확인
const isHomePage = computed(() => route.path === "/");

// 게임 수가 있을 때만 표시
const showGameCount = computed(() => uiStore.gameCount > 0);

// 테마 아이콘
const themeIcon = computed(() => (uiStore.isDark ? Moon : Sun));

// 도움말 다이얼로그 상태
const showHelpDialog = ref(false);

// 체인지로그 다이얼로그 상태
const showChangelogDialog = ref(false);
const changelogMode = ref<"afterVersion" | "recent">("afterVersion");

// 봇 차단 다이얼로그 상태
const showBotBlockDialog = ref(false);
const botBlockGameTitle = ref("");

// 게임 세션 종료 이벤트 - 캐시 무효화
function onGameSessionEnded(data: {
  path: string;
  durationSeconds: number;
  totalPlayTime: number;
}) {
  queryClient.invalidateQueries({ queryKey: queryKeys.games.all });
  queryClient.invalidateQueries({ queryKey: queryKeys.playTime(data.path) });
  queryClient.invalidateQueries({
    queryKey: queryKeys.playSessions(data.path),
  });
}

onMounted(async () => {
  // 컬러 테마 초기화 (설정에서 불러오기)
  try {
    const result = await window.api.invoke("getAllSettings");
    const colorTheme = result.settings.colorTheme ?? "default";
    initializeTheme(colorTheme, uiStore.isDark);
  } catch (error) {
    console.error("테마 초기화 실패:", error);
  }

  // 기존 초기화 (다크 모드만 처리)
  uiStore.initializeTheme();
  setupWindowListeners();

  // ESC 키 전역 리스너 - 모달이 열려있지 않을 때 창 최소화
  const handleKeyDown = (event: KeyboardEvent) => {
    // F1 키로 도움말 열기
    if (event.key === "F1") {
      event.preventDefault();
      showHelpDialog.value = true;
      return;
    }

    if (event.key === "Escape") {
      // 열린 다이얼로그가 있는지 확인 (shadcn-vue/reka-ui Dialog)
      const openDialog = document.querySelector(
        '[role="dialog"][data-state="open"]',
      );
      if (!openDialog) {
        minimizeWindow();
      }
    }
  };
  document.addEventListener("keydown", handleKeyDown);

  // IPC Message 이벤트 리스너 - main 프로세스에서 오는 메시지를 toast로 표시
  window.api.on(
    "message",
    (data: {
      type: "info" | "success" | "error" | "warning";
      message: string;
    }) => {
      const { type, message } = data;
      switch (type) {
        case "success":
          toast.success(message);
          break;
        case "error":
          toast.error(message);
          break;
        case "warning":
          toast.warning(message);
          break;
        default:
          toast(message);
      }
    },
  );

  // 번역 진행률 이벤트 리스너 (전체 번역 진행 상태 표시용)
  window.api.on(
    "translationProgress",
    (data: { current: number; total: number; gameTitle: string }) => {
      const { current, total, gameTitle } = data;
      toast.info(`번역 중... (${current}/${total})`, {
        description: gameTitle,
        duration: 2000,
      });
    },
  );

  // 전체 번역 완료 이벤트
  window.api.on(
    "allTranslationsDone",
    (data: { total: number; success: number; failed: number }) => {
      const { success, failed } = data;
      toast.success("전체 번역 완료", {
        description: `성공: ${success}, 실패: ${failed}`,
      });
    },
  );

  // 업데이트 발견 시 토스트 표시 (포터블/일반 분기)
  window.api.on(
    "updateAvailable",
    (data: { version: string; releaseDate: string; isPortable: boolean }) => {
      if (data.isPortable) {
        // 포터블: GitHub Releases 페이지로 안내
        toast.info(`새 버전 v${data.version}을 사용할 수 있습니다`, {
          description: "포터블 버전은 자동 업데이트를 지원하지 않습니다",
          duration: Infinity,
          action: {
            label: "다운로드 페이지",
            onClick: async () => {
              await window.api.invoke("downloadUpdate"); // AutoUpdater가 shell.openExternal 호출
            },
          },
        });
        toast(`업데이트 내역 보기`, {
          id: "changelog-hint",
          duration: Infinity,
          action: {
            label: "확인하기",
            onClick: () => {
              toast.dismiss("changelog-hint");
              changelogMode.value = "afterVersion";
              showChangelogDialog.value = true;
            },
          },
        });
      } else {
        // 일반: 자동 다운로드→설치
        toast.info(`새 버전 v${data.version}을 사용할 수 있습니다`, {
          description: "설치하기를 누르면 자동으로 다운로드 후 재시작합니다",
          duration: Infinity,
          action: {
            label: "설치하기",
            onClick: async () => {
              await window.api.invoke("downloadUpdate");
            },
          },
        });
        toast(`업데이트 내역 보기`, {
          id: "changelog-hint",
          duration: Infinity,
          action: {
            label: "확인하기",
            onClick: () => {
              toast.dismiss("changelog-hint");
              changelogMode.value = "afterVersion";
              showChangelogDialog.value = true;
            },
          },
        });
      }
    },
  );

  // 다운로드 진행률 표시 (일반 버전만)
  window.api.on(
    "updateDownloadProgress",
    (data: { percent: number; transferred: number; total: number }) => {
      toast.info(`업데이트 다운로드 중... ${data.percent.toFixed(0)}%`, {
        id: "update-download",
        duration: Infinity,
      });
    },
  );

  // 다운로드 완료 시 자동 설치 (일반 버전만)
  window.api.on("updateDownloaded", (data: { version: string }) => {
    toast.dismiss("update-download");
    toast.success(`v${data.version} 다운로드 완료! 앱을 재시작합니다.`, {
      duration: 2000,
    });
    setTimeout(() => {
      window.api.invoke("installUpdate");
    }, 2000);
  });

  // 업데이트 오류
  window.api.on("updateError", (data: { error: string }) => {
    toast.error("업데이트 오류", {
      description: data.error,
    });
  });

  // 봇 차단 감지 이벤트
  window.api.on(
    "botBlockDetected",
    (data: { gamePath: string; gameTitle: string }) => {
      botBlockGameTitle.value = data.gameTitle;
      showBotBlockDialog.value = true;
    },
  );

  window.api.on("gameSessionEnded", onGameSessionEnded);
});

// 언마운트 시 이벤트 리스너 정리
onUnmounted(() => {
  window.api.removeListener("gameSessionEnded", onGameSessionEnded);
});
</script>

<template>
  <div class="bg-background text-foreground flex h-screen flex-col">
    <!-- 커스텀 타이틀 바 -->
    <div
      class="bg-muted drag-region flex h-8 items-center justify-between select-none"
    >
      <!-- 왼쪽: 타이틀 + 게임 수 -->
      <div class="flex items-center gap-4 px-2">
        <span class="text-sm font-medium">야식메뉴판 Plus</span>
        <span v-if="showGameCount" class="text-muted-foreground text-xs">
          총 {{ uiStore.gameCount }}개
        </span>
      </div>

      <!-- 오른쪽: 도움말 + 테마 토글 + 윈도우 컨트롤 -->
      <div class="no-drag flex items-center">
        <!-- 도움말 버튼 -->
        <Button
          @click="router.push('/help')"
          variant="ghost"
          size="icon-sm"
          title="도움말"
        >
          <CircleHelp :size="14" />
        </Button>
        <!-- 테마 토글 버튼 -->
        <Button
          @click="uiStore.toggleTheme"
          variant="ghost"
          size="icon-sm"
          :title="uiStore.isDark ? '라이트 모드' : '다크 모드'"
        >
          <component :is="themeIcon" :size="14" />
        </Button>
        <button
          @click="minimizeWindow"
          class="hover:bg-muted-foreground/20 flex h-8 w-11 items-center justify-center transition-colors"
          title="최소화"
        >
          <Minus :size="14" />
        </button>
        <button
          @click="toggleMaximizeWindow"
          class="hover:bg-muted-foreground/20 flex h-8 w-11 items-center justify-center transition-colors"
          :title="isMaximized ? '복원' : '최대화'"
        >
          <Square :size="12" />
        </button>
        <button
          @click="closeWindow"
          class="hover:bg-destructive flex h-8 w-11 items-center justify-center transition-colors hover:text-white"
          title="닫기"
        >
          <X :size="14" />
        </button>
      </div>
    </div>

    <!-- 메인 콘텐츠 -->
    <div class="flex-1 overflow-hidden">
      <RouterView />
    </div>

    <!-- Toaster -->
    <Toaster rich-colors position="top-center" />

    <!-- 도움말 다이얼로그 -->
    <HelpDialog v-model:open="showHelpDialog" />

    <!-- 체인지로그 다이얼로그 -->
    <ChangelogDialog
      v-model:open="showChangelogDialog"
      :current-version="APP_VERSION"
      :mode="changelogMode"
    />

    <!-- 봇 차단 다이얼로그 -->
    <BotBlockDialog
      v-model:open="showBotBlockDialog"
      :game-title="botBlockGameTitle"
    />
  </div>
</template>

<style scoped>
.drag-region {
  -webkit-app-region: drag;
}

.no-drag {
  -webkit-app-region: no-drag;
}
</style>
