/**
 * 디버그 데이터 내보내기 핸들러
 *
 * 시스템 정보, 설정, 로그, (선택) DB를 ZIP으로 압축하여 내보내기
 */

import { ZipArchive } from "archiver";
import { app, clipboard, dialog, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { createWriteStream } from "fs";
import { access, readFile, stat, unlink, writeFile } from "fs/promises";
import os from "os";
import { join, resolve } from "path";
import { db } from "../db/db-manager.js";
import type { IpcMainEventMap, IpcRendererEventMap } from "../events.js";
import { wrapIpcHandler } from "../utils/ipc-wrapper.js";

/**
 * 경로 존재 여부 확인 (async)
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
 * DB 파일 경로 반환
 */
function getDbPath(): string {
  const isDevelopment = !app.isPackaged;
  return isDevelopment
    ? resolve("./dev.sqlite3")
    : resolve(app.getPath("userData"), "database.db");
}

/**
 * 설정 파일 경로 반환
 */
function getSettingsPath(): string {
  return resolve(app.getPath("userData"), "settings.json");
}

/**
 * 로그 파일 경로 반환 (electron-log v5 기본 경로)
 */
function getLogPath(): string {
  return resolve(app.getPath("userData"), "logs", "main.log");
}

/**
 * 파일 크기를 읽기 쉬운 형식으로 변환
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * 날짜를 YYYYMMDD 형식으로 포맷
 */
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * 공통 시스템 정보 생성 (Markdown 테이블 형식)
 */
function buildSystemInfoTable(): string {
  const version = app.getVersion();
  const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR;

  return [
    `| 항목 | 값 |`,
    `|------|-----|`,
    `| 앱 버전 | ${version} |`,
    `| Electron | ${process.versions.electron} |`,
    `| Chrome | ${process.versions.chrome} |`,
    `| Node.js | ${process.versions.node} |`,
    `| 포터블 | ${isPortable ? "예" : "아니요"} |`,
    `| 플랫폼 | ${os.platform()} |`,
    `| 아키텍처 | ${os.arch()} |`,
    `| OS 버전 | ${os.version()} |`,
    `| OS 릴리즈 | ${os.release()} |`,
    `| 로케일 | ${app.getLocale()} |`,
  ].join("\n");
}

/**
 * system-info.md 내용 생성
 */
async function generateSystemInfo(): Promise<string> {
  const dbPath = getDbPath();
  const settingsPath = getSettingsPath();
  const logPath = getLogPath();
  const userDataPath = app.getPath("userData");

  // DB 통계
  let gameCount = 0;
  let dbFileSize = "N/A";
  try {
    const result = await db("games").count("* as count").first();
    gameCount = Number((result as any)?.count ?? 0);
  } catch {
    gameCount = -1; // 조회 실패
  }
  try {
    if (await pathExists(dbPath)) {
      dbFileSize = formatFileSize((await stat(dbPath)).size);
    }
  } catch {
    dbFileSize = "N/A";
  }

  const lines: string[] = [
    "# Yasig Menu Plus - 시스템 정보",
    "",
    `생성일: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
    "",
    "## 환경 정보",
    "",
    buildSystemInfoTable(),
    "",
    "## 데이터 경로",
    "",
    `| 항목 | 경로 |`,
    `|------|------|`,
    `| userData | ${userDataPath} |`,
    `| 설정 파일 | ${settingsPath} (${(await pathExists(settingsPath)) ? "존재" : "없음"}) |`,
    `| DB 파일 | ${dbPath} (${(await pathExists(dbPath)) ? "존재" : "없음"}) |`,
    `| 로그 파일 | ${logPath} (${(await pathExists(logPath)) ? "존재" : "없음"}) |`,
    "",
    "## DB 통계",
    "",
    `| 항목 | 값 |`,
    `|------|-----|`,
    `| DB 파일 크기 | ${dbFileSize} |`,
    `| 게임 수 | ${gameCount >= 0 ? gameCount : "조회 실패"} |`,
    "",
  ];

  return lines.join("\n");
}

/**
 * 디버그 데이터 내보내기 핸들러
 */
export const exportDebugDataHandler = wrapIpcHandler(
  "exportDebugData",
  async (
    _event: IpcMainInvokeEvent,
    payload: IpcRendererEventMap["exportDebugData"],
  ): Promise<IpcMainEventMap["debugDataExported"]> => {
    const { includeDb } = payload;
    const version = app.getVersion();
    const dateStr = formatDate(new Date());
    const defaultFilename = `yasig-menu-plus-debug-v${version}-${dateStr}.ymp`;

    // 1. 저장 경로 선택 다이얼로그
    const dialogResult = await dialog.showSaveDialog({
      title: "디버그 데이터 저장",
      defaultPath: defaultFilename,
      filters: [{ name: "YMP 디버그 파일", extensions: ["ymp"] }],
    });

    if (dialogResult.canceled || !dialogResult.filePath) {
      return null;
    }

    const savePath = dialogResult.filePath;
    const tempDir = app.getPath("temp");
    const tempInfoPath = join(tempDir, `ymp-debug-info-${Date.now()}.md`);

    try {
      // 2. system-info.md 생성
      const systemInfo = await generateSystemInfo();
      await writeFile(tempInfoPath, systemInfo, "utf-8");

      // 3. ZIP 압축 생성
      await new Promise<void>((resolvePromise, rejectPromise) => {
        const output = createWriteStream(savePath);
        const archive = new ZipArchive({ zlib: { level: 9 } });

        output.on("close", () => {
          resolvePromise();
        });

        archive.on("error", (err) => {
          rejectPromise(err);
        });

        archive.pipe(output);

        // system-info.md 추가
        archive.file(tempInfoPath, { name: "system-info.md" });

        // settings.json 추가 (있으면)
        const settingsPath = getSettingsPath();
        archive.file(settingsPath, { name: "settings.json" });

        // main.log 추가 (있으면)
        const logPath = getLogPath();
        archive.file(logPath, { name: "main.log" });

        // DB 파일 추가 (선택 + 있으면)
        if (includeDb) {
          const dbPath = getDbPath();
          archive.file(dbPath, { name: "database.db" });
        }

        archive.finalize();
      });

      return { path: savePath };
    } finally {
      // 4. 임시 파일 정리
      try {
        if (await pathExists(tempInfoPath)) {
          await unlink(tempInfoPath);
        }
      } catch {
        // 임시 파일 정리 실패는 무시
      }
    }
  },
);

/**
 * 이슈 본문에 넣을 로그 상한
 *
 * GitHub 이슈 본문 한도는 65,536자. 환경 정보 표와 사용자가 적을 설명 여유를
 * 남기기 위해 로그는 문자 예산으로 자르고, 줄 수 상한을 함께 둔다.
 */
export const ISSUE_LOG_MAX_LINES = 500;
export const ISSUE_LOG_MAX_CHARS = 50_000;

/**
 * 로그 끝에서부터 줄 수·문자 예산 안에 들어가는 만큼 잘라낸다 (원래 순서 유지)
 */
export function selectRecentLogLines(
  lines: string[],
  maxLines: number,
  maxChars: number,
): string[] {
  const picked: string[] = [];
  let chars = 0;

  for (let i = lines.length - 1; i >= 0 && picked.length < maxLines; i--) {
    const cost = lines[i].length + 1; // 줄바꿈 포함
    if (chars + cost > maxChars) {
      break;
    }
    chars += cost;
    picked.push(lines[i]);
  }

  return picked.reverse();
}

/**
 * 정규식 특수문자 이스케이프
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * 경로 구분자를 백슬래시(이스케이프된 형태 포함)·슬래시 모두 허용하는 정규식 조각
 */
const PATH_SEP = "(?:\\\\+|/)";

/**
 * 사용자명이 드러나는 경로를 `<user>`로 가린다
 *
 * - 홈 디렉터리 전체 경로 (C:\Users\name, C:/Users/name, C:\\Users\\name)
 * - 다른 드라이브의 프로필 경로 (D:\Users\name)
 * 경로가 아닌 곳에 나오는 사용자명은 건드리지 않는다.
 */
export function redactUserInfo(
  text: string,
  homeDir: string,
  username: string,
): string {
  let result = text;

  const homeSegments = homeDir.split(/[\\/]+/).filter(Boolean);
  const homeLast = homeSegments.at(-1);
  if (homeLast) {
    const homePattern = new RegExp(
      homeSegments.map(escapeRegExp).join(PATH_SEP) + "(?![\\w.-])",
      "gi",
    );
    result = result.replace(
      homePattern,
      (match) => match.slice(0, match.length - homeLast.length) + "<user>",
    );
  }

  if (username) {
    const profilePattern = new RegExp(
      `(${PATH_SEP}Users${PATH_SEP})${escapeRegExp(username)}(?![\\w.-])`,
      "gi",
    );
    result = result.replace(profilePattern, "$1<user>");
  }

  return result;
}

/**
 * 현재 사용자명 (조회 실패 시 빈 문자열)
 */
function getUsername(): string {
  try {
    return os.userInfo().username;
  } catch {
    return "";
  }
}

/**
 * GitHub 이슈 페이지 열기 (시스템 정보 + 최근 로그 클립보드 복사)
 * URL 길이 제한으로 본문 전체를 클립보드에 복사 후 이슈 페이지 열기
 */
export const openGitHubIssueHandler = wrapIpcHandler(
  "openGitHubIssue",
  async (
    _event: IpcMainInvokeEvent,
    _payload: IpcRendererEventMap["openGitHubIssue"],
  ): Promise<IpcMainEventMap["gitHubIssueOpened"]> => {
    // 최근 로그 읽기 (줄 수·문자 예산 이내)
    let logSection = "";
    const logPath = getLogPath();
    if (await pathExists(logPath)) {
      try {
        const logContent = await readFile(logPath, "utf-8");
        const lines = logContent.split("\n").filter(Boolean);
        const lastLines = selectRecentLogLines(
          lines,
          ISSUE_LOG_MAX_LINES,
          ISSUE_LOG_MAX_CHARS,
        );
        logSection = [
          "",
          "<details>",
          `<summary>최근 로그 (마지막 ${lastLines.length}줄)</summary>`,
          "",
          "```",
          ...lastLines,
          "```",
          "",
          "</details>",
        ].join("\n");
      } catch {
        logSection = "\n## 최근 로그\n\n*로그 읽기 실패*";
      }
    }

    // 이슈 본문 생성 (공개 이슈에 올라가므로 사용자명이 드러나는 경로는 가린다)
    const body = redactUserInfo(
      [
        `## 환경 정보`,
        ``,
        buildSystemInfoTable(),
        logSection,
        ``,
        `## 문제 설명`,
        ``,
        `<!-- 여기에 문제를 설명해주세요 -->`,
        ``,
        `## 재현 방법`,
        ``,
        `<!-- 문제를 재현하는 방법을 적어주세요 -->`,
      ].join("\n"),
      os.homedir(),
      getUsername(),
    );

    // 클립보드에 본문 복사
    clipboard.writeText(body);

    // GitHub 이슈 페이지 열기 (title은 쿼리스트링, body는 클립보드)
    const url = new URL("https://github.com/qqoro/yasig-menu-plus/issues/new");
    url.searchParams.set("title", "[Bug] ");
    await shell.openExternal(url.toString());
  },
);
