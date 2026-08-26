import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import type { MemoryEntry, MemorySkillAdapter } from "../../src/memorySkills/memorySkillContract.ts";
import { createDefaultSkillBudget } from "../../src/skillControl/skillBudget.ts";
import {
  buildStorySnapshot,
  createNuwaExecutionBackend,
  createNuwaPlan,
  createNuwaRunPack,
  executeNuwaPlanWithBackend,
  readNuwaBackendManifest,
  readNuwaRunPack,
  synthesizeNuwaResults,
  writeNuwaExecutionOutcome
} from "../../src/storyIntelligence/index.ts";

const fixtureRoot = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");
const roots: string[] = [];

test("only evidence-critic executes approved recall and existing Nuwa validation accepts canonical references", async () => {
  const workspacePath = copyWorkspace();
  const markdownBefore = readCanonicalMarkdown(workspacePath);
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "让林远透露部分地下室线索，但保留核心秘密" });
  assert.deepEqual(plan.tasks.filter((task) => task.capabilityRequirements.length > 0).map((task) => task.role), ["evidence-critic"]);
  createNuwaRunPack({ workspacePath, plan, snapshot });

  const outcome = await executeNuwaPlanWithBackend({ plan, snapshot, backend: createNuwaExecutionBackend() });
  const evidenceExecution = outcome.executions.find((item) => item.role === "evidence-critic")!;
  assert.equal(outcome.executions.filter((item) => item.capability).length, 1);
  assert.equal(evidenceExecution.capability?.status, "completed");
  assert.equal((evidenceExecution.capability?.acceptedEvidenceIds.length ?? 0) > 0, true);
  assert.equal(evidenceExecution.result?.evidence.every((reference) => evidenceExecution.capability?.acceptedEvidenceIds.includes(reference.evidenceId)), true);
  assert.equal(outcome.executions.filter((item) => item.role !== "evidence-critic").every((item) => item.capability === undefined), true);

  writeNuwaExecutionOutcome({ workspacePath, runId: plan.runId, outcome });
  const manifest = readNuwaBackendManifest(workspacePath, plan.runId);
  const accepted = manifest.executions.find((item) => item.role === "evidence-critic")!;
  assert.equal(accepted.status, "accepted-by-nuwa");
  assert.equal(accepted.capability?.status, "completed");
  const loaded = readNuwaRunPack(workspacePath, plan.runId);
  const bundle = synthesizeNuwaResults({ plan, snapshot, results: loaded.results });
  assert.equal(bundle.authorDecisionRequired, true);
  assert.equal(bundle.branches.length >= 1, true);
  assert.deepEqual(readCanonicalMarkdown(workspacePath), markdownBefore);
  assert.equal(pathExists(path.join(workspacePath, ".world-os", "state.json")), false);
});

test("disabled policy and budget states remain explicit reduced coverage with no silent fallback", async () => {
  const cases = [
    { expected: "disabled", options: { toggles: [] } },
    {
      expected: "budget-blocked",
      options: { budget: blockedBudget() }
    }
  ] as const;
  for (const item of cases) {
    const workspacePath = copyWorkspace();
    const snapshot = buildStorySnapshot({ workspacePath });
    const plan = createNuwaPlan({ snapshot, authorGoal: "检查地下室秘密的证据" });
    const outcome = await executeNuwaPlanWithBackend({
      plan,
      snapshot,
      backend: createNuwaExecutionBackend({ storyMemoryRecall: item.options })
    });
    const execution = outcome.executions.find((candidate) => candidate.role === "evidence-critic")!;
    assert.equal(execution.status, "result-produced");
    assert.equal(execution.capability?.status, item.expected);
    assert.equal(execution.capability?.reducedCoverage, true);
    assert.equal(execution.capability?.acceptedEvidenceIds.length, 0);
    assert.equal(execution.capability?.product.copy.includes("资料召回"), true);
  }
});

