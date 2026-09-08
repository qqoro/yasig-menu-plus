import type { App } from "vue";
import log from "electron-log/renderer";

/**
 * 렌더러 로거 생성
 *
 * scope는 `renderer:` 접두사를 붙여 메인 프로세스 로그와 구분한다.
 * 로그는 preload 브릿지를 통해 메인 프로세스의 로그 파일로 모인다.
 */
export function createLogger(scope: string) {
  return log.scope(`renderer:${scope}`);
}

export const logger = log;

const globalLog = createLogger("global");

/**
 * 렌더러 전역 오류 포착
 *
 * 여기서 잡지 않으면 렌더러에서 터진 예외는 devtools 콘솔에만 남고
 * 제보 파일(main.log)에는 아무 흔적이 없다.
 */
export function initRendererErrorLogging(app: App): void {
  // Vue 컴포넌트 렌더/라이프사이클에서 발생한 예외
  app.config.errorHandler = (error, _instance, info) => {
    globalLog.error(`Vue 오류 (${info}):`, error);
  };

  // 컴파일러/런타임 경고는 개발 중에만 나온다
  app.config.warnHandler = (msg, _instance, trace) => {
    globalLog.warn(`Vue 경고: ${msg}${trace}`);
  };

  // 이벤트 핸들러 등 Vue 바깥에서 터진 예외
  window.addEventListener("error", (event) => {
    globalLog.error(
      `처리되지 않은 오류: ${event.message} (${event.filename}:${event.lineno}:${event.colno})`,
      event.error,
    );
  });

  // await 없이 버려진 Promise 거부
  window.addEventListener("unhandledrejection", (event) => {
    globalLog.error("처리되지 않은 Promise 거부:", event.reason);
  });
}
