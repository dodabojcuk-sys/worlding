import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyNuwaSceneIntervention,
  buildNuwaSceneCandidate,
  compareNuwaSceneSimulations,
  createNuwaSceneCheckpoint,
  createNuwaSceneSimulationRun,
  createNuwaRunPack,
  forkNuwaSceneSimulationFromCheckpoint,
  readNuwaSceneSimulationReadModel,
  readNuwaSceneSimulationRun,
  replayNuwaSceneSimulation,
  resolveNuwaSceneAction,
  runNuwaSceneSimulation,
  stepNuwaSceneSimulation,
  validateNuwaSceneSimulationRun,
  writeNuwaSceneSimulationRun,
  buildStorySnapshot,
  createNuwaPlan,
  type NuwaSceneSimulationRunR0
} from "../../src/storyIntelligence/index.ts";

const sourceFixture = path.join(process.cwd(), "tests", "fixtures", "story-markdown-workspace-v1");

function workspaceFixture(): string {
  const root = mkdtempSync(path.join(tmpdir(), "tianyan-nuwa-scene-r0-"));
  const workspace = path.join(root, "project");
  cpSync(sourceFixture, workspace, { recursive: true });
  return workspace;
}

function freshRun(runId = "nuwa-run-scene-r0"): NuwaSceneSimulationRunR0 {
  return createNuwaSceneSimulationRun({ runId, snapshotHash: "snapshot-fixture-r0", canonicalRevision: "canonical-fixture-r0" });
}

function completeRun(runId = "nuwa-run-scene-r0"): NuwaSceneSimulationRunR0 {
  return runNuwaSceneSimulation(freshRun(runId));
}

test("R0 fixture isolates actor knowledge and keeps passive entities passive", () => {
  const run = freshRun();
  assert.equal(run.scenario.unitRef.id, "unit.clocktower-search-arlan");
  assert.equal(run.scenario.beatRefs.length, 2);
  assert.equal(run.actors.length, 3);
  assert.equal(run.scenario.passiveEntities.length, 3);
  assert.equal(run.actors.find((actor) => actor.displayName === "林远")?.knowledgeRefs.includes(run.scenario.secretRef), true);
  assert.equal(run.actors.find((actor) => actor.displayName === "阿岚")?.knowledgeRefs.includes(run.scenario.secretRef), false);
  assert.equal(run.actors.find((actor) => actor.displayName === "守门人")?.knowledgeRefs.includes(run.scenario.secretRef), false);
});

test("unknown secret citations fail closed instead of being repaired", () => {
  const run = freshRun();
  const forged = {
    actionId: "action-forged",
    actorRef: run.actors[1]!.actorRef,
    type: "search" as const,
    targetRefs: ["item.oil-lamp"],
    statedIntent: "凭空使用地下室钥匙信息",
    knowledgeCitations: [run.scenario.secretRef],
    expectedEffect: "不应执行",
    sourceStep: 1
  };
  assert.throws(() => resolveNuwaSceneAction(run, forged), /Knowledge boundary leak/);
});

test("ObservationReceipt transfers the secret to B, while C remains unaware", () => {
  let run = freshRun();
  for (let index = 0; index < 4; index += 1) run = stepNuwaSceneSimulation(run);
  const alan = run.actors.find((actor) => actor.displayName === "阿岚")!;
  const gatekeeper = run.actors.find((actor) => actor.displayName === "守门人")!;
  assert.equal(alan.knowledgeRefs.includes(run.scenario.secretRef), true);
  assert.equal(gatekeeper.knowledgeRefs.includes(run.scenario.secretRef), false);
  assert.equal(run.ledger[3]!.observations[0]!.channel, "told");
  assert.equal(run.ledger[3]!.observations[0]!.sourceEventId, run.ledger[3]!.eventId);
});

