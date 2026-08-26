import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildNuwaAuthorChangePreview,
  buildNuwaAuthorReview,
  buildStorySnapshot,
  createNuwaPlan,
  createNuwaRunPack,
  importNuwaResultFile,
  readNuwaRunPack,
  runDeterministicNuwaPlan,
  runStoryIntelligenceBenchmark,
  synthesizeNuwaResults,
  writeNuwaPredictionBundle,
  writeNuwaResults,
  type NuwaAgentResult,
  type StoryIntelligenceBenchmarkCase
} from "../../src/storyIntelligence/index.ts";
import { rebuildWorkspaceIndex, updateWorkspaceState } from "../../src/storyWorkspace/index.mjs";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");
const casesPath = path.join(process.cwd(), "tests", "fixtures", "story-intelligence-v1", "cases.json");
const selectedScene = "scenes/03-02-告知边界.md";
const tempRoots: string[] = [];

test("Story Snapshot is deterministic Markdown metadata with no copied full prose", () => {
  const workspacePath = copyWorkspace();
  const scenePath = path.join(workspacePath, selectedScene);
  const markdownBefore = readFileSync(scenePath, "utf8");
  const stateBefore = readFileSync(path.join(workspacePath, ".world-os", "state.json"), "utf8");
  const first = buildStorySnapshot({ workspacePath });
  const second = buildStorySnapshot({ workspacePath });

  assert.deepEqual(first, second);
  assert.equal(first.project.title, "雾中灯塔");
  assert.equal(first.currentChapter?.title, "潜入灯塔");
  assert.equal(first.currentScene?.title, "告知边界");
  assert.deepEqual(first.openThreads.map((note) => note.title), ["地下室秘密"]);
  assert.deepEqual(first.lockedRules.map((note) => note.title), ["潮门开启规则"]);
  assert.equal(first.notes.some((note) => note.evidenceExcerpt.includes("## 世界约束")), false);
  assert.equal(first.notes.some((note) => note.evidenceExcerpt.includes("林远没有把全部真相说出口，只把旧地图推到阿岚面前。\n\n##")), false);
  assert.equal(readFileSync(scenePath, "utf8"), markdownBefore);
  assert.equal(readFileSync(path.join(workspacePath, ".world-os", "state.json"), "utf8"), stateBefore);
});

test("server-selected source identities extend only the bounded selection set", () => {
  const workspacePath = copyWorkspace();
  const base = buildStorySnapshot({ workspacePath });
  const source = base.notes.find((note) => note.type === "rule");
  assert.ok(source);
  const selected = buildStorySnapshot({ workspacePath, explicitNoteIds: [source.id, source.id] });

  assert.equal(selected.selectedNoteRefs.includes(source.relativePath), true);
  assert.equal(selected.selectedNoteRefs.filter((path) => path === source.relativePath).length, 1);
  assert.equal(selected.notes.find((note) => note.id === source.id)?.evidenceExcerpt.includes("##"), false);
  assert.throws(() => buildStorySnapshot({ workspacePath, explicitNoteIds: ["not a stable id"] }), /explicit source/i);
  assert.throws(() => buildStorySnapshot({ workspacePath, explicitNoteIds: ["event.missing"] }), /explicit source is unavailable/i);
});

