import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MULTIVERSE_R0_DERIVED_NAME,
  MULTIVERSE_R0_RUN_ID,
  createMultiverseSingleDerivedFixtureAdapter
} from "../../apps/story-studio/server/multiverseSingleDerivedFixture.mjs";
import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { MULTIVERSE_EVENT_CHANGE_ID } from "../../src/storyWorkspace/multiverseSingleDerivedR0.ts";

function fixture(faultInjector?: (boundary: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "multiverse-single-derived-r0-"));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const projectId = "multiverse-single-derived-fixture";
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  operations.createProject({ title: "潮痕来信 · 多元隔离演示", folderSlug: projectId });
  operations.createWorldObject({ projectId, type: "character", title: "沈砚" });
  operations.createWorldObject({ projectId, type: "character", title: "阿芜" });
  const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
  const adapter = createMultiverseSingleDerivedFixtureAdapter({ operations, authorControl, faultInjector });
  return { root, rootPath, stateFilePath, projectId, operations, authorControl, adapter };
}

function createLineage(value: ReturnType<typeof fixture>) {
  value.adapter.createRoot(value.projectId);
  value.adapter.ensureCompletedRun(value.projectId);
  value.adapter.saveDerived(value.projectId, { versionName: MULTIVERSE_R0_DERIVED_NAME, sourceRevision: 1, changeId: MULTIVERSE_EVENT_CHANGE_ID });
  return value.adapter.read(value.projectId);
}

