/**
 * ProcessMonitor 테스트
 *
 * startSession, endSession, endAllSessions, hasActiveSession 메서드를 테스트한다.
 * 인메모리 SQLite를 사용하며, child_process.spawn과 user-game-data는 모킹한다.
 */

import type { Knex } from "knex";
import { EventEmitter } from "events";
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
import {
  createTestDb,
  truncateAll,
  seedGame,
  seedUserGameData,
} from "../db/test-utils.js";

// ========== 모킹 ==========

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
}));

// DB 모킹: getter를 통해 테스트 DB 인스턴스를 주입
const dbRef: { current: Knex | null } = { current: null };
vi.mock("../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: {
    getKnex: () => dbRef.current!,
  },
}));

// spawn 모킹: 매 호출마다 새 EventEmitter를 반환
const spawnMock = vi.fn();
vi.mock("child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
}));

// getOrCreateUserGameData 모킹
const getOrCreateUserGameDataMock = vi.fn();
vi.mock("./user-game-data.js", () => ({
  get getOrCreateUserGameData() {
    return getOrCreateUserGameDataMock;
  },
}));

// ========== 테스트 대상 임포트 ==========

import { ProcessMonitor } from "./ProcessMonitor.js";

// ========== 테스트 DB 초기화 ==========

let db: Knex;

beforeAll(async () => {
  db = await createTestDb();
  dbRef.current = db;
});

afterAll(async () => {
  await db.destroy();
});

// ========== 유틸 ==========

/** spawn 모킹이 반환할 가짜 ChildProcess를 생성한다 */
function createMockProcess(): EventEmitter & { pid: number } {
  const proc = new EventEmitter() as EventEmitter & { pid: number };
  proc.pid = Math.floor(Math.random() * 100000);
  return proc;
}

// ============================================
// isExeFile 테스트 (기존)
// ============================================

// isExeFile 로직 — 클래스 내부 메서드를 직접 테스트
describe("isExeFile", () => {
  const monitor = new ProcessMonitor();

  describe("exe 파일", () => {
    const testCases: [string, string][] = [
      ["C:/Games/Game.exe", "절대 경로"],
      ["Game.exe", "상대 경로"],
      ["game.exe", "소문자 확장자"],
      ["GAME.EXE", "대문자 확장자"],
      ["Game.EXE", "대소문자 혼합"],
      ["C:/Games/Game.EXE", "대소문자 혼합 경로"],
      ["C:\\Games\\Game.exe", "Windows 경로"],
    ];

    it.each(testCases)("%s → true (%s)", (input, _desc) => {
      expect(monitor.isExeFile(input)).toBe(true);
    });
  });

  describe("exe 파일이 아님", () => {
    const testCases: [string, string][] = [
      ["C:/Games/Game.lnk", "lnk 파일"],
      ["C:/Games/Game.url", "url 파일"],
      ["C:/Games/Game.bat", "bat 파일"],
      ["C:/Games/Game.cmd", "cmd 파일"],
      ["C:/Games/Game", "확장자 없음"],
      ["C:/Games/Game.exe ", "뒤에 공백"],
      ["C:/Games/Game.exe.bak", "exe가 아닌 다른 확장자"],
      ["C:/Games/exe/Game.txt", "경로에 exe 포함"],
      ["", "빈 문자열"],
    ];

    it.each(testCases)("%s → false (%s)", (input, _desc) => {
      expect(monitor.isExeFile(input)).toBe(false);
    });
  });
});

// ============================================
// startSession 테스트
// ============================================

