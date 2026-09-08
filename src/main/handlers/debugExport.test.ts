import { beforeEach, describe, expect, it, vi } from "vitest";

// ========== 모듈 모킹 ==========

const mockWriteText = vi.fn();
const mockOpenExternal = vi.fn();

vi.mock("electron", () => ({
  app: {
    getPath: () => "C:\\Users\\chanb\\AppData\\Roaming\\yasig-menu-plus",
    getVersion: () => "1.21.2",
    getLocale: () => "ko",
    isPackaged: true,
  },
  clipboard: { writeText: (text: string) => mockWriteText(text) },
  dialog: { showSaveDialog: vi.fn() },
  shell: { openExternal: (url: string) => mockOpenExternal(url) },
}));

vi.mock("../db/db-manager.js", () => ({
  db: vi.fn(),
}));

vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal<typeof import("os")>();
  return {
    default: {
      ...actual,
      homedir: () => "C:\\Users\\chanb",
      userInfo: () => ({ ...actual.userInfo(), username: "chanb" }),
    },
  };
});

const mockReadFile = vi.fn();
vi.mock("fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs/promises")>();
  return {
    ...actual,
    access: vi.fn(async () => undefined),
    readFile: (...args: unknown[]) => mockReadFile(...args),
  };
});

import {
  ISSUE_LOG_MAX_CHARS,
  ISSUE_LOG_MAX_LINES,
  openGitHubIssueHandler,
  redactUserInfo,
  selectRecentLogLines,
} from "./debugExport.js";

// ========== 테스트 ==========

describe("selectRecentLogLines", () => {
  it("줄 수 상한만큼 뒤에서부터 가져오되 원래 순서를 유지한다", () => {
    const lines = ["a", "b", "c", "d", "e"];
    expect(selectRecentLogLines(lines, 3, 1000)).toEqual(["c", "d", "e"]);
  });

  it("문자 예산을 넘기면 오래된 줄부터 버린다", () => {
    // 각 줄 5자 + 줄바꿈 1자 = 6자. 예산 13자면 뒤에서 2줄만 들어간다
    const lines = ["11111", "22222", "33333", "44444"];
    expect(selectRecentLogLines(lines, 100, 13)).toEqual(["33333", "44444"]);
  });

  it("마지막 줄 하나가 예산보다 길면 빈 배열을 반환한다", () => {
    expect(selectRecentLogLines(["x".repeat(50)], 10, 20)).toEqual([]);
  });

  it("입력이 상한보다 적으면 전부 반환한다", () => {
    expect(selectRecentLogLines(["a", "b"], 10, 1000)).toEqual(["a", "b"]);
  });
});

describe("redactUserInfo", () => {
  const home = "C:\\Users\\chanb";
  const user = "chanb";

  it("백슬래시 경로의 홈 디렉터리를 가린다", () => {
    const text =
      "DB 파일 경로: C:\\Users\\chanb\\AppData\\Roaming\\yasig-menu-plus\\database.db";
    expect(redactUserInfo(text, home, user)).toBe(
      "DB 파일 경로: C:\\Users\\<user>\\AppData\\Roaming\\yasig-menu-plus\\database.db",
    );
  });

  it("슬래시 경로(file:// URL)의 홈 디렉터리를 가린다", () => {
    const text =
      "at file:///C:/Users/chanb/AppData/Local/Programs/yasig-menu-plus/resources/app.asar/main/utils/downloader.js:80:24";
    expect(redactUserInfo(text, home, user)).toBe(
      "at file:///C:/Users/<user>/AppData/Local/Programs/yasig-menu-plus/resources/app.asar/main/utils/downloader.js:80:24",
    );
  });

  it("JSON 문자열처럼 이스케이프된 백슬래시 경로도 가린다", () => {
    const text =
      '"filename": "C:\\\\Users\\\\chanb\\\\AppData\\\\Roaming\\\\db"';
    expect(redactUserInfo(text, home, user)).toBe(
      '"filename": "C:\\\\Users\\\\<user>\\\\AppData\\\\Roaming\\\\db"',
    );
  });

  it("대소문자가 달라도 가린다", () => {
    expect(redactUserInfo("c:\\users\\chanb\\Games", home, user)).toBe(
      "c:\\users\\<user>\\Games",
    );
  });

  it("홈 디렉터리와 다른 드라이브의 프로필 경로도 사용자명 기준으로 가린다", () => {
    expect(redactUserInfo("D:\\Users\\chanb\\Games", home, user)).toBe(
      "D:\\Users\\<user>\\Games",
    );
  });

  it("사용자명으로 시작하는 다른 단어는 건드리지 않는다", () => {
    const text = "C:\\Users\\chanbob\\Games";
    expect(redactUserInfo(text, home, user)).toBe(text);
  });

  it("경로가 아닌 곳에 나오는 사용자명은 건드리지 않는다", () => {
    const text = "게임 제목: chanb의 모험";
    expect(redactUserInfo(text, home, user)).toBe(text);
  });

  it("한 줄에 여러 번 나와도 전부 가린다", () => {
    const text = "C:\\Users\\chanb\\a → C:/Users/chanb/b";
    expect(redactUserInfo(text, home, user)).toBe(
      "C:\\Users\\<user>\\a → C:/Users/<user>/b",
    );
  });
});

describe("openGitHubIssueHandler", () => {
  beforeEach(() => {
    mockWriteText.mockReset();
    mockOpenExternal.mockReset();
    mockReadFile.mockReset();
  });

  it("클립보드 본문에서 사용자명을 가리고 로그 줄 수를 상한 이내로 제한한다", async () => {
    const logLines = Array.from(
      { length: ISSUE_LOG_MAX_LINES + 50 },
      (_, i) => `[info] 줄 ${i} C:\\Users\\chanb\\AppData\\Roaming\\app`,
    );
    mockReadFile.mockResolvedValue(logLines.join("\n"));

    await openGitHubIssueHandler({} as never, undefined as never);

    expect(mockWriteText).toHaveBeenCalledTimes(1);
    const body: string = mockWriteText.mock.calls[0][0];

    expect(body).not.toContain("chanb");
    expect(body).toContain("C:\\Users\\<user>\\AppData");
    expect(body).toContain(`최근 로그 (마지막 ${ISSUE_LOG_MAX_LINES}줄)`);
    // 가장 최근 줄은 포함되고, 상한 밖의 오래된 줄은 빠진다
    expect(body).toContain(`줄 ${logLines.length - 1} `);
    expect(body).not.toContain("줄 0 ");
    expect(body.length).toBeLessThan(ISSUE_LOG_MAX_CHARS + 5000);

    expect(mockOpenExternal).toHaveBeenCalledWith(
      "https://github.com/qqoro/yasig-menu-plus/issues/new?title=%5BBug%5D+",
    );
  });
});
