/**
 * 로그 레벨 결정 유틸리티
 *
 * 파일 로그 레벨은 실행 인자 > 환경변수 > 기본값 순으로 결정된다.
 * electron 의존이 없는 순수 함수라 워커 스레드와 테스트에서도 그대로 쓴다.
 */

/**
 * electron-log가 지원하는 로그 레벨 (심각도 높은 순)
 */
export const LOG_LEVELS = [
  "error",
  "warn",
  "info",
  "verbose",
  "debug",
  "silly",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

/**
 * 파일 로그 기본 레벨
 */
export const DEFAULT_FILE_LOG_LEVEL: LogLevel = "info";

/**
 * 개발 모드 콘솔 기본 레벨
 */
export const DEFAULT_DEV_CONSOLE_LOG_LEVEL: LogLevel = "debug";

/**
 * 로그 레벨을 지정하는 실행 인자 이름
 */
export const LOG_LEVEL_ARG = "--log-level";

/**
 * 로그 레벨을 지정하는 환경변수 이름
 */
export const LOG_LEVEL_ENV = "YMP_LOG_LEVEL";

/**
 * 문자열이 유효한 로그 레벨인지 판별
 */
export function isLogLevel(value: unknown): value is LogLevel {
  return (
    typeof value === "string" &&
    (LOG_LEVELS as readonly string[]).includes(value.trim().toLowerCase())
  );
}

/**
 * 문자열을 로그 레벨로 정규화 (유효하지 않으면 null)
 */
function normalizeLevel(value: string | undefined | null): LogLevel | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return isLogLevel(normalized) ? (normalized as LogLevel) : null;
}

/**
 * 실행 인자 목록에서 로그 레벨 추출
 *
 * `--log-level=debug`, `--log-level debug` 두 형태 모두 지원.
 * 여러 번 지정되면 마지막 값이 이긴다.
 */
export function parseLogLevelArg(argv: readonly string[]): LogLevel | null {
  let found: LogLevel | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (typeof arg !== "string") {
      continue;
    }

    if (arg.startsWith(`${LOG_LEVEL_ARG}=`)) {
      const level = normalizeLevel(arg.slice(LOG_LEVEL_ARG.length + 1));
      if (level) {
        found = level;
      }
      continue;
    }

    if (arg === LOG_LEVEL_ARG) {
      const level = normalizeLevel(argv[i + 1]);
      if (level) {
        found = level;
        i++;
      }
    }
  }

  return found;
}

/**
 * 두 레벨 중 더 상세한(=더 많이 남기는) 쪽 반환
 *
 * LOG_LEVELS는 심각도 높은 순이라 인덱스가 클수록 상세하다.
 */
export function moreVerboseLevel(a: LogLevel, b: LogLevel): LogLevel {
  return LOG_LEVELS.indexOf(a) >= LOG_LEVELS.indexOf(b) ? a : b;
}

/**
 * 실행 인자와 환경변수로 파일 로그 레벨 결정
 *
 * 우선순위: 실행 인자 > 환경변수 > 기본값(info).
 * 잘못된 값은 무시하고 다음 우선순위로 넘어간다.
 */
export function resolveFileLogLevel(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  defaultLevel: LogLevel = DEFAULT_FILE_LOG_LEVEL,
): LogLevel {
  return (
    parseLogLevelArg(argv) ?? normalizeLevel(env[LOG_LEVEL_ENV]) ?? defaultLevel
  );
}
