import { Launcher } from "chrome-launcher";
import type { IpcMainInvokeEvent } from "electron";
import { app, BrowserWindow } from "electron";
import puppeteer, { type Page } from "puppeteer-core";
import { detectBotBlock } from "../collectors/google-collector.js";
import {
  findCollector,
  saveInfo,
  type CollectorResult,
} from "../collectors/registry.js";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import { getGoogleCookie, setGoogleCookie } from "../store.js";
import { downloadImage } from "../utils/downloader.js";

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
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
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

/**
 * 봇 차단 해결용 non-headless 브라우저 실행
 */
async function launchVisibleBrowser(): Promise<
  Awaited<ReturnType<typeof puppeteer.launch>>
> {
  // 기존 visible 브라우저가 있으면 재사용
  if (visibleBrowserInstance && visibleBrowserInstance.isConnected()) {
    return visibleBrowserInstance;
  }

  const installations = Launcher.getInstallations();
  for (const chromePath of installations) {
    try {
      const browser = await puppeteer.launch({
        headless: false, // 사용자에게 보이는 모드
        executablePath: chromePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--window-size=800,600",
        ],
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
    botBlockResolveCallback = resolve;

    // 프론트엔드에 모달 표시 요청
    mainWindow?.webContents.send("botBlockDetected", { gamePath, gameTitle });

    // 타임아웃 설정
    setTimeout(() => {
      if (botBlockResolveCallback) {
        botBlockResolveCallback(false);
        botBlockResolveCallback = null;
      }
    }, timeout);
  });
}

/**
 * 봇 차단 해결 핸들러 (프론트엔드에서 "해결 완료" 버튼 클릭 시 호출)
 */
export async function resolveBotBlockHandler(
  _event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["resolveBotBlock"],
): Promise<void> {
  if (botBlockResolveCallback) {
    botBlockResolveCallback(payload.resolved);
    botBlockResolveCallback = null;
  }
}

/**
 * 요소가 나타날 때까지 대기 후 클릭
 */
async function waitAndClick(page: Page, selector: string, timeout = 5000) {
  await page.waitForSelector(selector, { timeout });
  await page.click(selector);
}

/**
 * Google 세이프서치 해제를 위한 새 쿠키 획득
 */
export async function getNewCookie() {
  const browser = await initBrowser();
  if (!browser) return;

  const page = await browser.newPage();
  try {
    await page.goto("https://www.google.com/preferences?hl=ko&fg=1");

    // 국가 설정 (한국)
    await waitAndClick(
      page,
      "body > div:nth-child(2) > div.iORcjf > div.LFAdvb > g-menu > g-menu-item:nth-child(2)",
    );
    await waitAndClick(
      page,
      "body > div:nth-child(2) > div.iORcjf > div:nth-child(2) > div:nth-child(2) > div.HrFxGf > div > div > div",
    );
    await waitAndClick(
      page,
      "body > div.iORcjf > div:nth-child(2) > div > div:nth-child(2) > div > div:nth-child(2) > div > div:nth-child(2) > div.HrqWPb",
    );
    await waitAndClick(
      page,
      "#lb > div > div.mcPPZ.nP0TDe.xg7rAe.ivkdbf > span > div > g-menu > g-menu-item:nth-child(2)",
    );
    await waitAndClick(
      page,
      "#lb > div > div.mcPPZ.nP0TDe.xg7rAe.ivkdbf > span > div > div.JhVSze > span:nth-child(2)",
    );

    // 세이프서치 설정 (해제)
    await page.goto("https://www.google.com/preferences?hl=ko&fg=1");
    await waitAndClick(
      page,
      "body > div:nth-child(2) > div.iORcjf > div:nth-child(2) > div:nth-child(1) > div:nth-child(2) > div > div > div",
    );
    await waitAndClick(
      page,
      "body > div.GSpaEb > div:nth-child(2) > g-radio-button-group > div:nth-child(6)",
    );
    // 새로운 쿠키가 적용될 때까지 대기
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const cookies = await page.cookies();
    const targetCookie = cookies.find((cookie) => cookie.name === "NID");
    if (!targetCookie) {
      console.error("[Collector] targetCookie not found!", targetCookie);
      return;
    }

    setGoogleCookie(targetCookie.value);
    return targetCookie.value;
  } finally {
    await page.close();
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

    // 메타데이터 수집
    let info: CollectorResult | undefined;

    // Google 컬렉터만 puppeteer 필요
    if (collector.name === "Google") {
      try {
        // 쿠키가 없으면 자동으로 획득
        let cookieValue = getGoogleCookie();
        if (!cookieValue) {
          cookieValue = await getNewCookie();
        }

        const browser = await initBrowser();
        const page = await browser.newPage();

        try {
          // 쿠키 설정
          if (cookieValue) {
            await page.setCookie({
              name: "NID",
              value: cookieValue,
              domain: ".google.com",
              path: "/",
            });
          }

          // 페이지 이동
          const params = new URLSearchParams({ q: id, udm: "2" });
          const searchUrl = "https://www.google.com/search?" + params;
          await page.goto(searchUrl, { waitUntil: "networkidle2" });

          // 봇 차단 감지
          const botBlockResult = await detectBotBlock(page);

          if (botBlockResult.blocked) {
            console.log(`[Collector] 봇 차단 감지: ${botBlockResult.reason}`);

            // headless 브라우저 페이지 닫기
            await page.close();

            // non-headless 브라우저 실행
            const visibleBrowser = await launchVisibleBrowser();
            const visiblePage = await visibleBrowser.newPage();

            try {
              // 쿠키 설정
              if (cookieValue) {
                await visiblePage.setCookie({
                  name: "NID",
                  value: cookieValue,
                  domain: ".google.com",
                  path: "/",
                });
              }

              // 같은 페이지로 이동
              await visiblePage.goto(searchUrl, { waitUntil: "networkidle2" });

              // 해결 대기 (사용자가 "해결 완료" 버튼 클릭 시까지)
              const mainWindow = BrowserWindow.getAllWindows()[0];
              const resolved = await waitForBotBlockResolution(
                mainWindow,
                gamePath,
                game?.title ?? id,
              );

              if (!resolved) {
                return {
                  gamePath,
                  success: false,
                  error: "CAPTCHA 해결 시간 초과 또는 취소됨",
                };
              }

              // 해결됨 - 다시 정보 수집
              const fetchResult = await collector.fetchInfo({
                path: gamePath,
                id,
                page: visiblePage,
              });
              if (fetchResult && "thumbnailUrl" in fetchResult) {
                info = fetchResult as CollectorResult;
              }
            } finally {
              await visiblePage.close();
              // CAPTCHA 해결 후 visible 브라우저 닫기
              if (visibleBrowserInstance) {
                await visibleBrowserInstance.close();
                visibleBrowserInstance = null;
              }
            }
          } else {
            // 차단되지 않음 - 기존 로직대로 수집
            const fetchResult = await collector.fetchInfo({
              path: gamePath,
              id,
              page,
            });
            if (fetchResult && "thumbnailUrl" in fetchResult) {
              info = fetchResult as CollectorResult;
            }
          }
        } finally {
          // headless 페이지가 아직 열려있으면 닫기
          if (page && !page.isClosed()) {
            await page.close();
          }
        }
      } catch (chromeError) {
        console.error(`[Collector] Chrome 에러:`, chromeError);
        return { gamePath, success: false, error: String(chromeError) };
      }
    } else {
      const fetchResult = await collector.fetchInfo({ path: gamePath, id });
      // CollectorResult 타입 검증
      if (fetchResult && "thumbnailUrl" in fetchResult) {
        info = fetchResult as CollectorResult;
      }
    }

    if (!info) {
      return { gamePath, success: false, error: "정보를 가져올 수 없습니다." };
    }

    // DB 저장 (이미지 다운로드 포함)
    await saveInfo(gamePath, info);

    // 썸네일이 없으면 Google 콜렉터로 fallback 시도
    if (!info.thumbnailUrl && collector.name !== "Google") {
      try {
        const fallbackCollector = (
          await import("../collectors/google-collector.js")
        ).GoogleCollector;
        const fallbackId = await fallbackCollector.getId(gamePath);
        if (fallbackId) {
          let cookieValue = getGoogleCookie();
          if (!cookieValue) {
            cookieValue = await getNewCookie();
          }

          const browser = await initBrowser();
          const page = await browser.newPage();

          if (cookieValue) {
            await page.setCookie({
              name: "NID",
              value: cookieValue,
              domain: ".google.com",
              path: "/",
            });
          }

          try {
            const googleResult = await fallbackCollector.fetchInfo({
              path: gamePath,
              id: fallbackId,
              page,
            });
            if (
              googleResult &&
              "thumbnailUrl" in googleResult &&
              googleResult.thumbnailUrl
            ) {
              try {
                const thumbnailPath = await downloadImage(
                  googleResult.thumbnailUrl,
                  gamePath,
                );
                await db("games")
                  .where("path", gamePath)
                  .update({ thumbnail: thumbnailPath });
              } catch (error) {
                console.error(
                  `[Collector] Google 썸네일 다운로드 실패:`,
                  error,
                );
              }
            }
          } finally {
            await page.close();
          }
        }
      } catch (error) {
        console.error(`[Collector] Google fallback 실패:`, error);
      }
    }

    return { gamePath, success: true };
  } catch (error) {
    console.error(`[Collector] 에러: ${gamePath}`, error);
    return { gamePath, success: false, error: String(error) };
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
 * 전체 게임 컬렉터 실행
 */
export async function runAllCollectorsHandler(
  event: IpcMainInvokeEvent,
  payload: IpcRendererEventMap["runAllCollectors"],
): Promise<IpcMainEventMap["allCollectorsDone"]> {
  const { force } = payload;
  const mainWindow = BrowserWindow.fromWebContents(event.sender);

  // 미수집 게임 목록 조회 (force=true면 전체, false면 미수집만)
  let query = db("games").select("path", "title");
  if (!force) {
    query = query.where("isLoadedInfo", 0);
  }
  const games = await query;

  const total = games.length;
  let success = 0;
  let failed = 0;

  // 동시 실행 제한 (최대 5개 동시 실행)
  const queue = new ConcurrencyQueue(5);

  // 진행 상태 추적
  let completed = 0;
  const updateProgress = (gameTitle: string) => {
    completed++;
    mainWindow?.webContents.send("collectorProgress", {
      current: completed,
      total,
      gameTitle,
    });
  };

  // 병렬 실행
  const promises = games.map((game) =>
    queue.add(async () => {
      const result = await runCollectorHandler(event, {
        gamePath: game.path,
        force,
      });
      if (result.success) success++;
      else failed++;
      updateProgress(game.title);
    }),
  );

  await Promise.all(promises);

  return { total, success, failed };
}
