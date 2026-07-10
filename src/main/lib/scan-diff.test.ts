import { describe, expect, it } from "vitest";
import type { GameCandidate } from "./scan-logic.js";
import { classifyCandidate, type ExistingGameRow } from "./scan-diff.js";

/**
 * 증분 스캔 분류 로직 테스트
 * 실행: pnpm test src/main/lib/scan-diff.test.ts
 */

const SOURCE = "C:\\library";

function makeCandidate(overrides: Partial<GameCandidate> = {}): GameCandidate {
  return {
    path: "C:\\library\\game",
    name: "game",
    isCompressFile: false,
    hasExecutable: true,
    mtimeMs: 1000,
    ...overrides,
  };
}

function makeExisting(
  overrides: Partial<ExistingGameRow> = {},
): ExistingGameRow {
  return {
    path: "C:\\library\\game",
    source: SOURCE,
    fingerprint: "abc123",
    dirMtimeMs: 1000,
    hasExecutable: 1,
    provider: null,
    externalId: null,
    ...overrides,
  };
}

describe("classifyCandidate", () => {
  it("DB에 없는 경로 → new", () => {
    expect(classifyCandidate(undefined, makeCandidate(), SOURCE)).toBe("new");
  });

  it("모든 조건 일치 → skip", () => {
    expect(classifyCandidate(makeExisting(), makeCandidate(), SOURCE)).toBe(
      "skip",
    );
  });

  it("저장된 dirMtimeMs가 null (업그레이드 후 첫 스캔) → changed", () => {
    expect(
      classifyCandidate(
        makeExisting({ dirMtimeMs: null }),
        makeCandidate(),
        SOURCE,
      ),
    ).toBe("changed");
  });

  it("후보 mtimeMs가 undefined (stat 실패) → changed", () => {
    expect(
      classifyCandidate(
        makeExisting(),
        makeCandidate({ mtimeMs: undefined }),
        SOURCE,
      ),
    ).toBe("changed");
  });

  it("mtime 불일치 → changed", () => {
    expect(
      classifyCandidate(
        makeExisting({ dirMtimeMs: 999 }),
        makeCandidate({ mtimeMs: 1000 }),
        SOURCE,
      ),
    ).toBe("changed");
  });

  it("저장된 fingerprint가 null → changed", () => {
    expect(
      classifyCandidate(
        makeExisting({ fingerprint: null }),
        makeCandidate(),
        SOURCE,
      ),
    ).toBe("changed");
  });

  it("source 불일치 (라이브러리 간 이동) → changed", () => {
    expect(
      classifyCandidate(
        makeExisting({ source: "D:\\other-library" }),
        makeCandidate(),
        SOURCE,
      ),
    ).toBe("changed");
  });

  it("hasExecutable 불일치 (0 vs true) → changed", () => {
    expect(
      classifyCandidate(
        makeExisting({ hasExecutable: 0 }),
        makeCandidate({ hasExecutable: true }),
        SOURCE,
      ),
    ).toBe("changed");
  });

  it("hasExecutable이 SQLite 정수 1이어도 true와 동일 취급 → skip", () => {
    expect(
      classifyCandidate(
        makeExisting({ hasExecutable: 1 }),
        makeCandidate({ hasExecutable: true }),
        SOURCE,
      ),
    ).toBe("skip");
  });

  it("hasExecutable이 boolean true여도 skip", () => {
    expect(
      classifyCandidate(
        makeExisting({ hasExecutable: true }),
        makeCandidate({ hasExecutable: true }),
        SOURCE,
      ),
    ).toBe("skip");
  });

  it("mtimeMs가 0이어도 유효한 값으로 비교 (0 === 0 → skip)", () => {
    expect(
      classifyCandidate(
        makeExisting({ dirMtimeMs: 0 }),
        makeCandidate({ mtimeMs: 0 }),
        SOURCE,
      ),
    ).toBe("skip");
  });
});
