/**
 * MCP 서버 생명주기/HTTP 통합 테스트 (인메모리 SQLite, 임시 포트)
 */

import { request } from "http";
import type { AddressInfo } from "net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Knex } from "knex";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestDb, seedGame, truncateAll } from "../db/test-utils.js";

// ========== 모킹 ==========

vi.mock("electron", () => ({
  app: {
    getPath: () => "/mock/userData",
    getVersion: () => "0.0.0-test",
    isPackaged: false,
  },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => p,
  toRelativePath: (p: string | null) => p,
}));
vi.mock("../utils/validator.js", () => ({
  validatePath: vi.fn(),
  validateDirectoryPath: vi.fn(),
  validateSearchQuery: vi.fn(),
  validateUrl: vi.fn(),
}));
vi.mock("../store.js", () => ({
  getTranslationSettings: () => ({
    titleDisplayPriority: ["translated", "collected", "original"],
  }),
  DEFAULT_TITLE_DISPLAY_PRIORITY: ["translated", "collected", "original"],
  getExcludedExecutables: () => [],
  addExcludedExecutable: vi.fn(),
  removeExcludedExecutable: vi.fn(),
  getLibraryPaths: () => ["/library/path"],
  getDisabledLibraryPaths: () => [],
  getOfflineLibraryPaths: () => [],
  getScanDepth: () => 5,
  getEnableNonGameContent: () => false,
  setLastRefreshedAt: vi.fn(),
}));
vi.mock("../utils/downloader.js", () => ({
  deleteImage: vi.fn(),
  downloadImage: vi.fn(),
  deleteThumbnail: vi.fn(),
}));
vi.mock("../workers/run-scan-worker.js", () => ({ runScanWorker: vi.fn() }));
vi.mock("../lib/fingerprint.js", () => ({
  computeFingerprint: vi.fn(() => Promise.resolve("mock-fp")),
}));
vi.mock("../handlers/home-scan.js", () => ({ scanLibraryPaths: vi.fn() }));
vi.mock("../handlers/home-library.js", () => ({
  registerLibraryPath: vi.fn(),
}));
vi.mock("../handlers/home-game-control.js", () => ({
  toExecutableFileName: (e: string) => e.split(/[/\\]/).pop() || e,
}));
vi.mock("./notify.js", () => ({
  notifyGameChanged: vi.fn(),
  notifyExternalChange: vi.fn(),
  broadcast: vi.fn(),
}));
vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: { getKnex: () => dbRef.current! },
}));

import {
  applyMcpSettings,
  buildMcpUrl,
  getMcpStatus,
  isAllowedHost,
  onMcpStatusChange,
  startMcpServer,
  stopMcpServer,
} from "./server.js";

const EXPECTED_TOOLS = [
  "search_games",
  "get_game",
  "list_tags",
  "list_makers",
  "list_categories",
  "get_game_images",
  "find_duplicates",
  "export_game_list",
  "update_game",
  "set_rating",
  "add_tags",
  "remove_tags",
  "add_makers",
  "remove_makers",
  "add_categories",
  "remove_categories",
  "set_executable_path",
  "set_thumbnail_from_url",
  "set_thumbnail_from_file",
  "remove_thumbnail",
  "refresh_library",
  "add_library_path",
  "list_excluded_executables",
  "add_excluded_executable",
  "remove_excluded_executable",
];

/** OS가 비어 있다고 알려 준 포트 하나를 얻는다 */
async function getFreePort(): Promise<number> {
  const { createServer } = await import("http");
  return new Promise((resolve, reject) => {
    const probe = createServer().listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
    probe.on("error", reject);
  });
}

/** 포트에 listen이 가능한지 (다른 서버가 점유 중이면 false) */
async function isPortFree(port: number): Promise<boolean> {
  const { createServer } = await import("http");
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
  });
}

/**
 * 원시 HTTP 요청 (Host/Origin 헤더를 직접 지정하기 위해 fetch 대신 사용)
 */
function rawPost(
  port: number,
  headers: Record<string, string>,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path: "/mcp",
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...headers,
        },
      },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode ?? 0));
      },
    );
    req.on("error", reject);
    req.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }));
  });
}

beforeAll(async () => {
  dbRef.current = await createTestDb();
});
afterAll(async () => {
  await stopMcpServer();
  await dbRef.current?.destroy();
});
beforeEach(async () => {
  await truncateAll(dbRef.current!);
});

describe("isAllowedHost / buildMcpUrl", () => {
  it("127.0.0.1:<port>와 localhost:<port>만 허용해야 한다", () => {
    expect(isAllowedHost("127.0.0.1:38210", 38210)).toBe(true);
    expect(isAllowedHost("localhost:38210", 38210)).toBe(true);
    expect(isAllowedHost("127.0.0.1", 38210)).toBe(false);
    expect(isAllowedHost("127.0.0.1:1", 38210)).toBe(false);
    expect(isAllowedHost("evil.example:38210", 38210)).toBe(false);
    expect(isAllowedHost(undefined, 38210)).toBe(false);
  });

  it("URL 형식", () => {
    expect(buildMcpUrl(38210)).toBe("http://127.0.0.1:38210/mcp");
  });
});

