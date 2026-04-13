import { describe, it, expect } from "vitest";
import { normalizePath } from "../normalize-path.js";

describe("normalizePath", () => {
  it("빈 문자열을 받으면 현재 작업 디렉토리를 반환해야 한다", () => {
    const result = normalizePath("");
    expect(result).toBeTypeOf("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("상대 경로를 절대 경로로 변환해야 한다", () => {
    const result = normalizePath(".");
    expect(result).toMatch(/^[A-Z]:\\/i);
  });

  it("끝 슬래시를 제거해야 한다", () => {
    const result = normalizePath("C:\\Users\\");
    expect(result).not.toMatch(/[\\/]$/);
  });

  it("루트 드라이브는 끝 슬래시를 유지해야 한다", () => {
    const result = normalizePath("C:\\");
    expect(result).toBe("C:\\");
  });

  it("존재하지 않는 경로도 에러 없이 resolve 결과를 반환해야 한다", () => {
    const result = normalizePath(
      "Z:\\nonexistent\\path\\that\\does\\not\\exist",
    );
    expect(result).toBeTypeOf("string");
    expect(result).toContain("Z:");
  });

  it("앞뒤 공백을 trim 해야 한다", () => {
    const result = normalizePath("  C:\\Users  ");
    expect(result).not.toMatch(/^\s|\s$/);
  });
});
