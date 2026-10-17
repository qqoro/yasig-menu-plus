/**
 * 목록 대조 핸들러 적대적 테스트
 *
 * 실제 컬렉터 getId/getUrl을 쓰는 registry 대역 + 실제 in-memory SQLite로
 * 표시 코드·URL·숨김 변환과 썸네일 동시성 제한의 경계를 공격한다.
 */
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

vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
}));

vi.mock("steam-user", () => ({ default: class {} }));

vi.mock("../utils/image-path.js", () => ({
  toAbsolutePath: (p: string | null) => (p ? `/absolute/${p}` : null),
  toRelativePath: (p: string | null) => p,
}));

vi.mock("../utils/downloader.js", () => ({
  fetchImageBuffer: vi.fn(async () => Buffer.from("img")),
  toPreviewDataUrl: vi.fn(async () => "data:image/webp;base64,AAA"),
}));

// 실제 컬렉터의 getId/getUrl을 그대로 쓰고 fetchInfo만 대역으로 교체
vi.mock("../collectors/registry.js", async () => {
  const { DLSiteCollector } = await vi.importActual<
    typeof import("../collectors/dlsite-collector.js")
  >("../collectors/dlsite-collector.js");
  const { SteamCollector } = await vi.importActual<
    typeof import("../collectors/steam-collector.js")
  >("../collectors/steam-collector.js");
  const { GetchuCollector } = await vi.importActual<
    typeof import("../collectors/getchu-collector.js")
  >("../collectors/getchu-collector.js");
  const { CienCollector } = await vi.importActual<
    typeof import("../collectors/cien-collector.js")
  >("../collectors/cien-collector.js");
  const wrap = (c: typeof DLSiteCollector) => ({ ...c, fetchInfo: vi.fn() });
  const PROVIDER_COLLECTORS = {
    dlsite: wrap(DLSiteCollector),
    steam: wrap(SteamCollector),
    getchu: wrap(GetchuCollector),
    cien: wrap(CienCollector),
  };
  return {
    PROVIDER_COLLECTORS,
    getCollectorUrl: (provider: string | null, id: string | null) => {
      if (!provider || !id) return null;
      const c = (PROVIDER_COLLECTORS as Record<string, typeof DLSiteCollector>)[
        provider.toLowerCase()
      ];
      return c?.getUrl?.(id) ?? null;
    },
  };
});

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: { getKnex: () => dbRef.current! },
}));

import { PROVIDER_COLLECTORS } from "../collectors/registry.js";
import { fetchImageBuffer, toPreviewDataUrl } from "../utils/downloader.js";
import { checkGameList, fetchListCheckPreview } from "./listCheck.js";

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
  vi.mocked(fetchImageBuffer).mockImplementation(async () =>
    Buffer.from("img"),
  );
  vi.mocked(toPreviewDataUrl).mockImplementation(
    async () => "data:image/webp;base64,AAA",
  );
});

const dlsiteFetch = () => vi.mocked(PROVIDER_COLLECTORS.dlsite.fetchInfo);

const EMPTY = { thumbnail: null, images: [], info: null };

/** 외부에서 풀어줄 수 있는 지연 */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

// ========== checkGameList ==========

describe("checkGameList 경계", () => {
  it("Getchu/Ci-en 행의 표시 코드와 URL", async () => {
    await seedGame(db, {
      path: "D:\\Games\\GC1234567 게임",
      title: "a",
      originalTitle: "-",
      provider: "getchu",
      externalId: "1234567",
    });
    await seedGame(db, {
      path: "D:\\Games\\CE123-456 게임",
      title: "b",
      originalTitle: "-",
      // 정보 수집 전 — 폴더명으로 인식
    });

    const { rows } = await checkGameList(
      "getchu1234567\nCIENcreator123article456",
    );

    expect(rows[0]).toMatchObject({
      status: "owned",
      code: "GC1234567",
      url: "https://www.getchu.com/item/1234567/",
    });
    expect(rows[1]).toMatchObject({
      status: "owned",
      code: "CE123-456",
      url: "https://ci-en.net/creator/123/article/456",
    });
  });

  it("DB의 숨김 플래그(0/1)를 boolean으로 돌려주고 보유로 센다", async () => {
    await seedGame(db, {
      path: "D:\\RJ01000001",
      title: "숨김",
      originalTitle: "-",
      isHidden: true,
    });
    await seedGame(db, {
      path: "D:\\RJ01000001 copy",
      title: "보임",
      originalTitle: "-",
      isHidden: false,
    });

    const { rows } = await checkGameList("RJ01000001");

    expect(rows[0].status).toBe("owned");
    expect(
      Object.fromEntries(rows[0].games.map((g) => [g.path, g.isHidden])),
    ).toEqual({
      "D:\\RJ01000001": true,
      "D:\\RJ01000001 copy": false,
    });
  });

  it("빈 입력·공백만 있는 입력은 빈 결과", async () => {
    await seedGame(db, { path: "D:\\x", title: "x", originalTitle: "-" });
    expect((await checkGameList("")).rows).toEqual([]);
    expect((await checkGameList(" \r\n\t\n\u3000")).rows).toEqual([]);
  });

  it("코드 없는 줄은 code/url/provider가 모두 null", async () => {
    const { rows } = await checkGameList("그냥 제목");
    expect(rows[0]).toMatchObject({
      status: "unknown",
      provider: null,
      externalId: null,
      code: null,
      url: null,
      games: [],
    });
  });
});

