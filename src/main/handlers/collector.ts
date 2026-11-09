import { Launcher } from "chrome-launcher";
import type { IpcMainInvokeEvent } from "electron";
import { app, BrowserWindow } from "electron";
import puppeteer, {
  type Browser,
  type Page,
  type Protocol,
} from "puppeteer-core";
import {
  buildGoogleSearchUrl,
  detectBotBlock,
  GoogleCollector,
} from "../collectors/google-collector.js";
import {
  type Collector,
  findCollector,
  saveInfo,
  type CollectorResult,
} from "../collectors/registry.js";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import {
  getEnableGoogleCollector,
  getGoogleAbuseExemption,
  getGoogleCollectorIgnoreUntil,
  getGoogleCookie,
  getSlowGoogleSearch,
  setGoogleAbuseExemption,
  setGoogleCollectorIgnoreUntil,
  setGoogleCookie,
} from "../store.js";
import { downloadImage } from "../utils/downloader.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("Collector");

/**
 * Puppeteer browser 인스턴스 (재사용을 위한 캐싱)
 */
let browserInstance: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
/**
 * 진행 중인 초기화 Promise (race condition 방지용 캐싱)
 */
let initPromise: Promise<Awaited<ReturnType<typeof puppeteer.launch>>> | null =
  null;

// 봇 차단 해결 대기 상태
let botBlockResolveCallback: ((resolved: boolean) => void) | null = null;
let visibleBrowserInstance: Awaited<
  ReturnType<typeof puppeteer.launch>
> | null = null;

/**
 * Google 컬렉터 무시 중인지 확인
 */
function isGoogleCollectorIgnored(): boolean {
  const ignoreUntil = getGoogleCollectorIgnoreUntil();
  if (!ignoreUntil) return false;

  const expireTime = new Date(ignoreUntil).getTime();
  const now = Date.now();

  if (now >= expireTime) {
    // 만료됨 - 설정 삭제
    setGoogleCollectorIgnoreUntil(undefined);
    return false;
  }

  return true;
}

/** navigator.webdriver 등 자동화 표시를 끄고 Chrome을 띄우는 공통 옵션 */
const CHROME_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-blink-features=AutomationControlled",
];
const IGNORED_CHROME_DEFAULT_ARGS = ["--enable-automation"];

/**
 * Puppeteer browser 초기화 (Chrome 설치 경로 자동 검색)
 */
async function initBrowser() {
  // 이미 초기화된 인스턴스 반환
  if (browserInstance) {
    return browserInstance;
  }

  // 이미 초기화 진행 중이면 같은 Promise 반환 (race condition 방지)
  if (initPromise) {
    return initPromise;
  }

  // Promise 생성 및 캐싱
  initPromise = (async () => {
    const installations = Launcher.getInstallations();

    for (const chromePath of installations) {
      try {
        const browser = await puppeteer.launch({
          headless: app.isPackaged,
          executablePath: chromePath,
          args: CHROME_ARGS,
          ignoreDefaultArgs: IGNORED_CHROME_DEFAULT_ARGS,
        });
        browserInstance = browser;
        return browser;
      } catch {
        continue;
      }
    }

    throw new Error("Chrome을 찾을 수 없거나 실행할 수 없습니다.");
  })();

  try {
    return await initPromise;
  } finally {
    // 완료 후 Promise 캐시 정리 (다음 초기화 요청에 대비)
    initPromise = null;
  }
}

/** navigator.userAgentData.getHighEntropyValues 결과 */
interface BrowserClientHints {
  architecture: string;
  bitness: string;
  brands: Protocol.Emulation.UserAgentBrandVersion[];
  fullVersionList: Protocol.Emulation.UserAgentBrandVersion[];
  mobile: boolean;
  model: string;
  platform: string;
  platformVersion: string;
  uaFullVersion: string;
  wow64: boolean;
}

