/**
 * AI 연동(MCP) HTTP 서버 생명주기
 *
 * - 127.0.0.1 전용, 경로 /mcp, Streamable HTTP stateless 모드
 * - 인증 없음. 대신 Host/Origin 헤더를 직접 검사해 브라우저 경유 호출을 막는다
 *   (SDK의 enableDnsRebindingProtection은 deprecated이고 Host를 포트 포함
 *   문자열로 비교해 쓰기 불편하다)
 * - 기동 실패는 예외로 올리지 않고 status.error로 보관한다
 */

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "http";
import type { AddressInfo } from "net";
import type { McpStatus } from "../events.js";
import { createLogger } from "../utils/logger.js";
import { createMcpServer } from "./register-tools.js";

const log = createLogger("Mcp");

let httpServer: Server | null = null;
let boundPort = 0;
let starting: Promise<McpStatus> | null = null;
let applyChain: Promise<unknown> = Promise.resolve();
let status: McpStatus = { running: false, port: 0, url: "", error: null };
const listeners = new Set<(status: McpStatus) => void>();

export function buildMcpUrl(port: number): string {
  return `http://127.0.0.1:${port}/mcp`;
}

export function getMcpStatus(): McpStatus {
  return status;
}

export function onMcpStatusChange(
  listener: (status: McpStatus) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setStatus(next: McpStatus): void {
  status = next;
  for (const listener of listeners) {
    listener(status);
  }
}

/**
 * Host 헤더가 이 서버 자신을 가리키는지 (포트까지 정확히 일치)
 */
export function isAllowedHost(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const url = req.url ?? "";
  if (url !== "/mcp" && !url.startsWith("/mcp?")) {
    res.writeHead(404).end();
    return;
  }
  if (!isAllowedHost(req.headers.host, boundPort)) {
    log.debug(`MCP 요청 거부: Host=${req.headers.host ?? "(없음)"}`);
    res.writeHead(403).end();
    return;
  }
  // CLI/데스크톱 MCP 클라이언트는 Origin을 보내지 않는다. 브라우저는 항상 보낸다.
  if (req.headers.origin !== undefined) {
    log.debug(`MCP 요청 거부: Origin=${req.headers.origin}`);
    res.writeHead(403).end();
    return;
  }

  // stateless: 요청마다 서버/전송을 새로 만들고 응답이 끝나면 닫는다
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    log.error("MCP 요청 처리 오류:", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" }).end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        }),
      );
    }
  }
}

/**
 * 서버 기동. 이미 떠 있으면 현재 상태를, 기동 중이면 그 기동의 결과를 돌려준다.
 * 실패(EADDRINUSE, 잘못된 포트 등)는 reject 대신 error가 채워진 상태로 resolve한다.
 */
export function startMcpServer(port: number): Promise<McpStatus> {
  if (httpServer) {
    return Promise.resolve(status);
  }
  if (starting) {
    return starting;
  }

  const attempt = new Promise<McpStatus>((resolve) => {
    const server = createServer((req, res) => {
      void handleHttpRequest(req, res);
    });

    const fail = (error: NodeJS.ErrnoException): void => {
      const message =
        error.code === "EADDRINUSE"
          ? `포트 ${port}이(가) 이미 사용 중입니다.`
          : error.message;
      log.error(`MCP 서버 기동 실패 (포트 ${port}):`, error);
      setStatus({ running: false, port, url: "", error: message });
      resolve(status);
    };

    server.once("error", fail);

    try {
      server.listen(port, "127.0.0.1", () => {
        // 기동 이후의 런타임 오류는 기동 실패 핸들러와 분리한다
        server.off("error", fail);
        server.on("error", (error: NodeJS.ErrnoException) => {
          log.error("MCP 서버 런타임 오류:", error);
          if (httpServer === server) {
            httpServer = null;
          }
          // 소켓을 닫아 두지 않으면 같은 포트로 재기동할 때 EADDRINUSE가 난다
          server.closeAllConnections();
          server.close();
          setStatus({
            running: false,
            port: 0,
            url: "",
            error: error.message,
          });
        });
        httpServer = server;
        boundPort = (server.address() as AddressInfo).port;
        log.info(`MCP 서버 시작: ${buildMcpUrl(boundPort)}`);
        setStatus({
          running: true,
          port: boundPort,
          url: buildMcpUrl(boundPort),
          error: null,
        });
        resolve(status);
      });
    } catch (error) {
      // 범위 밖 포트 등은 listen이 동기로 던진다
      server.off("error", fail);
      fail(error as NodeJS.ErrnoException);
    }
  });

  starting = attempt;
  void attempt.finally(() => {
    if (starting === attempt) {
      starting = null;
    }
  });
  return attempt;
}

/**
 * 서버 정지. 떠 있지 않으면 남아 있는 오류 상태만 초기화한다.
 * 기동이 진행 중이면 그 결과를 기다린 뒤 정지해, 앱 종료 직후 뜬 서버가
 * 남는 일이 없게 한다.
 */
export async function stopMcpServer(): Promise<void> {
  if (starting) {
    await starting;
  }
  return new Promise((resolve) => {
    const server = httpServer;
    if (!server) {
      if (status.error) {
        setStatus({ running: false, port: 0, url: "", error: null });
      }
      resolve();
      return;
    }
    httpServer = null;
    // 열려 있는 SSE 스트림이 있어도 즉시 닫히도록
    server.closeAllConnections();
    server.close(() => {
      log.info("MCP 서버 정지");
      setStatus({ running: false, port: 0, url: "", error: null });
      resolve();
    });
  });
}

/**
 * 설정값을 서버 상태에 반영 (설정 변경·앱 시작 시 호출)
 * 호출이 겹쳐도 정지/기동이 뒤섞이지 않도록 순서대로 직렬 실행한다.
 */
export function applyMcpSettings(settings: {
  enabled: boolean;
  port: number;
}): Promise<McpStatus> {
  const run = applyChain.then(async () => {
    await stopMcpServer();
    if (!settings.enabled) {
      return status;
    }
    return startMcpServer(settings.port);
  });
  applyChain = run.catch(() => undefined);
  return run;
}
