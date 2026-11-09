import type { IpcMainInvokeEvent } from "electron";
import type { Knex } from "knex";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestDb, seedGame, truncateAll } from "../db/test-utils.js";

/**
 * Google 검색 흐름 테스트
 * 실제 google-collector 로직에 가짜 Chrome 페이지만 끼워 검증한다.
 */

const HEADLESS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/156.0.0.0 Safari/537.36";
const NORMAL_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const HIGH_RES_IMAGE = "data:image/jpeg;base64,AAAA";

const harness = vi.hoisted(() => ({
  settings: {
    enableGoogleCollector: true,
    slowGoogleSearch: false,
    ignoreUntil: undefined as string | undefined,
  },
  headlessBrowser: null as any,
  visibleBrowser: null as any,
  launchOptions: [] as any[],
  mainWindow: { webContents: { send: vi.fn() } },
  findCollector: vi.fn(),
  saveInfo: vi.fn(),
  downloadImage: vi.fn(),
}));

let testDb: Knex;

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: true },
  BrowserWindow: {
    getAllWindows: () => [harness.mainWindow],
    fromWebContents: () => harness.mainWindow,
  },
}));

vi.mock("chrome-launcher", () => ({
  Launcher: { getInstallations: () => ["chrome.exe"] },
}));

vi.mock("puppeteer-core", () => ({
  default: {
    launch: vi.fn(async (options: { headless: boolean }) => {
      harness.launchOptions.push(options);
      return options.headless
        ? harness.headlessBrowser
        : harness.visibleBrowser;
    }),
  },
}));

vi.mock("../db/db-manager.js", () => ({
  get db() {
    return testDb;
  },
}));

vi.mock("../collectors/registry.js", () => ({
  findCollector: harness.findCollector,
  saveInfo: harness.saveInfo,
}));

vi.mock("../utils/downloader.js", () => ({
  downloadImage: harness.downloadImage,
}));

vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("../store.js", () => ({
  getGoogleCookie: () => "nid-cookie",
  setGoogleCookie: vi.fn(),
  getGoogleAbuseExemption: () => undefined,
  setGoogleAbuseExemption: vi.fn(),
  getGoogleCollectorIgnoreUntil: () => harness.settings.ignoreUntil,
  setGoogleCollectorIgnoreUntil: (value: string | undefined) => {
    harness.settings.ignoreUntil = value;
  },
  getEnableGoogleCollector: () => harness.settings.enableGoogleCollector,
  getSlowGoogleSearch: () => harness.settings.slowGoogleSearch,
}));

/** 요청 시점의 주소와 UA를 기록하는 가짜 Chrome */
function createFakeBrowser(userAgent: string, isBlocked: () => boolean) {
  const requests: {
    url: string;
    userAgent: string;
    userAgentMetadata: unknown;
  }[] = [];

  const newPage = async () => {
    let currentUrl = "about:blank";
    let currentUserAgent = userAgent;
    let currentMetadata: unknown;
    let closed = false;

    return {
      url: () => currentUrl,
      goto: async (url: string) => {
        // 브라우저 내부 페이지는 외부 요청이 아니다
        if (url.startsWith("chrome://")) {
          currentUrl = url;
          return;
        }
        requests.push({
          url,
          userAgent: currentUserAgent,
          userAgentMetadata: currentMetadata,
        });
        currentUrl = isBlocked() ? "https://www.google.com/sorry/index" : url;
      },
      setUserAgent: async (options: {
        userAgent: string;
        userAgentMetadata?: unknown;
      }) => {
        currentUserAgent = options.userAgent;
        currentMetadata = options.userAgentMetadata;
      },
      // getHighEntropyValues가 실제로 돌려주는 값
      evaluate: async () => ({
        architecture: "x86",
        bitness: "64",
        brands: [
          { brand: "Not:A-Brand", version: "8" },
          { brand: "Chromium", version: "156" },
          { brand: "Google Chrome", version: "156" },
        ],
        fullVersionList: [
          { brand: "Not:A-Brand", version: "8.0.0.0" },
          { brand: "Chromium", version: "156.0.8078.81" },
          { brand: "Google Chrome", version: "156.0.8078.81" },
        ],
        mobile: false,
        model: "",
        platform: "Windows",
        platformVersion: "19.0.0",
        uaFullVersion: "156.0.8078.81",
        wow64: false,
      }),
      setCookie: async () => {},
      cookies: async () => [
        { name: "NID", value: "new-nid" },
        { name: "GOOGLE_ABUSE_EXEMPTION", value: "exemption" },
      ],
      $: async () => null,
      // 차단 페이지에는 이미지가 없어 실제처럼 타임아웃된다
      waitForSelector: async () => {
        if (currentUrl.includes("/sorry/")) throw new Error("timeout");
      },
      $$eval: async () => ["https://example.test/thumb.jpg"],
      $eval: async () => HIGH_RES_IMAGE,
      click: async () => {},
      close: async () => {
        closed = true;
      },
      isClosed: () => closed,
    };
  };

  return {
    requests,
    newPage,
    userAgent: async () => userAgent,
    close: async () => {},
    connected: true,
  };
}

