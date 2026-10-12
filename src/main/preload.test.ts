import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * preload의 on/once/removeListener가 실제로 리스너를 떼는지 검증
 *
 * on()은 콜백을 ipcRenderer용 래퍼로 감싸 등록하므로, removeListener가 원본
 * 콜백만 넘기면 아무것도 제거되지 않는다. 래퍼를 기억했다가 떼는지 확인한다.
 */

// contextBridge.exposeInMainWorld로 넘어오는 api 객체를 가로챈다
const exposed: { api: Record<string, (...args: unknown[]) => unknown> } = {
  api: {},
};
const emitter = new EventEmitter();

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: typeof exposed.api) => {
      exposed.api = api;
    },
  },
  ipcRenderer: {
    on: (channel: string, listener: (...args: unknown[]) => void) =>
      emitter.on(channel, listener),
    once: (channel: string, listener: (...args: unknown[]) => void) =>
      emitter.once(channel, listener),
    removeListener: (channel: string, listener: (...args: unknown[]) => void) =>
      emitter.removeListener(channel, listener),
    removeAllListeners: (channel: string) =>
      emitter.removeAllListeners(channel),
    invoke: vi.fn(),
  },
  webUtils: { getPathForFile: vi.fn() },
}));

await import("./preload.js");

describe("preload 리스너 등록/해제", () => {
  beforeEach(() => {
    emitter.removeAllListeners();
  });

  it("removeListener로 뗀 콜백은 이후 이벤트를 받지 않아야 한다", () => {
    const callback = vi.fn();
    exposed.api.on("mcpStatusChanged", callback);
    emitter.emit("mcpStatusChanged", {}, { running: true });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ running: true });

    exposed.api.removeListener("mcpStatusChanged", callback);
    emitter.emit("mcpStatusChanged", {}, { running: false });
    expect(callback).toHaveBeenCalledTimes(1);
    expect(emitter.listenerCount("mcpStatusChanged")).toBe(0);
  });

  it("같은 콜백을 두 채널에 등록해도 한 채널만 떼어져야 한다", () => {
    const callback = vi.fn();
    exposed.api.on("autoScanDone", callback);
    exposed.api.on("mcpStatusChanged", callback);
    exposed.api.removeListener("autoScanDone", callback);

    expect(emitter.listenerCount("autoScanDone")).toBe(0);
    expect(emitter.listenerCount("mcpStatusChanged")).toBe(1);
    emitter.emit("mcpStatusChanged", {}, 1);
    expect(callback).toHaveBeenCalledWith(1);
  });

  it("once로 등록한 콜백은 한 번 호출 뒤 기억에서도 지워져야 한다", () => {
    const callback = vi.fn();
    exposed.api.once("autoScanDone", callback);
    emitter.emit("autoScanDone", {}, "a");
    emitter.emit("autoScanDone", {}, "b");
    expect(callback).toHaveBeenCalledTimes(1);
    // 이미 소비된 리스너를 떼도 오류 없이 지나가야 한다
    expect(() =>
      exposed.api.removeListener("autoScanDone", callback),
    ).not.toThrow();
    expect(emitter.listenerCount("autoScanDone")).toBe(0);
  });

  it("아직 실행되지 않은 once 리스너도 removeListener로 뗄 수 있어야 한다", () => {
    const callback = vi.fn();
    exposed.api.once("autoScanDone", callback);
    exposed.api.removeListener("autoScanDone", callback);
    emitter.emit("autoScanDone", {}, "a");
    expect(callback).not.toHaveBeenCalled();
  });
});
