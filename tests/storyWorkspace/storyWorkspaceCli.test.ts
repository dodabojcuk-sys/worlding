import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const CLI = path.join(process.cwd(), "bin", "world-os-story.mjs");

test("workspace CLI creates validates lists and rebuilds a Markdown workspace", () => {
  const rootPath = mkdtempSync(path.join(tmpdir(), "world-os-story-workspace-cli-"));

  const created = run("workspace", "create", "--path", rootPath, "--title", "雾中灯塔");
  assert.equal(created.command, "workspace create");
  assert.equal(created.data.project.title, "雾中灯塔");

  const note = run(
    "workspace", "note", "create",
    "--path", rootPath,
    "--type", "scene",
    "--id", "scene.cli",
    "--title", "命令行场景",
    "--body", "# 命令行场景\n\n作者手写内容。"
  );
  assert.equal(note.data.note.type, "scene");

  const opened = run("workspace", "open", "--path", rootPath);
  const status = run("workspace", "status", "--path", rootPath);
  const tree = run("workspace", "tree", "--path", rootPath);
  const valid = run("workspace", "validate", "--path", rootPath);
  assert.equal(opened.data.project.title, "雾中灯塔");
  assert.equal(status.data.summary.sceneCount, 1);
  assert.equal(tree.data.groups.scenes.length, 1);
  assert.equal(valid.data.valid, true);

  rmSync(path.join(rootPath, ".world-os", "index.json"));
  const reindexed = run("workspace", "reindex", "--path", rootPath);
  assert.equal(reindexed.data.entries.length, 2);
  assert.equal(existsSync(path.join(rootPath, ".world-os", "index.json")), true);
  assert.match(readFileSync(path.join(rootPath, "scenes", "命令行场景.md"), "utf8"), /作者手写内容/);
});

test("existing Story Control Surface commands remain available", () => {
  const stateFile = path.join(tmpdir(), "world-os-story-workspace-cli-control-state.json");
  const result = run("--state-file", stateFile, "home");

  assert.equal(result.action, "getProjectHome");
  rmSync(stateFile, { force: true });
});

function run(...args: string[]): Record<string, any> {
  return JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", CLI, ...args], {
    cwd: process.cwd(),
    encoding: "utf8"
  }));
}