/** 실행 중인 Chrome의 Client Hints (버전이 바뀌지 않으므로 한 번만 읽는다) */
let headlessClientHints: Protocol.Emulation.UserAgentMetadata | undefined;

/**
 * Chrome이 원래 보내는 Client Hints를 읽는다.
 * userAgentData는 보안 컨텍스트에서만 노출되어, 외부 요청이 없는 chrome:// 페이지에서 읽는다.
 */
async function readClientHints(
  browser: Browser,
): Promise<Protocol.Emulation.UserAgentMetadata | undefined> {
  if (headlessClientHints) return headlessClientHints;

  const page = await browser.newPage();
  try {
    await page.goto("chrome://version");
    const hints = await page.evaluate(() =>
      (
        navigator as Navigator & {
          userAgentData: {
            getHighEntropyValues(names: string[]): Promise<BrowserClientHints>;
          };
        }
      ).userAgentData.getHighEntropyValues([
        "architecture",
        "bitness",
        "fullVersionList",
        "model",
        "platformVersion",
        "uaFullVersion",
        "wow64",
      ]),
    );
    headlessClientHints = {
      brands: hints.brands,
      fullVersionList: hints.fullVersionList,
      fullVersion: hints.uaFullVersion,
      platform: hints.platform,
      platformVersion: hints.platformVersion,
      architecture: hints.architecture,
      model: hints.model,
      mobile: hints.mobile,
      bitness: hints.bitness,
      wow64: hints.wow64,
    };
    return headlessClientHints;
  } catch (error) {
    log.warn("Client Hints를 읽지 못해 UA만 변경:", error);
    return undefined;
  } finally {
    await page.close();
  }
}

/**
 * headless 브라우저의 새 페이지를 연다.
 * 기본 UA에는 HeadlessChrome이 그대로 노출되어 일반 Chrome UA로 바꾼다.
 * UA만 덮어쓰면 Sec-CH-UA가 사라지므로 원래 Client Hints를 함께 지정한다.
 */
async function newHeadlessPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  const userAgent = await browser.userAgent();
  if (userAgent.includes("HeadlessChrome")) {
    await page.setUserAgent({
      userAgent: userAgent.replace("HeadlessChrome", "Chrome"),
      userAgentMetadata: await readClientHints(browser),
    });
  }
  return page;
}

/**
 * 봇 차단 해결용 non-headless 브라우저 실행
 */
async function launchVisibleBrowser(): Promise<
  Awaited<ReturnType<typeof puppeteer.launch>>
> {
  // 기존 visible 브라우저가 있으면 재사용
  if (visibleBrowserInstance && visibleBrowserInstance.connected) {
    return visibleBrowserInstance;
  }

  const installations = Launcher.getInstallations();
  for (const chromePath of installations) {
    try {
      const browser = await puppeteer.launch({
        headless: false, // 사용자에게 보이는 모드
        executablePath: chromePath,
        args: [...CHROME_ARGS, "--window-size=800,600"],
        ignoreDefaultArgs: IGNORED_CHROME_DEFAULT_ARGS,
      });
      visibleBrowserInstance = browser;
      return browser;
    } catch {
      continue;
    }
  }

  throw new Error("Chrome을 찾을 수 없거나 실행할 수 없습니다.");
}

/**
 * 봇 차단 해결 대기
 * 사용자가 "해결 완료" 버튼을 누를 때까지 대기
 */
async function waitForBotBlockResolution(
  mainWindow: BrowserWindow | null,
  gamePath: string,
  gameTitle: string,
  timeout: number = 120000, // 2분
): Promise<boolean> {
  return new Promise((resolve) => {
    // 타임아웃 설정
    const timer = setTimeout(() => {
      if (botBlockResolveCallback) {
        botBlockResolveCallback(false);
        botBlockResolveCallback = null;
      }
    }, timeout);

    // 해결 시 타이머를 지워야 남은 타이머가 다음 인증을 취소하지 않는다
    botBlockResolveCallback = (resolved) => {
      clearTimeout(timer);
      resolve(resolved);
    };

    // 프론트엔드에 모달 표시 요청
    mainWindow?.webContents.send("botBlockDetected", { gamePath, gameTitle });
  });
}

