import type { Knex } from "knex";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createTestDb, seedGame, truncateAll } from "../db/test-utils.js";

// ========== 모듈 모킹 ==========

const mockSend = vi.fn();

vi.mock("electron", () => ({
  app: { getPath: () => "/mock/userData", isPackaged: false },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  shell: { openPath: vi.fn(), showItemInFolder: vi.fn(), trashItem: vi.fn() },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({
      webContents: { send: mockSend },
    })),
  },
}));

const dbRef: { current: Knex | null } = { current: null };
vi.mock("../db/db-manager.js", () => ({
  get db() {
    return dbRef.current!;
  },
  dbManager: {
    getKnex: () => dbRef.current!,
  },
}));

const mockTranslate = vi.fn();
vi.mock("../services/translation-manager.js", () => {
  return {
    TranslationManager: class MockTranslationManager {
      translate = mockTranslate;
    },
  };
});

vi.mock("../store.js", () => ({
  getTranslationSettings: vi.fn(() => ({})),
  setTranslationSettings: vi.fn(),
}));

// 실제 이벤트 값 대신 문자열 리터럴 사용 (const enum은 직접 import 불가)
vi.mock("../events.js", () => ({
  IpcMainSend: {
    TranslationProgress: "translationProgress",
  },
}));

// ========== 핸들러 import (모킹 이후) ==========
import { BrowserWindow } from "electron";
import {
  translateAllTitlesHandler,
  translateTitleHandler,
} from "./translation.js";

// ========== 테스트 ==========

