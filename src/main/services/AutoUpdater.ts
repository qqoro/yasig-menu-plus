/**
 * 자동 업데이트 서비스
 *
 * electron-updater를 사용하여 앱 자동 업데이트 관리
 * 포터블 버전은 자동 설치 불가, GitHub Releases 페이지로 안내
 */

import { app, BrowserWindow, shell } from "electron";
import pkg from "electron-updater";
import { IpcMainSend } from "../events.js";
import { createLogger } from "../utils/logger.js";
import { changelogService } from "./ChangelogService.js";

const { autoUpdater } = pkg;
const log = createLogger("AutoUpdater");

const RELEASES_PAGE_URL = "https://github.com/qqoro/yasig-menu-plus/releases";

export class AutoUpdater {
  private mainWindow: BrowserWindow | null = null;
  private isPortable: boolean;
  /** 포터블 업데이트 확인으로 찾은 새 버전의 릴리즈 페이지 */
  private portableReleaseUrl: string | null = null;

  constructor() {
    this.isPortable = this.checkPortable();
    // 자동 다운로드 비활성화 (수동으로 제어)
    autoUpdater.autoDownload = false;
    this.setupEvents();
  }

  /**
   * 메인 윈도우 설정 (이벤트 전송용)
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * 포터블 버전 확인
   * electron-builder가 포터블 빌드 시 PORTABLE_EXECUTABLE_DIR 환경 변수 설정
   */
  private checkPortable(): boolean {
    return !!process.env.PORTABLE_EXECUTABLE_DIR;
  }

  /**
   * electron-updater 이벤트 리스너 설정
   */
  private setupEvents(): void {
    autoUpdater.on("checking-for-update", () => {
      log.info("업데이트 확인 중...");
      this.send(IpcMainSend.UpdateChecking);
    });

    autoUpdater.on("update-available", (info) => {
      log.info(`업데이트 있음: v${info.version}`);
      this.send(IpcMainSend.UpdateAvailable, {
        version: info.version,
        releaseDate: info.releaseDate,
        isPortable: this.isPortable,
      });
    });

    autoUpdater.on("update-not-available", () => {
      log.info("업데이트 없음: 최신 버전입니다.");
      this.send(IpcMainSend.UpdateNotAvailable);
    });

    autoUpdater.on("download-progress", (progress) => {
      log.info(
        `다운로드 중: ${progress.percent.toFixed(1)}% (${progress.transferred}/${progress.total} bytes)`,
      );
      this.send(IpcMainSend.UpdateDownloadProgress, {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      log.info(`업데이트 다운로드 완료: v${info.version}`);
      this.send(IpcMainSend.UpdateDownloaded, {
        version: info.version,
      });
    });

    autoUpdater.on("error", (error) => {
      log.error("업데이트 오류:", error);
      this.send(IpcMainSend.UpdateError, {
        error: error.message,
      });
    });
  }

  /**
   * 업데이트 확인
   */
  async checkForUpdates(): Promise<void> {
    // 개발 환경에서는 업데이트 확인 안함
    if (!app.isPackaged) {
      log.debug("개발 환경: 업데이트 확인 건너뜀");
      this.send(IpcMainSend.UpdateNotAvailable);
      return;
    }

    // 포터블 빌드에는 app-update.yml이 없어 electron-updater가 항상 실패한다
    if (this.isPortable) {
      await this.checkPortableUpdate();
      return;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      log.error("업데이트 확인 실패:", error);
      this.send(IpcMainSend.UpdateError, {
        error: error instanceof Error ? error.message : "알 수 없는 오류",
      });
    }
  }

  /**
   * 포터블 버전 업데이트 확인 (GitHub Releases API로 새 버전만 비교)
   */
  private async checkPortableUpdate(): Promise<void> {
    log.info("업데이트 확인 중... (포터블)");
    this.send(IpcMainSend.UpdateChecking);

    try {
      const [latest] = await changelogService.fetchReleasesAfterVersion(
        app.getVersion(),
      );

      if (!latest) {
        log.info("업데이트 없음: 최신 버전입니다.");
        this.send(IpcMainSend.UpdateNotAvailable);
        return;
      }

      this.portableReleaseUrl = latest.htmlUrl;
      log.info(`업데이트 있음: ${latest.version}`);
      this.send(IpcMainSend.UpdateAvailable, {
        // electron-updater와 같은 형식 (v 접두사 없음)
        version: latest.version.replace(/^v/, ""),
        releaseDate: latest.publishedAt,
        isPortable: true,
      });
    } catch (error) {
      log.error("업데이트 확인 실패:", error);
      this.send(IpcMainSend.UpdateError, {
        error: error instanceof Error ? error.message : "알 수 없는 오류",
      });
    }
  }

  /**
   * 업데이트 다운로드
   * 포터블 버전은 GitHub Releases 페이지 열기
   */
  async downloadUpdate(): Promise<void> {
    if (this.isPortable) {
      // 포터블: 확인된 새 버전의 릴리즈 페이지, 없으면 릴리즈 목록 열기
      log.debug("포터블 버전: GitHub Releases 페이지 열기");
      await shell.openExternal(this.portableReleaseUrl ?? RELEASES_PAGE_URL);
      return;
    }

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      log.error("업데이트 다운로드 실패:", error);
      this.send(IpcMainSend.UpdateError, {
        error: error instanceof Error ? error.message : "다운로드 실패",
      });
    }
  }

  /**
   * 업데이트 설치 (앱 재시작)
   */
  quitAndInstall(): void {
    if (this.isPortable) {
      log.debug("포터블 버전은 자동 설치 불가");
      return;
    }

    log.info("업데이트 설치를 위해 앱 재시작...");
    // 설치 마법사 없이 이전 경로에 조용히 설치하고, 설치가 끝나면 앱을 다시 실행
    autoUpdater.quitAndInstall(true, true);
  }

  /**
   * 포터블 버전 여부 확인
   */
  isPortableVersion(): boolean {
    return this.isPortable;
  }

  /**
   * 이벤트 전송 헬퍼
   */
  private send<K extends keyof import("../events.js").IpcMainEventMap>(
    channel: K,
    data?: import("../events.js").IpcMainEventMap[K],
  ): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

// 싱글톤 인스턴스
export const autoUpdaterService = new AutoUpdater();
