import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn() },
}));

const store = {
  settings: {} as Record<string, unknown>,
  mcp: { enabled: false, port: 38210 },
};
vi.mock("../store.js", () => ({
  MCP_PORT_MIN: 1024,
  MCP_PORT_MAX: 65535,
  getAllSettings: () => store.settings,
  updateSettings: vi.fn((s: Record<string, unknown>) => {
    store.settings = { ...store.settings, ...s };
  }),
  getMcpSettings: () => store.mcp,
  getViewedHelpCards: () => [],
  markHelpCardsViewed: vi.fn(),
}));

const applyMcpSettings = vi.fn(async (..._args: unknown[]) => ({
  running: true,
  port: 38210,
  url: "",
  error: null,
}));
vi.mock("../mcp/server.js", () => ({
  applyMcpSettings: (...args: unknown[]) => applyMcpSettings(...args),
}));

import { updateSettingsHandler, validateMcpSettingsInput } from "./setting.js";

const event = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("validateMcpSettingsInput", () => {
  it("범위 밖 포트는 거부해야 한다", () => {
    expect(() =>
      validateMcpSettingsInput({ mcpSettings: { enabled: true, port: 80 } }),
    ).toThrow("포트는 1024~65535");
    expect(() =>
      validateMcpSettingsInput({ mcpSettings: { enabled: true, port: 70000 } }),
    ).toThrow();
    expect(() =>
      validateMcpSettingsInput({ mcpSettings: { enabled: true, port: 1.5 } }),
    ).toThrow();
  });

  it("정상 포트와 mcpSettings가 없는 입력은 통과해야 한다", () => {
    expect(() =>
      validateMcpSettingsInput({ mcpSettings: { enabled: true, port: 38210 } }),
    ).not.toThrow();
    expect(() =>
      validateMcpSettingsInput({ colorTheme: "default" }),
    ).not.toThrow();
  });
});

describe("updateSettingsHandler", () => {
  it("mcpSettings가 바뀌면 applyMcpSettings를 호출해야 한다", async () => {
    await updateSettingsHandler(event, {
      settings: { mcpSettings: { enabled: true, port: 38210 } },
    });
    expect(applyMcpSettings).toHaveBeenCalledWith(store.mcp);
  });

  it("다른 설정만 바뀌면 applyMcpSettings를 호출하지 않아야 한다", async () => {
    await updateSettingsHandler(event, { settings: { colorTheme: "default" } });
    expect(applyMcpSettings).not.toHaveBeenCalled();
  });

  it("잘못된 포트는 저장 전에 거부해야 한다", async () => {
    const { updateSettings } = await import("../store.js");
    await expect(
      updateSettingsHandler(event, {
        settings: { mcpSettings: { enabled: true, port: 1 } },
      }),
    ).rejects.toThrow("포트는 1024~65535");
    expect(updateSettings).not.toHaveBeenCalled();
  });
});