const EMPTY_INFO = {
  title: "수집된 제목",
  thumbnailUrl: null,
  images: [],
  publishDate: null,
  rating: null,
  reviewCount: null,
  downloadCount: null,
  makers: [],
  categories: [],
  tags: [],
  externalId: "RJ000001",
  provider: "dlsite",
};

const event = {} as IpcMainInvokeEvent;

/** 비동기 작업이 조건에 도달할 때까지 이벤트 루프를 돌린다 (가짜 타이머와 무관) */
async function until(check: () => boolean) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error("조건이 충족되지 않음");
}

const captchaPromptCount = () =>
  harness.mainWindow.webContents.send.mock.calls.filter(
    ([channel]) => channel === "botBlockDetected",
  ).length;

describe("Google 검색 흐름", () => {
  let handlers: typeof import("./collector.js");
  let GoogleCollector: (typeof import("../collectors/google-collector.js"))["GoogleCollector"];
  let headlessBlocked: boolean;

  /** 코드 없이 폴더명으로 Google을 바로 검색하는 게임 */
  const useGooglePrimary = (id: string) => {
    harness.findCollector.mockResolvedValue({ collector: GoogleCollector, id });
  };

  /** 코드로 정보는 받았지만 썸네일이 비어 Google 보충이 필요한 게임 */
  const useThumbnailFallback = () => {
    harness.findCollector.mockResolvedValue({
      collector: {
        name: "TestSite",
        getId: async () => "RJ000001",
        fetchInfo: async () => EMPTY_INFO,
      },
      id: "RJ000001",
    });
  };

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    vi.clearAllMocks();
    vi.resetModules();

    harness.settings.enableGoogleCollector = true;
    harness.settings.slowGoogleSearch = false;
    harness.settings.ignoreUntil = undefined;
    harness.launchOptions = [];
    harness.downloadImage.mockResolvedValue("thumbs/alpha.jpg");

    headlessBlocked = false;
    harness.headlessBrowser = createFakeBrowser(
      HEADLESS_UA,
      () => headlessBlocked,
    );
    harness.visibleBrowser = createFakeBrowser(NORMAL_UA, () => false);

    handlers = await import("./collector.js");
    ({ GoogleCollector } = await import("../collectors/google-collector.js"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe("검색 횟수", () => {
    it("게임 하나당 Google 검색 페이지를 한 번만 연다", async () => {
      useGooglePrimary("alpha-folder");

      await handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha-folder",
      });

      expect(harness.headlessBrowser.requests.map((r) => r.url)).toEqual([
        "https://www.google.com/search?q=alpha-folder&udm=2",
      ]);
    });

    it("검색 결과의 고화질 이미지를 수집 정보로 저장한다", async () => {
      useGooglePrimary("alpha-folder");

      const result = await handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha-folder",
      });

      expect(result).toEqual({
        gamePath: "/games/alpha-folder",
        success: true,
      });
      expect(harness.saveInfo).toHaveBeenCalledWith(
        "/games/alpha-folder",
        expect.objectContaining({ thumbnailUrl: HIGH_RES_IMAGE }),
      );
    });
  });

  describe("ID 없는 게임의 차단 처리", () => {
    it("인증을 마치면 보이는 창의 결과로 정보를 저장한다", async () => {
      useGooglePrimary("alpha-folder");
      headlessBlocked = true;

      const running = handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha-folder",
      });
      await until(() => captchaPromptCount() === 1);
      await handlers.resolveBotBlockHandler(event, { resolved: true });

      await expect(running).resolves.toEqual({
        gamePath: "/games/alpha-folder",
        success: true,
      });
      expect(harness.saveInfo).toHaveBeenCalledWith(
        "/games/alpha-folder",
        expect.objectContaining({ thumbnailUrl: HIGH_RES_IMAGE }),
      );
    });

    it("인증을 취소하면 수집 실패로 끝난다", async () => {
      useGooglePrimary("alpha-folder");
      headlessBlocked = true;

      const running = handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha-folder",
      });
      await until(() => captchaPromptCount() === 1);
      await handlers.resolveBotBlockHandler(event, { resolved: false });

      await expect(running).resolves.toEqual({
        gamePath: "/games/alpha-folder",
        success: false,
        error: "CAPTCHA 해결 시간 초과 또는 취소됨",
      });
      expect(harness.saveInfo).not.toHaveBeenCalled();
    });
  });

  describe("썸네일 보충", () => {
    it("차단되면 인증 창을 띄우고 인증 후 썸네일을 저장한다", async () => {
      await seedGame(testDb, { path: "/games/alpha", title: "테스트 게임 A" });
      useThumbnailFallback();
      headlessBlocked = true;

      const running = handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha",
      });
      await until(() => captchaPromptCount() === 1);
      expect(harness.mainWindow.webContents.send).toHaveBeenCalledWith(
        "botBlockDetected",
        { gamePath: "/games/alpha", gameTitle: "테스트 게임 A" },
      );
      await handlers.resolveBotBlockHandler(event, { resolved: true });
      await running;

      const game = await testDb("games").where("path", "/games/alpha").first();
      expect(game?.thumbnail).toBe("thumbs/alpha.jpg");
    });

    it("인증을 취소해도 코드로 받은 정보는 성공으로 남는다", async () => {
      await seedGame(testDb, { path: "/games/alpha" });
      useThumbnailFallback();
      headlessBlocked = true;

      const running = handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha",
      });
      await until(() => captchaPromptCount() === 1);
      await handlers.resolveBotBlockHandler(event, { resolved: false });

      await expect(running).resolves.toEqual({
        gamePath: "/games/alpha",
        success: true,
      });
      expect(harness.downloadImage).not.toHaveBeenCalled();
    });

    it("Google 이미지 검색을 끄면 보충 검색을 하지 않는다", async () => {
      await seedGame(testDb, { path: "/games/alpha" });
      useThumbnailFallback();
      harness.settings.enableGoogleCollector = false;

      const result = await handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha",
      });

      expect(result).toEqual({ gamePath: "/games/alpha", success: true });
      expect(harness.headlessBrowser.requests).toEqual([]);
    });
  });

  describe("인증 창 응답", () => {
    it("30분 무시를 고르면 이미 대기 중인 게임도 검색하지 않는다", async () => {
      useGooglePrimary("alpha-folder");
      headlessBlocked = true;

      const running = [
        handlers.runCollectorHandler(event, { gamePath: "/games/alpha" }),
        handlers.runCollectorHandler(event, { gamePath: "/games/beta" }),
      ];
      await until(() => captchaPromptCount() === 1);
      await handlers.resolveBotBlockHandler(event, {
        resolved: false,
        ignoreMinutes: 30,
      });
      await Promise.all(running);

      expect(captchaPromptCount()).toBe(1);
      expect(harness.headlessBrowser.requests).toHaveLength(1);
    });

    it("먼저 끝난 인증의 2분 타이머가 다음 인증을 취소하지 않는다", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      useGooglePrimary("alpha-folder");
      headlessBlocked = true;

      const first = handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha",
      });
      await until(() => captchaPromptCount() === 1);
      await handlers.resolveBotBlockHandler(event, { resolved: true });
      await first;

      await vi.advanceTimersByTimeAsync(60_000);
      let secondDone = false;
      const second = handlers
        .runCollectorHandler(event, { gamePath: "/games/beta" })
        .finally(() => {
          secondDone = true;
        });
      await until(() => captchaPromptCount() === 2);

      // 첫 인증 시작 후 2분이 지나는 시점
      await vi.advanceTimersByTimeAsync(61_000);
      expect(secondDone).toBe(false);

      await handlers.resolveBotBlockHandler(event, { resolved: true });
      await expect(second).resolves.toEqual({
        gamePath: "/games/beta",
        success: true,
      });
    });
  });

  describe("자동화 표시", () => {
    it("헤드리스와 인증용 창 모두 자동화 표시 없이 Chrome을 띄운다", async () => {
      useGooglePrimary("alpha-folder");
      headlessBlocked = true;

      const running = handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha-folder",
      });
      await until(() => captchaPromptCount() === 1);
      await handlers.resolveBotBlockHandler(event, { resolved: false });
      await running;

      expect(harness.launchOptions.map((o) => o.headless)).toEqual([
        true,
        false,
      ]);
      for (const options of harness.launchOptions) {
        expect(options.args).toContain(
          "--disable-blink-features=AutomationControlled",
        );
        expect(options.ignoreDefaultArgs).toEqual(["--enable-automation"]);
      }
    });
  });

  describe("헤드리스 UA", () => {
    it("검색 요청에 HeadlessChrome 표시를 보내지 않는다", async () => {
      useGooglePrimary("alpha-folder");

      await handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha-folder",
      });

      expect(harness.headlessBrowser.requests[0].userAgent).toBe(NORMAL_UA);
    });

    it("UA를 바꿔도 브라우저의 원래 Client Hints를 유지한다", async () => {
      useGooglePrimary("alpha-folder");

      await handlers.runCollectorHandler(event, {
        gamePath: "/games/alpha-folder",
      });

      expect(harness.headlessBrowser.requests[0].userAgentMetadata).toEqual({
        brands: [
          { brand: "Not:A-Brand", version: "8" },
          { brand: "Chromium", version: "156" },
          { brand: "Google Chrome", version: "156" },
        ],
        fullVersionList: [
          { brand: "Not:A-Brand", version: "8.0.0.0" },
          { brand: "Chromium", version: "156.0.8078.81" },
          { brand: "Google Chrome", version: "156.0.8078.81" },
        ],
        fullVersion: "156.0.8078.81",
        platform: "Windows",
        platformVersion: "19.0.0",
        architecture: "x86",
        model: "",
        mobile: false,
        bitness: "64",
        wow64: false,
      });
    });
  });

  describe("천천히 검색 옵션", () => {
    const runTwoSearches = () => {
      useGooglePrimary("alpha-folder");
      return [
        handlers.runCollectorHandler(event, { gamePath: "/games/alpha" }),
        handlers.runCollectorHandler(event, { gamePath: "/games/beta" }),
      ];
    };

    it.each([
      { random: 0, waitMs: 3000 },
      { random: 0.99, waitMs: 5970 },
    ])(
      "켜면 다음 검색까지 무작위로 기다린다 (random=$random → $waitMs ms)",
      async ({ random, waitMs }) => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
        vi.spyOn(Math, "random").mockReturnValue(random);
        harness.settings.slowGoogleSearch = true;

        const running = runTwoSearches();
        await until(() => harness.headlessBrowser.requests.length === 1);

        await vi.advanceTimersByTimeAsync(waitMs - 1);
        for (let i = 0; i < 50; i++) {
          await new Promise((resolve) => setImmediate(resolve));
        }
        expect(harness.headlessBrowser.requests).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(2);
        await Promise.all(running);
        expect(harness.headlessBrowser.requests).toHaveLength(2);
      },
    );

    it("끄면 기다리지 않고 바로 다음 검색을 한다", async () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });

      await Promise.all(runTwoSearches());

      expect(harness.headlessBrowser.requests).toHaveLength(2);
    });
  });
});
