/**
 * 워커 스레드용 로깅 설정
 *
 * 워커 스레드에서는 `require("electron")`이 실패하므로 메인 프로세스의
 * `utils/logger.ts`를 그대로 쓸 수 없다. electron-log의 node 엔트리는 동작하지만
 * electron이 없으면 로그 경로를 package.json 이름으로 추정해 패키징 후
 * productName 기준 경로와 어긋난다. 그래서 부모가 결정한 경로를 주입받는다.
 */
// ESM에서는 확장자 없는 서브패스를 해석하지 못하므로 node.js까지 명시한다
import log from "electron-log/node.js";
import type { LogLevel } from "../utils/log-level.js";

/**
 * 워커 로깅 초기화
 *
 * 워커의 로그는 전부 전역 console을 통해 나간다. scan-logic처럼 vitest에서
 * 직접 테스트되는 순수 모듈이 electron-log를 import하지 않게 하려는 것이다.
 *
 * @param scope 로그에 표시할 scope
 * @param logFilePath 부모가 알려준 로그 파일 절대 경로
 * @param level 파일 로그 레벨
 */
export function initWorkerLogging(
  scope: string,
  logFilePath: string | undefined,
  level: LogLevel,
): void {
  if (logFilePath) {
    log.transports.file.resolvePathFn = () => logFilePath;
  }
  log.transports.file.level = level;
  // 워커의 stdout은 개발 중 터미널로만 흘러가므로 파일과 같은 레벨로 맞춘다
  log.transports.console.level = level;
  log.transports.file.format =
    "[{y}-{m}-{d} {h}:{i}:{s}] [{level}] {scope} │ {text}";

  const scoped = log.scope(scope);
  console.log = scoped.info;
  console.info = scoped.info;
  console.warn = scoped.warn;
  console.error = scoped.error;
  console.debug = scoped.debug;
}
