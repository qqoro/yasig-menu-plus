import chalk from "chalk";
import { rmSync } from "fs";
import { join } from "path";
import { build } from "vite";
import { buildLicenseInfo } from "./license.js";
import compileTs from "./private/tsc.js";
const { blueBright, greenBright, redBright } = chalk;

function buildRenderer() {
  return build({
    configFile: join(import.meta.dirname, "..", "vite.config.js"),
    base: "./",
    mode: "production",
  });
}

function buildMain() {
  const mainPath = join(import.meta.dirname, "..", "src", "main");
  return compileTs(mainPath);
}

// 빌드 폴더 정리
console.log(blueBright("Cleaning build directories..."));
rmSync(join(import.meta.dirname, "..", "build"), {
  recursive: true,
  force: true,
});
// dist 폴더도 정리 (electron-builder 출력물)
rmSync(join(import.meta.dirname, "..", "dist"), {
  recursive: true,
  force: true,
});

console.log(blueBright("Transpiling renderer & main..."));

buildLicenseInfo()
  .then(() => Promise.allSettled([buildRenderer(), buildMain()]))
  .then(async (results) => {
    // Make this async to use await
    const failed = results.some((result) => result.status === "rejected");
    if (failed) {
      console.error(redBright("Renderer or main transpilation failed."));
      process.exit(1); // Exit if build failed
    }

    console.log(
      greenBright(
        "Renderer & main successfully transpiled! (ready to be built with electron-builder)",
      ),
    );
  })
  .catch((error) => {
    console.error(
      redBright("An unexpected error occurred during build:"),
      error,
    );
    process.exit(1);
  });
