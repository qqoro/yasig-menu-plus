import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { computeFingerprint } from "../fingerprint.js";

const TEST_DIR = join(__dirname, "__test_fp_dir__");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("computeFingerprint", () => {
  it("exe 파일로 fingerprint 계산", () => {
    writeFileSync(join(TEST_DIR, "game.exe"), "exe-content");
    const fp = computeFingerprint(TEST_DIR, false);
    expect(fp).toBeTypeOf("string");
    expect(fp).toHaveLength(64); // SHA-256 hex
  });

  it("lnk 파일로 fingerprint 계산", () => {
    writeFileSync(join(TEST_DIR, "game.lnk"), "lnk-content");
    const fp = computeFingerprint(TEST_DIR, false);
    expect(fp).toBeTypeOf("string");
    expect(fp).toHaveLength(64);
  });

  it("url 파일로 fingerprint 계산", () => {
    writeFileSync(join(TEST_DIR, "game.url"), "url-content");
    const fp = computeFingerprint(TEST_DIR, false);
    expect(fp).toBeTypeOf("string");
    expect(fp).toHaveLength(64);
  });

  it("실행 파일이 없으면 null 반환", () => {
    writeFileSync(join(TEST_DIR, "readme.txt"), "text");
    const fp = computeFingerprint(TEST_DIR, false);
    expect(fp).toBeNull();
  });

  it("exe + lnk 혼합 시 일관된 fingerprint", () => {
    writeFileSync(join(TEST_DIR, "game.exe"), "exe");
    writeFileSync(join(TEST_DIR, "shortcut.lnk"), "lnk");
    const fp1 = computeFingerprint(TEST_DIR, false);
    const fp2 = computeFingerprint(TEST_DIR, false);
    expect(fp1).toBe(fp2);
  });

  it("단일 파일(압축) fingerprint 계산", () => {
    const filePath = join(TEST_DIR, "game.zip");
    writeFileSync(filePath, "zip-content");
    const fp = computeFingerprint(filePath, true);
    expect(fp).toBeTypeOf("string");
    expect(fp).toHaveLength(64);
  });
});
