/**
 * better-sqlite3 네이티브 모듈 런타임 전환 스크립트.
 *
 * 사용법:
 *   node scripts/rebuild-native.js            → Electron용 리빌드
 *   node scripts/rebuild-native.js --node     → 시스템 Node용 리빌드
 *
 * node_modules/.native-target 마커 파일로 현재 빌드 대상을 추적하여,
 * 이미 올바른 런타임이면 리빌드를 스킵한다.
 */

import { createRequire } from "module";
import { execSync } from "child_process";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const rootDir = join(import.meta.dirname, "..");
const markerPath = join(rootDir, "node_modules", ".native-target");
const target = process.argv.includes("--node") ? "node" : "electron";

// 마커 확인 — 이미 올바른 런타임이면 스킵
try {
  if (readFileSync(markerPath, "utf8").trim() === target) {
    console.log(`better-sqlite3: 이미 ${target}용 (스킵)`);
    process.exit(0);
  }
} catch {}

if (target === "electron") {
  const require = createRequire(import.meta.url);
  const { version } = require("electron/package.json");
  console.log(`Rebuilding better-sqlite3 for Electron ${version}...`);
  execSync("pnpm rebuild better-sqlite3", {
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_runtime: "electron",
      npm_config_target: version,
    },
  });
} else {
  console.log("Rebuilding better-sqlite3 for Node.js...");
  execSync("pnpm rebuild better-sqlite3", { stdio: "inherit" });
}

writeFileSync(markerPath, target);
