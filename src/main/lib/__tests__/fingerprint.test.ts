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

  it("실행 파일 없어도 일반 파일로 fingerprint 계산", () => {
    writeFileSync(join(TEST_DIR, "readme.txt"), "text");
    const fp = computeFingerprint(TEST_DIR, false);
    expect(fp).toBeTypeOf("string");
    expect(fp).toHaveLength(64);
  });

  it("exe + lnk 혼합 시 일관된 fingerprint", () => {
    writeFileSync(join(TEST_DIR, "game.exe"), "exe");
    writeFileSync(join(TEST_DIR, "shortcut.lnk"), "lnk");
    const fp1 = computeFingerprint(TEST_DIR, false);
    const fp2 = computeFingerprint(TEST_DIR, false);
    expect(fp1).toBe(fp2);
  });

  it("하위 디렉토리 파일 포함하여 fingerprint 계산", () => {
    writeFileSync(join(TEST_DIR, "game.exe"), "exe-content");
    mkdirSync(join(TEST_DIR, "data"), { recursive: true });
    writeFileSync(join(TEST_DIR, "data", "actors.json"), "actors-data");
    const fp = computeFingerprint(TEST_DIR, false);
    expect(fp).toBeTypeOf("string");
    expect(fp).toHaveLength(64);
  });

  it("블랙리스트 디렉토리 파일 제외", () => {
    writeFileSync(join(TEST_DIR, "game.exe"), "exe-content");
    mkdirSync(join(TEST_DIR, "save"), { recursive: true });
    writeFileSync(join(TEST_DIR, "save", "save1.dat"), "save-data");

    const fp1 = computeFingerprint(TEST_DIR, false);

    rmSync(join(TEST_DIR, "save"), { recursive: true, force: true });
    const fp2 = computeFingerprint(TEST_DIR, false);

    expect(fp1).toBe(fp2);
  });

  it("비exe 파일이 다르면 다른 fingerprint", () => {
    writeFileSync(join(TEST_DIR, "game.exe"), "exe-content");
    writeFileSync(join(TEST_DIR, "data.pak"), "data-v1");
    const fp1 = computeFingerprint(TEST_DIR, false);

    writeFileSync(join(TEST_DIR, "data.pak"), "data-v2-longer");
    const fp2 = computeFingerprint(TEST_DIR, false);

    expect(fp1).not.toBe(fp2);
  });

  it("단일 파일(압축) fingerprint 계산", () => {
    const filePath = join(TEST_DIR, "game.zip");
    writeFileSync(filePath, "zip-content");
    const fp = computeFingerprint(filePath, true);
    expect(fp).toBeTypeOf("string");
    expect(fp).toHaveLength(64);
  });
});
