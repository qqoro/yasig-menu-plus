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

// ========== 모킹 ==========

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
}));

vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));

vi.mock("../store.js", () => ({
  DEFAULT_TITLE_DISPLAY_PRIORITY: ["translated", "collected", "original"],
  getTranslationSettings: vi.fn(() => ({
    titleDisplayPriority: ["translated", "collected", "original"],
  })),
}));

vi.mock("../utils/downloader.js", () => ({
  fetchImageBuffer: vi.fn(async () => Buffer.from("img")),
  toPreviewDataUrl: vi.fn(async () => "data:image/webp;base64,AAA"),
}));

// 컬렉터 getId 규칙만 흉내 낸 registry (네트워크 의존 제거)
vi.mock("../collectors/registry.js", () => {
  const dlsite = {
    name: "DLSite",
    getId: async (t: string) => /[RBV]J\d{6,8}/i.exec(t)?.[0],
    fetchInfo: vi.fn(),
    getUrl: (id: string) =>
      `https://www.dlsite.com/maniax/work/=/product_id/${id}.html`,
  };
  const steam = {
    name: "Steam",
    getId: async (t: string) => /ST(\d{4,8})/i.exec(t)?.[1],
    fetchInfo: vi.fn(),
    getUrl: (id: string) => `https://store.steampowered.com/app/${id}/`,
  };
  const PROVIDER_COLLECTORS = { dlsite, steam };
  return {
    PROVIDER_COLLECTORS,
    getCollectorUrl: (provider: string | null, id: string | null) =>
      provider && id
        ? ((PROVIDER_COLLECTORS as Record<string, typeof dlsite>)[
            provider
          ]?.getUrl(id) ?? null)
        : null,
  };
});

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: { getKnex: () => dbRef.current! },
}));

// 모킹 후 import
import { PROVIDER_COLLECTORS } from "../collectors/registry.js";
import { getTranslationSettings } from "../store.js";
import { fetchImageBuffer } from "../utils/downloader.js";
import {
  checkGameList,
  fetchListCheckImage,
  fetchListCheckPreview,
} from "./listCheck.js";

let db: Knex;

beforeAll(async () => {
  db = await createTestDb();
  dbRef.current = db;
});

afterEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await db.destroy();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkGameList", () => {
  it("보유/미보유 판정과 표시용 코드·URL을 돌려준다", async () => {
    await seedGame(db, {
      path: "D:\\Games\\RJ01089692 사라",
      provider: "dlsite",
      externalId: "RJ01089692",
      thumbnail: "thumbnails/a.webp",
      isHidden: true,
    });

    const { rows } = await checkGameList(
      "RJ01089692 [屋上の細道] 사라\nST1145360 Hades",
    );

    expect(rows[0]).toMatchObject({
      status: "owned",
      code: "RJ01089692",
      url: "https://www.dlsite.com/maniax/work/=/product_id/RJ01089692.html",
      games: [
        {
          path: "D:\\Games\\RJ01089692 사라",
          thumbnail: "/absolute/thumbnails/a.webp",
          isHidden: true,
        },
      ],
    });
    expect(rows[1]).toMatchObject({
      status: "missing",
      provider: "steam",
      externalId: "1145360",
      code: "ST1145360",
      url: "https://store.steampowered.com/app/1145360/",
    });
  });

  it("코드 없는 줄은 제목 완전 일치로만 판정한다", async () => {
    await seedGame(db, { path: "D:\\x", title: "Hollow Knight" });

    const { rows } = await checkGameList("hollow knight\nHollow");

    expect(rows[0]).toMatchObject({
      status: "owned",
      matchedBy: "title",
      code: null,
      url: null,
    });
    expect(rows[1].status).toBe("unknown");
  });

  it("보유 게임 제목은 설정의 제목 표시 우선순위를 따른다", async () => {
    await seedGame(db, {
      path: "D:\\Games\\RJ01089692",
      provider: "dlsite",
      externalId: "RJ01089692",
      title: "自称天才魔術師サラ",
      originalTitle: "RJ01089692",
      translatedTitle: "자칭 천재 마술사 사라",
    });

    vi.mocked(getTranslationSettings).mockReturnValueOnce({
      titleDisplayPriority: ["collected", "translated", "original"],
    } as never);
    const { rows } = await checkGameList("RJ01089692");

    expect(rows[0].games[0].title).toBe("自称天才魔術師サラ");
  });

  it("소문자로 붙여넣은 RJ코드도 대문자 코드·URL로 돌려준다", async () => {
    const { rows } = await checkGameList("rj01366886 소문자");

    expect(rows[0]).toMatchObject({
      externalId: "RJ01366886",
      code: "RJ01366886",
      url: "https://www.dlsite.com/maniax/work/=/product_id/RJ01366886.html",
    });
  });
});

const EMPTY_PREVIEW = { thumbnail: null, images: [], info: null };

/** 컬렉터 결과 기본값 */
function collected(overrides: Record<string, unknown> = {}) {
  return {
    thumbnailUrl: "https://img.dlsite.jp/main.jpg",
    images: [
      "https://img.dlsite.jp/main.jpg",
      "https://img.dlsite.jp/smp1.jpg",
      "https://img.dlsite.jp/smp2.jpg",
      "https://img.dlsite.jp/smp1.jpg",
    ],
    title: "작품",
    publishDate: new Date("2025-01-06T00:00:00.000Z"),
    rating: 4.38,
    reviewCount: 586,
    downloadCount: 2037,
    makers: ["서클"],
    categories: [],
    tags: ["태그1", "태그2"],
    externalId: "RJ01",
    provider: "dlsite",
    ...overrides,
  } as never;
}

