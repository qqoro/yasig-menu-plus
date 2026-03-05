import { describe, expect, it } from "vitest";

/**
 * ProcessMonitor 유틸리티 테스트
 * 실행: pnpm test
 */

// isExeFile 로직
function isExeFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith(".exe");
}

// ============================================
// isExeFile 테스트
// ============================================
describe("isExeFile", () => {
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
      expect(isExeFile(input)).toBe(true);
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
      expect(isExeFile(input)).toBe(false);
    });
  });
});
