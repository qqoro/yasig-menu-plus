import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";

const state = vi.hoisted(() => ({
  userData: "",
  handle: vi.fn(),
  launch: vi.fn(),
}));
vi.mock("electron", () => ({
  app: { isPackaged: true, getPath: () => state.userData },
  ipcMain: { handle: state.handle },
}));
vi.mock("../handlers/home-game-control.js", () => ({
  assertNotRunning: () => {},
  executeGameLaunch: state.launch,
}));
vi.mock("../utils/logger.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));
import { cheatInjector } from "./cheat-injector.js";
import { registerCheatHandlers } from "../handlers/cheat.js";
import { IpcRendererSend } from "../events.js";

let root: string;
let game: string;
const resourcesDescriptor = Object.getOwnPropertyDescriptor(
  process,
  "resourcesPath",
);
const originals = {
  mv: "// custom startup\r\nPluginManager.setup($plugins);\r\nwindow.onload = function () { customBoot(); };\r\n",
  mz: '// custom startup\nconst scriptUrls = [\n  "js/libs/pixi.js",\n  "js/custom.js",\n];\ncustomBoot();\n',
};

async function fixture(engine: "mv" | "mz", content = originals[engine]) {
  const gameRoot = engine === "mv" ? join(game, "www") : game;
  await mkdir(join(gameRoot, "js"), { recursive: true });
  await writeFile(
    join(gameRoot, "js", engine === "mv" ? "rpg_core.js" : "rmmz_core.js"),
    "",
  );
  const main = join(gameRoot, "js/main.js");
  await writeFile(main, content);
  return { gameRoot, main, detection: await cheatInjector.detect(game) };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ymp-cheat-"));
  game = join(root, "game");
  state.userData = join(root, "user-data");
  await mkdir(state.userData);
  await cp(resolve("src/main/cheat"), join(root, "resources/cheat"), {
    recursive: true,
  });
  Object.defineProperty(process, "resourcesPath", {
    configurable: true,
    value: join(root, "resources"),
  });
});

afterEach(async () => {
  if (resourcesDescriptor)
    Object.defineProperty(process, "resourcesPath", resourcesDescriptor);
  else Reflect.deleteProperty(process, "resourcesPath");
  await rm(root, { recursive: true, force: true });
});