describe("fetchListCheckPreview", () => {
  it("컬렉터 조회 한 번으로 대표 이미지·샘플 이미지·정보를 돌려준다", async () => {
    vi.mocked(PROVIDER_COLLECTORS.dlsite.fetchInfo).mockResolvedValue(
      collected(),
    );

    const result = await fetchListCheckPreview("dlsite", "RJ01089975");

    expect(PROVIDER_COLLECTORS.dlsite.fetchInfo).toHaveBeenCalledTimes(1);
    expect(PROVIDER_COLLECTORS.dlsite.fetchInfo).toHaveBeenCalledWith({
      path: "RJ01089975",
      id: "RJ01089975",
    });
    expect(fetchImageBuffer).toHaveBeenCalledWith(
      "https://img.dlsite.jp/main.jpg",
    );
    expect(result).toEqual({
      thumbnail: "data:image/webp;base64,AAA",
      // 대표 이미지와 중복 주소는 빠짐
      images: [
        "https://img.dlsite.jp/smp1.jpg",
        "https://img.dlsite.jp/smp2.jpg",
      ],
      info: {
        title: "작품",
        rating: 4.38,
        reviewCount: 586,
        downloadCount: 2037,
        publishDate: "2025-01-06T00:00:00.000Z",
        makers: ["서클"],
        tags: ["태그1", "태그2"],
      },
    });
  });

  it("대표 이미지만 실패하면 정보와 샘플 이미지는 그대로 돌려준다", async () => {
    vi.mocked(PROVIDER_COLLECTORS.dlsite.fetchInfo).mockResolvedValue(
      collected({ publishDate: new Date("invalid") }),
    );
    vi.mocked(fetchImageBuffer).mockRejectedValueOnce(new Error("403"));

    const result = await fetchListCheckPreview("dlsite", "RJ01");

    expect(result.thumbnail).toBeNull();
    expect(result.images).toHaveLength(2);
    expect(result.info).toMatchObject({ rating: 4.38, publishDate: null });
  });

  it("정보가 없거나 실패하면 빈 미리보기", async () => {
    vi.mocked(PROVIDER_COLLECTORS.dlsite.fetchInfo).mockResolvedValueOnce(
      undefined,
    );
    expect(await fetchListCheckPreview("dlsite", "RJ01")).toEqual(
      EMPTY_PREVIEW,
    );

    vi.mocked(PROVIDER_COLLECTORS.dlsite.fetchInfo).mockRejectedValueOnce(
      new Error("network"),
    );
    expect(await fetchListCheckPreview("dlsite", "RJ02")).toEqual(
      EMPTY_PREVIEW,
    );

    expect(await fetchListCheckPreview("unknown", "x")).toEqual(EMPTY_PREVIEW);
  });

  it("동시 요청은 3개까지만 진행한다", async () => {
    let active = 0;
    let peak = 0;
    vi.mocked(PROVIDER_COLLECTORS.dlsite.fetchInfo).mockImplementation(
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
        return undefined;
      },
    );

    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        fetchListCheckPreview("dlsite", `RJ0${i}`),
      ),
    );

    expect(peak).toBe(3);
    expect(PROVIDER_COLLECTORS.dlsite.fetchInfo).toHaveBeenCalledTimes(8);
  });

  it("응답 없는 요청은 타임아웃으로 슬롯을 돌려준다", async () => {
    vi.useFakeTimers();
    try {
      // 영영 끝나지 않는 요청 3개가 슬롯을 모두 차지
      vi.mocked(PROVIDER_COLLECTORS.dlsite.fetchInfo).mockImplementation(
        () => new Promise(() => {}),
      );
      const hanging = Array.from({ length: 3 }, (_, i) =>
        fetchListCheckPreview("dlsite", `RJ1${i}`),
      );

      vi.mocked(PROVIDER_COLLECTORS.dlsite.fetchInfo).mockResolvedValueOnce(
        collected(),
      );
      const next = fetchListCheckPreview("dlsite", "RJ20");

      await vi.advanceTimersByTimeAsync(20_000);

      expect(await Promise.all(hanging)).toEqual([
        EMPTY_PREVIEW,
        EMPTY_PREVIEW,
        EMPTY_PREVIEW,
      ]);
      expect((await next).thumbnail).toBe("data:image/webp;base64,AAA");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("fetchListCheckImage", () => {
  it("미리보기로 돌려준 샘플 이미지만 받아온다", async () => {
    vi.mocked(PROVIDER_COLLECTORS.dlsite.fetchInfo).mockResolvedValue(
      collected({ images: ["https://img.dlsite.jp/allowed.jpg"] }),
    );
    await fetchListCheckPreview("dlsite", "RJ30");

    expect(
      await fetchListCheckImage("https://img.dlsite.jp/allowed.jpg"),
    ).toEqual({ dataUrl: "data:image/webp;base64,AAA" });
    expect(fetchImageBuffer).toHaveBeenLastCalledWith(
      "https://img.dlsite.jp/allowed.jpg",
    );

    // 미리보기에 없던 주소는 요청하지 않음
    vi.mocked(fetchImageBuffer).mockClear();
    expect(await fetchListCheckImage("https://evil.example/x.jpg")).toEqual({
      dataUrl: null,
    });
    expect(fetchImageBuffer).not.toHaveBeenCalled();
  });

  it("다운로드 실패는 null", async () => {
    vi.mocked(PROVIDER_COLLECTORS.dlsite.fetchInfo).mockResolvedValue(
      collected({ images: ["https://img.dlsite.jp/broken.jpg"] }),
    );
    await fetchListCheckPreview("dlsite", "RJ31");
    vi.mocked(fetchImageBuffer).mockRejectedValueOnce(new Error("404"));

    expect(
      await fetchListCheckImage("https://img.dlsite.jp/broken.jpg"),
    ).toEqual({ dataUrl: null });
  });
});