// ========== fetchListCheckPreview ==========

describe("fetchListCheckPreview 경계", () => {
  it("Object 프로토타입 키를 provider로 줘도 던지지 않고 null", async () => {
    for (const p of [
      "constructor",
      "__proto__",
      "toString",
      "hasOwnProperty",
    ]) {
      await expect(fetchListCheckPreview(p, "1")).resolves.toEqual(EMPTY);
    }
  });

  it("fetchInfo가 동기적으로 던져도 null", async () => {
    dlsiteFetch().mockImplementationOnce(() => {
      throw new Error("sync");
    });
    await expect(fetchListCheckPreview("dlsite", "RJ01")).resolves.toEqual(
      EMPTY,
    );
  });

  it("fetchImageBuffer가 동기적으로 던지거나(잘못된 URL) 변환이 실패해도 대표 이미지만 null", async () => {
    dlsiteFetch().mockResolvedValue({
      thumbnailUrl: "ftp://x",
      images: [],
      makers: [],
      tags: [],
    } as never);
    vi.mocked(fetchImageBuffer).mockImplementationOnce(() => {
      throw new Error("invalid url");
    });
    const first = await fetchListCheckPreview("dlsite", "RJ01");
    expect(first.thumbnail).toBeNull();
    expect(first.info).not.toBeNull();

    vi.mocked(toPreviewDataUrl).mockRejectedValueOnce(new Error("sharp"));
    const second = await fetchListCheckPreview("dlsite", "RJ02");
    expect(second.thumbnail).toBeNull();
    expect(second.info).not.toBeNull();
  });

  it("fetchInfo가 undefined를 돌려줘도 null", async () => {
    dlsiteFetch().mockResolvedValueOnce(undefined);
    await expect(fetchListCheckPreview("dlsite", "RJ01")).resolves.toEqual(
      EMPTY,
    );
  });

  it("실패가 연달아 나도 슬롯이 새지 않고 다시 3개까지 동시 진행", async () => {
    // 1) 실패 10건 (동기 throw / 비동기 reject 섞어서)
    let n = 0;
    dlsiteFetch().mockImplementation(async () => {
      n += 1;
      if (n % 2) throw new Error("boom");
      await new Promise((r) => setTimeout(r, 1));
      throw new Error("late boom");
    });
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        fetchListCheckPreview("dlsite", `RJ${i}`),
      ),
    );

    // 2) 이후 매달린 작업 5개 → 정확히 3개만 시작돼야 함
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    let started = 0;
    dlsiteFetch().mockImplementation(async () => {
      const gate = gates[started];
      started += 1;
      await gate.promise;
      return { thumbnailUrl: null } as never;
    });
    const pending = Array.from({ length: 5 }, (_, i) =>
      fetchListCheckPreview("dlsite", `RJ1${i}`),
    );
    await flush();
    expect(started).toBe(3);

    // 하나 풀면 대기 중이던 하나가 들어온다
    gates[0].resolve();
    await flush();
    expect(started).toBe(4);

    gates.forEach((g) => g.resolve());
    await Promise.all(pending);
    expect(started).toBe(5);

    // 3) 모두 끝난 뒤 다시 3개까지 즉시 시작 (카운터 원복 확인)
    const gates2 = Array.from({ length: 4 }, () => deferred<void>());
    let started2 = 0;
    dlsiteFetch().mockImplementation(async () => {
      const gate = gates2[started2];
      started2 += 1;
      await gate.promise;
      return { thumbnailUrl: null } as never;
    });
    const pending2 = Array.from({ length: 4 }, (_, i) =>
      fetchListCheckPreview("dlsite", `RJ2${i}`),
    );
    await flush();
    expect(started2).toBe(3);
    gates2.forEach((g) => g.resolve());
    await Promise.all(pending2);
  });

  it("알 수 없는 provider는 슬롯이 꽉 차 있어도 기다리지 않는다", async () => {
    const gate = deferred<void>();
    dlsiteFetch().mockImplementation(async () => {
      await gate.promise;
      return { thumbnailUrl: null } as never;
    });
    const busy = Array.from({ length: 3 }, (_, i) =>
      fetchListCheckPreview("dlsite", `RJ${i}`),
    );
    await flush();

    await expect(fetchListCheckPreview("nope", "1")).resolves.toEqual(EMPTY);

    gate.resolve();
    await Promise.all(busy);
  });

  it("대기열은 먼저 온 요청부터 처리한다 (FIFO)", async () => {
    const gate = deferred<void>();
    const order: string[] = [];
    dlsiteFetch().mockImplementation(async ({ id }: { id: string }) => {
      order.push(id);
      await gate.promise;
      return { thumbnailUrl: null } as never;
    });
    const all = ["A", "B", "C", "D", "E", "F"].map((id) =>
      fetchListCheckPreview("dlsite", id),
    );
    await flush();
    gate.resolve();
    await Promise.all(all);
    expect(order).toEqual(["A", "B", "C", "D", "E", "F"]);
  });
});
