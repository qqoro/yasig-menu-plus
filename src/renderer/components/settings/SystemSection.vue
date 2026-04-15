<script setup lang="ts">
import { version as APP_VERSION } from "../../../../package.json";
import { computed, ref } from "vue";
import {
  Bug,
  Download,
  Github,
  History,
  Info,
  Loader2,
  RefreshCw,
  Star,
} from "lucide-vue-next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "vue-sonner";
import ChangelogDialog from "@/components/ChangelogDialog.vue";
import {
  useAllSettings,
  useUpdateSettings,
} from "@/composables/useAllSettings";
import { useAutoUpdate } from "@/composables/useAutoUpdate";
import { formatBytes } from "@/utils/format";

// 통합 설정
const { data: settings } = useAllSettings();
const updateSettingsMutation = useUpdateSettings();

// 자동 업데이트 관련
const {
  status: updateStatus,
  updateInfo,
  progress: downloadProgress,
  error: updateError,
  isPortable,
  isUpdateAvailable,
  isReadyToInstall,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  isCheckPending,
  isDownloadPending,
  hasError: hasUpdateError,
} = useAutoUpdate();

// 자동 업데이트 설정
const checkOnStartup = computed({
  get: () => settings.value?.autoUpdateSettings?.checkOnStartup ?? true,
  set: (value) => {
    updateSettingsMutation.mutate({
      autoUpdateSettings: {
        ...settings.value?.autoUpdateSettings,
        checkOnStartup: value,
      },
    });
  },
});

const isChecking = computed(() => updateStatus.value === "checking");
const isDownloading = computed(() => updateStatus.value === "downloading");

// 체인지로그 다이얼로그 상태
const changelogOpen = ref(false);

// 디버그 데이터 내보내기
const showExportDialog = ref(false);
const includeDb = ref(true);
const isExporting = ref(false);

async function handleExport() {
  isExporting.value = true;
  try {
    const result = await window.api.invoke("exportDebugData", {
      includeDb: includeDb.value,
    });
    if (result) {
      toast.success("디버그 데이터를 내보냈습니다.");
    }
  } catch (error) {
    toast.error(
      "내보내기 실패: " +
        (error instanceof Error ? error.message : String(error)),
    );
  } finally {
    isExporting.value = false;
    showExportDialog.value = false;
  }
}

