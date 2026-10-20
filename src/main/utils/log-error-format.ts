/**
 * 로그 인자로 넘긴 Error를 원인까지 펼쳐 기록하기 위한 electron-log hook
 *
 * electron-log는 Error를 `error.stack` 문자열 하나로 바꿔 기록하므로 `cause`,
 * `code`, `AggregateError.errors` 같은 정보가 모두 버려진다. Node fetch 실패는
 * stack이 "TypeError: fetch failed" 한 줄뿐이고 실제 원인(DNS·인증서·연결 거부)은
 * cause에만 있어서, 이대로면 로그만으로는 원인을 알 수 없다.
 *
 * electron 모듈에 의존하지 않으므로 워커 스레드 로거에서도 쓸 수 있다.
 */
import { inspect } from "node:util";

/**
 * cause 체인을 따라갈 최대 깊이
 */
const INSPECT_DEPTH = 5;

/**
 * 메시지의 Error 인자를 util.inspect 문자열로 바꾼다 (원본 메시지는 그대로 둔다)
 *
 * util.inspect는 stack과 함께 cause, AggregateError의 하위 에러, code 같은
 * 추가 속성까지 출력한다.
 */
export function expandErrorsHook<T extends { data: unknown[] }>(message: T): T {
  return {
    ...message,
    data: message.data.map((item) =>
      item instanceof Error
        ? inspect(item, { depth: INSPECT_DEPTH, colors: false })
        : item,
    ),
  };
}
