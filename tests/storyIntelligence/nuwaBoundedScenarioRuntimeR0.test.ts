import assert from "node:assert/strict";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildNuwaEventOverlay,
  buildStorySnapshot,
  cancelNuwaBoundedRun,
  compareNuwaBoundedBranches,
  createNuwaBoundedRun,
  createNuwaPlan,
  createNuwaRunPack,
  createTideLetterBoundedSnapshot,
  forkNuwaBoundedFromStep,
  freezeNuwaBoundedSnapshot,
  getNuwaBoundedRunProjection,
  pauseNuwaBoundedRun,
  prepareNuwaBoundedCandidateHandoff,
  readNuwaBoundedRun,
  replayNuwaBoundedRun,
  resumeNuwaBoundedRun,
  startNuwaBoundedRun,
  stepNuwaBoundedRun,
  updateNuwaBoundedView,
  validateBoundedSnapshot,
  writeNuwaBoundedRun,
  type NuwaBoundedRun
} from "../../src/storyIntelligence/index.ts";

const sourceFixture = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");

function readyRun(runId = "nuwa-tide-letter-r0"): NuwaBoundedRun {
  const draft = createNuwaBoundedRun({ runId });
  const snapshot = createTideLetterBoundedSnapshot({ projectId: "fixture-project", sourceRevision: "fixture-source-r0" });
  return freezeNuwaBoundedSnapshot(draft, snapshot);
}

function completedOriginal(runId = "nuwa-tide-letter-r0"): NuwaBoundedRun {
  let run = startNuwaBoundedRun(readyRun(runId));
  for (let index = 0; index < 4; index += 1) run = stepNuwaBoundedRun(run);
  return run;
}

function completedComparison(runId = "nuwa-tide-letter-r0"): NuwaBoundedRun {
  let run = completedOriginal(runId);
  run = forkNuwaBoundedFromStep(run, { sourceBranchId: "branch.original", sequence: 2, instruction: "不要展示完整来信，只询问阿芜亲历的守夜记录。" });
  run = resumeNuwaBoundedRun(run);
  run = stepNuwaBoundedRun(run);
  run = stepNuwaBoundedRun(run);
  return run;
}

test("BoundedStorySnapshot freezes an author-readable allowlist with integrity", () => {
  const snapshot = createTideLetterBoundedSnapshot({ projectId: "fixture-project", sourceRevision: "fixture-source-r0" });
  assert.equal(validateBoundedSnapshot(snapshot), "current");
  assert.equal(snapshot.confirmedEvents.length, 2);
  assert.equal(snapshot.participatingCharacters.length, 2);
  assert.equal(snapshot.maximumSteps, 4);
  assert.equal(snapshot.maximumBranches, 2);
  assert.equal(snapshot.budgetClass, "fixture-zero-provider");
  assert.ok(snapshot.forbiddenChanges.includes("不确认寄信人身份"));
});

test("snapshot integrity, stale revisions, and missing references fail closed", () => {
  const snapshot = createTideLetterBoundedSnapshot({ projectId: "fixture-project", sourceRevision: "fixture-source-r0" });
  const tampered = structuredClone(snapshot);
  tampered.authorGoal = "篡改目标";
  assert.equal(validateBoundedSnapshot(tampered), "mismatch");
  const missing = structuredClone(snapshot);
  missing.selectedSources[0]!.available = false;
  const { integrity: _integrity, ...unsigned } = missing;
  missing.integrity = (awaitStableHash(unsigned));
  assert.equal(validateBoundedSnapshot(missing), "missing-reference");
  const staleRun = completedOriginal();
  staleRun.stale = true;
  assert.equal(getNuwaBoundedRunProjection(staleRun).canHandoff, false);
  assert.match(getNuwaBoundedRunProjection(staleRun).submissionBlocker || "", /stale/iu);
});

test("deterministic steps preserve knowledge boundaries and rejected changes have zero delta", () => {
  const run = completedOriginal();
  const rejected = run.branches[0]!.steps[1]!;
  assert.equal(rejected.status, "rejected");
  assert.deepEqual(rejected.knowledgeAfter, rejected.knowledgeBefore);
  assert.deepEqual(rejected.stateAfter, ["无状态变化；步骤被拒绝"]);
  assert.ok(rejected.constraintChecks.every((check) => check.outcome === "reject"));
  assert.equal(JSON.stringify(run).includes("claim.future-lighthouse-history"), true);
  assert.equal(run.providerCalls, 0);
});

test("pause, resume, and duplicate step receipts are idempotent", () => {
  let run = startNuwaBoundedRun(readyRun());
  run = stepNuwaBoundedRun(run, "operation.step.one");
  const repeated = stepNuwaBoundedRun(run, "operation.step.one");
  assert.equal(repeated.branches[0]!.steps.length, 1);
  run = pauseNuwaBoundedRun(run);
  assert.throws(() => stepNuwaBoundedRun(run), /only while running/iu);
  run = resumeNuwaBoundedRun(run);
  assert.equal(run.lifecycle, "running");
});

test("cancel rejects late results and remains recovered as cancelled", () => {
  let run = startNuwaBoundedRun(readyRun());
  run = cancelNuwaBoundedRun(run);
  assert.equal(run.lifecycle, "cancelled");
  assert.throws(() => stepNuwaBoundedRun(run, "late-result"), /only while running/iu);
});

