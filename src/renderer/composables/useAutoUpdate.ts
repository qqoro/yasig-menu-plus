/**
 * 자동 업데이트 관련 composable
 *
 * electron-updater를 통한 업데이트 확인, 다운로드, 설치 기능 제공
 */

import { useMutation } from "@tanstack/vue-query";
import { onMounted, onUnmounted, ref, computed } from "vue";

// 업데이트 상태 타입
type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "error";

// 업데이트 정보 타입
interface UpdateInfo {
  version: string;
  releaseDate: string;
}

// 다운로드 진행률 타입
interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

// 싱글톤 상태
const status = ref<UpdateStatus>("idle");
const updateInfo = ref<UpdateInfo | null>(null);
const progress = ref<DownloadProgress | null>(null);
const error = ref<string | null>(null);
const isPortable = ref(false);

// 이벤트 리스너 맵
type EventHandlers = {
  updateChecking: () => void;
  updateAvailable: (info: UpdateInfo) => void;
  updateNotAvailable: () => void;
  updateDownloadProgress: (p: DownloadProgress) => void;
  updateDownloaded: (info: { version: string }) => void;
  updateError: (e: { error: string }) => void;
};

export function useAutoUpdate() {
  // 계산된 속성
  const isChecking = computed(() => status.value === "checking");
  const isDownloading = computed(() => status.value === "downloading");
  const isUpdateAvailable = computed(() => status.value === "available");
  const isReadyToInstall = computed(() => status.value === "downloaded");
  const hasError = computed(() => status.value === "error");

  // 업데이트 확인 mutation
  const checkMutation = useMutation({
    mutationFn: async () => {
      const result = await window.api.invoke("checkForUpdate");
      isPortable.value = result.isPortable;
    },
  });

  // 업데이트 다운로드 mutation
  const downloadMutation = useMutation({
    mutationFn: async () => {
      await window.api.invoke("downloadUpdate");
    },
  });

  // 업데이트 설치 mutation
  const installMutation = useMutation({
    mutationFn: async () => {
      await window.api.invoke("installUpdate");
    },
  });

  // 이벤트 핸들러
  const handlers: EventHandlers = {
    updateChecking: () => {
      status.value = "checking";
    },
    updateAvailable: (info: UpdateInfo) => {
      status.value = "available";
      updateInfo.value = info;
    },
    updateNotAvailable: () => {
      status.value = "not-available";
    },
    updateDownloadProgress: (p: DownloadProgress) => {
      status.value = "downloading";
      progress.value = p;
    },
    updateDownloaded: (info: { version: string }) => {
      status.value = "downloaded";
      updateInfo.value = info as UpdateInfo;
    },
    updateError: (e: { error: string }) => {
      status.value = "error";
      error.value = e.error;
    },
  };

  // 이벤트 리스너 등록
  onMounted(() => {
    for (const [channel, handler] of Object.entries(handlers)) {
      window.api.on(channel as any, handler as any);
    }
  });

  // 이벤트 리스너 해제
  onUnmounted(() => {
    for (const [channel, handler] of Object.entries(handlers)) {
      window.api.removeListener(channel as any, handler as any);
    }
  });

  return {
    // 상태
    status,
    updateInfo,
    progress,
    error,
    isPortable,
    // 계산된 속성
    isChecking,
    isDownloading,
    isUpdateAvailable,
    isReadyToInstall,
    hasError,
    // 액션
    checkForUpdates: () => checkMutation.mutate(),
    downloadUpdate: () => downloadMutation.mutate(),
    installUpdate: () => installMutation.mutate(),
    // mutation 상태
    isCheckPending: checkMutation.isPending,
    isDownloadPending: downloadMutation.isPending,
    isInstallPending: installMutation.isPending,
  };
}
