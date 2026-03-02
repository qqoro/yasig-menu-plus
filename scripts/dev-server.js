process.env.NODE_ENV = "development";

import chalk from "chalk";
import { spawn } from "child_process";
import { watch } from "chokidar";
import Electron from "electron";
import { cpSync } from "fs";
import { EOL } from "os";
import { join } from "path";
import { createServer } from "vite";
import { buildLicenseInfo } from "./license.js";
import compileTs from "./private/tsc.js";
const { blueBright, greenBright, redBright, white } = chalk;

let viteServer = null;
let electronProcess = null;
let electronProcessLocker = false;
let rendererPort = 0;

async function startRenderer() {
  viteServer = await createServer({
    configFile: join(import.meta.dirname, "..", "vite.config.js"),
    mode: "development",
  });

  return viteServer.listen();
}

async function startElectron() {
  if (electronProcess) {
    // single instance lock
    return;
  }

  try {
    await compileTs(join(import.meta.dirname, "..", "src", "main"));
  } catch {
    console.log(
      redBright(
        "Could not start Electron because of the above typescript error(s).",
      ),
    );
    electronProcessLocker = false;
    return;
  }

  const args = [
    join(import.meta.dirname, "..", "build", "main", "main.js"),
    rendererPort,
  ];
  electronProcess = spawn(Electron, args);
  electronProcessLocker = false;

  electronProcess.stdout.on("data", (data) => {
    if (data == EOL) {
      return;
    }

    process.stdout.write(blueBright(`[electron] `) + white(data.toString()));
  });

  electronProcess.stderr.on("data", (data) =>
    process.stderr.write(blueBright(`[electron] `) + white(data.toString())),
  );

  electronProcess.on("exit", () => stop());
}

function restartElectron() {
  if (electronProcess) {
    electronProcess.removeAllListeners("exit");
    electronProcess.kill();
    electronProcess = null;
  }

  if (!electronProcessLocker) {
    electronProcessLocker = true;
    startElectron();
  }
}

function copyStaticFiles() {
  copy("static");
}

/*
The working dir of Electron is build/main instead of src/main because of TS.
tsc does not copy static files, so copy them over manually for dev server.
*/
function copy(path) {
  cpSync(
    join(import.meta.dirname, "..", "src", "main", path),
    join(import.meta.dirname, "..", "build", "main", path),
    { recursive: true },
  );
}

function stop() {
  viteServer.close();
  process.exit();
}

async function start() {
  console.log(`${greenBright("============================================")}`);
  console.log(`${greenBright("== Starting Electron + Vite Dev Server... ==")}`);
  console.log(`${greenBright("============================================")}`);

  const devServer = await startRenderer();
  rendererPort = devServer.config.server.port;

  copyStaticFiles();
  await buildLicenseInfo();
  startElectron();

  const path = join(import.meta.dirname, "..", "src", "main");
  watch(path, {
    cwd: path,
  }).on("change", (path) => {
    console.log(
      blueBright(`[electron] `) + `Change in ${path}. reloading... 🚀`,
    );

    if (path.startsWith(join("static", "/"))) {
      copy(path);
    }

    restartElectron();
  });
}

start();
