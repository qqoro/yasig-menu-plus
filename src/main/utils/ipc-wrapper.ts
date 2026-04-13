/**
 * IPC 핸들러 에러 래핑 유틸리티
 *
 * 모든 IPC 핸들러를 try/catch로 감싸 에러 로깅 + reject 처리.
 * 에러 원인을 electron-log에 기록하여 사용자 불만 접수 시 원인 파악 가능.
 */
import log from "electron-log";

export const console = log;

export function wrapIpcHandler<TArgs, TReturn>(
  channel: string,
  handler: (
    event: Electron.IpcMainInvokeEvent,
    args: TArgs,
  ) => Promise<TReturn> | TReturn,
): (event: Electron.IpcMainInvokeEvent, args: TArgs) => Promise<TReturn> {
  return async (event, args) => {
    try {
      return await handler(event, args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[IPC:${channel}] 핸들러 오류: ${message}`);
      throw error;
    }
  };
}