describe("MCP 서버", () => {
  it("꺼진 상태의 기본 상태값", () => {
    expect(getMcpStatus()).toEqual({
      running: false,
      port: 0,
      url: "",
      error: null,
    });
  });

  it("기동 → tools/list → get_game → 정지", async () => {
    const seen: boolean[] = [];
    const off = onMcpStatusChange((s) => seen.push(s.running));

    const status = await startMcpServer(0);
    expect(status.running).toBe(true);
    expect(status.error).toBeNull();
    expect(status.url).toBe(`http://127.0.0.1:${status.port}/mcp`);

    await seedGame(dbRef.current!, { path: "/games/a", title: "Alpha" });

    const client = new Client({ name: "test-client", version: "0.0.0" });
    const transport = new StreamableHTTPClientTransport(new URL(status.url));
    await client.connect(transport);

    const tools = await client.listTools();
    expect(tools.tools.map((t) => t.name).sort()).toEqual(
      [...EXPECTED_TOOLS].sort(),
    );

    const ok = await client.callTool({
      name: "get_game",
      arguments: { path: "/games/a" },
    });
    expect(ok.isError).toBeFalsy();
    const content = ok.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text).title).toBe("Alpha");

    const bad = await client.callTool({
      name: "get_game",
      arguments: { path: "/none" },
    });
    expect(bad.isError).toBe(true);

    const tooMany = await client.callTool({
      name: "search_games",
      arguments: { limit: 1000 },
    });
    expect(tooMany.isError).toBe(true);
    // zod 검증 단계에서 막히므로 인자(limit) 오류가 보고되어야 한다
    const tooManyText = (tooMany.content as Array<{ text: string }>)[0].text;
    expect(tooManyText).toContain("limit");

    await client.close();
    await stopMcpServer();
    expect(getMcpStatus().running).toBe(false);
    expect(getMcpStatus().url).toBe("");
    expect(seen).toEqual([true, false]);
    off();
  });

  it("Host가 다르거나 Origin이 있으면 403", async () => {
    const status = await startMcpServer(0);
    expect(await rawPost(status.port, { host: "evil.example:80" })).toBe(403);
    expect(
      await rawPost(status.port, {
        host: `127.0.0.1:${status.port}`,
        origin: "http://attacker.example",
      }),
    ).toBe(403);
    await stopMcpServer();
  });

  it("/mcp 외 경로는 404", async () => {
    const status = await startMcpServer(0);
    const code = await new Promise<number>((resolve, reject) => {
      const req = request(
        { host: "127.0.0.1", port: status.port, path: "/other", method: "GET" },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(code).toBe(404);
    await stopMcpServer();
  });

  it("포트가 사용 중이면 reject하지 않고 error 상태를 돌려줘야 한다", async () => {
    const first = await startMcpServer(0);
    // 같은 포트로 두 번째 http 서버를 띄우려면 먼저 모듈 상태를 비워야 하므로
    // 별도 http 서버로 포트를 점유한 뒤 startMcpServer를 호출한다
    await stopMcpServer();
    const { createServer } = await import("http");
    const blocker = createServer().listen(first.port, "127.0.0.1");
    await new Promise((r) => blocker.once("listening", r));
    try {
      const status = await startMcpServer(first.port);
      expect(status.running).toBe(false);
      expect(status.error).toContain("이미 사용 중");
      expect(getMcpStatus().running).toBe(false);
    } finally {
      await new Promise((r) => blocker.close(r));
    }
  });

  it("await 없이 start를 두 번 호출해도 running 상태여야 한다", async () => {
    const [a, b] = await Promise.all([startMcpServer(0), startMcpServer(0)]);
    expect(a.running).toBe(true);
    expect(b.port).toBe(a.port);
    expect(getMcpStatus().running).toBe(true);
    expect(getMcpStatus().error).toBeNull();
    await stopMcpServer();
  });

  it("applyMcpSettings가 연달아 호출되면 마지막 설정의 포트로 떠 있어야 한다", async () => {
    // 서로 다른 고정 포트로 두 번 호출해 직렬화(정지 → 기동)가 지켜지는지 본다
    const [p1, p2] = await Promise.all([getFreePort(), getFreePort()]);
    const results = await Promise.all([
      applyMcpSettings({ enabled: true, port: p1 }),
      applyMcpSettings({ enabled: true, port: p2 }),
    ]);
    expect(results[0].port).toBe(p1);
    expect(results[1].port).toBe(p2);
    expect(getMcpStatus().running).toBe(true);
    expect(getMcpStatus().port).toBe(p2);
    expect(getMcpStatus().error).toBeNull();
    // 첫 서버는 닫혀 p1이 다시 비어 있어야 한다
    expect(await isPortFree(p1)).toBe(true);
    await stopMcpServer();
  });

  it("기동이 끝나기 전에 stop을 호출해도 서버가 남지 않아야 한다", async () => {
    const port = await getFreePort();
    const starting = startMcpServer(port);
    await stopMcpServer();
    const started = await starting;
    expect(started.running).toBe(true);
    expect(getMcpStatus().running).toBe(false);
    expect(await isPortFree(port)).toBe(true);
  });

  it("잘못된 포트는 reject 대신 error 상태로 돌려줘야 한다", async () => {
    const status = await startMcpServer(99999);
    expect(status.running).toBe(false);
    expect(status.error).toBeTruthy();
    expect(getMcpStatus().error).toBeTruthy();
  });

  it("정지하면 남아 있던 error가 초기화돼야 한다", async () => {
    await startMcpServer(99999);
    expect(getMcpStatus().error).toBeTruthy();
    await stopMcpServer();
    expect(getMcpStatus().error).toBeNull();
  });
});
