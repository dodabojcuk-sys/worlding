import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createNuwaBoundedScenarioFixtureAdapter } from "../../apps/story-studio/server/nuwaBoundedScenarioFixture.mjs";
import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "nuwa-bounded-fixture-"));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const projectId = "tide-letter-isolated";
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  operations.createProject({ title: "潮痕来信 · 隔离演示", folderSlug: projectId });
  operations.createWorldObject({ projectId, type: "character", title: "沈砚" });
  operations.createWorldObject({ projectId, type: "character", title: "阿芜" });
  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  const adapter = createNuwaBoundedScenarioFixtureAdapter({ operations, authorControl, now: () => "2026-08-23T08:30:00.000Z" });
  return { root, rootPath, stateFilePath, projectId, operations, authorControl, adapter };
}

function completeFixture(value: ReturnType<typeof fixture>) {
  value.adapter.operate(value.projectId, "start");
  value.adapter.operate(value.projectId, "play");
  value.adapter.operate(value.projectId, "fork", { sourceBranchId: "branch.original", sequence: 2, instruction: "只询问阿芜亲历的守夜记录。" });
  value.adapter.operate(value.projectId, "resume");
  value.adapter.operate(value.projectId, "play");
  return value.adapter.operate(value.projectId, "handoff");
}

test("isolated fixture recovers a ready bounded snapshot with zero Provider calls", () => {
  const value = fixture();
  try {
    const initial = value.adapter.read(value.projectId);
    assert.equal(initial.run.lifecycle, "ready");
    assert.equal(initial.run.integrityStatus, "current");
    assert.equal(initial.run.snapshot?.authorGoal.includes("旧名线索"), true);
    assert.deepEqual(initial.providerLedger, { setup: 3, generation: 6, total: 9 });
    assert.equal(initial.realProviderCalls, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("run controls persist rejection, branch correction, comparison, overlay, and replay", () => {
  const value = fixture();
  try {
    const completed = completeFixture(value);
    assert.equal(completed.run.lifecycle, "completed");
    assert.equal(completed.run.branches.length, 2);
    assert.equal(completed.run.branches[0]?.steps[1]?.status, "rejected");
    assert.equal(completed.run.activeBranch.steering.length, 1);
    assert.ok(completed.run.comparison?.rows.some((row) => row.category === "knowledge"));
    assert.ok(completed.run.overlay?.candidates.every((candidate) => candidate.causalStatus === "candidate-not-confirmed"));
    assert.equal(completed.run.replay.matches, true);
    assert.equal(completed.run.handoff?.status, "sent-review");
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("Candidate and Impact Review remain non-writing until AuthorControl confirmation", () => {
  const value = fixture();
  try {
    completeFixture(value);
    const candidate = value.adapter.prepareReview(value.projectId);
    assert.equal(candidate.review.stage, "candidate-review");
    assert.equal(candidate.review.eventWrites, 0);
    const impact = value.adapter.prepareImpact(value.projectId);
    assert.equal(impact.review.stage, "impact-review");
    assert.equal(impact.review.eventWrites, 0);
    assert.equal(impact.review.worldStateWrites, 0);
    assert.equal(impact.review.relationWrites, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("rejected Nuwa candidate creates zero formal writes", () => {
  const value = fixture();
  try {
    completeFixture(value);
    value.adapter.prepareReview(value.projectId);
    const rejected = value.adapter.reject(value.projectId);
    assert.equal(rejected.review.stage, "rejected");
    assert.equal(rejected.review.eventWrites, 0);
    assert.equal(value.authorControl.listVerifiedCanonEventIds({ projectId: value.projectId }).length, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("duplicate confirmation writes one Fixture Event and recovers the same owners after restart", () => {
  const value = fixture();
  try {
    completeFixture(value);
    const first = value.adapter.confirm(value.projectId);
    const repeated = value.adapter.confirm(value.projectId);
    assert.equal(first.review.stage, "integrated");
    assert.equal(first.review.eventWrites, 1);
    assert.equal(repeated.review.appliedEventId, first.review.appliedEventId);
    assert.equal(value.authorControl.listVerifiedCanonEventIds({ projectId: value.projectId }).length, 1);
    const restartedOperations = createStoryStudioWorkspaceOperations({ rootPath: value.rootPath, stateFilePath: value.stateFilePath });
    const restartedControl = createStoryStudioAuthorControl({ rootPath: value.rootPath, stateFilePath: value.stateFilePath });
    const restarted = createNuwaBoundedScenarioFixtureAdapter({ operations: restartedOperations, authorControl: restartedControl }).read(value.projectId);
    assert.equal(restarted.review.stage, "integrated");
    assert.equal(restarted.review.appliedEventId, first.review.appliedEventId);
    assert.equal(restarted.run.handoff?.status, "integrated");
    assert.equal(restarted.run.replay.matches, true);
    assert.equal(restarted.realProviderCalls, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("missing source and stale revision are fail-closed read projections", () => {
  const value = fixture();
  try {
    assert.match(value.adapter.read(value.projectId, { missingSource: true }).run.submissionBlocker || "", /引用来源缺失/u);
    assert.match(value.adapter.read(value.projectId, { stale: true }).run.submissionBlocker || "", /stale/u);
    assert.equal(value.adapter.read(value.projectId, { missingSource: true }).review.eventWrites, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("fixture mutation rejects a non-isolated project", () => {
  const value = fixture();
  try {
    value.operations.createProject({ title: "真实项目", folderSlug: "real-project" });
    assert.throws(() => value.adapter.operate("real-project", "start"), /explicitly isolated/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
