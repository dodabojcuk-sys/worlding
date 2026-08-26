import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  getWorkspaceNoteGuard,
  getWorkspaceProjectSummary,
  readWorkspaceNote,
  rebuildWorkspaceIndex,
  updateWorkspaceNote,
  updateWorkspaceState
} from "../../src/storyWorkspace/index.mjs";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");
const selectedScene = "scenes/03-02-告知边界.md";
const tempRoots: string[] = [];

test("fixture truth projects exact workspace chapter scene thread and locked-rule context", () => {
  const rootPath = copyFixture();
  const sceneBefore = readFileSync(path.join(rootPath, selectedScene), "utf8");
  const stateBefore = readFileSync(path.join(rootPath, ".world-os", "state.json"), "utf8");
  const summary = getWorkspaceProjectSummary(rootPath);
  const guard = getWorkspaceNoteGuard(rootPath, selectedScene);

  assert.equal(summary.projectTitle, "雾中灯塔");
  assert.equal(summary.currentChapterTitle, "潜入灯塔");
  assert.equal(summary.currentSceneTitle, "告知边界");
  assert.equal(summary.unresolvedThreads.length, 1);
  assert.deepEqual(summary.unresolvedThreads, ["地下室秘密"]);
  assert.equal(summary.lockedRuleCount, 1);
  assert.deepEqual(summary.lockedRules, ["潮门开启规则"]);

  assert.deepEqual(guard.guard.characters, [
    "林远：守塔人，也是地下室秘密的第一发现者。",
    "阿岚：林远的伙伴，尚未知道地下室的核心真相。"
  ]);
  assert.deepEqual(guard.guard.locations, ["旧灯塔：只在海雾中显影的旧建筑。"]);
  assert.deepEqual(guard.guard.threads, ["地下室秘密：核心秘密尚未公开。"]);
  assert.deepEqual(guard.guard.rules, ["潮门开启规则：潮门不能被主动开启。"]);
  assert.equal(new Set(guard.guard.linkedNotes.map((note) => note.relativePath)).size, guard.guard.linkedNotes.length);
  assert.equal(readFileSync(path.join(rootPath, selectedScene), "utf8"), sceneBefore);
  assert.equal(readFileSync(path.join(rootPath, ".world-os", "state.json"), "utf8"), stateBefore);
});

test("index rebuild preserves workspace truth without copying prose into derived JSON", () => {
  const rootPath = copyFixture();
  const sceneBefore = readFileSync(path.join(rootPath, selectedScene), "utf8");
  const indexPath = path.join(rootPath, ".world-os", "index.json");

  unlinkSync(indexPath);
  rebuildWorkspaceIndex(rootPath);

  const summary = getWorkspaceProjectSummary(rootPath);
  const indexSource = readFileSync(indexPath, "utf8");
  const stateSource = readFileSync(path.join(rootPath, ".world-os", "state.json"), "utf8");
  assert.equal(summary.currentChapterTitle, "潜入灯塔");
  assert.equal(summary.currentSceneTitle, "告知边界");
  assert.equal(summary.unresolvedThreads.length, 1);
  assert.equal(summary.lockedRuleCount, 1);
  assert.doesNotMatch(indexSource, /林远没有把全部真相|核心秘密尚未公开|潮门不能被主动开启/);
  assert.doesNotMatch(stateSource, /林远没有把全部真相|核心秘密尚未公开|潮门不能被主动开启/);
  assert.equal(readFileSync(path.join(rootPath, selectedScene), "utf8"), sceneBefore);
});

test("stale workspace writes remain conflicts and never overwrite external Markdown", () => {
  const rootPath = copyFixture();
  const before = readWorkspaceNote(rootPath, selectedScene);
  const external = before.body.replace("林远没有把全部真相说出口", "外部编辑保留了秘密");
  const externalSource = readFileSync(path.join(rootPath, selectedScene), "utf8").replace(before.body, external);
  writeFileSync(path.join(rootPath, selectedScene), externalSource, "utf8");

  const result = updateWorkspaceNote(rootPath, {
    relativePath: selectedScene,
    expectedContentHash: before.contentHash,
    body: "# S2 · 告知边界\n\n浏览器中的旧正文。"
  });

  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.match(readFileSync(path.join(rootPath, selectedScene), "utf8"), /外部编辑保留了秘密/);
  assert.doesNotMatch(readFileSync(path.join(rootPath, selectedScene), "utf8"), /浏览器中的旧正文/);
});

function copyFixture(): string {
  const rootPath = mkdtempSync(path.join(tmpdir(), "world-os-story-workspace-truth-"));
  tempRoots.push(rootPath);
  cpSync(fixtureRoot, rootPath, { recursive: true });
  for (const directory of [
    "world/events",
    "planning",
    "reviews",
    "assets/images",
    "assets/references",
    ".world-os/cache",
    ".world-os/locks",
    ".world-os/runs"
  ]) {
    mkdirSync(path.join(rootPath, directory), { recursive: true });
  }
  rebuildWorkspaceIndex(rootPath);
  updateWorkspaceState(rootPath, {
    currentChapterPath: "chapters/03-潜入灯塔.md",
    currentScenePath: selectedScene
  });
  assert.equal(existsSync(path.join(rootPath, ".obsidian")), false);
  return rootPath;
}

test.after(() => {
  for (const entry of tempRoots) rmSync(entry, { recursive: true, force: true });
});
