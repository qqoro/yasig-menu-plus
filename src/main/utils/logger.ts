/**
 * 메인 프로세스 로깅 설정
 *
 * ## 레벨 규약
 * - error   : 사용자 작업이 실패했고 복구하지 못함
 * - warn    : 실패했지만 대체 경로로 계속 진행 (수집기 fallback, 파일 잠김 등)
 * - info    : 사용자가 유발한 작업의 시작/끝과 결과 요약
 * - debug   : 진단용 상세 (개별 항목, 조회 조건, 외부 응답 요약)
 * - verbose / silly : 사용하지 않음
 *
 * 파일 로그 레벨은 `--log-level=debug` 실행 인자 또는 `YMP_LOG_LEVEL` 환경변수로
 * 올릴 수 있다. 인자가 환경변수보다 우선한다.
 */
import { app } from "electron";
import log from "electron-log";
import {
  DEFAULT_DEV_CONSOLE_LOG_LEVEL,
  moreVerboseLevel,
  resolveFileLogLevel,
  type LogLevel,
} from "./log-level.js";

const isDev = !app.isPackaged;

/**
 * 로그 파일 최대 크기 (초과 시 main.old.log로 회전)
 *
 * 기본값 1MB는 스캔·수집 로그가 조금만 쌓여도 넘어가 제보 시 맥락이 잘린다.
 */
const LOG_FILE_MAX_SIZE = 10 * 1024 * 1024;

/**
 * 이 실행에서 사용할 파일 로그 레벨
 */
const fileLogLevel: LogLevel = resolveFileLogLevel(process.argv, process.env);

/**
 * 콘솔 후킹 전 원본 console 메서드 (복원용)
 */
const originalConsole = {
  log: console.log,
  info: console.info,
  warn: console.warn,
  error: console.error,
  debug: console.debug,
};

let consoleHooked = false;

/**
 * 전역 console을 지정한 scope의 로거로 바꿔친다
 *
 * electron-log의 콘솔 트랜스포트는 모듈 로드 시점에 원본 console을 캡처하므로
 * 여기서 console을 덮어써도 재귀 호출이 생기지 않는다.
 */
function redirectConsole(scope: string): void {
  const scoped = log.scope(scope);
  console.log = scoped.info;
  console.info = scoped.info;
  console.warn = scoped.warn;
  console.error = scoped.error;
  console.debug = scoped.debug;
}

/**
 * 전역 console을 원래대로 되돌린다
 */
function restoreConsole(): void {
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
}

/**
 * 로깅 초기화
 *
 * main.ts에서 가장 먼저 한 번만 호출한다.
 * - 레벨/포맷/로테이션 설정
 * - 렌더러 로그 브릿지 활성화 (preload 주입)
 * - 처리되지 않은 예외·거부 포착
 * - 전역 console을 파일 로그로 리다이렉트
 */
export function initLogging(): void {
  log.transports.file.level = fileLogLevel;
  log.transports.file.maxSize = LOG_FILE_MAX_SIZE;
  log.transports.console.level = isDev
    ? moreVerboseLevel(DEFAULT_DEV_CONSOLE_LOG_LEVEL, fileLogLevel)
    : fileLogLevel;

  log.transports.console.format =
    "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {scope} │ {text}";
  log.transports.file.format =
    "[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {scope} │ {text}";

  // 렌더러 프로세스 로그를 메인 로그 파일로 모은다
  log.initialize();

  // 처리되지 않은 예외/거부는 앱이 죽기 직전 마지막 단서라 반드시 남긴다.
  // 개발 중에는 즉시 알아채도록 다이얼로그를 띄우고, 배포판에서는 조용히 기록만 한다.
  log.errorHandler.startCatching({ showDialog: isDev });

  // 서드파티 라이브러리와 asar 밖에서 로드되는 마이그레이션이 뱉는 console 출력을
  // 파일 로그로 끌어온다. scope는 하나만 걸 수 있어 기본값은 Console로 둔다.
  if (!consoleHooked) {
    redirectConsole("Console");
    consoleHooked = true;
  }

  log
    .scope("Logger")
    .info(
      `로깅 시작 (파일 레벨: ${fileLogLevel}, 파일: ${log.transports.file.getFile().path})`,
    );
}

/**
 * 지정한 scope로 console을 묶어 콜백을 실행한 뒤 원래 scope로 되돌린다
 *
 * asar 밖에서 로드되는 마이그레이션처럼 로거를 import할 수 없는 코드가
 * console.log만으로 정확한 scope를 남기게 하는 용도.
 */
export async function withConsoleScope<T>(
  scope: string,
  fn: () => Promise<T>,
): Promise<T> {
  redirectConsole(scope);
  try {
    return await fn();
  } finally {
    if (consoleHooked) {
      redirectConsole("Console");
    } else {
      restoreConsole();
    }
  }
}

/**
 * 현재 파일 로그 레벨 (워커에 전달할 때 사용)
 */
export function getFileLogLevel(): LogLevel {
  return fileLogLevel;
}

/**
 * 현재 로그 파일 경로 (워커에 전달할 때 사용)
 *
 * 워커 스레드에서는 electron 모듈을 쓸 수 없어 electron-log가 로그 경로를
 * package.json 이름으로 추정한다. 패키징 후 productName 기준 경로와 어긋나므로
 * 메인 프로세스가 결정한 경로를 명시적으로 넘겨야 한 파일에 모인다.
 */
export function getLogFilePath(): string {
  return log.transports.file.getFile().path;
}

/**
 * scope가 붙은 로거 생성
 */
export function createLogger(scope: string) {
  return log.scope(scope);
}

export const logger = log;