describe("치트 플러그인 v2 주입과 복원", () => {
  for (const engine of ["mv", "mz"] as const) {
    it(`${engine}: 게임 시작 코드를 보존하고 공식 로더를 연결한 뒤 정확히 복원`, async () => {
      const { gameRoot, main, detection } = await fixture(engine);
      await cheatInjector.inject(game, detection);
      const patched = await readFile(main, "utf8");
      const events: string[] = [];
      const context = {
        window: {},
        $plugins: [],
        customBoot: () => events.push("boot"),
        PluginManager: {
          setup: () => events.push("setup"),
          loadScript: (url: string) => events.push(url),
        },
      };
      expect(patched).toContain("customBoot()");
      expect(patched).toContain("cheat/init/import.js");
      if (engine === "mz") {
        expect(runInNewContext(patched + "\nscriptUrls", context)).toEqual([
          "cheat/init/import.js",
          "js/libs/pixi.js",
          "js/custom.js",
        ]);
        expect(events).toEqual(["boot"]);
        expect(patched).toContain('"js/custom.js"');
        expect(patched.indexOf('"cheat/init/import.js"')).toBeLessThan(
          patched.indexOf('"js/libs/pixi.js"'),
        );
      } else {
        runInNewContext(patched, context);
        expect(events).toEqual(["setup", "../../cheat/init/import.js"]);
        expect(patched.indexOf("PluginManager.setup($plugins);")).toBeLessThan(
          patched.indexOf("PluginManager.loadScript"),
        );
        expect(patched).not.toMatch(/(?<!\r)\n/);
      }
      expect(
        JSON.parse(
          await readFile(
            join(gameRoot, "cheat-version-description.json"),
            "utf8",
          ),
        ).version,
      ).toBe("v2.1.1");
      await access(join(gameRoot, "cheat/cheat.js"));
      expect(await cheatInjector.restore(game)).toBe(true);
      expect(await readFile(main, "utf8")).toBe(originals[engine]);
      await expect(access(join(gameRoot, "cheat"))).rejects.toThrow();
      await expect(
        access(join(gameRoot, "cheat-version-description.json")),
      ).rejects.toThrow();
      await expect(access(main + ".cheat-backup")).rejects.toThrow();
    });

    it(`${engine}: 알 수 없는 시작 파일은 변경 없이 거부`, async () => {
      const { main, gameRoot, detection } = await fixture(
        engine,
        "customBoot();\n",
      );
      await expect(cheatInjector.inject(game, detection)).rejects.toThrow();
      expect(await readFile(main, "utf8")).toBe("customBoot();\n");
      await expect(access(main + ".cheat-backup")).rejects.toThrow();
      await expect(access(join(gameRoot, "cheat"))).rejects.toThrow();
    });
  }

  it("기존 치트 파일과 버전 파일을 복원하고 설정은 유지", async () => {
    const { gameRoot, detection } = await fixture("mv");
    await mkdir(join(gameRoot, "cheat"));
    await writeFile(join(gameRoot, "cheat/custom.js"), "user cheat");
    await writeFile(
      join(gameRoot, "cheat-version-description.json"),
      "old version",
    );
    await mkdir(join(gameRoot, "cheat-settings"));
    await writeFile(
      join(gameRoot, "cheat-settings/kv-storage.json"),
      "user settings",
    );
    await cheatInjector.inject(game, detection);
    await writeFile(
      join(gameRoot, "cheat-settings/kv-storage.json"),
      "updated settings",
    );
    await cheatInjector.restoreAllPending();
    expect(await readFile(join(gameRoot, "cheat/custom.js"), "utf8")).toBe(
      "user cheat",
    );
    expect(
      await readFile(join(gameRoot, "cheat-version-description.json"), "utf8"),
    ).toBe("old version");
    expect(
      await readFile(join(gameRoot, "cheat-settings/kv-storage.json"), "utf8"),
    ).toBe("updated settings");
    await expect(access(join(gameRoot, "cheat/cheat.js"))).rejects.toThrow();
  });

  it("파일 복사 중 실패하면 원본과 기존 치트 파일 복원", async () => {
    const { main, gameRoot, detection } = await fixture("mv");
    await mkdir(join(gameRoot, "cheat"));
    await writeFile(join(gameRoot, "cheat/custom.js"), "original");
    await rm(join(root, "resources/cheat/mv/cheat-version-description.json"));
    await expect(cheatInjector.inject(game, detection)).rejects.toThrow();
    expect(await readFile(main, "utf8")).toBe(originals.mv);
    expect(await readFile(join(gameRoot, "cheat/custom.js"), "utf8")).toBe(
      "original",
    );
    await expect(access(join(gameRoot, "cheat/cheat.js"))).rejects.toThrow();
  });

  it("연속 주입 후에도 로더 중복 없이 최초 원본으로 복원", async () => {
    const { main, detection } = await fixture("mz");
    await cheatInjector.inject(game, detection);
    await cheatInjector.inject(game, detection);
    expect(
      (await readFile(main, "utf8")).match(/cheat\/init\/import.js/g),
    ).toHaveLength(1);
    await cheatInjector.restoreAllPending();
    expect(await readFile(main, "utf8")).toBe(originals.mz);
  });

  it("v1 복원 기록도 읽어 복원", async () => {
    const { main, gameRoot } = await fixture("mv", "old injected code");
    await writeFile(main + ".cheat-backup", originals.mv);
    await mkdir(join(gameRoot, "cheat"));
    await writeFile(
      join(state.userData, "cheat-injections.json"),
      JSON.stringify([
        {
          gamePath: game,
          version: "mv",
          mainJsPath: main,
          mainJsBackupPath: main + ".cheat-backup",
          injectedDirs: [join(gameRoot, "cheat")],
          timestamp: new Date().toISOString(),
        },
      ]),
    );
    await cheatInjector.restoreAllPending();
    expect(await readFile(main, "utf8")).toBe(originals.mv);
  });

  it("기존 백업이 있으면 덮어쓰지 않고 주입 거부", async () => {
    const { main, gameRoot, detection } = await fixture("mv");
    await mkdir(join(gameRoot, "cheat.cheat-backup"));
    await writeFile(join(gameRoot, "cheat.cheat-backup/user.js"), "keep");
    await expect(cheatInjector.inject(game, detection)).rejects.toThrow();
    expect(await readFile(main, "utf8")).toBe(originals.mv);
    expect(
      await readFile(join(gameRoot, "cheat.cheat-backup/user.js"), "utf8"),
    ).toBe("keep");
  });

  it("치트 주입 후 게임 실행 실패 시 즉시 원본과 번들 복원", async () => {
    const { main, gameRoot } = await fixture("mv");
    state.launch.mockRejectedValueOnce(new Error("게임 실행 실패"));
    registerCheatHandlers();
    const handler = state.handle.mock.calls.find(
      ([channel]) => channel === IpcRendererSend.PlayGameWithCheat,
    )![1];
    await expect(handler({}, { path: game })).rejects.toThrow("게임 실행 실패");
    expect(await readFile(main, "utf8")).toBe(originals.mv);
    await expect(access(join(gameRoot, "cheat"))).rejects.toThrow();
    expect(
      JSON.parse(
        await readFile(join(state.userData, "cheat-injections.json"), "utf8"),
      ),
    ).toEqual([]);
  });

  it("이미 설치된 MV 로더와 원본 BOM을 중복 및 손상 없이 보존", async () => {
    const original =
      "\uFEFF" +
      originals.mv.replace(
        "PluginManager.setup($plugins);",
        'PluginManager.setup($plugins);\r\nPluginManager.loadScript("../../cheat/init/import.js");',
      );
    const { main, detection } = await fixture("mv", original);
    await cheatInjector.inject(game, detection);
    expect(await readFile(main, "utf8")).toBe(original);
    await cheatInjector.restore(game);
    expect(await readFile(main)).toEqual(Buffer.from(original));
  });
});