describe("translation 핸들러", () => {
  let testDb: Knex;

  beforeAll(async () => {
    testDb = await createTestDb();
    dbRef.current = testDb;
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  beforeEach(async () => {
    await truncateAll(testDb);
    vi.clearAllMocks();
    // 기본 번역 결과 설정
    mockTranslate.mockResolvedValue({
      translatedText: "번역된 제목",
      source: "google",
    });
  });

  // ========== translateTitleHandler ==========

  describe("translateTitleHandler", () => {
    const mockEvent = { sender: {} } as any;

    it("게임이 없으면 에러를 던진다", async () => {
      await expect(
        translateTitleHandler(mockEvent, {
          path: "/games/nonexistent",
          force: false,
        }),
      ).rejects.toThrow("게임을 찾을 수 없습니다.");
    });

    it("이미 번역된 게임 + force=false → 기존 번역 반환 (DB 업데이트 없음)", async () => {
      await seedGame(testDb, {
        path: "/games/already-translated",
        title: "テストゲーム",
        translatedTitle: "기존 번역",
        translationSource: "google",
      });

      const result = await translateTitleHandler(mockEvent, {
        path: "/games/already-translated",
        force: false,
      });

      // 기존 번역이 반환됨
      expect(result).toEqual({
        path: "/games/already-translated",
        translatedTitle: "기존 번역",
        source: "google",
      });

      // TranslationManager.translate가 호출되지 않음
      expect(mockTranslate).not.toHaveBeenCalled();
    });

    it("이미 번역된 게임 + force=true → 재번역 수행", async () => {
      await seedGame(testDb, {
        path: "/games/force-retranslate",
        title: "テストゲーム",
        translatedTitle: "기존 번역",
        translationSource: "google",
      });

      mockTranslate.mockResolvedValue({
        translatedText: "새로운 번역",
        source: "google",
      });

      const result = await translateTitleHandler(mockEvent, {
        path: "/games/force-retranslate",
        force: true,
      });

      // 새 번역 결과가 반환됨
      expect(result).toEqual({
        path: "/games/force-retranslate",
        translatedTitle: "새로운 번역",
        source: "google",
      });

      // translate 호출 확인
      expect(mockTranslate).toHaveBeenCalledWith("テストゲーム");

      // DB에 업데이트 확인
      const game = await testDb("games")
        .where("path", "/games/force-retranslate")
        .first();
      expect(game!.translatedTitle).toBe("새로운 번역");
      expect(game!.translationSource).toBe("google");
    });

    it("번역되지 않은 게임 → 번역 후 DB 업데이트", async () => {
      await seedGame(testDb, {
        path: "/games/untranslated",
        title: "未翻訳ゲーム",
        translatedTitle: null,
        translationSource: null,
      });

      mockTranslate.mockResolvedValue({
        translatedText: "번역완료 제목",
        source: "google",
      });

      const result = await translateTitleHandler(mockEvent, {
        path: "/games/untranslated",
        force: false,
      });

      // 번역 결과 반환
      expect(result).toEqual({
        path: "/games/untranslated",
        translatedTitle: "번역완료 제목",
        source: "google",
      });

      // translate 호출 확인
      expect(mockTranslate).toHaveBeenCalledWith("未翻訳ゲーム");

      // DB에 업데이트 확인
      const game = await testDb("games")
        .where("path", "/games/untranslated")
        .first();
      expect(game!.translatedTitle).toBe("번역완료 제목");
      expect(game!.translationSource).toBe("google");
      expect(game!.translatedAt).not.toBeNull();
      expect(game!.updatedAt).not.toBeNull();
    });

    it("translationSource가 null인 기존 번역 → source를 'unknown'으로 반환", async () => {
      await seedGame(testDb, {
        path: "/games/no-source",
        title: "テスト",
        translatedTitle: "번역됨",
        translationSource: null,
      });

      const result = await translateTitleHandler(mockEvent, {
        path: "/games/no-source",
        force: false,
      });

      expect(result.source).toBe("unknown");
    });
  });

  // ========== translateAllTitlesHandler ==========

  describe("translateAllTitlesHandler", () => {
    const mockEvent = { sender: {} } as any;

    it("번역할 게임이 없으면 {total:0, success:0, failed:0} 반환", async () => {
      const result = await translateAllTitlesHandler(mockEvent, {
        force: false,
      });

      expect(result).toEqual({ total: 0, success: 0, failed: 0 });
    });

    it("force=false → translatedTitle이 null인 게임만 번역", async () => {
      // 이미 번역된 게임
      await seedGame(testDb, {
        path: "/games/already-done",
        title: "既翻訳",
        translatedTitle: "이미 번역됨",
        translationSource: "google",
      });

      // 아직 번역되지 않은 게임 2개
      await seedGame(testDb, {
        path: "/games/need-translate-1",
        title: "ゲーム1",
        translatedTitle: null,
      });
      await seedGame(testDb, {
        path: "/games/need-translate-2",
        title: "ゲーム2",
        translatedTitle: null,
      });

      const result = await translateAllTitlesHandler(mockEvent, {
        force: false,
      });

      // 번역되지 않은 2개만 처리
      expect(result.total).toBe(2);
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);

      // translate가 2번 호출됨
      expect(mockTranslate).toHaveBeenCalledTimes(2);

      // 이미 번역된 게임은 변경되지 않음
      const alreadyDone = await testDb("games")
        .where("path", "/games/already-done")
        .first();
      expect(alreadyDone!.translatedTitle).toBe("이미 번역됨");
    });

    it("force=true → 모든 게임 번역 (이미 번역된 게임 포함)", async () => {
      // 이미 번역된 게임
      await seedGame(testDb, {
        path: "/games/already-done",
        title: "既翻訳",
        translatedTitle: "이미 번역됨",
        translationSource: "google",
      });

      // 번역되지 않은 게임
      await seedGame(testDb, {
        path: "/games/not-done",
        title: "未翻訳",
        translatedTitle: null,
      });

      const result = await translateAllTitlesHandler(mockEvent, {
        force: true,
      });

      // 전체 2개 처리
      expect(result.total).toBe(2);
      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);

      // translate가 2번 호출됨
      expect(mockTranslate).toHaveBeenCalledTimes(2);
    });

    it("진행률 이벤트를 BrowserWindow에 전송", async () => {
      await seedGame(testDb, {
        path: "/games/progress-1",
        title: "ゲーム1",
        translatedTitle: null,
      });
      await seedGame(testDb, {
        path: "/games/progress-2",
        title: "ゲーム2",
        translatedTitle: null,
      });

      await translateAllTitlesHandler(mockEvent, { force: false });

      // BrowserWindow.fromWebContents가 호출됨
      expect(BrowserWindow.fromWebContents).toHaveBeenCalledWith(
        mockEvent.sender,
      );

      // 진행률 이벤트 2번 전송 (각 게임마다)
      expect(mockSend).toHaveBeenCalledTimes(2);

      // 첫 번째 게임 진행률
      expect(mockSend).toHaveBeenCalledWith("translationProgress", {
        current: 1,
        total: 2,
        gameTitle: expect.any(String),
      });

      // 두 번째 게임 진행률
      expect(mockSend).toHaveBeenCalledWith("translationProgress", {
        current: 2,
        total: 2,
        gameTitle: expect.any(String),
      });
    });

    it("일부 번역 실패 시 failed 카운트 증가", async () => {
      await seedGame(testDb, {
        path: "/games/will-succeed",
        title: "成功ゲーム",
        translatedTitle: null,
      });
      await seedGame(testDb, {
        path: "/games/will-fail",
        title: "失敗ゲーム",
        translatedTitle: null,
      });
      await seedGame(testDb, {
        path: "/games/will-succeed-2",
        title: "成功ゲーム2",
        translatedTitle: null,
      });

      // translate를 호출별로 다르게 설정: 2번째 호출만 실패
      mockTranslate
        .mockResolvedValueOnce({
          translatedText: "성공 번역1",
          source: "google",
        })
        .mockRejectedValueOnce(new Error("번역 서비스 오류"))
        .mockResolvedValueOnce({
          translatedText: "성공 번역2",
          source: "google",
        });

      const result = await translateAllTitlesHandler(mockEvent, {
        force: false,
      });

      expect(result.total).toBe(3);
      expect(result.success).toBe(2);
      expect(result.failed).toBe(1);

      // 실패한 게임의 DB는 변경되지 않음
      const failedGame = await testDb("games")
        .where("path", "/games/will-fail")
        .first();
      expect(failedGame!.translatedTitle).toBeNull();
    });

    it("BrowserWindow를 가져올 수 없으면 진행률 이벤트 없이 번역 진행", async () => {
      // fromWebContents가 null을 반환하도록 설정
      vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce(null);

      await seedGame(testDb, {
        path: "/games/no-window",
        title: "ウィンドウなし",
        translatedTitle: null,
      });

      const result = await translateAllTitlesHandler(mockEvent, {
        force: false,
      });

      // 번역 자체는 성공
      expect(result.total).toBe(1);
      expect(result.success).toBe(1);
      expect(result.failed).toBe(0);

      // send가 호출되지 않음
      expect(mockSend).not.toHaveBeenCalled();
    });

    it("모든 번역이 실패하면 success=0, failed=total", async () => {
      await seedGame(testDb, {
        path: "/games/all-fail-1",
        title: "失敗1",
        translatedTitle: null,
      });
      await seedGame(testDb, {
        path: "/games/all-fail-2",
        title: "失敗2",
        translatedTitle: null,
      });

      mockTranslate.mockRejectedValue(new Error("서비스 다운"));

      const result = await translateAllTitlesHandler(mockEvent, {
        force: false,
      });

      expect(result.total).toBe(2);
      expect(result.success).toBe(0);
      expect(result.failed).toBe(2);
    });
  });
});