/**
 * 봇 차단 해결 핸들러 (프론트엔드에서 "해결 완료" 버튼 클릭 시 호출)
 */
export async function resolveBotBlockHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["resolveBotBlock"],
): Promise<void> {
  // 무시 시간 설정
  if (payload.ignoreMinutes && payload.ignoreMinutes > 0) {
    const expireTime = new Date(Date.now() + payload.ignoreMinutes * 60 * 1000);
    setGoogleCollectorIgnoreUntil(expireTime.toISOString());
    log.info(`봇 차단 ${payload.ignoreMinutes}분간 무시 설정됨`);
  }

  if (botBlockResolveCallback) {
    botBlockResolveCallback(payload.resolved);
    botBlockResolveCallback = null;
  }
}

/**
 * Google headless 페이지에 저장된 쿠키들을 모두 적용한다.
 * - NID: 세이프서치 해제 쿠키
 * - GOOGLE_ABUSE_EXEMPTION: CAPTCHA 통과 증명 쿠키
 */
async function applyGoogleCookies(page: Page): Promise<void> {
  const nid = getGoogleCookie();
  const abuseExemption = getGoogleAbuseExemption();

  const cookies: Parameters<Page["setCookie"]>[0][] = [];
  if (nid) {
    cookies.push({
      name: "NID",
      value: nid,
      domain: ".google.com",
      path: "/",
    });
  }
  if (abuseExemption) {
    cookies.push({
      name: "GOOGLE_ABUSE_EXEMPTION",
      value: abuseExemption,
      domain: ".google.com",
      path: "/",
    });
  }

  if (cookies.length > 0) {
    await page.setCookie(...cookies);
  }
}

/**
 * visible 페이지에서 Google 도메인 쿠키를 추출하여 store에 저장한다.
 * CAPTCHA 통과 직후 호출되어, 갱신된 NID와 새로 발급된 GOOGLE_ABUSE_EXEMPTION을 보존한다.
 */
async function persistGoogleCookiesFromPage(page: Page): Promise<void> {
  try {
    const cookies = await page.cookies("https://www.google.com");
    const nid = cookies.find((c) => c.name === "NID");
    const abuseExemption = cookies.find(
      (c) => c.name === "GOOGLE_ABUSE_EXEMPTION",
    );

    if (nid?.value) {
      setGoogleCookie(nid.value);
    }
    if (abuseExemption?.value) {
      setGoogleAbuseExemption(abuseExemption.value);
      log.info("GOOGLE_ABUSE_EXEMPTION 쿠키 저장됨");
    }
  } catch (error) {
    log.warn("Google 쿠키 추출 실패, 쿠키 없이 진행:", error);
  }
}

/**
 * Google 세이프서치 해제를 위한 새 쿠키 획득
 *
 * Google 페이지는 표준 HTML이 아닌 커스텀 엘리먼트 사용:
 * - 트리거: div.lnnMGf (검색결과 지역 버튼)
 * - 옵션: g-menu-item[role="option"]
 * - 확인: span.GmiStb[role="button"]
 * - 라디오: [role="radio"]
 */
