import { spawnSync } from "child_process";
import fs from "fs/promises";
import { exit } from "process";
import { gte } from "semver";

const file = await fs.readFile("package.json");
const json = JSON.parse(file.toString());
const version = "v" + json.version;

const git = spawnSync("git", ["tag", "--list"]);
const tags = git.stdout
  .toString()
  .trim()
  .split("\n")
  .map((tag) => tag.trim());

if (!tags.every((tag) => gte(version, tag))) {
  console.log(
    "버전을 확인해주세요! package.json버전이 태그에 지정된 버전으로 업데이트되지 않았습니다.",
  );
  exit(1);
}