describe("startSession", () => {
  let monitor: ProcessMonitor;

  beforeEach(async () => {
    await truncateAll(db);
    monitor = new ProcessMonitor();
    vi.clearAllMocks();
    // console.log/error 출력 억제
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it(".exe가 아닌 파일이면 false를 반환한다", async () => {
    const result = await monitor.startSession(
      "/games/test",
      "C:/Games/Game.lnk",
    );
    expect(result).toBe(false);
    // spawn이 호출되지 않아야 함
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("이미 활성 세션이 있으면 false를 반환한다", async () => {
    // 첫 번째 세션을 시작하기 위한 준비
    const gamePath = "/games/duplicate-session";
    await seedGame(db, { path: gamePath, fingerprint: "fp-dup" });
    const ugd = await seedUserGameData(db, gamePath, {
      fingerprint: "fp-dup",
    });
    getOrCreateUserGameDataMock.mockResolvedValue(ugd.id);

    const mockProc = createMockProcess();
    spawnMock.mockReturnValue(mockProc);

    // 첫 번째 시작 → 성공
    const first = await monitor.startSession(gamePath, "C:/Games/Game.exe");
    expect(first).toBe(true);

    // 같은 gamePath로 두 번째 시작 → 중복이므로 false
    const second = await monitor.startSession(gamePath, "C:/Games/Game.exe");
    expect(second).toBe(false);
    // spawn은 한 번만 호출되어야 함
    expect(spawnMock).toHaveBeenCalledTimes(1);
  });

  it("정상 시작: DB 업데이트, spawn 호출, true 반환", async () => {
    const gamePath = "/games/normal-start";
    await seedGame(db, { path: gamePath, fingerprint: "fp-normal" });
    const ugd = await seedUserGameData(db, gamePath, {
      fingerprint: "fp-normal",
    });
    getOrCreateUserGameDataMock.mockResolvedValue(ugd.id);

    const mockProc = createMockProcess();
    spawnMock.mockReturnValue(mockProc);

    const result = await monitor.startSession(gamePath, "C:/Games/Normal.exe");

    expect(result).toBe(true);

    // spawn이 올바른 인자로 호출되었는지 확인
    expect(spawnMock).toHaveBeenCalledWith("C:/Games/Normal.exe", [], {
      detached: false,
      stdio: "ignore",
    });

    // DB: games.sessionStartAt이 설정되었는지 확인
    const game = await db("games").where("path", gamePath).first();
    expect(game!.sessionStartAt).not.toBeNull();

    // DB: userGameData.lastPlayedAt이 설정되었는지 확인
    const userData = await db("userGameData").where("id", ugd.id).first();
    expect(userData!.lastPlayedAt).not.toBeNull();

    // 활성 세션이 등록되었는지 확인
    expect(monitor.hasActiveSession(gamePath)).toBe(true);
  });
});

// ============================================
// endSession 테스트
// ============================================

describe("endSession", () => {
  let monitor: ProcessMonitor;

  beforeEach(async () => {
    await truncateAll(db);
    monitor = new ProcessMonitor();
    vi.clearAllMocks();
    vi.useFakeTimers();
    // console.log/error 출력 억제
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("활성 세션이 없으면 아무것도 하지 않는다", async () => {
    // endSession 호출 시 에러 없이 반환되어야 함
    await monitor.endSession("/games/nonexistent");
    // getOrCreateUserGameData가 호출되지 않아야 함
    expect(getOrCreateUserGameDataMock).not.toHaveBeenCalled();
  });

  it("플레이 시간 >= 60초: playSessions 삽입, totalPlayTime 증가, sessionStartAt null", async () => {
    const gamePath = "/games/long-play";
    await seedGame(db, { path: gamePath, fingerprint: "fp-long" });
    const ugd = await seedUserGameData(db, gamePath, {
      fingerprint: "fp-long",
      totalPlayTime: 100,
    });
    getOrCreateUserGameDataMock.mockResolvedValue(ugd.id);

    const mockProc = createMockProcess();
    spawnMock.mockReturnValue(mockProc);

    // 시간 설정: 2026-01-01 00:00:00
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    // 세션 시작
    await monitor.startSession(gamePath, "C:/Games/Game.exe");

    // 시간을 120초 후로 이동
    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));

    // mainWindow 설정 (sendEvent 테스트)
    const mockWebContents = { send: vi.fn() };
    const mockWindow = {
      isDestroyed: () => false,
      webContents: mockWebContents,
    };
    monitor.setMainWindow(mockWindow as any);

    // 세션 종료
    await monitor.endSession(gamePath);

    // 세션이 제거되었는지 확인
    expect(monitor.hasActiveSession(gamePath)).toBe(false);

    // DB: playSessions에 레코드가 삽입되었는지 확인
    const sessions = await db("playSessions")
      .where("userGameDataId", ugd.id)
      .select("*");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationSeconds).toBe(120);

    // DB: userGameData.totalPlayTime이 증가했는지 확인
    const userData = await db("userGameData").where("id", ugd.id).first();
    expect(userData!.totalPlayTime).toBe(220); // 기존 100 + 120

    // DB: games.sessionStartAt이 null로 되었는지 확인
    const game = await db("games").where("path", gamePath).first();
    expect(game!.sessionStartAt).toBeNull();

    // 프론트엔드에 이벤트가 전송되었는지 확인
    expect(mockWebContents.send).toHaveBeenCalledWith("gameSessionEnded", {
      path: gamePath,
      durationSeconds: 120,
      totalPlayTime: 220,
      wasCheatMode: false,
    });
  });

  it("플레이 시간 < 60초: playSessions 삽입 없음, sessionStartAt만 null로", async () => {
    const gamePath = "/games/short-play";
    await seedGame(db, { path: gamePath, fingerprint: "fp-short" });
    const ugd = await seedUserGameData(db, gamePath, {
      fingerprint: "fp-short",
      totalPlayTime: 50,
    });
    getOrCreateUserGameDataMock.mockResolvedValue(ugd.id);

    const mockProc = createMockProcess();
    spawnMock.mockReturnValue(mockProc);

    // 시간 설정: 2026-01-01 00:00:00
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    // 세션 시작
    await monitor.startSession(gamePath, "C:/Games/Game.exe");

    // 시간을 30초 후로 이동 (60초 미만)
    vi.setSystemTime(new Date("2026-01-01T00:00:30Z"));

    // 세션 종료
    await monitor.endSession(gamePath);

    // 세션이 제거되었는지 확인
    expect(monitor.hasActiveSession(gamePath)).toBe(false);

    // DB: playSessions에 레코드가 삽입되지 않았는지 확인
    const sessions = await db("playSessions")
      .where("userGameDataId", ugd.id)
      .select("*");
    expect(sessions).toHaveLength(0);

    // DB: userGameData.totalPlayTime이 변경되지 않았는지 확인
    const userData = await db("userGameData").where("id", ugd.id).first();
    expect(userData!.totalPlayTime).toBe(50);

    // DB: games.sessionStartAt이 null로 되었는지 확인
    const game = await db("games").where("path", gamePath).first();
    expect(game!.sessionStartAt).toBeNull();
  });

  it("정확히 60초일 때 기록한다 (경계값)", async () => {
    const gamePath = "/games/boundary";
    await seedGame(db, { path: gamePath, fingerprint: "fp-bound" });
    const ugd = await seedUserGameData(db, gamePath, {
      fingerprint: "fp-bound",
      totalPlayTime: 0,
    });
    getOrCreateUserGameDataMock.mockResolvedValue(ugd.id);

    const mockProc = createMockProcess();
    spawnMock.mockReturnValue(mockProc);

    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await monitor.startSession(gamePath, "C:/Games/Game.exe");

    // 정확히 60초 후
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    await monitor.endSession(gamePath);

    // playSessions에 기록되어야 함
    const sessions = await db("playSessions")
      .where("userGameDataId", ugd.id)
      .select("*");
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationSeconds).toBe(60);
  });

  it("59초일 때 기록하지 않는다 (경계값)", async () => {
    const gamePath = "/games/boundary-under";
    await seedGame(db, { path: gamePath, fingerprint: "fp-under" });
    const ugd = await seedUserGameData(db, gamePath, {
      fingerprint: "fp-under",
      totalPlayTime: 0,
    });
    getOrCreateUserGameDataMock.mockResolvedValue(ugd.id);

    const mockProc = createMockProcess();
    spawnMock.mockReturnValue(mockProc);

    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await monitor.startSession(gamePath, "C:/Games/Game.exe");

    // 59초 후
    vi.setSystemTime(new Date("2026-01-01T00:00:59Z"));
    await monitor.endSession(gamePath);

    // playSessions에 기록되지 않아야 함
    const sessions = await db("playSessions")
      .where("userGameDataId", ugd.id)
      .select("*");
    expect(sessions).toHaveLength(0);
  });

  it("mainWindow가 없으면 이벤트 전송을 건너뛴다 (에러 없음)", async () => {
    const gamePath = "/games/no-window";
    await seedGame(db, { path: gamePath, fingerprint: "fp-nowin" });
    const ugd = await seedUserGameData(db, gamePath, {
      fingerprint: "fp-nowin",
      totalPlayTime: 0,
    });
    getOrCreateUserGameDataMock.mockResolvedValue(ugd.id);

    const mockProc = createMockProcess();
    spawnMock.mockReturnValue(mockProc);

    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await monitor.startSession(gamePath, "C:/Games/Game.exe");

    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
    // mainWindow를 설정하지 않은 상태로 종료 → 에러 없이 완료되어야 함
    await monitor.endSession(gamePath);

    // playSessions에는 기록되어야 함
    const sessions = await db("playSessions")
      .where("userGameDataId", ugd.id)
      .select("*");
    expect(sessions).toHaveLength(1);
  });

  it("이미 종료된 세션에 대해 중복 호출해도 안전하다", async () => {
    const gamePath = "/games/double-end";
    await seedGame(db, { path: gamePath, fingerprint: "fp-dbl" });
    const ugd = await seedUserGameData(db, gamePath, {
      fingerprint: "fp-dbl",
      totalPlayTime: 0,
    });
    getOrCreateUserGameDataMock.mockResolvedValue(ugd.id);

    const mockProc = createMockProcess();
    spawnMock.mockReturnValue(mockProc);

    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    await monitor.startSession(gamePath, "C:/Games/Game.exe");

    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));
    await monitor.endSession(gamePath);
    // 두 번째 호출 — 이미 세션이 제거되었으므로 아무것도 하지 않음
    await monitor.endSession(gamePath);

    // playSessions에 한 건만 기록되어야 함
    const sessions = await db("playSessions")
      .where("userGameDataId", ugd.id)
      .select("*");
    expect(sessions).toHaveLength(1);
  });
});