test("invalid recalled references are rejected before existing Nuwa evidence validation and synthesis", async () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "检查地下室秘密的证据" });
  const backend = createNuwaExecutionBackend({ storyMemoryRecall: { memoryAdapterFactory: maliciousFactory } });
  const outcome = await executeNuwaPlanWithBackend({ plan, snapshot, backend });
  const execution = outcome.executions.find((item) => item.role === "evidence-critic")!;
  assert.equal(execution.capability?.status, "invalid-reference");
  assert.equal(execution.capability?.acceptedEvidenceIds.length, 0);
  assert.equal(execution.capability?.rejectedReferenceCount, 1);
  assert.equal(execution.result?.evidence.some((reference) => reference.relativePath === "outside/private.md"), false);

  createNuwaRunPack({ workspacePath, plan, snapshot });
  writeNuwaExecutionOutcome({ workspacePath, runId: plan.runId, outcome });
  const stored = readNuwaBackendManifest(workspacePath, plan.runId).executions.find((item) => item.role === "evidence-critic")!;
  assert.equal(stored.status, "accepted-by-nuwa");
  assert.equal(stored.capability?.status, "invalid-reference");
  assert.equal(stored.result?.evidence.some((reference) => reference.relativePath === "outside/private.md"), false);
});

test("capability configuration participates in deterministic backend cache identity", async () => {
  const workspacePath = copyWorkspace();
  const snapshot = buildStorySnapshot({ workspacePath });
  const plan = createNuwaPlan({ snapshot, authorGoal: "检查地下室秘密的证据" });
  createNuwaRunPack({ workspacePath, plan, snapshot });
  const enabledBackend = createNuwaExecutionBackend();
  const first = await executeNuwaPlanWithBackend({ plan, snapshot, backend: enabledBackend });
  writeNuwaExecutionOutcome({ workspacePath, runId: plan.runId, outcome: first });
  const cache = readNuwaBackendManifest(workspacePath, plan.runId).cache;
  const disabled = await executeNuwaPlanWithBackend({
    plan,
    snapshot,
    backend: createNuwaExecutionBackend({ storyMemoryRecall: { toggles: [] } }),
    cachedResults: cache
  });
  assert.equal(disabled.executions.some((execution) => execution.cacheHit), false);
  assert.equal(disabled.executions.find((execution) => execution.role === "evidence-critic")?.capability?.status, "disabled");
});

test.after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

function copyWorkspace(): string {
  const root = mkdtempSync(path.join(tmpdir(), "nuwa-story-recall-"));
  roots.push(root);
  cpSync(fixtureRoot, root, { recursive: true });
  return root;
}

function blockedBudget() {
  const budget = createDefaultSkillBudget();
  budget.perSkill["story-memory-recall"]!.maxCallsPerRun = 0;
  return budget;
}

function maliciousFactory(): MemorySkillAdapter {
  return {
    adapterId: "malicious-test-adapter",
    writeMemory() { throw new Error("write must not be called"); },
    searchMemory() {
      return {
        results: [{ entry: maliciousEntry(), score: 1, matchedBy: ["keyword"] }],
        diagnostics: { adapterId: "malicious-test-adapter", queryMode: "keyword", matchedCount: 1, truncated: false }
      };
    },
    getMemory() { return undefined; },
    exportMemorySnapshot() { return { adapterId: "malicious-test-adapter", entries: [] }; }
  };
}

function maliciousEntry(): MemoryEntry {
  return {
    id: "outside-entry",
    projectId: "outside",
    sourceRef: "outside/private.md",
    kind: "story_fact",
    text: "outside",
    tags: [],
    importance: 1,
    createdAt: "1970-01-01T00:00:00.000Z",
    metadata: { evidenceId: "outside", noteId: "outside", title: "Outside", noteType: "event" }
  };
}

function readCanonicalMarkdown(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  walk(root, root, result);
  return result;
}

function walk(root: string, directory: string, result: Record<string, string>): void {
  for (const entry of readdirSync(directory).sort()) {
    if (entry === ".world-os") continue;
    const absolute = path.join(directory, entry);
    if (statSync(absolute).isDirectory()) walk(root, absolute, result);
    else if (entry.endsWith(".md")) result[path.relative(root, absolute)] = readFileSync(absolute, "utf8");
  }
}

function pathExists(filePath: string): boolean {
  try { statSync(filePath); return true; } catch { return false; }
}
