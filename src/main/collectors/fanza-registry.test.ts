import { describe, expect, it, vi } from "vitest";
import {
  findCollector,
  getCollectorUrl,
  PROVIDER_COLLECTORS,
} from "./registry.js";
import { EXTERNAL_ID_EXTRACTORS } from "../lib/external-id.js";

vi.mock("../db/db-manager.js", () => ({ db: vi.fn() }));
vi.mock("../store.js", () => ({ getEnableGoogleCollector: () => false }));
vi.mock("../services/user-game-data.js", () => ({
  updateUserGameDataExternalKey: vi.fn(),
}));
vi.mock("../utils/downloader.js", () => ({
  downloadImage: vi.fn(),
  deleteImage: vi.fn(),
}));
vi.mock("../utils/image-path.js", () => ({ toAbsolutePath: (p: string) => p }));
vi.mock("steam-user", () => ({ default: class {} }));
vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("FANZA registry 연동", () => {
  it.each([
    ["d_216826", "https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=d_216826/"],
    ["debo_0158", "https://dlsoft.dmm.co.jp/detail/debo_0158/"],
  ])("외부 원본 링크 생성: %s", (id, expected) => {
    expect(getCollectorUrl("fanza", id)).toBe(expected);
  });

  it("registry와 공통 추출기가 동일한 우선순위 사용", () => {
    expect(Object.keys(PROVIDER_COLLECTORS)).toEqual([
      "dlsite",
      "steam",
      "getchu",
      "fanza",
      "itch",
      "cien",
      "vndb",
    ]);
    expect(EXTERNAL_ID_EXTRACTORS.map((x) => x.provider)).toEqual(
      Object.keys(PROVIDER_COLLECTORS),
    );
  });

  it.each([
    ["D:/RJ01234567/[FANZA-debo_0158] v562", "fanza", "debo_0158"],
    ["D:/게임/[d_216826] GC123456", "getchu", "123456"],
    ["D:/게임/ITCH-maker.game CE123-456", "itch", "maker.game"],
  ])("실제 컬렉터 선택: %s", async (path, provider, id) => {
    const result = await findCollector(path);
    expect(result?.collector).toBe(PROVIDER_COLLECTORS[provider]);
    expect(result?.id).toBe(id);
  });
});
