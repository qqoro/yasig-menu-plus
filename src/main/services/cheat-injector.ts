/**
 * RPG Maker MV/MZ 치트 플러그인 주입/복원 서비스
 *
 * 내장 플러그인: paramonos RPG-Maker-MV-MZ-Cheat-UI-Plugin
 * - MV/MZ 둘 다 지원
 * - https://github.com/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin
 *
 * 원본 main.js에 공식 로더만 추가하고 v2 번들을 복사
 * - MV: www/js/main.js 수정, mv/ 내용물을 www/에 복사
 * - MZ: js/main.js 수정, mz/ 내용물을 게임 루트에 복사
 */

import {
  readFile,
  writeFile,
  copyFile,
  mkdir,
  rm,
  stat,
  readdir,
  access,
  rename,
} from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import { createLogger } from "../utils/logger.js";
const log = createLogger("CheatInjector");

const BACKUP_SUFFIX = ".cheat-backup";
const REGISTRY_FILE = "cheat-injections.json";

/**
 * 경로 존재 여부 확인 (existsSync 대체)
 */
async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * 디렉토리 재귀 복사 (cpSync 대체)
 * cpSync가 Electron에서 네이티브 크래시를 유발하여 copyFile 기반으로 구현
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  if (!(await pathExists(dest))) {
    await mkdir(dest, { recursive: true });
  }
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

export interface RpgMakerDetectionResult {
  isRpgMaker: boolean;
  version: "mv" | "mz" | null;
  mainJsPath: string | null; // main.js 경로
  gameRoot: string | null; // 파일 복사 대상 루트
}

interface InjectionRecord {
  gamePath: string;
  version: "mv" | "mz";
  mainJsPath: string;
  mainJsBackupPath: string;
  injectedDirs: string[]; // 복사한 디렉토리 경로들
  replacedPaths?: string[]; // 기존 항목을 .cheat-backup으로 옮긴 경로
  timestamp: string;
}

class CheatInjector {
  /**
   * RPG Maker MV/MZ 게임 감지
   */
  async detect(gamePath: string): Promise<RpgMakerDetectionResult> {
    if (
      !(await pathExists(gamePath)) ||
      !(await stat(gamePath)).isDirectory()
    ) {
      return {
        isRpgMaker: false,
        version: null,
        mainJsPath: null,
        gameRoot: null,
      };
    }

    // MV 감지: www/js/main.js 또는 www/js/rpg_core.js
    const mvMainJs = join(gamePath, "www", "js", "main.js");
    const mvCore = join(gamePath, "www", "js", "rpg_core.js");
    if ((await pathExists(mvMainJs)) && (await pathExists(mvCore))) {
      return {
        isRpgMaker: true,
        version: "mv",
        mainJsPath: mvMainJs,
        gameRoot: join(gamePath, "www"),
      };
    }

    // MZ 감지: js/main.js 또는 js/rmmz_core.js
    const mzMainJs = join(gamePath, "js", "main.js");
    const mzCore = join(gamePath, "js", "rmmz_core.js");
    if ((await pathExists(mzMainJs)) && (await pathExists(mzCore))) {
      return {
        isRpgMaker: true,
        version: "mz",
        mainJsPath: mzMainJs,
        gameRoot: gamePath,
      };
    }

    return {
      isRpgMaker: false,
      version: null,
      mainJsPath: null,
      gameRoot: null,
    };
  }