test("resolver rejects an unreachable move and an exhausted resource", () => {
  let run = freshRun();
  const actor = run.actors[0]!;
  const unreachable = resolveNuwaSceneAction(run, {
    actionId: "action-invalid-move",
    actorRef: actor.actorRef,
    type: "move",
    targetRefs: ["location.nowhere"],
    statedIntent: "走向不存在的地方",
    knowledgeCitations: [],
    expectedEffect: "拒绝",
    sourceStep: 1
  });
  assert.equal(unreachable.outcome, "rejected");
  run = runNuwaSceneSimulation(run);
  const used = run.ledger.find((event) => event.action.type === "use-resource");
  assert.ok(used);
  const secondUse = resolveNuwaSceneAction(run, {
    actionId: "action-invalid-resource",
    actorRef: actor.actorRef,
    type: "use-resource",
    targetRefs: ["oil-lamp"],
    statedIntent: "再次点灯",
    knowledgeCitations: [],
    expectedEffect: "拒绝",
    sourceStep: 9
  });
  assert.equal(secondUse.outcome, "rejected");
});

test("the deterministic loop performs one step and only changes the Run sandbox", () => {
  const run = freshRun();
  const next = stepNuwaSceneSimulation(run);
  assert.equal(next.ledger.length, 1);
  assert.equal(next.nextStep, 2);
  assert.deepEqual(next.scenario, run.scenario);
  assert.equal(next.status, "paused");
  assert.equal(next.ledger[0]!.action.actorRef.id, "character.linyuan");
  assert.equal(next.actors[0]!.locationRef, next.sandboxState.locations["actor.linyuan"]);
});

test("actor resource projections stay aligned with the Run sandbox", () => {
  const completed = completeRun();
  assert.equal(completed.sandboxState.resources["oil-lamp"], 0);
  assert.equal(completed.actors.find((actor) => actor.actorRef.id === "character.linyuan")?.resources["oil-lamp"], 0);
});

test("pause prevents new steps and single-step is exact", () => {
  const first = stepNuwaSceneSimulation(freshRun());
  const paused = { ...first, status: "paused" as const };
  const stillPaused = { ...paused, status: "paused" as const };
  assert.equal(stillPaused.ledger.length, 1);
  const second = stepNuwaSceneSimulation(paused);
  assert.equal(second.ledger.length, 2);
});

test("checkpoint hashes are stable and persist through reload", () => {
  const checkpointed = createNuwaSceneCheckpoint(stepNuwaSceneSimulation(freshRun()), { checkpointId: "checkpoint-01", createdAt: "2026-08-17T00:00:01.000Z" });
  const repeated = createNuwaSceneCheckpoint(checkpointed, { checkpointId: "checkpoint-01", createdAt: "2030-01-01T00:00:00.000Z" });
  assert.deepEqual(repeated.checkpoints, checkpointed.checkpoints);
  assert.equal(checkpointed.checkpoints[0]!.sandboxStateHash, checkpointed.stateHash);
  assert.equal(checkpointed.checkpoints[0]!.ledgerHash, checkpointed.ledgerHash);
});

test("intervention is a separate author event and does not rewrite the old ledger", () => {
  const before = createNuwaSceneCheckpoint(stepNuwaSceneSimulation(freshRun()), { checkpointId: "checkpoint-01" });
  const intervened = applyNuwaSceneIntervention(before, { checkpointId: "checkpoint-01", instruction: "作者要求保留秘密边界。", modifiedSoftGoal: "先建立信任再推进线索" });
  assert.equal(intervened.ledger.length, before.ledger.length);
  assert.equal(intervened.interventions.length, 1);
  assert.equal(intervened.interventions[0]!.provenance.kind, "author");
  assert.deepEqual(intervened.ledger, before.ledger);
});

