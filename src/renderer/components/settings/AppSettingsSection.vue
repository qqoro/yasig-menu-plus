<script setup lang="ts">
import { Cookie, Folder, Loader2, Palette, RotateCcw } from "lucide-vue-next";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  useAllSettings,
  useUpdateSettings,
} from "@/composables/useAllSettings";
import { useGetNewCookie } from "@/composables/useCollector";
import { useSetTheme, useThemeSettings } from "@/composables/useTheme";
import { themeList } from "@/lib/themeList";

// 통합 설정
const { data: settings } = useAllSettings();
const updateSettingsMutation = useUpdateSettings();

// 자동 스캔 설정
const autoScanOnStartup = computed({
  get: () => settings.value?.autoScanOnStartup ?? false,
  set: (value) => {
    updateSettingsMutation.mutate({
      autoScanOnStartup: value,
    });
  },
});

// 스캔 깊이 설정
const scanDepthInput = ref(settings.value?.scanDepth ?? 5);

watch(
  () => settings.value?.scanDepth,
  (val) => {
    scanDepthInput.value = val ?? 5;
  },
);

function handleScanDepthChange() {
  const depth = Math.max(1, Math.min(10, Number(scanDepthInput.value) || 5));
  scanDepthInput.value = depth;
  updateSettingsMutation.mutate({ scanDepth: depth });
}

// 비게임 콘텐츠 인식 토글
const enableNonGameContent = computed({
  get: () => settings.value?.enableNonGameContent ?? false,
  set: (value: boolean) => {
    updateSettingsMutation.mutate({ enableNonGameContent: value });
  },
});

// 오디오 플레이어 선택
async function selectAudioPlayer() {
  const result = await window.api.invoke("selectProgram");
  const filePath = result?.filePaths?.[0];
  if (filePath) {
    updateSettingsMutation.mutate({
      mediaPlayerSettings: {
        ...(settings.value?.mediaPlayerSettings ?? {
          audioPlayerPath: null,
          videoPlayerPath: null,
        }),
        audioPlayerPath: filePath,
      },
    });
  }
}

// 오디오 플레이어 초기화
function resetAudioPlayer() {
  updateSettingsMutation.mutate({
    mediaPlayerSettings: {
      ...(settings.value?.mediaPlayerSettings ?? {
        audioPlayerPath: null,
        videoPlayerPath: null,
      }),
      audioPlayerPath: null,
    },
  });
}

// 비디오 플레이어 선택
async function selectVideoPlayer() {
  const result = await window.api.invoke("selectProgram");
  const filePath = result?.filePaths?.[0];
  if (filePath) {
    updateSettingsMutation.mutate({
      mediaPlayerSettings: {
        ...(settings.value?.mediaPlayerSettings ?? {
          audioPlayerPath: null,
          videoPlayerPath: null,
        }),
        videoPlayerPath: filePath,
      },
    });
  }
}

// 비디오 플레이어 초기화
function resetVideoPlayer() {
  updateSettingsMutation.mutate({
    mediaPlayerSettings: {
      ...(settings.value?.mediaPlayerSettings ?? {
        audioPlayerPath: null,
        videoPlayerPath: null,
      }),
      videoPlayerPath: null,
    },
  });
}

// 테마 설정
const { data: themeSettings } = useThemeSettings();
const setThemeMutation = useSetTheme();

// 현재 선택된 테마
const currentTheme = computed(
  () => themeSettings.value?.colorTheme ?? "default",
);

// 테마 변경 핸들러
function handleSetTheme(theme: string) {
  setThemeMutation.mutate(theme);
}

// Google 쿠키 관리
const getNewCookieMutation = useGetNewCookie();

/**
 * Google 쿠키 획득 (세이프서치 해제)
 */