async function handleOpenGitHubIssue() {
  toast.info("이슈 본문이 클립보드에 복사되었습니다. 붙여넣기 해주세요.");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await window.api.invoke("openGitHubIssue");
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 섹션 헤더 -->
    <div class="flex items-center gap-2">
      <Info :size="20" class="text-muted-foreground" />
      <h2 class="text-lg font-semibold">정보</h2>
    </div>

    <!-- 카드 그리드 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <!-- 업데이트 설정 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">업데이트</CardTitle>
          <CardDescription class="text-sm">
            앱 업데이트 확인 및 설치
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
          <!-- 현재 버전 -->
          <div class="text-muted-foreground text-sm">
            현재 버전: {{ APP_VERSION }}
          </div>

          <!-- 자동 확인 설정 -->
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <label class="text-sm leading-none font-medium"
                >시작 시 자동 확인</label
              >
              <p class="text-muted-foreground text-xs">
                앱 시작 시 업데이트를 자동으로 확인합니다
              </p>
            </div>
            <Switch v-model="checkOnStartup" />
          </div>

          <!-- 상태 표시 -->
          <div
            v-if="isChecking || isCheckPending"
            class="flex items-center gap-2"
          >
            <Loader2 class="h-4 w-4 animate-spin" />
            <span class="text-sm">업데이트 확인 중...</span>
          </div>

          <div v-else-if="isDownloading || isDownloadPending" class="space-y-2">
            <div class="flex items-center gap-2">
              <Loader2 class="h-4 w-4 animate-spin" />
              <span class="text-sm">다운로드 중...</span>
            </div>
            <div v-if="downloadProgress" class="space-y-1">
              <div class="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  class="bg-primary h-full transition-all"
                  :style="{
                    width: `${downloadProgress.percent}%`,
                  }"
                ></div>
              </div>
              <div class="text-muted-foreground flex justify-between text-xs">
                <span>{{ downloadProgress.percent.toFixed(1) }}%</span>
                <span>
                  {{ formatBytes(downloadProgress.transferred) }} /
                  {{ formatBytes(downloadProgress.total) }}
                </span>
              </div>
            </div>
          </div>

          <div v-else-if="isReadyToInstall" class="space-y-2">
            <div class="text-sm text-green-500">
              v{{ updateInfo?.version }} 다운로드 완료
            </div>
            <Button @click="installUpdate" variant="default" class="w-full">
              지금 재시작하여 설치
            </Button>
          </div>

          <div
            v-else-if="updateStatus === 'not-available'"
            class="text-muted-foreground text-sm"
          >
            최신 버전입니다.
          </div>

          <div v-else-if="hasUpdateError" class="text-destructive text-sm">
            오류: {{ updateError }}
          </div>

          <!-- 업데이트 있음 (포터블 안내) -->
          <div
            v-if="isPortable && isUpdateAvailable"
            class="bg-muted/50 rounded-md p-3"
          >
            <p class="text-sm">
              포터블 버전은 자동 업데이트가 지원되지 않습니다.
            </p>
            <Button
              @click="downloadUpdate"
              variant="outline"
              class="mt-2 w-full"
            >
              <Download :size="16" />
              다운로드 페이지 열기
            </Button>
          </div>

          <!-- 업데이트 있음 (설치 버전) -->
          <div v-else-if="!isPortable && isUpdateAvailable" class="space-y-2">
            <div class="text-sm">
              새 버전 v{{ updateInfo?.version }}을(를) 사용할 수 있습니다.
            </div>
            <Button
              @click="downloadUpdate"
              :disabled="isDownloading || isDownloadPending"
              variant="default"
              class="w-full"
            >
              <Download :size="16" />
              다운로드
            </Button>
          </div>

          <!-- 버튼 그룹 -->
          <div
            v-if="
              !isChecking &&
              !isDownloading &&
              !isReadyToInstall &&
              !isCheckPending &&
              !isDownloadPending
            "
            class="flex gap-2"
          >
            <Button @click="checkForUpdates" variant="secondary" class="flex-1">
              <RefreshCw class="h-4 w-4" />
              업데이트 확인
            </Button>
            <Button
              @click="changelogOpen = true"
              variant="outline"
              class="flex-1"
            >
              <History :size="16" />
              업데이트 내역
            </Button>
          </div>
        </CardContent>
      </Card>

      <!-- GitHub 링크 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">GitHub</CardTitle>
          <CardDescription class="text-sm">
            프로젝트 저장소에서 소스 코드를 확인하거나 이슈를 등록할 수
            있습니다. 유용하게 사용하셨다면 Star를 눌러 응원해주세요!
          </CardDescription>
        </CardHeader>
        <CardContent>
          <a
            href="https://github.com/qqoro/yasig-menu-plus"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" class="w-full">
              <Star :size="18" />
              Star 하기
            </Button>
          </a>
        </CardContent>
      </Card>

      <!-- 문제 제보 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">문제 제보</CardTitle>
          <CardDescription class="text-sm">
            문제 발생 시 진단 데이터를 파일로 내보내거나 GitHub 이슈로 등록할 수
            있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-2">
          <Button
            @click="showExportDialog = true"
            :disabled="isExporting"
            variant="outline"
            class="w-full"
          >
            <Loader2 v-if="isExporting" :size="16" class="animate-spin" />
            <Bug v-else :size="16" />
            디버그 데이터 내보내기
          </Button>
          <Button
            @click="handleOpenGitHubIssue"
            variant="outline"
            class="w-full"
          >
            <Github :size="16" />
            GitHub 이슈 등록하기
          </Button>
        </CardContent>
      </Card>
    </div>

    <!-- 내보내기 확인 다이얼로그 -->
    <Dialog v-model:open="showExportDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>문제 해결 데이터 내보내기</DialogTitle>
          <DialogDescription>
            시스템 정보, 설정, 로그가 포함된 파일을 생성합니다.
          </DialogDescription>
        </DialogHeader>
        <div class="flex items-center gap-2">
          <Checkbox
            :checked="includeDb"
            @update:checked="includeDb = $event"
            id="includeDb"
          />
          <label for="includeDb" class="cursor-pointer text-sm"
            >데이터베이스 포함</label
          >
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showExportDialog = false"
            >취소</Button
          >
          <Button @click="handleExport" :disabled="isExporting"
            >내보내기</Button
          >
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 체인지로그 다이얼로그 -->
    <ChangelogDialog
      v-model:open="changelogOpen"
      :current-version="APP_VERSION"
    />
  </div>
</template>
