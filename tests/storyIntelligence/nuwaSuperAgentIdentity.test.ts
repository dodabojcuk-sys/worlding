import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  NUWA_ORCHESTRATION_IDENTITY,
  buildNuwaAuthorReview,
  buildStorySnapshot,
  createNuwaPlan,
  createNuwaRunPack,
  importNuwaResultFile,
  readNuwaRunPack,
  runDeterministicNuwaPlan,
  synthesizeNuwaResults,
  writeNuwaResults
} from "../../src/storyIntelligence/index.ts";
import { rebuildWorkspaceIndex, updateWorkspaceState } from "../../src/storyWorkspace/index.mjs";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");
const tempRoots: string[] = [];

test("Nuwa has one supervisory identity and only delegates bounded specialist tasks", () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({
    snapshot,
    authorGoal: "让林远向阿岚透露部分地下室线索，但保留核心秘密未公开。"
  });

  assert.deepEqual(NUWA_ORCHESTRATION_IDENTITY, {
    kind: "supervisor-agent",
    name: "nuwa",
    authorDecisionRequired: true
  });
  assert.equal(plan.tasks.length, plan.selectedRoles.length);
  assert.equal(new Set(plan.selectedRoles).size, plan.selectedRoles.length);
  assert.equal(plan.authorConfirmationRequired, true);
  assert.equal(plan.tasks.every((task) => task.allowedNoteRefs.length > 0), true);
  assert.equal(plan.tasks.every((task) => task.writeScope === "none" && task.noWrite), true);
  assert.equal(plan.tasks.every((task) => task.forbiddenOperations.includes("spawn-agent")), true);
  assert.equal(plan.tasks.every((task) => task.forbiddenOperations.includes("write-markdown")), true);
  assert.equal(plan.tasks.every((task) => task.forbiddenOperations.includes("commit-story-change")), true);
});

test("specialist results return through Nuwa synthesis as multiple unselected candidate futures", () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({
    snapshot,
    authorGoal: "让林远向阿岚透露部分地下室线索，但保留核心秘密未公开。"
  });
  const markdownBefore = markdownTree(workspacePath);
  const firstResults = runDeterministicNuwaPlan({ plan, snapshot });
  const secondResults = runDeterministicNuwaPlan({ plan, snapshot });
  const bundle = synthesizeNuwaResults({ plan, snapshot, results: firstResults });

  assert.deepEqual(firstResults, secondResults);
  assert.equal(firstResults.every((result) => result.runId === plan.runId), true);
  assert.equal(firstResults.every((result) => plan.tasks.some((task) => task.taskId === result.taskId && task.role === result.role)), true);
  assert.equal(firstResults.every((result) => result.writeScope === "none"), true);
  assert.equal(bundle.branches.length >= 1 && bundle.branches.length <= 5, true);
  assert.equal(new Set(bundle.branches.map((branch) => branch.strategy)).size, bundle.branches.length);
  assert.equal(bundle.authorDecisionRequired, true);
  assert.equal(Object.hasOwn(bundle, "selectedBranch"), false);
  assert.deepEqual(markdownTree(workspacePath), markdownBefore);
});

test("unsupported assumptions and specialist disagreement remain visible to the author", () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({
    snapshot,
    authorGoal: "让林远发现龙族血脉，并决定是否立即揭示地下室秘密。"
  });
  const results = runDeterministicNuwaPlan({ plan, snapshot });
  const contradictory = structuredClone(results);
  const firstEvidence = contradictory[0].evidence[0];
  const secondEvidence = contradictory[1].evidence[0];

  contradictory[0].findings.push({
    id: `${contradictory[0].taskId}-delay`,
    category: "continuity",
    summary: "Delay the reveal.",
    affectedNoteRefs: [firstEvidence.relativePath],
    evidenceIds: [firstEvidence.evidenceId],
    support: "supported",
    claim: { key: "reveal-timing", value: "delayed" }
  });
  contradictory[1].findings.push({
    id: `${contradictory[1].taskId}-immediate`,
    category: "character",
    summary: "Reveal a clue now.",
    affectedNoteRefs: [secondEvidence.relativePath],
    evidenceIds: [secondEvidence.evidenceId],
    support: "supported",
    claim: { key: "reveal-timing", value: "immediate" }
  });

  const bundle = synthesizeNuwaResults({ plan, snapshot, results: contradictory });
  assert.equal(bundle.unsupportedAssumptions.some((item) => item.includes("龙族")), true);
  assert.equal(bundle.disagreements.some((item) => item.claimKey === "reveal-timing"), true);
  assert.equal(bundle.disagreements.every((item) => item.resolution === "author-review-required"), true);
});

