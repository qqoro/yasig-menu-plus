/**
 * AI 클라이언트에 이 앱의 MCP 서버를 등록할 때 쓰는 명령어·설정 문자열.
 * 설정 화면과 도움말 페이지가 같은 문자열을 보여 주도록 한곳에서 만든다.
 */

export const MCP_SERVER_NAME = "yasig";

/** 포트로 MCP 접속 주소를 만든다 */
export function buildMcpUrl(port: number): string {
  return `http://127.0.0.1:${port}/mcp`;
}

/** Claude Code 등록 명령 */
export function buildClaudeCodeCommand(url: string): string {
  return `claude mcp add --transport http ${MCP_SERVER_NAME} ${url}`;
}

/** Codex CLI 등록 명령 */
export function buildCodexCommand(url: string): string {
  return `codex mcp add ${MCP_SERVER_NAME} --url ${url}`;
}

/**
 * Claude Desktop용 claude_desktop_config.json 조각.
 * 커스텀 커넥터는 Anthropic 서버에서 접속하므로 로컬 주소에 닿지 않아
 * mcp-remote(stdio → HTTP 브리지)를 거친다.
 */
export function buildClaudeDesktopConfig(url: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVER_NAME]: {
          command: "npx",
          args: ["-y", "mcp-remote", url, "--transport", "http-only"],
        },
      },
    },
    null,
    2,
  );
}
