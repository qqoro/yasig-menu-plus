/**
 * IPC 핸들러 에러 래핑 유틸리티
 *
 * 모든 IPC 핸들러를 try/catch로 감싸 에러 로깅 + reject 처리.
 * 에러 원인을 electron-log에 기록하여 사용자 불만 접수 시 원인 파악 가능.
 */
import { createLogger } from "./logger.js";

const log = createLogger("IPC");

/**
 * 느린 핸들러로 간주해 경고를 남기는 기준 (ms)
 */
const SLOW_HANDLER_MS = 3000;

export function wrapIpcHandler<TArgs, TReturn>(
  channel: string,
  handler: (
    event: Electron.IpcMainInvokeEvent,
    args: TArgs,
  ) => Promise<TReturn> | TReturn,
): (event: Electron.IpcMainInvokeEvent, args: TArgs) => Promise<TReturn> {
  return async (event, args) => {
    const startedAt = Date.now();

    try {
      const result = await handler(event, args);

      // 호출 단위 로그는 남기지 않는다. detectRpgMaker처럼 화면에 보이는 게임
      // 수만큼 호출되는 채널이 있어 debug 레벨을 통째로 못 쓰게 만든다.
      // 사용자 행동의 흐름은 각 핸들러의 도메인 로그가 담당한다.
      const elapsed = Date.now() - startedAt;
      if (elapsed >= SLOW_HANDLER_MS) {
        log.warn(`${channel} 응답 지연: ${elapsed}ms`);
      }

      return result;
    } catch (error) {
      // 스택트레이스까지 남겨야 제보 로그만으로 원인 지점을 찾을 수 있다
      log.error(`${channel} 핸들러 오류:`, error);
      throw error;
    }
  };
}
