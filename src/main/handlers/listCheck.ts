/**
 * 목록 대조 핸들러
 *
 * 붙여넣은 작품 목록을 라이브러리(숨김 포함)와 대조하고,
 * 미보유 작품의 대표 이미지·샘플 이미지·평점 등을 외부 사이트에서 받아 미리보기로 돌려준다.
 */

import type { IpcMainInvokeEvent } from "electron";
import {
  PROVIDER_COLLECTORS,
  getCollectorUrl,
} from "../collectors/registry.js";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import { formatExternalCode } from "../lib/export-format.js";
import {
  buildListCheckRows,
  type CodeExtractor,
  type ListCheckLibraryGame,
} from "../lib/list-check.js";
import {
  DEFAULT_TITLE_DISPLAY_PRIORITY,
  getTranslationSettings,
} from "../store.js";
import { fetchImageBuffer, toPreviewDataUrl } from "../utils/downloader.js";
import { toAbsolutePath } from "../utils/image-path.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";
import { createLogger } from "../utils/logger.js";

const log = createLogger("ListCheck");

/**
 * 폴더명 코드 인식과 같은 규칙의 추출기 (컬렉터 우선순위 순)
 * 소문자 RJ코드는 DLsite 작품 페이지가 404이므로 대문자로 통일
 */
function getCodeExtractors(): CodeExtractor[] {
  return Object.entries(PROVIDER_COLLECTORS).map(([provider, collector]) => ({
    provider,
    getId: async (text) => (await collector.getId(text))?.toUpperCase(),
  }));
}

/**
 * 붙여넣은 목록을 라이브러리와 대조
 */
export async function checkGameList(
  text: string,
): Promise<IpcMainEventMap["gameListChecked"]> {
  const games = await db("games").select(
    "path",
    "title",
    "originalTitle",
    "translatedTitle",
    "provider",
    "externalId",
    "thumbnail",
    "isHidden",
  );

  const library: ListCheckLibraryGame[] = games.map((g) => ({
    path: g.path,
    title: g.title,
    originalTitle: g.originalTitle,
    translatedTitle: g.translatedTitle,
    provider: g.provider,
    externalId: g.externalId,
    thumbnail: toAbsolutePath(g.thumbnail),
    isHidden: !!g.isHidden,
  }));

  const rows = await buildListCheckRows(
    text,
    library,
    getCodeExtractors(),
    getTranslationSettings().titleDisplayPriority ??
      DEFAULT_TITLE_DISPLAY_PRIORITY,
  );

  return {
    rows: rows.map((row) => ({
      ...row,
      code: row.externalId
        ? formatExternalCode(row.provider, row.externalId)
        : null,
      url: getCollectorUrl(row.provider, row.externalId),
    })),
  };
}

/** 동시 실행 수 제한기 (외부 사이트 차단 방지) */
function createLimiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    } else {
      active += 1;
    }
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      // 대기 중인 작업이 있으면 슬롯을 그대로 넘긴다
      if (next) next();
      else active -= 1;
    }
  };
}

/** 응답 없는 요청이 슬롯을 영영 붙잡아 뒤 요청이 모두 멈추는 것을 막는다 */
async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} 타임아웃`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

const FETCH_TIMEOUT_MS = 20_000;
// 목록 전체의 대표 이미지 조회와 마우스를 올린 작품의 샘플 이미지 조회는 따로 제한
const runPreviewFetch = createLimiter(3);
const runImageFetch = createLimiter(3);

/** 미리보기로 돌려준 샘플 이미지 URL — 이 목록에 있는 주소만 받아온다 */
const allowedImageUrls = new Set<string>();

const EMPTY_PREVIEW: IpcMainEventMap["listCheckPreviewFetched"] = {
  thumbnail: null,
  images: [],
  info: null,
};

async function toDataUrl(url: string): Promise<string> {
  return toPreviewDataUrl(await fetchImageBuffer(url));
}

/**
 * 미보유 작품 미리보기 — 대표 이미지(data URL) + 샘플 이미지 URL + 평점 등 정보
 * 컬렉터 조회 한 번으로 모두 얻는다. 실패하면 빈 미리보기
 */
export async function fetchListCheckPreview(
  provider: string,
  externalId: string,
): Promise<IpcMainEventMap["listCheckPreviewFetched"]> {
  if (!Object.hasOwn(PROVIDER_COLLECTORS, provider)) return EMPTY_PREVIEW;
  const collector = PROVIDER_COLLECTORS[provider];

  return runPreviewFetch(async () => {
    try {
      const info = await withTimeout(
        collector.fetchInfo({
          path: formatExternalCode(provider, externalId),
          id: externalId,
        }),
        FETCH_TIMEOUT_MS,
        "작품 정보 조회",
      );
      if (!info) return EMPTY_PREVIEW;

      // 대표 이미지가 실패해도 정보와 샘플 이미지는 보여준다
      let thumbnail: string | null = null;
      if (info.thumbnailUrl) {
        try {
          thumbnail = await withTimeout(
            toDataUrl(info.thumbnailUrl),
            FETCH_TIMEOUT_MS,
            "대표 이미지",
          );
        } catch (error) {
          log.warn(`대표 이미지 가져오기 실패: ${info.thumbnailUrl}`, error);
        }
      }

      const images = [...new Set(info.images)].filter(
        (url) => url !== info.thumbnailUrl,
      );
      for (const url of images) allowedImageUrls.add(url);

      return {
        thumbnail,
        images,
        info: {
          title: info.title,
          rating: info.rating,
          reviewCount: info.reviewCount,
          downloadCount: info.downloadCount,
          // 잘못된 날짜는 toISOString에서 예외가 나므로 걸러낸다
          publishDate:
            info.publishDate && !Number.isNaN(info.publishDate.getTime())
              ? info.publishDate.toISOString()
              : null,
          makers: info.makers,
          tags: info.tags,
        },
      };
    } catch (error) {
      log.warn(`미리보기 가져오기 실패: ${provider}:${externalId}`, error);
      return EMPTY_PREVIEW;
    }
  });
}

/**
 * 샘플 이미지 한 장 → 미리보기 data URL (저장하지 않음)
 * 미리보기로 돌려준 적 없는 주소는 거부한다. 실패하면 null
 */
export async function fetchListCheckImage(
  url: string,
): Promise<IpcMainEventMap["listCheckImageFetched"]> {
  if (!allowedImageUrls.has(url)) return { dataUrl: null };

  return runImageFetch(async () => {
    try {
      return {
        dataUrl: await withTimeout(
          toDataUrl(url),
          FETCH_TIMEOUT_MS,
          "샘플 이미지",
        ),
      };
    } catch (error) {
      log.warn(`샘플 이미지 가져오기 실패: ${url}`, error);
      return { dataUrl: null };
    }
  });
}

export const checkGameListHandler = wrapIpcHandler(
  "checkGameList",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["checkGameList"],
  ): Promise<IpcMainEventMap["gameListChecked"]> => checkGameList(payload.text),
);

export const fetchListCheckPreviewHandler = wrapIpcHandler(
  "fetchListCheckPreview",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["fetchListCheckPreview"],
  ): Promise<IpcMainEventMap["listCheckPreviewFetched"]> =>
    fetchListCheckPreview(payload.provider, payload.externalId),
);

export const fetchListCheckImageHandler = wrapIpcHandler(
  "fetchListCheckImage",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["fetchListCheckImage"],
  ): Promise<IpcMainEventMap["listCheckImageFetched"]> =>
    fetchListCheckImage(payload.url),
);