test("empty Multiverse has no automatic root, derived, or Nuwa Run", () => {
  const value = fixture();
  try {
    const empty = value.adapter.read(value.projectId);
    assert.equal(empty.root, null);
    assert.equal(empty.derived, null);
    assert.equal(empty.nuwa, null);
    assert.equal(empty.writes.confirmedEvents, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("root baseline is explicit and idempotent", () => {
  const value = fixture();
  try {
    const first = value.adapter.createRoot(value.projectId).view;
    const repeated = value.adapter.createRoot(value.projectId).view;
    assert.equal(first.root?.id, repeated.root?.id);
    assert.equal(first.root?.revision, 1);
    assert.equal(repeated.derived, null);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("completed Nuwa path has a new independent identity and zero formal writes", () => {
  const value = fixture();
  try {
    const run = value.adapter.ensureCompletedRun(value.projectId);
    assert.equal(run.runId, MULTIVERSE_R0_RUN_ID);
    assert.notEqual(run.runId, "nuwa-tide-letter-bounded-r0");
    assert.equal(run.lifecycle, "completed");
    assert.equal(run.handoff?.status, "sent-review");
    assert.equal(value.authorControl.listVerifiedCanonEventIds({ projectId: value.projectId }).length, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("derived creation fails without explicit root", () => {
  const value = fixture();
  try {
    assert.throws(() => value.adapter.saveDerived(value.projectId, { versionName: MULTIVERSE_R0_DERIVED_NAME, sourceRevision: 1, changeId: MULTIVERSE_EVENT_CHANGE_ID }), /root WorkVersion explicitly/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("derived confirmation rejects mismatched name, source revision, or candidate", () => {
  const value = fixture();
  try {
    value.adapter.createRoot(value.projectId);
    assert.throws(() => value.adapter.saveDerived(value.projectId, { versionName: "其他", sourceRevision: 1, changeId: MULTIVERSE_EVENT_CHANGE_ID }), /name/);
    assert.throws(() => value.adapter.saveDerived(value.projectId, { versionName: MULTIVERSE_R0_DERIVED_NAME, sourceRevision: 2, changeId: MULTIVERSE_EVENT_CHANGE_ID }), /source revision/);
    assert.throws(() => value.adapter.saveDerived(value.projectId, { versionName: MULTIVERSE_R0_DERIVED_NAME, sourceRevision: 1, changeId: "other" }), /candidate identity/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("one direct derived version pins root revision one and is idempotent", () => {
  const value = fixture();
  try {
    const first = createLineage(value);
    const repeated = value.adapter.saveDerived(value.projectId, { versionName: MULTIVERSE_R0_DERIVED_NAME, sourceRevision: 1, changeId: MULTIVERSE_EVENT_CHANGE_ID }).view;
    assert.equal(first.derived?.id, repeated.derived?.id);
    assert.equal(repeated.derived?.pinnedRootRevision, 1);
    assert.equal(repeated.derived?.revision, 1);
    assert.equal(value.adapter.listVersions(value.projectId).length, 2);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("semantic compare exposes one changed Event and three non-writing owner dimensions", () => {
  const value = fixture();
  try {
    const view = createLineage(value);
    assert.deepEqual(view.compare?.rows.map((row) => [row.owner, row.state]), [["Event", "changed"], ["Character", "unchanged"], ["WorldState", "unchanged"], ["Relation", "unknown"]]);
    assert.equal(view.compare?.signals.length, 16);
    assert.equal(view.compare?.rows.filter((row) => row.selectable).length, 1);
    assert.deepEqual(view.writes, { confirmedEvents: 0, rootRevisionAppends: 0, derivedRevisions: 1, character: 0, worldState: 0, relation: 0, canonBody: 0, session: 0, archive: 0, memory: 0, provider: 0, plugin: 0 });
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("missing reference and stale selection fail closed", () => {
  const value = fixture();
  try {
    createLineage(value);
    assert.equal(value.adapter.read(value.projectId, { missingSource: true }).compare?.rows[0]?.state, "insufficient");
    assert.equal(value.adapter.read(value.projectId, { staleSelection: true }).compare?.rows[0]?.state, "stale");
    assert.throws(() => value.adapter.prepareReview(value.projectId, []), /exactly one/);
    assert.equal(value.authorControl.listVerifiedCanonEventIds({ projectId: value.projectId }).length, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("Candidate Review and Impact Review produce zero confirmed Event writes", () => {
  const value = fixture();
  try {
    createLineage(value);
    const candidate = value.adapter.prepareReview(value.projectId, [MULTIVERSE_EVENT_CHANGE_ID]);
    assert.equal(candidate.review.stage, "candidate-review");
    assert.equal(candidate.writes.confirmedEvents, 0);
    const impact = value.adapter.prepareImpact(value.projectId);
    assert.equal(impact.review.stage, "impact-review");
    assert.equal(impact.writes.confirmedEvents, 0);
    assert.equal(impact.writes.character + impact.writes.worldState + impact.writes.relation, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("reject keeps root at one and writes no Event", () => {
  const value = fixture();
  try {
    createLineage(value);
    const rejected = value.adapter.reject(value.projectId);
    assert.equal(rejected.review.stage, "rejected");
    assert.equal(rejected.root?.revision, 1);
    assert.equal(rejected.writes.confirmedEvents, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("author confirmation writes one Event and appends only root revision two", () => {
  const value = fixture();
  try {
    createLineage(value);
    value.adapter.prepareReview(value.projectId, [MULTIVERSE_EVENT_CHANGE_ID]);
    value.adapter.prepareImpact(value.projectId);
    const integrated = value.adapter.confirm(value.projectId);
    assert.equal(integrated.review.stage, "integrated");
    assert.equal(integrated.writes.confirmedEvents, 1);
    assert.equal(integrated.root?.revision, 2);
    assert.equal(integrated.derived?.revision, 1);
    assert.equal(integrated.derived?.pinnedRootRevision, 1);
    assert.equal(integrated.derived?.status, "integrated");
    assert.equal(integrated.writes.character + integrated.writes.worldState + integrated.writes.relation + integrated.writes.session + integrated.writes.archive + integrated.writes.memory, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("duplicate confirmation returns the same Event and root revision", () => {
  const value = fixture();
  try {
    createLineage(value);
    const first = value.adapter.confirm(value.projectId);
    const second = value.adapter.confirm(value.projectId);
    assert.equal(second.review.appliedEventId, first.review.appliedEventId);
    assert.equal(second.root?.revision, 2);
    assert.equal(second.writes.confirmedEvents, 1);
    assert.equal(value.adapter.listVersions(value.projectId).length, 2);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("crash after Event apply recovers by appending only the missing WorkVersion revision", () => {
  let shouldCrash = true;
  const value = fixture((boundary) => {
    if (boundary === "after-event-apply" && shouldCrash) {
      shouldCrash = false;
      throw new Error("fixture crash after Event apply");
    }
  });
  try {
    createLineage(value);
    assert.throws(() => value.adapter.confirm(value.projectId), /fixture crash/);
    assert.equal(value.authorControl.listVerifiedCanonEventIds({ projectId: value.projectId }).length, 1);
    assert.equal(value.adapter.read(value.projectId).root?.revision, 1);
    const recovered = value.adapter.confirm(value.projectId);
    assert.equal(recovered.root?.revision, 2);
    assert.equal(recovered.writes.confirmedEvents, 1);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("restart recovers lineage, compare, receipts, and integrated Event", () => {
  const value = fixture();
  try {
    createLineage(value);
    const first = value.adapter.confirm(value.projectId);
    const restartedOperations = createStoryStudioWorkspaceOperations({ rootPath: value.rootPath, stateFilePath: value.stateFilePath });
    const restartedControl = createStoryStudioAuthorControl({ rootPath: value.rootPath, stateFilePath: value.stateFilePath });
    const restarted = createMultiverseSingleDerivedFixtureAdapter({ operations: restartedOperations, authorControl: restartedControl }).read(value.projectId);
    assert.equal(restarted.root?.revision, 2);
    assert.equal(restarted.derived?.pinnedRootRevision, 1);
    assert.equal(restarted.review.appliedEventId, first.review.appliedEventId);
    assert.ok(restarted.history.some((ref) => ref.startsWith("event:")));
    assert.equal(restarted.writes.provider, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("Fixture mutation rejects a real Project", () => {
  const value = fixture();
  try {
    value.operations.createProject({ title: "真实项目", folderSlug: "real-project" });
    assert.throws(() => value.adapter.createRoot("real-project"), /explicitly isolated/);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