test("Nuwa planner selects only relevant specialist roles and bounded no-write tasks", () => {
  const snapshot = buildStorySnapshot({ workspacePath: copyWorkspace() });
  const relationshipPlan = createNuwaPlan({
    snapshot,
    authorGoal: "让林远与阿岚的信任转为合作，但保留关系中的不确定性"
  });
  const mysteryPlan = createNuwaPlan({
    snapshot,
    authorGoal: "让地下室秘密出现新线索，但不要提前揭开悬念"
  });

  assert.deepEqual(relationshipPlan.selectedRoles, ["character-arc", "causality", "evidence-critic"]);
  assert.deepEqual(mysteryPlan.selectedRoles, ["continuity", "foreshadowing", "evidence-critic"]);
  for (const task of relationshipPlan.tasks) {
    assert.equal(task.writeScope, "none");
    assert.equal(task.noWrite, true);
    assert.equal(task.evidenceRequired, true);
    assert.equal(task.allowedNoteRefs.length > 0, true);
    assert.equal(task.allowedNoteRefs.length <= snapshot.notes.length, true);
    assert.deepEqual(task.forbiddenOperations, [
      "write-markdown",
      "write-workspace-state",
      "commit-story-change",
      "spawn-agent",
      "call-provider"
    ]);
  }
  const evidenceTask = relationshipPlan.tasks.find((task) => task.role === "evidence-critic");
  assert.ok(evidenceTask);
  for (const accepted of snapshot.recentAcceptedChanges) {
    assert.equal(evidenceTask.allowedNoteRefs.includes(accepted.relativePath), true, accepted.relativePath);
  }
});

test("deterministic Nuwa results and synthesis are stable, evidence-backed, and unselected", () => {
  const snapshot = buildStorySnapshot({ workspacePath: copyWorkspace() });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远向阿岚透露部分秘密，但保留地下室核心悬念" });
  const firstResults = runDeterministicNuwaPlan({ plan, snapshot });
  const secondResults = runDeterministicNuwaPlan({ plan, snapshot });
  const firstBundle = synthesizeNuwaResults({ plan, snapshot, results: firstResults });
  const secondBundle = synthesizeNuwaResults({ plan, snapshot, results: secondResults });

  assert.deepEqual(firstResults, secondResults);
  assert.deepEqual(firstBundle, secondBundle);
  assert.equal(firstBundle.runnerLabel, "本地规则推演");
  assert.equal(firstBundle.authorDecisionRequired, true);
  assert.equal(firstBundle.branches.length >= 1 && firstBundle.branches.length <= 5, true);
  assert.equal(new Set(firstBundle.branches.map((branch) => branch.strategy)).size, firstBundle.branches.length);
  assert.equal(firstBundle.branches.every((branch) => branch.evidence.length > 0), true);
  assert.equal(firstResults.every((result) => result.writeScope === "none"), true);
  assert.equal(firstResults.flatMap((result) => result.findings).filter((finding) => finding.support === "supported").every((finding) => finding.evidenceIds.length > 0), true);
});

test("distinct bounded goals produce variable deduplicated candidate counts", () => {
  const snapshot = buildStorySnapshot({ workspacePath: copyWorkspace() });
  const allowedRoles = ["causality", "tension", "evidence-critic"] as const;
  const goals = [
    "比较林远与阿岚的信任变化。",
    "比较这次选择在后续章节形成的长期压力。"
  ];
  const counts = goals.map((authorGoal) => {
    const plan = createNuwaPlan({ snapshot, authorGoal, allowedRoles: [...allowedRoles] });
    const results = runDeterministicNuwaPlan({ plan, snapshot });
    const bundle = synthesizeNuwaResults({ plan, snapshot, results });
    assert.equal(bundle.branches.length >= 1 && bundle.branches.length <= 5, true);
    assert.equal(new Set(bundle.branches.map((branch) => branch.strategy)).size, bundle.branches.length);
    return bundle.branches.length;
  });

  assert.deepEqual(counts, [1, 2]);
});