  /**
   * 치트 플러그인 주입
   */
  async inject(
    gamePath: string,
    detection: RpgMakerDetectionResult,
  ): Promise<void> {
    if (
      !detection.isRpgMaker ||
      !detection.version ||
      !detection.mainJsPath ||
      !detection.gameRoot
    ) {
      throw new Error("RPG Maker 게임이 아닙니다.");
    }

    const { version, mainJsPath, gameRoot } = detection;
    const backupPath = mainJsPath + BACKUP_SUFFIX;

    // 이전 기록의 복원이 실패하면 원본 백업을 덮어쓰지 않음
    const pending = (await this.loadRegistry()).some(
      (r) => r.gamePath === gamePath,
    );
    if (pending && !(await this.restore(gamePath))) {
      throw new Error("이전 치트 주입을 복원하지 못했습니다.");
    }

    // 레지스트리가 없는 구버전 백업도 복원
    if (await pathExists(backupPath)) {
      log.warn("이전 주입 백업 발견, 복원 후 재주입:", backupPath);
      await copyFile(backupPath, mainJsPath);
      await rm(backupPath);
    }

    const mainJsContent = await readFile(mainJsPath, "utf8");
    const patched = this.patchMainJs(mainJsContent, version);
    const names = ["cheat", "cheat-version-description.json"];
    const injectedDirs = names.map((name) => join(gameRoot, name));
    const replacedPaths: string[] = [];
    for (const dest of injectedDirs) {
      if (await pathExists(dest + BACKUP_SUFFIX)) {
        throw new Error(
          `기존 치트 백업을 먼저 확인해 주세요: ${dest + BACKUP_SUFFIX}`,
        );
      }
      if (await pathExists(dest)) replacedPaths.push(dest);
    }

    // 바이너리 복사로 BOM과 인코딩을 포함한 원본 바이트 보존
    await copyFile(mainJsPath, backupPath);

    try {
      // 파일 변경 전에 기록해 중간 실패나 앱 재시작에도 복원 가능
      await this.addToRegistry({
        gamePath,
        version,
        mainJsPath,
        mainJsBackupPath: backupPath,
        injectedDirs,
        replacedPaths,
        timestamp: new Date().toISOString(),
      });

      for (const dest of replacedPaths) {
        await rename(dest, dest + BACKUP_SUFFIX);
      }
      await this.copyBundleFiles(version, gameRoot);
      await writeFile(mainJsPath, patched, "utf8");

      log.info(`치트 플러그인 주입 완료: ${gamePath} (${version})`);
    } catch (error) {
      log.error("치트 주입 실패, 백업 복원:", error);
      if ((await this.loadRegistry()).some((r) => r.gamePath === gamePath)) {
        await this.restore(gamePath);
      } else {
        await copyFile(backupPath, mainJsPath);
        await rm(backupPath);
      }
      throw error;
    }
  }

