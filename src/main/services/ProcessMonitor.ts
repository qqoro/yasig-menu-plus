/**
 * 게임 프로세스 모니터링 서비스
 *
 * .exe 파일만 spawn()으로 실행하여 정확한 종료 감지
 * 그 외 파일(.lnk, .url, 압축파일)은 플레이 타임 추적하지 않음
 */

import { ChildProcess, spawn } from "child_process";
import type { BrowserWindow } from "electron";
import { db } from "../db/db-manager.js";
import { getOrCreateUserGameData } from "./user-game-data.js";

interface ActiveSession {
  gamePath: string;
  executablePath: string;
  startedAt: Date;
  process: ChildProcess;
}

export class ProcessMonitor {
  private activeSessions: Map<string, ActiveSession> = new Map();
  private mainWindow: BrowserWindow | null = null;

  /** 최소 플레이 시간 (초) - 이 시간 미만은 기록하지 않음 */
  private readonly MIN_PLAY_TIME_SECONDS = 60;

  /**
   * 메인 윈도우 설정 (이벤트 전송용)
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * 실행 파일이 .exe인지 확인
   */
  isExeFile(filePath: string): boolean {
    return filePath.toLowerCase().endsWith(".exe");
  }

  /**
   * 게임 세션 시작
   * .exe 파일이면 spawn()으로 실행하고 종료 감지
   * 그 외 파일이면 false 반환 (플레이 타임 추적 안 함)
   */
  async startSession(
    gamePath: string,
    executablePath: string,
  ): Promise<boolean> {
    // .exe가 아니면 추적하지 않음
    if (!this.isExeFile(executablePath)) {
      return false;
    }

    // 이미 실행 중인 세션이 있으면 무시
    if (this.activeSessions.has(gamePath)) {
      console.log(`이미 실행 중인 세션: ${gamePath}`);
      return false;
    }

    // 세션 시작 시간 기록
    const startedAt = new Date();

    // DB에 세션 시작 기록
    await db("games").where("path", gamePath).update({
      sessionStartAt: startedAt,
      updatedAt: startedAt,
    });
    const userGameDataId = await getOrCreateUserGameData(gamePath);
    await db("userGameData").where("id", userGameDataId).update({
      lastPlayedAt: startedAt,
    });

    // spawn으로 실행
    const gameProcess = spawn(executablePath, [], {
      detached: false, // 부모 프로세스와 연결 유지
      stdio: "ignore", // 입출력 무시
    });

    // 세션 등록
    const session: ActiveSession = {
      gamePath,
      executablePath,
      startedAt,
      process: gameProcess,
    };

    this.activeSessions.set(gamePath, session);

    // 종료 이벤트 리스너
    gameProcess.on("close", async (code) => {
      console.log(`게임 프로세스 종료: ${executablePath}, 코드: ${code}`);
      await this.endSession(gamePath);
    });

    gameProcess.on("error", async (err) => {
      console.error(`게임 프로세스 에러: ${executablePath}`, err);
      await this.endSession(gamePath);
    });

    console.log(`게임 세션 시작: ${gamePath}`);
    return true;
  }

  /**
   * 게임 세션 종료
   */
  async endSession(gamePath: string): Promise<void> {
    const session = this.activeSessions.get(gamePath);
    if (!session) return;

    // 세션 제거 (먼저 제거하여 중복 호출 방지)
    this.activeSessions.delete(gamePath);

    // 플레이 시간 계산
    const endedAt = new Date();
    const durationSeconds = Math.floor(
      (endedAt.getTime() - session.startedAt.getTime()) / 1000,
    );

    // 최소 플레이 시간 확인
    if (durationSeconds >= this.MIN_PLAY_TIME_SECONDS) {
      try {
        const userGameDataId = await getOrCreateUserGameData(gamePath);

        // 세션 기록 저장
        await db("playSessions").insert({
          userGameDataId,
          startedAt: session.startedAt,
          endedAt,
          durationSeconds,
        });

        // 총 플레이 타임 업데이트
        await db("userGameData")
          .where("id", userGameDataId)
          .increment("totalPlayTime", durationSeconds);

        await db("games").where("path", gamePath).update({
          sessionStartAt: null,
          updatedAt: endedAt,
        });

        // 업데이트된 총 플레이 타임 조회
        const updatedData = await db("userGameData")
          .where("id", userGameDataId)
          .select("totalPlayTime")
          .first();

        console.log(
          `플레이 타임 기록: ${gamePath}, ${durationSeconds}초, 총 ${updatedData?.totalPlayTime ?? 0}초`,
        );

        // 프론트엔드에 알림
        this.sendEvent("gameSessionEnded", {
          path: gamePath,
          durationSeconds,
          totalPlayTime: updatedData?.totalPlayTime ?? 0,
        });
      } catch (error) {
        console.error("플레이 타임 기록 실패:", error);
      }
    } else {
      // 최소 시간 미달 시 세션 시작 기록만 제거
      await db("games").where("path", gamePath).update({
        sessionStartAt: null,
        updatedAt: endedAt,
      });
      console.log(
        `플레이 타임 미달 (${durationSeconds}초): ${gamePath}, 기록하지 않음`,
      );
    }
  }

  /**
   * 모든 활성 세션 종료 (앱 종료 시)
   */
  async endAllSessions(): Promise<void> {
    const gamePaths = [...this.activeSessions.keys()];
    console.log(`모든 세션 종료: ${gamePaths.length}개`);

    for (const gamePath of gamePaths) {
      await this.endSession(gamePath);
    }
  }

  /**
   * 활성 세션 존재 여부 확인
   */
  hasActiveSession(gamePath: string): boolean {
    return this.activeSessions.has(gamePath);
  }

  /**
   * 이벤트 전송 헬퍼
   */
  private sendEvent(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }
}

// 싱글톤 인스턴스
export const processMonitor = new ProcessMonitor();