export async function getNewCookie() {
  const browser = await initBrowser();
  if (!browser) return;

  const page = await newHeadlessPage(browser);
  try {
    // ── 1단계: 검색결과 지역을 가나로 설정 (연령 인증 우회) ──
    await page.goto(
      "https://www.google.com/preferences?hl=ko&lang=1&prev=https://www.google.com/preferences?hl%3Dko",
      { waitUntil: "networkidle2" },
    );

    // 이미 가나로 설정되어 있는지 확인
    const regionAlreadySet = await page.evaluate(() => {
      // 지역 버튼의 현재 값이 "가나"인지 확인
      const buttons = document.querySelectorAll('div[role="button"]');
      for (const btn of buttons) {
        if (!btn.textContent?.includes("검색결과 지역")) continue;
        const divs = btn.querySelectorAll("div");
        for (const div of divs) {
          if (div.children.length === 0 && div.textContent?.trim() === "가나") {
            return true;
          }
        }
      }
      return false;
    });

    if (regionAlreadySet) {
      log.info("지역이 이미 가나로 설정됨 — 건너뜀");
    } else {
      // 다이얼로그 열기 → 가나 선택 → 확인
      await page.evaluate(async () => {
        const xPath = (xpath: string) =>
          document.evaluate(
            xpath,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null,
          ).singleNodeValue as HTMLElement | null;

        // 검색결과 지역 버튼
        const trigger = xPath(
          "/html/body/div[2]/div[1]/div[2]/div/div[3]/div/div[2]/div[1]/div",
        );
        if (!trigger) throw new Error("지역 설정 버튼을 찾을 수 없음");
        trigger.click();
        await new Promise((r) => setTimeout(r, 1500));

        // 가나
        const ghana = xPath(
          "/html/body/div[6]/div/div[2]/span/div/g-menu/g-menu-item[2]/div",
        );
        if (!ghana) throw new Error("가나 옵션을 찾을 수 없음");
        ghana.click();
        await new Promise((r) => setTimeout(r, 1000));

        // 확인
        const confirm = xPath(
          "/html/body/div[6]/div/div[2]/span/div/div[2]/span[2]",
        );
        if (!confirm) throw new Error("확인 버튼을 찾을 수 없음");
        confirm.click();
      });
      log.info("지역 가나로 설정 완료");
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    // ── 2단계: 세이프서치 해제 ──
    await page.goto("https://www.google.com/safesearch?hl=ko", {
      waitUntil: "networkidle2",
    });

    await page.evaluate(() => {
      const radios = document.querySelectorAll('[role="radio"]');
      for (const radio of radios) {
        if (radio.textContent?.includes("사용 안함")) {
          (radio as HTMLElement).click();
          return;
        }
      }
      throw new Error("사용 안함 라디오를 찾을 수 없음");
    });
    log.info("세이프서치 해제 완료");

    // 쿠키 적용 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const cookies = await page.cookies();
    const targetCookie = cookies.find((cookie) => cookie.name === "NID");
    if (!targetCookie) {
      log.warn("NID 쿠키를 찾을 수 없음");
      return;
    }

    setGoogleCookie(targetCookie.value);
    return targetCookie.value;
  } finally {
    await page.close();
  }
}

/**
 * 동시 실행 제한을 위한 큐 기반 유틸리티
 */
class ConcurrencyQueue {
  private running = 0;
  private queue: Array<() => Promise<void>> = [];

  constructor(private limit: number) {}

  async add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          resolve(await fn());
        } catch (err) {
          reject(err);
        }
      });
      this.process();
    });
  }

  private async process() {
    while (this.queue.length > 0 && this.running < this.limit) {
      this.running++;
      const task = this.queue.shift();
      if (task) {
        try {
          await task();
        } finally {
          this.running--;
          this.process();
        }
      }
    }
  }
}

/**
 * Google 콜렉터/Fallback 호출 직렬화 큐.
 * 동시 호출 시 구글 봇 감지가 트리거되어 매 게임마다 CAPTCHA가 뜨는 문제를 방지하기 위해
 * 동시성을 1로 제한한다. (외부 ConcurrencyQueue(5)와는 별개)
 */
const googleSerialQueue = new ConcurrencyQueue(1);

/** "천천히 검색" 옵션을 켰을 때 Google 검색 사이의 무작위 간격 */
const SLOW_SEARCH_MIN_GAP_MS = 3000;
const SLOW_SEARCH_MAX_GAP_MS = 6000;