test("child Run shares only the checkpoint prefix and cannot mutate its parent", () => {
  const parentBefore = applyNuwaSceneIntervention(createNuwaSceneCheckpoint(runNuwaSceneSimulation(freshRun(), { steps: 4 }), { checkpointId: "checkpoint-04" }), {
    checkpointId: "checkpoint-04",
    instruction: "作者让守门人收到秘密传播。",
    injectSecretTo: ["actor.gatekeeper"]
  });
  const { parent, child } = forkNuwaSceneSimulationFromCheckpoint(parentBefore, { checkpointId: "checkpoint-04", childRunId: "nuwa-scene-child-r0" });
  assert.equal(parent.ledger.length, 4);
  assert.equal(child.sharedPrefixStep, 4);
  assert.equal(child.ledger.length, 4);
  assert.equal(parent.actors.find((actor) => actor.displayName === "守门人")?.knowledgeRefs.includes(parent.scenario.secretRef), false);
  assert.equal(child.actors.find((actor) => actor.displayName === "守门人")?.knowledgeRefs.includes(child.scenario.secretRef), true);
  const childCompleted = runNuwaSceneSimulation(child);
  assert.equal(parent.ledger.length, 4);
  assert.equal(childCompleted.ledger.length, 8);
  const comparison = compareNuwaSceneSimulations(parent, childCompleted);
  assert.equal(comparison.sharedPrefixStep, 4);
  assert.ok(comparison.differentActions.length > 0);
  assert.ok(comparison.informationPropagation.some((item) => item.includes("守门人")));
  assert.equal(comparison.metrics.parentCost, 0);
});

test("replay consumes the saved ledger without regenerating actions", () => {
  const run = completeRun();
  const replay = replayNuwaSceneSimulation(run);
  assert.equal(replay.matches, true);
  assert.equal(replay.regeneratedActions, 0);
  assert.equal(replay.stateHash, run.stateHash);
  assert.equal(replay.ledgerHash, run.ledgerHash);
});

test("candidate builder is traceable, review-gated, and stale-safe", () => {
  const run = completeRun();
  const candidate = buildNuwaSceneCandidate(run, { currentCanonicalRevision: run.canonicalRevision, checkpointId: null });
  assert.equal(candidate.reviewGate, "candidate-review");
  assert.equal(candidate.mutatesCanon, false);
  assert.equal(candidate.mutatesEvent, false);
  assert.equal(candidate.mutatesNovel, false);
  assert.equal(candidate.relevantStepRange.start, 1);
  assert.equal(candidate.relevantStepRange.end, 8);
  assert.throws(() => buildNuwaSceneCandidate(run, { currentCanonicalRevision: "stale-canon" }), /stale/i);
});

test("RunPack persistence appends the Event Ledger and restores the selected Run", () => {
  const workspacePath = workspaceFixture();
  try {
    const snapshot = buildStorySnapshot({ workspacePath });
    const plan = createNuwaPlan({ snapshot, authorGoal: "场景排演 R0" });
    createNuwaRunPack({ workspacePath, plan, snapshot });
    let run = createNuwaSceneSimulationRun({ runId: plan.runId, snapshotHash: snapshot.snapshotHash, canonicalRevision: snapshot.snapshotHash });
    writeNuwaSceneSimulationRun(workspacePath, run);
    run = stepNuwaSceneSimulation(run);
    writeNuwaSceneSimulationRun(workspacePath, run);
    const ledgerPath = path.join(workspacePath, ".world-os", "runs", "nuwa", plan.runId, "scene-ledger.jsonl");
    const prefix = readFileSync(ledgerPath, "utf8");
    run = stepNuwaSceneSimulation(run);
    writeNuwaSceneSimulationRun(workspacePath, run);
    assert.equal(readFileSync(ledgerPath, "utf8").startsWith(prefix), true);
    const loaded = readNuwaSceneSimulationRun(workspacePath, plan.runId)!;
    assert.equal(loaded.ledger.length, 2);
    assert.equal(readNuwaSceneSimulationReadModel(workspacePath, plan.runId)?.replay?.matches, true);
    assert.equal(existsSync(path.join(workspacePath, ".world-os", "runs", "nuwa", plan.runId, "scene-runtime.json")), true);
  } finally {
    rmSync(path.dirname(workspacePath), { recursive: true, force: true });
  }
});

test("validation rejects a tampered Run and Provider cost remains zero", () => {
  const run = completeRun();
  const tampered = structuredClone(run);
  tampered.ledger[3]!.observations[0]!.receivingActorRef = run.actors[2]!.actorRef;
  assert.throws(() => validateNuwaSceneSimulationRun(tampered), /replay hash/i);
  assert.equal(buildNuwaSceneCandidate(run).authorInterventions.length, 0);
});
