import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  NUWA_DIRECTOR_NEVER_DELEGABLE,
  advanceNuwaLongformJobR1,
  assertNuwaDirectorPermissionR1,
  createNuwaDirectorStateR1,
  createNuwaLongformJobR1,
  createNuwaTemporaryAgentR1,
  endNuwaTemporaryAgentR1,
  setNuwaDirectorPermissionR1,
  setNuwaLongformJobStatusR1
} from "../../src/storyIntelligence/nuwaDelegationPolicyR1.ts";
import { readNuwaDirectorStateR1, writeNuwaDirectorStateR1 } from "../../src/storyIntelligence/nuwaRunPack.ts";

const NOW = "2026-08-18T08:00:00.000Z";

test("director defaults are bounded, provider-free, and exclude owner powers", () => {
  const state = createNuwaDirectorStateR1({ projectId: "project.demo", runId: "run.demo", createdAt: NOW });
  assert.deepEqual(state.permissions.filter((item) => item.status === "granted").map((item) => item.kind), ["read-context", "create-proposal", "rehearse-sandbox"]);
  assert.equal(state.scope.maxCalls, 0);
  assert.equal(state.scope.maxCost, 0);
  assert.equal(state.scope.costCurrency, "CNY");
  assert.ok(NUWA_DIRECTOR_NEVER_DELEGABLE.includes("confirm-canon"));
  assert.ok(!state.permissions.some((item) => item.kind === ("confirm-canon" as never)));
  assert.throws(() => assertNuwaDirectorPermissionR1(state, "predict-future", NOW), /not granted/);
});

test("prediction and temporary agents require explicit grants and stay Run-local", () => {
  let state = createNuwaDirectorStateR1({ projectId: "project.demo", runId: "run.demo", createdAt: NOW });
  state = setNuwaDirectorPermissionR1(state, { kind: "predict-future", granted: true, reason: "作者允许本 Run 预测", now: "2026-08-18T08:01:00.000Z" });
  assert.doesNotThrow(() => assertNuwaDirectorPermissionR1(state, "predict-future", "2026-08-18T08:02:00.000Z"));
  assert.throws(() => createNuwaTemporaryAgentR1(state, { displayName: "夜巡人", purpose: "检查钟楼路径", now: "2026-08-18T08:03:00.000Z" }), /not granted/);
  state = setNuwaDirectorPermissionR1(state, { kind: "create-temporary-agent", granted: true, reason: "作者允许一个临时视角", now: "2026-08-18T08:03:00.000Z" });
  state = createNuwaTemporaryAgentR1(state, { displayName: "夜巡人", purpose: "检查钟楼路径", now: "2026-08-18T08:04:00.000Z" });
  assert.equal(state.temporaryAgents[0].outputScope, "run-local-proposal");
  state = endNuwaTemporaryAgentR1(state, { agentId: state.temporaryAgents[0].agentId, status: "completed", now: "2026-08-18T08:05:00.000Z" });
  assert.equal(state.temporaryAgents[0].status, "completed");
  state = setNuwaDirectorPermissionR1(state, { kind: "predict-future", granted: false, reason: "作者收回预测权限", now: "2026-08-18T08:06:00.000Z" });
  assert.throws(() => assertNuwaDirectorPermissionR1(state, "predict-future", "2026-08-18T08:07:00.000Z"), /not granted/);
});

test("longform orchestration advances in stages and closes on author checkpoints", () => {
  let state = createNuwaDirectorStateR1({ projectId: "project.demo", runId: "run.demo", createdAt: NOW });
  state = createNuwaLongformJobR1(state, { title: "钟楼长篇编排", now: "2026-08-18T08:01:00.000Z" });
  state = advanceNuwaLongformJobR1(state, { now: "2026-08-18T08:02:00.000Z" });
  assert.equal(state.longformJob?.currentStage, "creative-brief");
  assert.throws(() => advanceNuwaLongformJobR1(state, { now: "2026-08-18T08:03:00.000Z" }), /explicit author confirmation/);
  state = advanceNuwaLongformJobR1(state, { confirmCreativeBrief: true, now: "2026-08-18T08:03:00.000Z" });
  state = setNuwaLongformJobStatusR1(state, { action: "pause", now: "2026-08-18T08:04:00.000Z" });
  assert.throws(() => advanceNuwaLongformJobR1(state, { now: "2026-08-18T08:05:00.000Z" }), /Resume/);
  state = setNuwaLongformJobStatusR1(state, { action: "resume", now: "2026-08-18T08:05:00.000Z" });
  while (state.longformJob?.currentStage !== "author-checkpoint") {
    state = advanceNuwaLongformJobR1(state, { now: new Date(Date.parse(state.updatedAt) + 60_000).toISOString() });
  }
  assert.equal(state.longformJob.authorCheckpointRequired, true);
  assert.throws(() => advanceNuwaLongformJobR1(state, { now: "2026-08-18T08:10:00.000Z" }), /explicit confirmation/);
  state = advanceNuwaLongformJobR1(state, { confirmAuthorCheckpoint: true, now: "2026-08-18T08:10:00.000Z" });
  assert.equal(state.longformJob?.providerCalls, 0);
});

test("director state persists inside the existing Run Pack only", () => {
  const workspacePath = mkdtempSync(path.join(os.tmpdir(), "tianyan-director-r1-"));
  try {
    const runId = "run-demo";
    const runPath = path.join(workspacePath, ".world-os", "runs", "nuwa", runId);
    mkdirSync(runPath, { recursive: true });
    writeFileSync(path.join(runPath, "run.json"), "{}\n", "utf8");
    const state = createNuwaDirectorStateR1({ projectId: path.basename(workspacePath), runId, createdAt: NOW });
    writeNuwaDirectorStateR1({ workspacePath, runId, state });
    assert.deepEqual(readNuwaDirectorStateR1(workspacePath, runId), state);
    assert.equal(readNuwaDirectorStateR1(workspacePath, runId).scope.runId, runId);
  } finally {
    rmSync(workspacePath, { recursive: true, force: true });
  }
});