let lastGoogleSearchAt = 0;

/** 옵션이 켜져 있으면 직전 검색과의 간격을 확보한다. 첫 검색은 기다리지 않는다 */
async function throttleGoogleSearch(): Promise<void> {
  if (getSlowGoogleSearch()) {
    const gap =
      SLOW_SEARCH_MIN_GAP_MS +
      Math.random() * (SLOW_SEARCH_MAX_GAP_MS - SLOW_SEARCH_MIN_GAP_MS);
    const waitMs = lastGoogleSearchAt + gap - Date.now();
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  lastGoogleSearchAt = Date.now();
}

interface GoogleSearchArgs {
  gamePath: string;
  gameTitle: string | undefined;
  id: string;
}

/** info가 없고 error도 없으면 검색을 건너뛰었거나 결과가 없는 경우 */
interface GoogleSearchOutcome {
  info?: CollectorResult;
  error?: string;
}

/** 이미 검색 결과를 연 페이지에서 정보를 읽는다 */
async function readGoogleResult(
  page: Page,
  { gamePath, id }: GoogleSearchArgs,
): Promise<CollectorResult | undefined> {
  const result = await GoogleCollector.fetchInfo({ path: gamePath, id, page });
  return result && "thumbnailUrl" in result
    ? (result as CollectorResult)
    : undefined;
}

/** 보이는 Chrome에서 사용자가 CAPTCHA를 푼 뒤 그 창에서 결과를 읽는다 */
async function collectAfterCaptcha(
  args: GoogleSearchArgs,
  searchUrl: string,
): Promise<GoogleSearchOutcome> {
  const visibleBrowser = await launchVisibleBrowser();
  const visiblePage = await visibleBrowser.newPage();

  try {
    await applyGoogleCookies(visiblePage);
    await visiblePage.goto(searchUrl, { waitUntil: "networkidle2" });

    const resolved = await waitForBotBlockResolution(
      BrowserWindow.getAllWindows()[0],
      args.gamePath,
      args.gameTitle ?? args.id,
    );
    if (!resolved) {
      return { error: "CAPTCHA 해결 시간 초과 또는 취소됨" };
    }

    await persistGoogleCookiesFromPage(visiblePage);

    // 사용자가 어느 화면에서 완료를 눌렀는지 알 수 없어 결과 페이지를 다시 연다
    await visiblePage.goto(searchUrl, { waitUntil: "networkidle2" });
    return { info: await readGoogleResult(visiblePage, args) };
  } finally {
    await visiblePage.close();
    if (visibleBrowserInstance) {
      await visibleBrowserInstance.close();
      visibleBrowserInstance = null;
    }
  }
}

/**
 * Google 검색의 단일 진입점. ID 없는 게임의 수집과 썸네일 보충이 함께 쓴다.
 * 직렬 큐, 설정 확인, 쿠키, 요청 간격, 차단 감지와 인증을 모두 여기서 처리한다.
 */
async function searchGoogle(
  args: GoogleSearchArgs,
): Promise<GoogleSearchOutcome> {
  return googleSerialQueue.add(async () => {
    // 큐에서 기다리는 동안 "30분 무시"가 눌릴 수 있어 실행 직전에 확인한다
    if (!getEnableGoogleCollector() || isGoogleCollectorIgnored()) {
      log.debug("Google 검색 스킵 (비활성화 또는 봇 차단 무시 중)");
      return {};
    }

    try {
      if (!getGoogleCookie()) {
        await getNewCookie();
      }
      await throttleGoogleSearch();

      const searchUrl = buildGoogleSearchUrl(args.id);
      const browser = await initBrowser();
      const page = await newHeadlessPage(browser);

      try {
        await applyGoogleCookies(page);
        await page.goto(searchUrl, { waitUntil: "networkidle2" });

        const botBlockResult = await detectBotBlock(page);
        if (!botBlockResult.blocked) {
          return { info: await readGoogleResult(page, args) };
        }

        log.warn(`봇 차단 감지: ${botBlockResult.reason}`);
        await page.close();
        return await collectAfterCaptcha(args, searchUrl);
      } finally {
        if (!page.isClosed()) {
          await page.close();
        }
      }
    } catch (chromeError) {
      log.error("Chrome 에러:", chromeError);
      return { error: String(chromeError) };
    }
  });
}

/**
 * 단일 게임에 대한 primary 정보 수집 (saveInfo, fallback 미포함).
 * Google 콜렉터 분기는 내부적으로 googleSerialQueue 를 사용해 직렬화한다.
 * 비-Google 분기는 큐 없이 즉시 실행 (호출자가 적절한 큐로 감싸야 함).
 *
 * 반환:
 * - earlyReturn: 호출자가 즉시 반환해야 할 결과 (CAPTCHA 타임아웃, Chrome 에러 등)
 * - info: 수집된 메타데이터 (성공 시)
 * - 둘 다 undefined: 정보를 가져오지 못함 (호출자가 "정보를 가져올 수 없습니다" 처리)
 */
async function runPrimaryCollection(args: {
  gamePath: string;
  gameTitle: string | undefined;
  collector: Collector;
  id: string;
}): Promise<{
  earlyReturn?: IpcMainEventMap["collectorDone"];
  info?: CollectorResult;
}> {
  const { gamePath, gameTitle, collector, id } = args;
  let info: CollectorResult | undefined;

  if (collector.name === "Google") {
    const outcome = await searchGoogle({ gamePath, gameTitle, id });
    if (outcome.error) {
      return {
        earlyReturn: { gamePath, success: false, error: outcome.error },
      };
    }
    return { info: outcome.info };
  }

  const fetchResult = await collector.fetchInfo({ path: gamePath, id });
  if (fetchResult && "thumbnailUrl" in fetchResult) {
    info = fetchResult as CollectorResult;
  }

  return { info };
}

/**
 * 비-Google primary 콜렉터로 썸네일을 못 받았을 때 Google 검색으로 썸네일만 보충.
 * 실패해도 코드로 받은 정보는 유지되도록 수집 실패로 전파하지 않는다.
 */
async function runGoogleFallback(
  gamePath: string,
  gameTitle: string | undefined,
): Promise<void> {
  const id = await GoogleCollector.getId(gamePath);
  if (!id) return;

  const { info, error } = await searchGoogle({ gamePath, gameTitle, id });
  if (error) {
    log.warn(`Google 폴백 실패, 썸네일 없이 진행: ${gamePath}`, error);
    return;
  }
  if (!info?.thumbnailUrl) return;

  try {
    const thumbnailPath = await downloadImage(info.thumbnailUrl, gamePath);
    await db("games")
      .where("path", gamePath)
      .update({ thumbnail: thumbnailPath });
  } catch (downloadError) {
    log.warn(
      `Google 썸네일 다운로드 실패, 썸네일 없이 진행: ${gamePath}`,
      downloadError,
    );
  }
}

/**
 * 단일 게임 컬렉터 실행
 */
export async function runCollectorHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["runCollector"],
): Promise<IpcMainEventMap["collectorDone"]> {
  const { gamePath, force } = payload;

  // 이미 수집되었는지 확인
  const game = await db("games").where("path", gamePath).first();
  if (!force && game?.isLoadedInfo) {
    return { gamePath, success: true, alreadyCollected: true };
  }

  try {
    // 컬렉터 찾기
    const result = await findCollector(gamePath);
    if (!result) {
      return {
        gamePath,
        success: false,
        error: "지원하지 않는 게임입니다 (ID를 찾을 수 없음)",
      };
    }

    const { collector, id } = result;

    // Primary 정보 수집
    const primary = await runPrimaryCollection({
      gamePath,
      gameTitle: game?.title,
      collector,
      id,
    });
    if (primary.earlyReturn) {
      return primary.earlyReturn;
    }
    if (!primary.info) {
      return { gamePath, success: false, error: "정보를 가져올 수 없습니다." };
    }

    // DB 저장 (이미지 다운로드 포함)
    await saveInfo(gamePath, primary.info);

    // 썸네일이 없으면 Google 콜렉터로 fallback 시도
    if (!primary.info.thumbnailUrl && collector.name !== "Google") {
      await runGoogleFallback(gamePath, game?.title);
    }

    return { gamePath, success: true };
  } catch (error) {
    log.error(`에러: ${gamePath}`, error);
    return { gamePath, success: false, error: String(error) };
  }
}

