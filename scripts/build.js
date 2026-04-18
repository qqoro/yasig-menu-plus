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

/**
 * Preload 스크립트를 CJS로 빌드
 *
 * tsc는 ESM(import)으로 출력하지만, 패키징 환경(특히 포터블)에서
 * ESM preload가 로드되지 않는 이슈가 있어 Vite로 CJS 번들링
 */
function buildPreload() {
  return build({
    configFile: false,
    build: {
      lib: {
        entry: join(import.meta.dirname, "..", "src", "main", "preload.ts"),
        formats: ["cjs"],
        fileName: () => "preload.js",
      },
      outDir: join(import.meta.dirname, "..", "build", "main"),
      emptyOutDir: false,
      minify: false,
      rollupOptions: {
        external: ["electron"],
      },
    },
  });
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
    const failed = results.some((result) => result.status === "rejected");
    if (failed) {
      console.error(redBright("Renderer or main transpilation failed."));
      process.exit(1);
    }

    // tsc가 출력한 ESM preload를 CJS로 덮어쓰기
    console.log(blueBright("Bundling preload (CJS)..."));
    await buildPreload();

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
