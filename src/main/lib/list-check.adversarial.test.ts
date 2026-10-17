/**
 * 목록 대조 적대적 테스트
 *
 * 실제 컬렉터 getId(dlsite → steam → getchu → cien 순서)를 그대로 써서
 * 폴더명 인식 규칙과 붙여넣기 줄 인식이 어긋나는 지점을 찾는다.
 */
import { describe, expect, it, vi } from "vitest";

// 컬렉터 모듈이 끌고 오는 무거운 의존성 차단 (getId는 순수 정규식이라 영향 없음)
vi.mock("../collectors/registry.js", () => ({}));
vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  }),
}));
vi.mock("steam-user", () => ({ default: class {} }));

import { CienCollector } from "../collectors/cien-collector.js";
import { DLSiteCollector } from "../collectors/dlsite-collector.js";
import { GetchuCollector } from "../collectors/getchu-collector.js";
import { SteamCollector } from "../collectors/steam-collector.js";
import { formatExternalCode } from "./export-format.js";
import {
  buildListCheckRows,
  splitListLines,
  type CodeExtractor,
  type ListCheckLibraryGame,
} from "./list-check.js";

// PROVIDER_COLLECTORS와 같은 순서·같은 provider 값
const extractors: CodeExtractor[] = [
  { provider: "dlsite", getId: DLSiteCollector.getId },
  { provider: "steam", getId: SteamCollector.getId },
  { provider: "getchu", getId: GetchuCollector.getId },
  { provider: "cien", getId: CienCollector.getId },
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

/** 폴더명으로 스캔·수집된 게임이 DB에 남기는 provider/externalId를 실제 getId로 재현 */
async function collectedFromFolder(
  path: string,
): Promise<ListCheckLibraryGame> {
  const name = path.split(/[\\/]/).pop()!;
  for (const e of extractors) {
    const id = await e.getId(name);
    if (id) return game({ path, provider: e.provider, externalId: id });
  }
  throw new Error(`코드 없는 폴더: ${path}`);
}

// ========== 줄 나누기 ==========

describe("줄 나누기 경계", () => {
  it("CR만 쓰는 줄바꿈도 줄로 나눈다", () => {
    // 일부 클립보드/구형 맥 텍스트는 \r 만으로 줄을 나눈다
    expect(splitListLines("RJ01000001\rRJ01000002")).toEqual([
      "RJ01000001",
      "RJ01000002",
    ]);
  });

  it("CR만 쓰는 줄바꿈 목록도 각 줄을 따로 판정한다", async () => {
    const rows = await buildListCheckRows(
      "RJ01000001 A\rRJ01000002 B",
      [game({ provider: "dlsite", externalId: "RJ01000002" })],
      extractors,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      externalId: "RJ01000002",
      status: "owned",
    });
  });

  it("BOM으로 시작하는 붙여넣기도 첫 줄 제목이 일치한다", async () => {
    const rows = await buildListCheckRows(
      "\uFEFFHollow Knight\r\nCeleste",
      [game({ path: "D:\\a", title: "Hollow Knight" })],
      extractors,
    );
    expect(rows[0]).toMatchObject({ status: "owned", matchedBy: "title" });
  });

  it("전각 공백·NBSP도 공백으로 취급한다", async () => {
    const rows = await buildListCheckRows(
      "\u3000Hollow\u3000\u00A0Knight\u3000",
      [game({ path: "D:\\a", title: "Hollow Knight" })],
      extractors,
    );
    expect(rows[0].status).toBe("owned");
  });

  it("폭 없는 공백(ZWSP)만 있는 줄은 빈 줄로 본다", () => {
    // 웹 페이지 복사 시 눈에 안 보이는 줄이 판별 불가 행으로 남는지
    expect(splitListLines("RJ01000001\n\u200B\nRJ01000002")).toEqual([
      "RJ01000001",
      "RJ01000002",
    ]);
  });
});

// ========== 실제 getId 규칙 왕복 ==========

