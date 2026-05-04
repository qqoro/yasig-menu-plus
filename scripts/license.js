import chalk from "chalk";
import { createHash } from "crypto";
import { exec } from "child_process";
import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
const { blueBright, greenBright, yellowBright, redBright } = chalk;

const execPromise = promisify(exec);

const LICENSE_FILENAMES = [
  "LICENSE",
  "LICENSE.md",
  "LICENSE.txt",
  "license",
  "license.md",
  "license.txt",
  "LICENCE",
  "LICENCE.md",
  "LICENCE.txt",
];

async function readLicenseText(packagePath) {
  for (const name of LICENSE_FILENAMES) {
    try {
      return await readFile(join(packagePath, name), "utf-8");
    } catch {}
  }
  // 폴백: README에서 라이선스 섹션 찾기
  for (const name of ["README.md", "README"]) {
    try {
      const text = await readFile(join(packagePath, name), "utf-8");
      const match = text.match(/##?\s*Licen[cs]e[\s\S]*?(?=^##?\s|￿)/im);
      if (match) return match[0].trim();
    } catch {}
  }
  return null;
}

async function getLockfileHash(rootDir) {
  try {
    const lockfile = await readFile(join(rootDir, "pnpm-lock.yaml"), "utf-8");
    return createHash("md5").update(lockfile).digest("hex");
  } catch {
    return null;
  }
}

export async function buildLicenseInfo() {
  const rootDir = join(import.meta.dirname, "..");
  const outputDir = join(rootDir, "src", "renderer", "assets");
  await mkdir(outputDir, { recursive: true });
  const outputPath = join(outputDir, "licenses.json");

  const currentHash = await getLockfileHash(rootDir);
  if (currentHash) {
    try {
      const existing = JSON.parse(await readFile(outputPath, "utf-8"));
      if (existing._meta?.lockHash === currentHash) {
        console.log(blueBright("Licenses are up to date, skipping..."));
        return;
      }
      console.log(yellowBright("Lockfile changed, regenerating licenses..."));
    } catch {
      console.log(blueBright("Generating licenses..."));
    }
  }

  try {
    const { stdout } = await execPromise("pnpm licenses list --json", {
      cwd: rootDir,
    });
    const raw = JSON.parse(stdout);

    // 라이선스 타입별로 전문 1개만 읽어서 중복 제거
    const licenseTexts = {};
    const licensesByType = {};
    for (const [type, packages] of Object.entries(raw)) {
      const firstPkg = packages.find((p) => p.paths?.[0]);
      if (firstPkg) {
        const text = await readLicenseText(firstPkg.paths[0]);
        if (text) licenseTexts[type] = text;
      }
      // paths는 번들에 불필요하므로 제거
      licensesByType[type] = packages.map(({ paths, ...rest }) => rest);
    }

    const data = {
      _meta: { lockHash: currentHash },
      licenseTexts,
      licenses: licensesByType,
    };

    await writeFile(outputPath, JSON.stringify(data, null, 2), { flag: "w" });
    console.log(greenBright(`Licenses generated at ${outputPath}`));
  } catch (error) {
    console.error(redBright("Failed to generate licenses:"), error);
  }
}

// postinstall 등 직접 실행 시
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/license.js")) {
  buildLicenseInfo();
}
