/**
 * 자동 업데이트 서비스
 *
 * electron-updater를 사용하여 앱 자동 업데이트 관리
 * 포터블 버전은 자동 설치 불가, GitHub Releases 페이지로 안내
 */

import { app, BrowserWindow, shell } from "electron";
import pkg from "electron-updater";
import * as fs from "fs";
import * as path from "path";
import { IpcMainSend } from "../events.js";

const { autoUpdater } = pkg;

export class AutoUpdater {
  private mainWindow: BrowserWindow | null = null;
  private isPortable: boolean;

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
   * 방법 1: 실행 파일명에 'portable' 포함
   * 방법 2: uninstall.exe 없으면 포터블 (NSIS 설치버전은 있음)
   */
  private checkPortable(): boolean {
    // 개발 환경에서는 포터블로 간주하지 않음
    if (!app.isPackaged) {
      return false;
    }

    const exePath = process.execPath.toLowerCase();

    // 방법 1: 실행 파일명에 'portable' 포함
    if (exePath.includes("portable")) {
      return true;
    }

    // 방법 2: uninstall.exe 없으면 포터블
    const appDir = path.dirname(exePath);
    const uninstallPath = path.join(appDir, "uninstall.exe");
    if (!fs.existsSync(uninstallPath)) {
      return true;
    }

    return false;
  }

  /**
   * electron-updater 이벤트 리스너 설정
   */
  private setupEvents(): void {
    autoUpdater.on("checking-for-update", () => {
      console.log("업데이트 확인 중...");
      this.send(IpcMainSend.UpdateChecking);
    });

    autoUpdater.on("update-available", (info) => {
      console.log(`업데이트 있음: v${info.version}`);
      this.send(IpcMainSend.UpdateAvailable, {
        version: info.version,
        releaseDate: info.releaseDate,
      });
    });

    autoUpdater.on("update-not-available", () => {
      console.log("업데이트 없음: 최신 버전입니다.");
      this.send(IpcMainSend.UpdateNotAvailable);
    });

    autoUpdater.on("download-progress", (progress) => {
      console.log(
        `다운로드 중: ${progress.percent.toFixed(1)}% (${progress.transferred}/${progress.total} bytes)`,
      );
      this.send(IpcMainSend.UpdateDownloadProgress, {
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
      });
    });

    autoUpdater.on("update-downloaded", (info) => {
      console.log(`업데이트 다운로드 완료: v${info.version}`);
      this.send(IpcMainSend.UpdateDownloaded, {
        version: info.version,
      });
    });

    autoUpdater.on("error", (error) => {
      console.error("업데이트 오류:", error);
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
      console.log("개발 환경: 업데이트 확인 건너뜀");
      this.send(IpcMainSend.UpdateNotAvailable);
      return;
    }

    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      console.error("업데이트 확인 실패:", error);
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
      // 포터블: GitHub Releases 페이지 열기
      console.log("포터블 버전: GitHub Releases 페이지 열기");
      await shell.openExternal(
        "https://github.com/qqoro/yasig-menu-plus/releases",
      );
      return;
    }

    try {
      await autoUpdater.downloadUpdate();
    } catch (error) {
      console.error("업데이트 다운로드 실패:", error);
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
      console.log("포터블 버전은 자동 설치 불가");
      return;
    }

    console.log("업데이트 설치를 위해 앱 재시작...");
    autoUpdater.quitAndInstall();
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
