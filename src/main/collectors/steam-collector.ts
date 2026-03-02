import SteamUser from "steam-user";
import { Collector, type CollectorResult } from "./registry.js";

/**
 * SteamUser 클라이언트 (재사용을 위한 싱글톤)
 */
let steamClient: SteamUser | null = null;
let isLoggingIn = false;
let loginPromise: Promise<void> | null = null;

/**
 * SteamUser 클라이언트 초기화 (익명 로그인)
 */
async function getSteamClient(): Promise<SteamUser> {
  // 이미 초기화된 클라이언트 반환
  if (steamClient) {
    return steamClient;
  }

  // 로그인 진행 중이면 대기
  if (isLoggingIn && loginPromise) {
    await loginPromise;
    if (steamClient) return steamClient;
  }

  // 새 클라이언트 생성 및 로그인
  isLoggingIn = true;
  loginPromise = new Promise((resolve, reject) => {
    const client = new SteamUser({
      enablePicsCache: true, // PIC 캐시 활성화
    });

    client.on("loggedOn", () => {
      console.log("[SteamCollector] 익명 로그인 성공");
      steamClient = client;
      isLoggingIn = false;
      resolve();
    });

    client.on("error", (err) => {
      console.error("[SteamCollector] 로그인 에러:", err);
      steamClient = null;
      isLoggingIn = false;
      reject(err);
    });

    // 익명 로그인
    client.logOn({ anonymous: true });
  });

  await loginPromise;
  return steamClient!;
}

/**
 * Steam API 응답 타입 (기존 방식용)
 */
interface SteamApiResponse {
  [appId: string]: {
    success: boolean;
    data?: {
      name: string;
      release_date: {
        coming_soon: boolean;
        date: string;
      };
      developers: string[];
      genres: {
        id: string;
        description: string;
      }[];
      header_image: string;
      screenshots: {
        id: number;
        path_thumbnail: string;
        path_full: string;
      }[];
    };
  };
}

export const SteamCollector: Collector = {
  name: "Steam",
  getId: async (path: string) => {
    const id = /ST(\d{4,8})/gi.exec(path);
    if (id?.[1]) {
      return id[1];
    }

    if (!path.toLowerCase().includes("steam")) {
      return;
    }

    return /\d{4,8}/g.exec(path)?.[0] ?? undefined;
  },

  fetchInfo: async ({ id }) => {
    // steam-user로 메타데이터 수집
    let title: string | null = null;
    let makers: string[] = [];
    let categories: string[] = [];
    let tags: string[] = [];
    let publishDate: Date | null = null;

    try {
      const client = await getSteamClient();
      const appId = Number.parseInt(id);
      const result = await client.getProductInfo([appId], [], true);
      const appInfo = result.apps[appId];

      if (appInfo?.appinfo) {
        // steam-user 타입이 엄격하므로 any로 캐스팅
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = appInfo.appinfo as any;

        // 기본 정보
        title = info.common?.name ?? null;

        // 개발사/퍼블리셔
        if (info.extended?.developer) {
          makers.push(info.extended.developer);
        }

        // 발매일
        if (info.common?.steam_release_date) {
          const timestamp = Number.parseInt(
            info.common.steam_release_date as string,
          );
          if (!isNaN(timestamp)) {
            publishDate = new Date(timestamp * 1000);
          }
        }
      }
    } catch (error) {
      console.error("[SteamCollector] steam-user 에러:", error);
    }

    // 이미지와 장르는 기존 Steam API 사용 (국가 차단될 수 있음)
    let thumbnailUrl: string | null = null;
    let images: string[] = [];

    try {
      const res = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${id}&cc=us&l=korean`,
      );
      const steam = (await res.json()) as SteamApiResponse | null;
      const info = steam?.[id]?.data;

      if (info) {
        thumbnailUrl = info.header_image ?? null;
        const screenshots = info.screenshots ?? [];
        images = screenshots.map((s) => s.path_full);

        // 장르 (description에서 가져옴)
        if (info.genres) {
          categories = info.genres.map((g) => g.description);
        }
      }
    } catch (error) {
      console.error("[SteamCollector] 이미지 API 에러:", error);
    }

    // 데이터가 하나도 없으면 undefined 반환
    if (!title && makers.length === 0 && categories.length === 0) {
      return undefined;
    }

    return {
      title,
      thumbnailUrl,
      images,
      publishDate,
      makers,
      categories,
      tags,
      externalId: id,
      provider: "steam",
    } satisfies CollectorResult;
  },
  getUrl: (id) => `https://store.steampowered.com/app/${id}/`,
};