describe("폴더명으로 수집된 externalId ↔ 붙여넣기 코드 일치", () => {
  const cases: [string, string, string][] = [
    // [폴더 경로, 붙여넣는 줄, 설명]
    ["D:\\Games\\RJ01089692 사라", "RJ01089692", "DLsite RJ"],
    ["D:\\Games\\BJ01234567 만화", "bj01234567 책", "DLsite BJ 소문자"],
    ["D:\\Games\\VJ012345 게임", "VJ012345", "DLsite VJ 6자리"],
    ["D:\\Games\\Hades ST1145360", "ST1145360 Hades", "Steam ST"],
    ["D:\\Games\\Hades steam 1145360", "ST1145360", "Steam 키워드 폴더"],
    ["D:\\Games\\GC1234567 게임", "getchu1234567", "Getchu GC ↔ GETCHU"],
    ["D:\\Games\\CE123-456 게임", "CIENcreator123article456", "Ci-en 두 표기"],
    ["D:\\Games\\CIENcreator123article456", "CE123-456", "Ci-en 역방향"],
  ];

  for (const [path, line, label] of cases) {
    it(`${label}: 수집된 게임과 매칭`, async () => {
      const lib = [await collectedFromFolder(path)];
      const rows = await buildListCheckRows(line, lib, extractors);
      expect(rows[0]).toMatchObject({ status: "owned", matchedBy: "code" });

      // 정보 수집 전(폴더명 인식) 경로도 똑같이 매칭돼야 함
      const rowsRaw = await buildListCheckRows(
        line,
        [game({ path })],
        extractors,
      );
      expect(rowsRaw[0]).toMatchObject({ status: "owned", matchedBy: "code" });
    });
  }

  it("내보내기 코드(formatExternalCode)를 다시 붙여넣으면 같은 게임으로 매칭", async () => {
    const lib = [
      game({ path: "D:\\a", provider: "dlsite", externalId: "RJ01089692" }),
      game({ path: "D:\\b", provider: "steam", externalId: "1145360" }),
      game({ path: "D:\\c", provider: "getchu", externalId: "1234567" }),
      game({ path: "D:\\d", provider: "cien", externalId: "123-456" }),
    ];
    const text = lib
      .map(
        (g) => `제목\t${formatExternalCode(g.provider, g.externalId!)}\t메모`,
      )
      .join("\n");
    const rows = await buildListCheckRows(text, lib, extractors);
    expect(rows.map((r) => r.games.map((g) => g.path))).toEqual([
      ["D:\\a"],
      ["D:\\b"],
      ["D:\\c"],
      ["D:\\d"],
    ]);
  });

  it("작품 URL 형태의 줄도 DLsite/Steam 코드로 인식한다", async () => {
    const rows = await buildListCheckRows(
      "https://www.dlsite.com/maniax/work/=/product_id/RJ01089692.html\nhttps://store.steampowered.com/app/1145360/Hades/",
      [
        game({ path: "D:\\a", provider: "dlsite", externalId: "RJ01089692" }),
        game({ path: "D:\\b", provider: "steam", externalId: "1145360" }),
      ],
      extractors,
    );
    expect(rows.map((r) => r.status)).toEqual(["owned", "owned"]);
  });

  it("Ci-en 코드는 대문자 표기여도 같은 작품으로 매칭 (id 대소문자 무시)", async () => {
    // 폴더 CE123-456 → externalId "123-456"
    const lib = [await collectedFromFolder("D:\\Games\\CE123-456 게임")];
    const rows = await buildListCheckRows(
      "CIENCREATOR123ARTICLE456",
      lib,
      extractors,
    );
    expect(rows[0]).toMatchObject({
      provider: "cien",
      externalId: "123-456",
      status: "owned",
    });
  });
});

// ========== 코드/제목 충돌 ==========

describe("코드와 제목 판정 충돌", () => {
  it("보유 게임 제목과 완전히 같은 줄이 우연히 코드 모양을 품으면 보유로 판정해야 한다", async () => {
    // "steam" 키워드 + 4자리 숫자 → steam 코드로 오인식되어 제목 일치가 무시됨
    const rows = await buildListCheckRows(
      "Steampunk Story 1886",
      [
        game({
          path: "D:\\a",
          title: "Steampunk Story 1886",
          provider: "dlsite",
          externalId: "RJ01000001",
        }),
      ],
      extractors,
    );
    expect(rows[0].status).toBe("owned");
  });

  it("코드 줄은 코드로 먼저 찾고, 못 찾으면 제목 완전 일치로 판정", async () => {
    const rows = await buildListCheckRows(
      "RJ01000009\nRJ01000001 Foo",
      [
        game({ path: "D:\\RJ01000009 Foo", title: "RJ01000009" }),
        game({ path: "D:\\x", title: "RJ01000001 Foo" }),
      ],
      extractors,
    );
    expect(rows[0].games.map((g) => g.path)).toEqual(["D:\\RJ01000009 Foo"]);
    // 두 번째 줄은 같은 코드의 게임이 없지만 제목이 완전히 같은 게임(폴더 x)이 있음
    expect(rows[1]).toMatchObject({
      status: "owned",
      matchedBy: "title",
      games: [{ path: "D:\\x" }],
    });
  });
});

