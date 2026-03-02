import chalk from "chalk";
import { exec } from "child_process";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import { promisify } from "util";
const { blueBright, greenBright, yellowBright, redBright } = chalk;

const execPromise = promisify(exec);

export async function buildLicenseInfo() {
  const licensesOutputDirectory = join(
    import.meta.dirname,
    "..",
    "src",
    "renderer",
    "assets",
  );
  await mkdir(licensesOutputDirectory, { recursive: true }); // Ensure directory exists
  const licensesOutputPath = join(licensesOutputDirectory, "licenses.json");
  const packageJsonPath = join(import.meta.dirname, "..", "package.json");

  // licenses.json과 package.json의 수정 시간 비교
  try {
    const licensesStats = await stat(licensesOutputPath);
    const packageStats = await stat(packageJsonPath);

    // licenses.json이 package.json보다 최근에 수정되었으면 건너뛰기
    if (licensesStats.mtime >= packageStats.mtime) {
      console.log(
        blueBright("Licenses are up to date, skipping generation..."),
      );
      return;
    }
    console.log(
      yellowBright("package.json has been modified, regenerating licenses..."),
    );
  } catch {
    // 파일이 없거나 오류 발생 시 생성
    console.log(blueBright("Generating licenses for the first time..."));
  }

  // --- Generate Open Source Licenses ---

  try {
    const { stdout } = await execPromise(
      "pnpm license-checker-rseidelsohn --excludePackages ';yasig-menu-plus;' --json ",
    );
    const rawLicenses = JSON.parse(stdout);
    const processedLicenses = {};

    for (const key in rawLicenses) {
      if (rawLicenses.hasOwnProperty(key)) {
        const licenseData = rawLicenses[key];
        let licenseText = "";

        if (licenseData.licenseFile) {
          try {
            licenseText = await readFile(licenseData.licenseFile, "utf-8");
          } catch (fileError) {
            console.warn(
              yellowBright(
                `Could not read license file for ${key}: ${fileError.message}`,
              ),
            );
          }
        }
        const lastAtIndex = key.lastIndexOf("@");
        let name = key;
        let version = "";

        if (lastAtIndex > 0) {
          // Ensure it's not the first character (for @scope)
          name = key.substring(0, lastAtIndex);
          version = key.substring(lastAtIndex + 1);
        }

        processedLicenses[key] = { ...licenseData, name, version, licenseText };
      }
    }

    await writeFile(
      licensesOutputPath,
      JSON.stringify(processedLicenses, null, 2),
      { flag: "w" },
    );
    console.log(
      greenBright(`Open source licenses generated at ${licensesOutputPath}`),
    );
  } catch (error) {
    console.error(redBright("Failed to generate open source licenses:"), error);
  }
}
