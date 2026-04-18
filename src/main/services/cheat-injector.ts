/**
 * RPG Maker MV/MZ 치트 플러그인 주입/복원 서비스
 *
 * 내장 플러그인: paramonos RPG-Maker-MV-MZ-Cheat-UI-Plugin
 * - MV/MZ 둘 다 지원
 * - https://github.com/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin
 *
 * 주입 방식: main.js를 백업 후 덮어쓰고 cheat/, css/ 폴더 복사
 * - MV: www/js/main.js 백업, mv/ 내용물을 www/에 복사
 * - MZ: js/main.js 백업, mz/ 내용물을 게임 루트에 복사
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
} from "node:fs/promises";
import { join } from "node:path";
import { app } from "electron";
import log from "electron-log";

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
    if (!detection.isRpgMaker || !detection.mainJsPath || !detection.gameRoot) {
      throw new Error("RPG Maker 게임이 아닙니다.");
    }

    const { version, mainJsPath, gameRoot } = detection;
    const backupPath = mainJsPath + BACKUP_SUFFIX;

    // 이미 백업이 있으면 (이전 주입이 미복원됨) 먼저 복원
    if (await pathExists(backupPath)) {
      log.warn("이전 주입 백업 발견, 복원 후 재주입:", backupPath);
      // 레지스트리 기록이 없어도 백업 파일로 직접 복원
      try {
        const backupContent = await readFile(backupPath, "utf-8");
        await writeFile(mainJsPath, backupContent, "utf-8");
        await rm(backupPath, { force: true });
        log.info("백업 파일로 main.js 복원 완료");
      } catch (e) {
        log.error("백업 복원 실패:", e);
      }
      // 레지스트리에도 기록이 있으면 함께 정리
      await this.restore(gamePath);
    }

    // 1. main.js 백업
    const mainJsContent = await readFile(mainJsPath, "utf-8");
    await writeFile(backupPath, mainJsContent, "utf-8");

    try {
      // 2. 번들 파일 복사 (cheat/, css/, js/, cheat-version-description.json)
      const injectedDirs = await this.copyBundleFiles(version!, gameRoot);

      // 3. 레지스트리에 기록
      await this.addToRegistry({
        gamePath,
        version: version!,
        mainJsPath,
        mainJsBackupPath: backupPath,
        injectedDirs,
        timestamp: new Date().toISOString(),
      });

      log.info(`치트 플러그인 주입 완료: ${gamePath} (${version})`);
    } catch (error) {
      // 주입 실패 시 백업 복원
      log.error("치트 주입 실패, 백업 복원:", error);
      if (await pathExists(backupPath)) {
        await writeFile(
          mainJsPath,
          await readFile(backupPath, "utf-8"),
          "utf-8",
        );
        await rm(backupPath, { force: true });
      }
      throw error;
    }
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
        await writeFile(
          record.mainJsPath,
          await readFile(record.mainJsBackupPath, "utf-8"),
          "utf-8",
        );
        await rm(record.mainJsBackupPath, { force: true });
        log.info(`main.js 복원 완료: ${record.mainJsPath}`);
      }

      // 주입한 디렉토리/파일 삭제
      for (const dir of record.injectedDirs) {
        if (await pathExists(dir)) {
          await rm(dir, { recursive: true, force: true });
          log.info(`주입 디렉토리 삭제: ${dir}`);
        }
      }

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
   * mv/ 내부의 cheat/, css/, js/, *.json → www/
   * mz/ 내부의 cheat/, css/, js/, *.json → 게임 루트
   */
  private async copyBundleFiles(
    version: "mv" | "mz",
    gameRoot: string,
  ): Promise<string[]> {
    const bundleDir = this.getBundleDir(version);
    if (!(await pathExists(bundleDir))) {
      throw new Error(`치트 플러그인 번들을 찾을 수 없습니다: ${bundleDir}`);
    }

    const injectedDirs: string[] = [];
    const entries = [
      { src: join(bundleDir, "cheat"), dest: join(gameRoot, "cheat") },
      { src: join(bundleDir, "css"), dest: join(gameRoot, "css") },
      { src: join(bundleDir, "js"), dest: join(gameRoot, "js") },
      {
        src: join(bundleDir, "cheat-version-description.json"),
        dest: join(gameRoot, "cheat-version-description.json"),
      },
    ];

    for (const { src, dest } of entries) {
      if (!(await pathExists(src))) continue;

      if ((await stat(src)).isDirectory()) {
        // 기존 디렉토리는 추적하지 않음 (js/ 등 게임 원본)
        // 파일 덮어쓰기는 main.js 백업/복원으로 처리
        const isNewDir = !(await pathExists(dest));
        await copyDirRecursive(src, dest);
        if (isNewDir) {
          injectedDirs.push(dest);
        }
      } else {
        await copyFile(src, dest);
      }
    }

    return injectedDirs;
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
