import { beforeEach, describe, expect, it, vi } from "vitest";

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
}));

vi.mock("vue", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue")>()),
  onMounted: (fn: () => void) => fn(),
  onUnmounted: vi.fn(),
}));

vi.mock("@tanstack/vue-query", () => ({
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { useAutoUpdate } from "../useAutoUpdate";

const info = {
  version: "1.27.0",
  releaseDate: "2026-11-17T00:00:00Z",
  isPortable: false,
};

describe("useAutoUpdate", () => {
  beforeEach(() => {
    handlers.clear();
    vi.stubGlobal("window", {
      api: {
        on: (channel: string, handler: (payload: unknown) => void) =>
          handlers.set(channel, handler),
        removeListener: vi.fn(),
      },
    });
  });

  it("설치형은 새 버전 발견 즉시 진행률을 기다리는 다운로드 상태가 된다", () => {
    const update = useAutoUpdate();
    handlers.get("updateAvailable")!(info);

    expect(update.isDownloading.value).toBe(true);
    expect(update.isUpdateAvailable.value).toBe(false);
    expect(update.updateInfo.value?.version).toBe("1.27.0");
    expect(update.progress.value).toBeNull();
  });

  it("진행률 없이 캐시에서 다운로드가 완료되어도 설치 준비 상태가 된다", () => {
    const update = useAutoUpdate();
    handlers.get("updateAvailable")!(info);
    handlers.get("updateDownloaded")!({ version: info.version });

    expect(update.isReadyToInstall.value).toBe(true);
    expect(update.isDownloading.value).toBe(false);
  });

  it("실패 후 새 다운로드를 시작할 때 이전 진행률과 오류를 지운다", () => {
    const update = useAutoUpdate();
    handlers.get("updateDownloadProgress")!({
      percent: 50,
      transferred: 50,
      total: 100,
    });
    handlers.get("updateError")!({ error: "네트워크 오류" });
    handlers.get("updateAvailable")!(info);

    expect(update.progress.value).toBeNull();
    expect(update.error.value).toBeNull();
    expect(update.isDownloading.value).toBe(true);
  });

  it("포터블은 다운로드 상태 대신 다운로드 페이지 안내 상태를 유지한다", () => {
    const update = useAutoUpdate();
    handlers.get("updateAvailable")!({ ...info, isPortable: true });

    expect(update.isPortable.value).toBe(true);
    expect(update.isUpdateAvailable.value).toBe(true);
    expect(update.isDownloading.value).toBe(false);
  });
});