async function handleGetNewCookie(): Promise<void> {
  try {
    await getNewCookieMutation.mutateAsync(undefined);
    toast.success("Google 쿠키가 설정되었습니다.");
  } catch {
    toast.error("쿠키 획득에 실패했습니다.");
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 섹션 헤더 -->
    <div class="flex items-center gap-2">
      <Palette :size="20" class="text-muted-foreground" />
      <h2 class="text-lg font-semibold">앱 설정</h2>
    </div>

    <!-- 카드 그리드 -->
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <!-- 자동 스캔 설정 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">자동 스캔</CardTitle>
          <CardDescription class="text-sm">
            앱 시작 시 변경된 라이브러리를 자동으로 스캔합니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <label class="text-sm leading-none font-medium"
                >앱 시작 시 자동 스캔</label
              >
              <p class="text-muted-foreground text-xs">
                변경 사항이 있는 경로만 자동 스캔합니다
              </p>
            </div>
            <Switch v-model="autoScanOnStartup" />
          </div>
          <div class="border-border mt-4 border-t pt-4">
            <div class="flex items-center justify-between">
              <div class="space-y-0.5">
                <label class="text-sm leading-none font-medium">
                  스캔 깊이
                </label>
                <p class="text-muted-foreground text-xs">
                  하위 폴더를 몇 단계까지 탐색할지 설정합니다 (1~10)
                </p>
              </div>
              <Input
                v-model.number="scanDepthInput"
                type="number"
                min="1"
                max="10"
                class="w-20"
                @change="handleScanDepthChange"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- 테마 설정 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">테마 설정</CardTitle>
          <CardDescription class="text-sm">
            애플리케이션의 컬러 테마를 선택하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div class="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto">
            <button
              v-for="theme in themeList"
              :key="theme.value"
              type="button"
              @click="handleSetTheme(theme.value)"
              :class="[
                'rounded-md border p-2 text-center text-xs transition-colors',
                currentTheme === theme.value
                  ? 'border-primary bg-primary/10'
                  : 'border-border hover:border-primary/50',
              ]"
            >
              {{ theme.label }}
            </button>
          </div>
        </CardContent>
      </Card>

      <!-- 비게임 콘텐츠 설정 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">비게임 콘텐츠</CardTitle>
          <CardDescription class="text-sm">
            RJ코드 폴더를 비게임 콘텐츠(오디오/비디오)로 인식하고 외부
            플레이어로 재생합니다.
          </CardDescription>
        </CardHeader>
        <CardContent class="flex flex-col gap-4">
          <!-- 비게임 콘텐츠 인식 토글 -->
          <div class="flex items-center justify-between">
            <div class="space-y-0.5">
              <label class="text-sm leading-none font-medium"
                >비게임 콘텐츠 인식</label
              >
              <p class="text-muted-foreground text-xs">
                RJ코드 폴더를 비게임 콘텐츠로 인식합니다
              </p>
            </div>
            <Switch v-model="enableNonGameContent" />
          </div>

          <!-- 오디오 플레이어 선택 -->
          <div
            class="border-border flex flex-col gap-2 border-t pt-3"
            :class="{ 'pointer-events-none opacity-50': !enableNonGameContent }"
          >
            <div class="space-y-0.5">
              <label class="text-sm leading-none font-medium"
                >오디오 플레이어</label
              >
              <p class="text-muted-foreground truncate font-mono text-xs">
                {{
                  settings?.mediaPlayerSettings?.audioPlayerPath ||
                  "설정되지 않음"
                }}
              </p>
            </div>
            <div class="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                class="flex-1"
                @click="selectAudioPlayer"
                :disabled="!enableNonGameContent"
              >
                <Folder :size="14" />
                파일 선택
              </Button>
              <Button
                variant="ghost"
                size="sm"
                @click="resetAudioPlayer"
                :disabled="
                  !enableNonGameContent ||
                  !settings?.mediaPlayerSettings?.audioPlayerPath
                "
                title="초기화"
              >
                <RotateCcw :size="14" />
              </Button>
            </div>
          </div>

          <!-- 비디오 플레이어 선택 -->
          <div
            class="border-border flex flex-col gap-2 border-t pt-3"
            :class="{ 'pointer-events-none opacity-50': !enableNonGameContent }"
          >
            <div class="space-y-0.5">
              <label class="text-sm leading-none font-medium"
                >비디오 플레이어</label
              >
              <p class="text-muted-foreground truncate font-mono text-xs">
                {{
                  settings?.mediaPlayerSettings?.videoPlayerPath ||
                  "설정되지 않음"
                }}
              </p>
            </div>
            <div class="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                class="flex-1"
                @click="selectVideoPlayer"
                :disabled="!enableNonGameContent"
              >
                <Folder :size="14" />
                파일 선택
              </Button>
              <Button
                variant="ghost"
                size="sm"
                @click="resetVideoPlayer"
                :disabled="
                  !enableNonGameContent ||
                  !settings?.mediaPlayerSettings?.videoPlayerPath
                "
                title="초기화"
              >
                <RotateCcw :size="14" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Google 쿠키 설정 -->
      <Card>
        <CardHeader class="pb-4">
          <CardTitle class="text-lg">Google 검색 설정</CardTitle>
          <CardDescription class="text-sm">
            Google 이미지 검색에서 세이프서치를 해제합니다. 쿠키가 만료되면 다시
            설정하세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            @click="handleGetNewCookie"
            :disabled="getNewCookieMutation.isPending.value"
            variant="outline"
            class="w-full"
            size="default"
          >
            <Loader2
              v-if="getNewCookieMutation.isPending.value"
              :size="18"
              class="animate-spin"
            />
            <Cookie v-else :size="18" />
            {{
              getNewCookieMutation.isPending.value
                ? "설정 중..."
                : "Google 쿠키 설정"
            }}
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
