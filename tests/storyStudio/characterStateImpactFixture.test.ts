import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createCharacterStateImpactFixtureAdapter } from "../../apps/story-studio/server/characterStateImpactFixture.mjs";

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "character-state-impact-"));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const projectId = "tide-letter-isolated";
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  operations.createProject({ title: "潮痕来信 · 隔离演示", folderSlug: projectId });
  operations.createWorldObject({ projectId, type: "character", title: "沈砚" });
  operations.createWorldObject({ projectId, type: "character", title: "阿芜" });
  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  const adapter = createCharacterStateImpactFixtureAdapter({ operations, authorControl, now: () => "2026-08-23T00:00:00.000Z" });
  return { root, rootPath, stateFilePath, projectId, operations, authorControl, adapter };
}

test("Candidate impact preview writes no formal Event before author confirmation", () => {
  const value = fixture();
  try {
    const prepared = value.adapter.prepare(value.projectId);
    assert.equal(prepared.stage, "awaiting_author");
    assert.equal(prepared.formalEventWrites, 0);
    assert.equal(prepared.characterWrites, 0);
    assert.equal(prepared.worldStateWrites, 0);
    assert.equal(prepared.relationWrites, 0);
    assert.equal(prepared.providerCalls, 0);
    assert.ok(prepared.candidateReviewId);
    assert.ok(prepared.impactReviewId);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("rejected Candidate creates zero formal writes", () => {
  const value = fixture();
  try {
    const rejected = value.adapter.reject(value.projectId);
    assert.equal(rejected.stage, "rejected");
    assert.equal(rejected.formalEventWrites, 0);
    assert.equal(value.authorControl.listVerifiedCanonEventIds({ projectId: value.projectId }).length, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("author confirmation is idempotent and recovers after restart from existing owners", () => {
  const value = fixture();
  try {
    const first = value.adapter.confirm(value.projectId);
    const repeated = value.adapter.confirm(value.projectId);
    assert.equal(first.stage, "confirmed");
    assert.equal(first.formalEventWrites, 1);
    assert.equal(repeated.appliedEventId, first.appliedEventId);
    assert.equal(value.authorControl.listVerifiedCanonEventIds({ projectId: value.projectId }).length, 1);
    const restartedOperations = createStoryStudioWorkspaceOperations({ rootPath: value.rootPath, stateFilePath: value.stateFilePath });
    const restartedControl = createStoryStudioAuthorControl({ rootPath: value.rootPath, stateFilePath: value.stateFilePath });
    const restarted = createCharacterStateImpactFixtureAdapter({ operations: restartedOperations, authorControl: restartedControl }).read(value.projectId);
    assert.equal(restarted.stage, "confirmed");
    assert.equal(restarted.appliedEventId, first.appliedEventId);
    assert.equal(restarted.providerCalls, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("fixture mutation adapter rejects a non-isolated project", () => {
  const value = fixture();
  try {
    value.operations.createProject({ title: "真实项目", folderSlug: "real-project" });
    assert.throws(() => value.adapter.prepare("real-project"), /explicitly isolated/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