// ============================================
// hasActiveSession 테스트
// ============================================

describe("hasActiveSession", () => {
  let monitor: ProcessMonitor;

  beforeEach(async () => {
    await truncateAll(db);
    monitor = new ProcessMonitor();
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("활성 세션이 없으면 false를 반환한다", () => {
    expect(monitor.hasActiveSession("/games/no-session")).toBe(false);
  });

  it("활성 세션이 있으면 true를 반환한다", async () => {
    const gamePath = "/games/active-check";
    await seedGame(db, { path: gamePath, fingerprint: "fp-active" });
    const ugd = await seedUserGameData(db, gamePath, {
      fingerprint: "fp-active",
    });
    getOrCreateUserGameDataMock.mockResolvedValue(ugd.id);

    const mockProc = createMockProcess();
    spawnMock.mockReturnValue(mockProc);

    await monitor.startSession(gamePath, "C:/Games/Game.exe");
    expect(monitor.hasActiveSession(gamePath)).toBe(true);
  });

  it("다른 gamePath에 대해서는 false를 반환한다", async () => {
    const gamePath = "/games/active-only";
    await seedGame(db, { path: gamePath, fingerprint: "fp-only-active" });
    const ugd = await seedUserGameData(db, gamePath, {
      fingerprint: "fp-only-active",
    });
    getOrCreateUserGameDataMock.mockResolvedValue(ugd.id);

    const mockProc = createMockProcess();
    spawnMock.mockReturnValue(mockProc);

    await monitor.startSession(gamePath, "C:/Games/Game.exe");
    expect(monitor.hasActiveSession("/games/other-game")).toBe(false);
  });
});

// ============================================
// endAllSessions 테스트
// ============================================

describe("endAllSessions", () => {
  let monitor: ProcessMonitor;

  beforeEach(async () => {
    await truncateAll(db);
    monitor = new ProcessMonitor();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("활성 세션이 없으면 아무것도 하지 않는다", async () => {
    await monitor.endAllSessions();
    expect(getOrCreateUserGameDataMock).not.toHaveBeenCalled();
  });

  it("여러 활성 세션을 모두 종료한다", async () => {
    const gamePaths = ["/games/multi-1", "/games/multi-2", "/games/multi-3"];

    // 각 게임과 유저 데이터 시드
    for (let i = 0; i < gamePaths.length; i++) {
      await seedGame(db, {
        path: gamePaths[i],
        fingerprint: `fp-multi-${i}`,
      });
      const ugd = await seedUserGameData(db, gamePaths[i], {
        fingerprint: `fp-multi-${i}`,
        totalPlayTime: 0,
      });
      // getOrCreateUserGameData가 각 gamePath에 맞는 id를 반환하도록 설정
      getOrCreateUserGameDataMock.mockResolvedValueOnce(ugd.id); // startSession에서 호출
      getOrCreateUserGameDataMock.mockResolvedValueOnce(ugd.id); // endSession에서 호출
    }

    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));

    // 모든 세션 시작
    for (const gamePath of gamePaths) {
      const mockProc = createMockProcess();
      spawnMock.mockReturnValueOnce(mockProc);
      await monitor.startSession(gamePath, "C:/Games/Game.exe");
    }

    // 모든 세션이 활성인지 확인
    for (const gamePath of gamePaths) {
      expect(monitor.hasActiveSession(gamePath)).toBe(true);
    }

    // 시간을 120초 후로 이동
    vi.setSystemTime(new Date("2026-01-01T00:02:00Z"));

    // 모든 세션 종료
    await monitor.endAllSessions();

    // 모든 세션이 종료되었는지 확인
    for (const gamePath of gamePaths) {
      expect(monitor.hasActiveSession(gamePath)).toBe(false);
    }

    // DB: 각 게임의 sessionStartAt이 null인지 확인
    for (const gamePath of gamePaths) {
      const game = await db("games").where("path", gamePath).first();
      expect(game!.sessionStartAt).toBeNull();
    }

    // DB: playSessions에 3건 기록되었는지 확인
    const allSessions = await db("playSessions").select("*");
    expect(allSessions).toHaveLength(3);
  });
});