test("external specialist results cannot bypass Nuwa synthesis or author confirmation", () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远延后公开地下室线索。" });
  createNuwaRunPack({ workspacePath, plan, snapshot });
  const result = runDeterministicNuwaPlan({ plan, snapshot })[0];
  const externalResultPath = path.join(workspacePath, ".world-os", "runs", "nuwa", plan.runId, "backend", "imports", "external-specialist-result.json");
  writeFileSync(externalResultPath, JSON.stringify(result), "utf8");
  const imported = importNuwaResultFile({ workspacePath, runId: plan.runId, filePath: externalResultPath });
  const loadedBeforeSynthesis = readNuwaRunPack(workspacePath, plan.runId);

  assert.equal(imported.status, "awaiting-results");
  assert.equal(loadedBeforeSynthesis.bundle, null);
  const blockedReview = spawnSync(process.execPath, [
    "--experimental-strip-types",
    "bin/world-os-story.mjs",
    "nuwa",
    "author-review",
    "--workspace",
    workspacePath,
    "--run",
    plan.runId,
    "--branch",
    "prediction-partial-clue-example"
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.notEqual(blockedReview.status, 0);
  assert.match(blockedReview.stderr, /requires a synthesized prediction bundle/);

  const completeResults = runDeterministicNuwaPlan({ plan, snapshot });
  writeNuwaResults({ workspacePath, runId: plan.runId, results: completeResults });
  const bundle = synthesizeNuwaResults({ plan, snapshot, results: completeResults });
  const review = buildNuwaAuthorReview({ snapshot, bundle, branchId: bundle.branches[0].id });

  assert.equal(review.authorDecisionRequired, true);
  assert.equal(review.mutatesMarkdown, false);
  assert.equal(review.changePreview, null);
});

test("Story Intelligence retains one planner, one runner, and one synthesis path", () => {
  const sourceRoot = path.join(process.cwd(), "src", "storyIntelligence");
  const moduleNames = readdirSync(sourceRoot).filter((entry) => entry.endsWith(".ts")).sort();
  const source = moduleNames.map((entry) => readFileSync(path.join(sourceRoot, entry), "utf8")).join("\n");

  assert.equal(moduleNames.some((entry) => /orchestrator|supervisor|director/i.test(entry)), false);
  assert.match(readFileSync(path.join(sourceRoot, "nuwaPlanner.ts"), "utf8"), /createNuwaPlan/);
  assert.match(readFileSync(path.join(sourceRoot, "nuwaRunner.ts"), "utf8"), /runDeterministicNuwaPlan/);
  assert.match(readFileSync(path.join(sourceRoot, "nuwaSynthesis.ts"), "utf8"), /synthesizeNuwaResults/);
  assert.equal(source.includes("commitStoryEvent"), false);
  assert.equal(source.includes("spawn-agent"), true);
});

test.after(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

function copyWorkspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), "world-os-nuwa-supervisor-"));
  const workspacePath = path.join(root, "mist-lighthouse");
  cpSync(fixtureRoot, workspacePath, { recursive: true });
  for (const directory of ["world/events", "planning", "reviews", "assets/images", "assets/references", ".world-os/cache", ".world-os/locks", ".world-os/runs"]) {
    mkdirSync(path.join(workspacePath, directory), { recursive: true });
  }
  rebuildWorkspaceIndex(workspacePath);
  updateWorkspaceState(workspacePath, {
    currentChapterPath: "chapters/03-潜入灯塔.md",
    currentScenePath: "scenes/03-02-告知边界.md",
    activeSurface: "writing"
  });
  tempRoots.push(root);
  return workspacePath;
}

function markdownTree(workspacePath: string): Array<{ relativePath: string; content: string }> {
  const files: string[] = [];
  visit(workspacePath);
  return files.sort().map((relativePath) => ({
    relativePath,
    content: readFileSync(path.join(workspacePath, relativePath), "utf8")
  }));

  function visit(directory: string): void {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".world-os" || entry.name === ".DS_Store") continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      if (entry.isFile() && entry.name.endsWith(".md")) files.push(path.relative(workspacePath, absolute));
    }
  }
}