  private patchMainJs(content: string, version: "mv" | "mz"): string {
    const newline = content.includes("\r\n") ? "\r\n" : "\n";
    // 이미 설치한 공식 로더는 중복 추가하지 않음
    if (
      version === "mv" &&
      /PluginManager\s*\.\s*loadScript\s*\(\s*["']\.\.\/\.\.\/cheat\/init\/import\.js["']\s*\)/.test(
        content,
      )
    ) {
      return content;
    }
    if (
      version === "mz" &&
      /["'](?:\.\.\/\.\.\/)?cheat\/init\/import\.js["']/.test(content)
    ) {
      return content.replace(
        /(["'])\.\.\/\.\.\/cheat\/init\/import\.js\1/,
        '"cheat/init/import.js"',
      );
    }
    const anchor =
      version === "mv"
        ? /^[\t ]*PluginManager\s*\.\s*setup\s*\(\s*\$plugins\s*\)\s*;/m
        : /^[\t ]*(?:const|let|var)\s+scriptUrls\s*=\s*\[/m;
    if (!anchor.test(content)) {
      throw new Error(
        `치트 로딩 코드를 추가할 위치를 찾을 수 없습니다 (${version}). 게임 원본은 변경하지 않습니다.`,
      );
    }
    const loader =
      version === "mv"
        ? [
            "// 치트 플러그인 로드",
            'PluginManager._path = "js/plugins/";',
            'PluginManager.loadScript("../../cheat/init/import.js");',
          ].join(newline)
        : '    "cheat/init/import.js",';
    return content.replace(anchor, (match) => match + newline + loader);
  }

  /**
   * 치트 플러그인 복원
   */
  async restore(gamePath: string): Promise<boolean> {
    const records = await this.loadRegistry();
    const record = records.find((r) => r.gamePath === gamePath);

    if (!record) {
      log.info(`복원할 치트 주입 기록 없음: ${gamePath}`);
      return false;
    }

    try {
      // main.js 복원
      if (await pathExists(record.mainJsBackupPath)) {
        await copyFile(record.mainJsBackupPath, record.mainJsPath);
        log.info(`main.js 복원 완료: ${record.mainJsPath}`);
      }

      // 주입한 디렉토리/파일 삭제
      for (const dir of record.injectedDirs) {
        const replaced = record.replacedPaths?.includes(dir);
        const backup = dir + BACKUP_SUFFIX;
        // 백업 전 실패했거나 이미 복원한 항목은 원본 그대로 유지
        if (replaced && !(await pathExists(backup))) continue;
        if (await pathExists(dir)) {
          await rm(dir, { recursive: true, force: true });
          log.info(`주입 디렉토리 삭제: ${dir}`);
        }
        if (replaced) await rename(backup, dir);
      }

      await rm(record.mainJsBackupPath, { force: true });
      // 레지스트리에서 제거
      await this.removeFromRegistry(gamePath);

      log.info(`치트 복원 완료: ${gamePath}`);
      return true;
    } catch (error) {
      log.error(`치트 복원 실패: ${gamePath}`, error);
      return false;
    }
  }

  /**
   * 앱 시작 시 미복원 항목 정리
   */
  async restoreAllPending(): Promise<void> {
    const records = await this.loadRegistry();
    if (records.length === 0) return;

    log.info(`미복원 치트 주입 항목 ${records.length}개 발견, 복원 시작`);

    for (const record of records) {
      try {
        await this.restore(record.gamePath);
      } catch (error) {
        log.error(`미복원 항목 복원 실패: ${record.gamePath}`, error);
      }
    }
  }

  /**
   * 번들 파일들을 게임 폴더에 복사
   * v2의 cheat/ 및 버전 파일만 복사. 게임 js/와 설정 폴더는 유지
   */
  private async copyBundleFiles(
    version: "mv" | "mz",
    gameRoot: string,
  ): Promise<void> {
    const bundleDir = this.getBundleDir(version);
    if (!(await pathExists(bundleDir))) {
      throw new Error(`치트 플러그인 번들을 찾을 수 없습니다: ${bundleDir}`);
    }

    const entries = [
      { src: join(bundleDir, "cheat"), dest: join(gameRoot, "cheat") },
      {
        src: join(bundleDir, "cheat-version-description.json"),
        dest: join(gameRoot, "cheat-version-description.json"),
      },
    ];

    for (const { src, dest } of entries) {
      if ((await stat(src)).isDirectory()) {
        await copyDirRecursive(src, dest);
      } else {
        await copyFile(src, dest);
      }
    }
  }

  /**
   * 내장 플러그인 번들 디렉토리
   */
  private getBundleDir(version: "mv" | "mz"): string {
    const isDev = !app.isPackaged;
    if (isDev) {
      return join(process.cwd(), "build", "main", "cheat", version);
    }
    return join(process.resourcesPath, "cheat", version);
  }

  private getRegistryPath(): string {
    return join(app.getPath("userData"), REGISTRY_FILE);
  }

  private async loadRegistry(): Promise<InjectionRecord[]> {
    const path = this.getRegistryPath();
    if (!(await pathExists(path))) return [];
    try {
      return JSON.parse(await readFile(path, "utf-8"));
    } catch {
      return [];
    }
  }

  private async saveRegistry(records: InjectionRecord[]): Promise<void> {
    await writeFile(
      this.getRegistryPath(),
      JSON.stringify(records, null, 2),
      "utf-8",
    );
  }

  private async addToRegistry(record: InjectionRecord): Promise<void> {
    const records = await this.loadRegistry();
    const filtered = records.filter((r) => r.gamePath !== record.gamePath);
    filtered.push(record);
    await this.saveRegistry(filtered);
  }

  private async removeFromRegistry(gamePath: string): Promise<void> {
    const records = await this.loadRegistry();
    await this.saveRegistry(records.filter((r) => r.gamePath !== gamePath));
  }
}

export const cheatInjector = new CheatInjector();