test("fork from step two preserves the original branch and steering affects only future steps", () => {
  const original = completedOriginal();
  const originalHash = JSON.stringify(original.branches[0]!.steps);
  let run = forkNuwaBoundedFromStep(original, { sourceBranchId: "branch.original", sequence: 2, instruction: "只询问阿芜亲历的记录。", operationId: "fork.once" });
  const repeated = forkNuwaBoundedFromStep(run, { sourceBranchId: "branch.original", sequence: 2, instruction: "只询问阿芜亲历的记录。", operationId: "fork.once" });
  assert.equal(repeated.branches.length, 2);
  run = resumeNuwaBoundedRun(run);
  run = stepNuwaBoundedRun(run);
  assert.equal(JSON.stringify(run.branches[0]!.steps), originalHash);
  assert.equal(run.branches[1]!.steps[2]!.createdBy, "author-steering");
  assert.equal(run.branches[1]!.steps[0]!.createdBy, "fixture-director");
});

test("semantic branch comparison reports Event, knowledge, source, and rule differences", () => {
  const run = completedComparison();
  const comparison = compareNuwaBoundedBranches(run, "branch.original", "branch.temporary-old-name-correction");
  assert.equal(comparison.sharedPrefixStep, 2);
  assert.ok(comparison.rows.some((row) => row.category === "event"));
  assert.ok(comparison.rows.some((row) => row.category === "knowledge"));
  assert.ok(comparison.rows.some((row) => row.category === "source"));
  assert.ok(comparison.rows.some((row) => row.category === "rule-conflict"));
  assert.notEqual(comparison.endings.left, comparison.endings.right);
});

test("Event Overlay keeps confirmed IDs and candidate IDs in separate read-only layers", () => {
  const overlay = buildNuwaEventOverlay(completedComparison())!;
  assert.ok(overlay.confirmedBaseline.every((event) => event.eventId.startsWith("fixture.event.")));
  assert.ok(overlay.candidates.every((candidate) => candidate.candidateId.startsWith("candidate.")));
  assert.ok(overlay.candidates.every((candidate) => candidate.causalStatus === "candidate-not-confirmed"));
  assert.ok(overlay.candidates.every((candidate) => candidate.worldTime === null));
});

test("completed temporary branch prepares an idempotent Candidate/Impact handoff", () => {
  const completed = completedComparison();
  const handed = prepareNuwaBoundedCandidateHandoff(completed, "handoff.once");
  const repeated = prepareNuwaBoundedCandidateHandoff(handed, "handoff.once");
  assert.equal(repeated.handoff?.status, "sent-review");
  assert.equal(repeated.receipts.filter((receipt) => receipt.operationId === "handoff.once").length, 1);
  assert.equal(repeated.handoff?.sourceBranchId, "branch.temporary-old-name-correction");
  assert.ok(repeated.handoff?.unresolvedConflicts.some((item) => item.includes("精确世界时间")));
});

test("replay is deterministic and makes zero Provider calls", () => {
  const replay = replayNuwaBoundedRun(completedComparison());
  assert.equal(replay.matches, true);
  assert.equal(replay.providerCalls, 0);
  assert.equal(replay.stepsIntegrity.length, 64);
});

test("view state and comparison pair survive persistence inside the existing RunPack", () => {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-bounded-r0-"));
  const workspace = path.join(root, "project");
  cpSync(sourceFixture, workspace, { recursive: true });
  try {
    const storySnapshot = buildStorySnapshot({ workspacePath: workspace });
    const plan = createNuwaPlan({ snapshot: storySnapshot, authorGoal: "潮痕来信有界排演" });
    createNuwaRunPack({ workspacePath: workspace, plan, snapshot: storySnapshot });
    let run = completedComparison(plan.runId);
    run = updateNuwaBoundedView(run, { selectedStepId: "branch.temporary-old-name-correction.step.3", activeTool: "compare", dockOpen: true }, "view.persist");
    writeNuwaBoundedRun(workspace, run);
    const restored = readNuwaBoundedRun(workspace, plan.runId)!;
    assert.equal(restored.viewState.selectedStepId, "branch.temporary-old-name-correction.step.3");
    assert.deepEqual(restored.viewState.compareBranchIds, ["branch.original", "branch.temporary-old-name-correction"]);
    assert.equal(restored.viewState.dockOpen, true);
    assert.equal(getNuwaBoundedRunProjection(restored).replay.matches, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

function awaitStableHash(value: unknown): string {
  // Keep the test independent from object key order without introducing a
  // second integrity implementation in production.
  return stableHashForTest(value);
}

function stableHashForTest(value: unknown): string {
  const ordered = (input: unknown): string => Array.isArray(input)
    ? `[${input.map(ordered).join(",")}]`
    : input && typeof input === "object"
      ? `{${Object.keys(input as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${ordered((input as Record<string, unknown>)[key])}`).join(",")}}`
      : JSON.stringify(input);
  return (requireHash(ordered(value)));
}

function requireHash(value: string): string {
  // Dynamic import is unnecessary in the product; node:crypto is used only in
  // this test helper so production and test integrity remain independently checked.
  return globalThis.process.getBuiltinModule("node:crypto").createHash("sha256").update(value).digest("hex");
}