/**
 * 전체 게임 컬렉터 실행
 *
 * 두 큐를 병렬로 운용:
 * - nonGoogleQueue (5): 비-Google primary 수집 + saveInfo
 * - googleSerialQueue (1, 모듈 레벨): Google primary 수집 및 Google fallback
 *
 * Google 작업이 직렬 큐에서 대기하더라도 비-Google 큐 슬롯을 점유하지 않아
 * 비-Google 게임 처리가 막히지 않는다.
 */
export async function runAllCollectorsHandler(
  event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["runAllCollectors"],
): Promise<IpcMainEventMap["allCollectorsDone"]> {
  const { force } = payload;
  const mainWindow = BrowserWindow.fromWebContents(event.sender);

  let query = db("games").select("path", "title");
  if (!force) {
    query = query.where("isLoadedInfo", 0);
  }
  const games = await query;

  const total = games.length;
  let success = 0;
  let failed = 0;
  let completed = 0;

  const updateProgress = (gameTitle: string) => {
    completed++;
    mainWindow?.webContents.send("collectorProgress", {
      current: completed,
      total,
      gameTitle,
    });
  };

  // 비-Google primary 작업용 큐. Google 작업은 모듈 레벨 googleSerialQueue 사용.
  const nonGoogleQueue = new ConcurrencyQueue(5);

  const promises = games.map(async (game) => {
    try {
      // 이미 수집된 게임 스킵 (force=false)
      if (!force) {
        const existing = await db("games").where("path", game.path).first();
        if (existing?.isLoadedInfo) {
          success++;
          updateProgress(game.title);
          return;
        }
      }

      // 컬렉터 분류 (cheap, 네트워크 없음)
      const result = await findCollector(game.path);
      if (!result) {
        failed++;
        updateProgress(game.title);
        return;
      }

      const { collector, id } = result;

      // Primary + saveInfo 묶음.
      // 비-Google 은 nonGoogleQueue 슬롯 점유, Google 은 내부에서 googleSerialQueue 사용.
      const runPrimaryAndSave = async () => {
        const primary = await runPrimaryCollection({
          gamePath: game.path,
          gameTitle: game.title,
          collector,
          id,
        });
        if (primary.earlyReturn || !primary.info) {
          return primary;
        }
        await saveInfo(game.path, primary.info);
        return primary;
      };

      const primary =
        collector.name === "Google"
          ? await runPrimaryAndSave()
          : await nonGoogleQueue.add(runPrimaryAndSave);

      if (primary.earlyReturn || !primary.info) {
        failed++;
        updateProgress(game.title);
        return;
      }

      // Google fallback: googleSerialQueue 에 별도 enqueue (비-Google 슬롯 점유 X)
      if (!primary.info.thumbnailUrl && collector.name !== "Google") {
        await runGoogleFallback(game.path, game.title);
      }

      success++;
      updateProgress(game.title);
    } catch (error) {
      log.error(`에러: ${game.path}`, error);
      failed++;
      updateProgress(game.title);
    }
  });

  await Promise.all(promises);

  return { total, success, failed };
}
