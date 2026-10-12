import { describe, expect, it } from "vitest";
import {
  buildClaudeCodeCommand,
  buildClaudeDesktopConfig,
  buildCodexCommand,
  buildMcpUrl,
} from "../mcp-commands";

describe("mcp-commands", () => {
  const url = buildMcpUrl(38210);

  it("포트로 루프백 MCP 주소를 만든다", () => {
    expect(url).toBe("http://127.0.0.1:38210/mcp");
  });

  it("Claude Code 등록 명령에 HTTP 전송과 주소가 들어간다", () => {
    expect(buildClaudeCodeCommand(url)).toBe(
      "claude mcp add --transport http yasig http://127.0.0.1:38210/mcp",
    );
  });

  it("Codex CLI 등록 명령에 주소가 들어간다", () => {
    expect(buildCodexCommand(url)).toBe(
      "codex mcp add yasig --url http://127.0.0.1:38210/mcp",
    );
  });

  it("Claude Desktop 설정은 mcp-remote를 http-only로 거치는 JSON이다", () => {
    const parsed = JSON.parse(buildClaudeDesktopConfig(url));
    expect(parsed.mcpServers.yasig).toEqual({
      command: "npx",
      args: ["-y", "mcp-remote", url, "--transport", "http-only"],
    });
  });
});