// ========== 경로 basename ==========

describe("폴더명(basename) 처리", () => {
  it("슬래시/역슬래시/UNC/후행 구분자 모두 마지막 폴더명만 본다", async () => {
    const rows = await buildListCheckRows(
      "RJ01000001\nRJ01000002\nRJ01000003\nRJ01000004",
      [
        game({ path: "D:/Games/RJ01000001 a" }),
        game({ path: "\\\\nas\\share\\RJ01000002 b" }),
        game({ path: "D:\\Games\\RJ01000003 c\\" }),
        game({ path: "D:\\RJ01000004\\inner" }),
      ],
      extractors,
    );
    expect(rows.map((r) => r.status)).toEqual([
      "owned",
      "owned",
      "owned",
      "missing",
    ]);
  });

  it("제목 일치에도 basename만 쓰고 상위 경로는 무시", async () => {
    const rows = await buildListCheckRows(
      "Games\nMy Game",
      [game({ path: "D:/Games/My Game" })],
      extractors,
    );
    expect(rows.map((r) => r.status)).toEqual(["unknown", "owned"]);
  });
});

// ========== 병합 ==========

describe("목록 내 중복 병합", () => {
  it("대소문자만 다른 같은 코드는 첫 줄 원문으로 합친다", async () => {
    const rows = await buildListCheckRows(
      "rj01000001 first\nRJ01000001 second\n  RJ01000001  ",
      [],
      extractors,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      line: "rj01000001 first",
      occurrences: 3,
    });
  });

  it("같은 Ci-en 글의 두 표기는 하나로 합친다", async () => {
    const rows = await buildListCheckRows(
      "CE123-456\nCIENcreator123article456",
      [],
      extractors,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].occurrences).toBe(2);
  });

  it("병합된 행이 다른 행과 games 배열을 공유하지 않는다", async () => {
    const lib = [
      game({ path: "D:\\a", provider: "dlsite", externalId: "RJ01000001" }),
    ];
    const rows = await buildListCheckRows("RJ01000001\nOther", lib, extractors);
    rows[0].games.push({
      path: "x",
      title: null,
      thumbnail: null,
      isHidden: false,
    });
    const again = await buildListCheckRows("RJ01000001", lib, extractors);
    expect(again[0].games).toHaveLength(1);
  });
});

// ========== 숨김/다중 ==========

describe("숨김·다중 보유", () => {
  it("코드 일치·폴더명 인식·제목 일치 모두 숨김 게임을 포함한다", async () => {
    const rows = await buildListCheckRows(
      "RJ01000001\nRJ01000002\nSecret",
      [
        game({
          path: "D:\\a",
          provider: "dlsite",
          externalId: "RJ01000001",
          isHidden: true,
        }),
        game({ path: "D:\\RJ01000002", isHidden: true }),
        game({ path: "D:\\c", translatedTitle: "secret", isHidden: true }),
      ],
      extractors,
    );
    expect(rows.map((r) => [r.status, r.games[0]?.isHidden])).toEqual([
      ["owned", true],
      ["owned", true],
      ["owned", true],
    ]);
  });

  it("제목·원제·폴더명이 모두 같은 줄과 같아도 게임은 한 번만 나온다", async () => {
    const rows = await buildListCheckRows(
      "Foo",
      [
        game({
          path: "D:\\Foo",
          title: "foo",
          originalTitle: "FOO",
          translatedTitle: " Foo ",
        }),
      ],
      extractors,
    );
    expect(rows[0].games).toHaveLength(1);
  });
});
