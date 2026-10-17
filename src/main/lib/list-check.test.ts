import { describe, expect, it } from "vitest";
import {
  buildListCheckRows,
  extractCode,
  splitListLines,
  type CodeExtractor,
  type ListCheckLibraryGame,
} from "./list-check.js";

// 컬렉터 getId와 같은 규칙의 테스트용 추출기
const extractors: CodeExtractor[] = [
  {
    provider: "dlsite",
    getId: async (t) => /[RBV]J\d{6,8}/i.exec(t)?.[0],
  },
  {
    provider: "steam",
    getId: async (t) => /ST(\d{4,8})/i.exec(t)?.[1],
  },
];

function game(overrides: Partial<ListCheckLibraryGame>): ListCheckLibraryGame {
  return {
    path: "D:\\Games\\game",
    title: null,
    originalTitle: null,
    translatedTitle: null,
    provider: null,
    externalId: null,
    thumbnail: null,
    isHidden: false,
    ...overrides,
  };
}

describe("splitListLines", () => {
  it("빈 줄과 앞뒤 공백을 제거한다", () => {
    expect(splitListLines("  a  \r\n\r\n b\n\n")).toEqual(["a", "b"]);
  });
});

describe("extractCode", () => {
  it("우선순위가 높은 추출기의 코드를 쓴다", async () => {
    expect(await extractCode("RJ01089692 ST1234", extractors)).toEqual({
      provider: "dlsite",
      externalId: "RJ01089692",
    });
  });

  it("코드가 없으면 null", async () => {
    expect(await extractCode("그냥 제목", extractors)).toBeNull();
  });
});

describe("buildListCheckRows", () => {
  it("코드가 일치하는 게임은 보유, 없으면 미보유", async () => {
    const rows = await buildListCheckRows(
      "RJ01089692 [屋上の細道] 자칭 천재 마술사 사라\n\nRJ01089975 [サークル] 리본",
      [game({ path: "D:\\a", provider: "dlsite", externalId: "RJ01089692" })],
      extractors,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      status: "owned",
      matchedBy: "code",
      provider: "dlsite",
      externalId: "RJ01089692",
      games: [{ path: "D:\\a" }],
    });
    expect(rows[1]).toMatchObject({ status: "missing", games: [] });
  });

  it("코드 대소문자 차이는 무시한다", async () => {
    const rows = await buildListCheckRows(
      "rj01089692 작품",
      [game({ provider: "dlsite", externalId: "RJ01089692" })],
      extractors,
    );
    expect(rows[0].status).toBe("owned");
  });

  it("externalId가 없는 게임은 폴더명에서 코드를 인식한다", async () => {
    const rows = await buildListCheckRows(
      "ST1145360 Hades",
      [game({ path: "D:\\Games\\Hades ST1145360" })],
      extractors,
    );
    expect(rows[0]).toMatchObject({ status: "owned", provider: "steam" });
  });

  it("폴더 상위 경로의 코드는 인식하지 않는다", async () => {
    const rows = await buildListCheckRows(
      "RJ01000000 작품",
      [game({ path: "D:\\RJ01000000\\다른 게임" })],
      extractors,
    );
    expect(rows[0].status).toBe("missing");
  });

  it("같은 코드를 가진 게임이 여러 개면 모두 나열한다", async () => {
    const rows = await buildListCheckRows(
      "RJ01089977",
      [
        game({ path: "D:\\a", provider: "dlsite", externalId: "RJ01089977" }),
        game({ path: "E:\\b.zip", isHidden: true, externalId: null }),
        game({ path: "E:\\RJ01089977 v2" }),
      ],
      extractors,
    );
    expect(rows[0].games.map((g) => g.path)).toEqual([
      "D:\\a",
      "E:\\RJ01089977 v2",
    ]);
  });

  it("목록 안의 같은 코드는 한 줄로 합치고 횟수를 센다", async () => {
    const rows = await buildListCheckRows(
      "RJ01089692 첫 줄\nRJ01089692 두 번째 줄\n제목만\n제목만",
      [],
      extractors,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ line: "RJ01089692 첫 줄", occurrences: 2 });
    expect(rows[1]).toMatchObject({ line: "제목만", occurrences: 2 });
  });

  it("코드 없는 줄은 제목이 완전히 같을 때만 보유", async () => {
    const rows = await buildListCheckRows(
      "My  Game\nMy Game 2",
      [game({ path: "D:\\x", originalTitle: "my game" })],
      extractors,
    );
    expect(rows[0]).toMatchObject({ status: "owned", matchedBy: "title" });
    expect(rows[1]).toMatchObject({ status: "unknown", games: [] });
  });

  it("숨김 여부와 썸네일을 결과에 담는다", async () => {
    const rows = await buildListCheckRows(
      "RJ01090427",
      [
        game({
          path: "D:\\h",
          provider: "dlsite",
          externalId: "RJ01090427",
          isHidden: true,
          thumbnail: "C:\\thumb.webp",
        }),
      ],
      extractors,
    );
    expect(rows[0].games[0]).toEqual({
      path: "D:\\h",
      title: null,
      thumbnail: "C:\\thumb.webp",
      isHidden: true,
    });
  });

  it("보유 게임 제목은 제목 표시 우선순위를 따른다", async () => {
    const lib = [
      game({
        path: "D:\\RJ01000001",
        provider: "dlsite",
        externalId: "RJ01000001",
        title: "原題",
        originalTitle: "RJ01000001",
        translatedTitle: "번역 제목",
      }),
    ];

    const translatedFirst = await buildListCheckRows(
      "RJ01000001",
      lib,
      extractors,
      ["translated", "collected", "original"],
    );
    const collectedFirst = await buildListCheckRows(
      "RJ01000001",
      lib,
      extractors,
      ["collected", "translated", "original"],
    );
    const originalFirst = await buildListCheckRows(
      "RJ01000001",
      lib,
      extractors,
      ["original", "collected", "translated"],
    );

    expect(translatedFirst[0].games[0].title).toBe("번역 제목");
    expect(collectedFirst[0].games[0].title).toBe("原題");
    expect(originalFirst[0].games[0].title).toBe("RJ01000001");
  });

  it("우선순위 앞쪽 제목이 비어 있으면 다음 제목을 쓴다", async () => {
    const rows = await buildListCheckRows(
      "RJ01000002",
      [
        game({
          provider: "dlsite",
          externalId: "RJ01000002",
          title: "原題",
          originalTitle: "RJ01000002",
          translatedTitle: null,
        }),
      ],
      extractors,
      ["translated", "collected", "original"],
    );
    expect(rows[0].games[0].title).toBe("原題");
  });
});