test("unsupported facts, stale results, duplicate branches, and disagreements stay explicit", () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远发现龙族血脉，并决定是否立即揭示地下室秘密" });
  const results = runDeterministicNuwaPlan({ plan, snapshot });
  const contradictory = structuredClone(results);
  contradictory[0].findings.push({
    id: `${contradictory[0].taskId}-claim-a`,
    category: "continuity",
    summary: "Delay the reveal.",
    affectedNoteRefs: contradictory[0].evidence.slice(0, 1).map((item) => item.relativePath),
    evidenceIds: contradictory[0].evidence.slice(0, 1).map((item) => item.evidenceId),
    support: "supported",
    claim: { key: "reveal-timing", value: "delayed" }
  });
  contradictory[1].findings.push({
    id: `${contradictory[1].taskId}-claim-b`,
    category: "character",
    summary: "Reveal a clue now.",
    affectedNoteRefs: contradictory[1].evidence.slice(0, 1).map((item) => item.relativePath),
    evidenceIds: contradictory[1].evidence.slice(0, 1).map((item) => item.evidenceId),
    support: "supported",
    claim: { key: "reveal-timing", value: "immediate" }
  });
  contradictory[0].proposedBranches.push({ ...contradictory[0].proposedBranches[0], id: "duplicate-branch" });
  const bundle = synthesizeNuwaResults({ plan, snapshot, results: contradictory });

  assert.equal(bundle.unsupportedAssumptions.some((item) => item.includes("龙族")), true);
  assert.equal(bundle.disagreements.some((item) => item.claimKey === "reveal-timing"), true);
  assert.equal(bundle.branches.length >= 1 && bundle.branches.length <= 5, true);
  assert.equal(new Set(bundle.branches.map((branch) => branch.strategy)).size, bundle.branches.length);

  const stale = structuredClone(results);
  stale[0].snapshotHash = "stale-snapshot";
  assert.throws(() => synthesizeNuwaResults({ plan, snapshot, results: stale }), /stale/i);
});

test("Nuwa run pack uses the existing workspace runs directory and external task Markdown", () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远保留地下室核心悬念" });
  const record = createNuwaRunPack({ workspacePath, plan, snapshot });
  const runPath = path.join(workspacePath, ".world-os", "runs", "nuwa", plan.runId);
  const markdownBefore = markdownTree(workspacePath);
  const results = runDeterministicNuwaPlan({ plan, snapshot });
  writeNuwaResults({ workspacePath, runId: plan.runId, results });
  const bundle = synthesizeNuwaResults({ plan, snapshot, results });
  writeNuwaPredictionBundle({ workspacePath, runId: plan.runId, bundle });
  const loaded = readNuwaRunPack(workspacePath, plan.runId);

  assert.equal(record.status, "planned");
  assert.equal(existsSync(path.join(runPath, "run.json")), true);
  assert.equal(existsSync(path.join(runPath, "snapshot.json")), true);
  assert.equal(readFileSync(path.join(workspacePath, ".world-os", "runs", "nuwa", "latest.json"), "utf8").includes(plan.runId), true);
  assert.equal(existsSync(path.join(runPath, "tasks", "continuity.md")), plan.selectedRoles.includes("continuity"));
  assert.match(readFileSync(path.join(runPath, "tasks", `${plan.tasks[0].role}.md`), "utf8"), /write_scope: none/);
  assert.equal(loaded.results.length, plan.tasks.length);
  assert.deepEqual(loaded.bundle, bundle);
  assert.deepEqual(markdownTree(workspacePath), markdownBefore);
  assert.equal(readFileSync(path.join(workspacePath, ".world-os", "state.json"), "utf8").includes(plan.runId), false);

  const externalPath = path.join(runPath, "backend", "imports", "external-result.json");
  writeFileSync(externalPath, JSON.stringify(results[0]), "utf8");
  const imported = importNuwaResultFile({ workspacePath, runId: plan.runId, filePath: externalPath });
  assert.equal(imported.resultTaskIds.includes(results[0].taskId), true);
});

test("Nuwa author review reuses Decision Workspace and Change Preview without mutating Markdown", () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远向阿岚透露部分秘密，但保留地下室核心悬念" });
  const results = runDeterministicNuwaPlan({ plan, snapshot });
  const bundle = synthesizeNuwaResults({ plan, snapshot, results });
  const markdownBefore = markdownTree(workspacePath);
  const branch = bundle.branches.find((candidate) => candidate.strategy === "partial-clue") ?? bundle.branches[0];
  const review = buildNuwaAuthorReview({ snapshot, bundle, branchId: branch.id });
  const decisionWorkspace = review.decisionWorkspace as { version: string; options: Array<{ id: string }> };
  const preview = buildNuwaAuthorChangePreview({
    snapshot,
    bundle,
    branchId: branch.id,
    decisionOptionId: decisionWorkspace.options[1].id,
    authorNotes: ["作者只请求预览。"]
  });

  assert.equal(review.status, "awaiting-author-decision");
  assert.equal(review.authorDecisionRequired, true);
  assert.equal(review.mutatesMarkdown, false);
  assert.equal(decisionWorkspace.version, "world-os-story-decision-workspace-v1");
  assert.equal(preview.version, "world-os-story-change-preview-v1");
  assert.equal(preview.mutatesWorld, false);
  assert.deepEqual(markdownTree(workspacePath), markdownBefore);
});

test("Story Intelligence benchmark records ten deterministic baseline cases without claiming model quality", () => {
  const workspacePath = copyWorkspace();
  const cases = JSON.parse(readFileSync(casesPath, "utf8")) as StoryIntelligenceBenchmarkCase[];
  const outputPath = path.join(process.cwd(), "output", "story-intelligence-benchmark-v1", "benchmark.json");
  const benchmark = runStoryIntelligenceBenchmark({ workspacePath, cases, outputPath });

  assert.equal(benchmark.cases.length, 10);
  assert.equal(benchmark.cases.every((item) => item.passed), true);
  assert.equal(benchmark.aggregate.authorDecisionBoundary, true);
  assert.deepEqual(benchmark.limitations, ["deterministic-baseline-only", "not-model-quality-evidence"]);
  assert.equal(existsSync(outputPath), true);
});

test("Story Intelligence source remains provider-neutral, no-write, non-recursive, and outside runtime systems", () => {
  const source = readSourceTree(path.join(process.cwd(), "src", "storyIntelligence"));
  for (const forbidden of [
    "openai",
    "anthropic",
    "gemini",
    "fetch(",
    "XMLHttpRequest",
    "WebSocket",
    "Date.now",
    "Math.random",
    "gateway",
    "ExecutionGateway",
    "processIntent",
    "commitStoryEvent",
    "chainOfThought",
    "reasoningTrace"
  ]) {
    assert.equal(source.includes(forbidden), false, `forbidden Story Intelligence term: ${forbidden}`);
  }
  assert.equal(source.includes("spawn-agent"), true);
  assert.equal(source.includes("write-markdown"), true);
  assert.equal(source.includes("write-workspace-state"), true);
});

function copyWorkspace(): string {
  const workspacePath = mkdtempSync(path.join(tmpdir(), "world-os-story-intelligence-"));
  tempRoots.push(workspacePath);
  cpSync(fixtureRoot, workspacePath, { recursive: true });
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
    mkdirSync(path.join(workspacePath, directory), { recursive: true });
  }
  rebuildWorkspaceIndex(workspacePath);
  updateWorkspaceState(workspacePath, {
    currentChapterPath: "chapters/03-潜入灯塔.md",
    currentScenePath: selectedScene
  });
  return workspacePath;
}

function markdownTree(workspacePath: string): Record<string, string> {
  const files = listFiles(workspacePath).filter((entry) => entry.endsWith(".md"));
  return Object.fromEntries(files.map((filePath) => [path.relative(workspacePath, filePath), readFileSync(filePath, "utf8")]));
}

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    if (entryPath.includes(`${path.sep}.world-os${path.sep}`)) return [];
    return statSync(entryPath).isDirectory() ? listFiles(entryPath) : [entryPath];
  });
}

function readSourceTree(directory: string): string {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? [readSourceTree(path.join(directory, entry.name))] : [readFileSync(path.join(directory, entry.name), "utf8")])
    .join("\n");
}

test.after(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});
