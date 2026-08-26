import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createCreationSourceSelectionPort } from "../../apps/story-studio/server/creationSourceSelectionPort.mjs";
import { createWorkVersionBoundCreationFixtureAdapter } from "../../apps/story-studio/server/workVersionBoundCreationFixture.mjs";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { buildNeutralStoryPackage } from "../../src/storyCreation/neutralStoryPackage.ts";
import { projectWorkVersionOutputArtifactSourceValidation } from "../../src/storyCreation/workVersionBoundOutputArtifact.ts";

function fixture(faultInjector?: (boundary: string) => void) {
  const root = mkdtempSync(path.join(tmpdir(), "work-version-creation-r0-"));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const projectId = "work-version-creation-source-fixture";
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  operations.createProject({ title: "潮痕来信 · 创作来源隔离演示", folderSlug: projectId });
  operations.createWorldObject({ projectId, type: "character", title: "沈砚" });
  const event = operations.createWorldObject({ projectId, type: "event", title: "沈砚在灯下核对守夜记录", status: "planned", tags: ["Fixture"] });
  const capturedAt = "2026-08-24T09:40:00.000Z";
  const sourceRef = { sourceKind: "event-line" as const, ownerId: "story-studio.event", entityId: event.id, entityVersion: event.revisionToken, capturedAt, staleState: "fresh" as const };
  const storyUnit = operations.createStoryUnit({
    projectId,
    title: "守夜记录核对",
    summary: "沈砚核对残页中的旧名；寄信人和精确时间仍未知。",
    sourceRefs: [sourceRef],
    items: [{ id: "story-item.watch-record", kind: "event-scope", authority: "author-intent", possibilityStatus: "selected-for-output", content: { summary: "核对旧名守夜记录", unknowns: ["寄信人", "精确世界时间"] }, sourceRefs: [sourceRef], createdBy: "author" }],
    unresolvedQuestionIds: ["unknown.sender", "unknown.world-time"]
  });
  const adapter = createWorkVersionBoundCreationFixtureAdapter({ operations, faultInjector });
  return { root, rootPath, stateFilePath, projectId, operations, adapter, event, storyUnit };
}

async function prepareHistorical(value: ReturnType<typeof fixture>) {
  value.adapter.createRoot(value.projectId);
  await value.adapter.createArtifact(value.projectId);
  value.adapter.saveArtifact(value.projectId);
  value.adapter.advanceRoot(value.projectId);
  const view = await value.adapter.read(value.projectId);
  assert.equal(view.root?.revision, 3);
  assert.equal(view.sourceValidation?.status, "historical_valid");
  return view;
}

test("Path A binds one existing OutputArtifact to root r1 and appends root r2 exactly once", async () => {
  const value = fixture();
  try {
    value.adapter.createRoot(value.projectId);
    const first = await value.adapter.createArtifact(value.projectId);
    const repeated = await value.adapter.createArtifact(value.projectId);
    const directReplay = value.operations.createOutputArtifact({
      projectId: value.projectId,
      type: first.type,
      title: first.title,
      sourceUnits: first.sourceUnits,
      generationBrief: first.generationBrief || undefined,
      content: "",
      structure: first.structure,
      workVersionSource: first.provenance.workVersionSource!,
      createdAt: first.createdAt
    });
    const view = await value.adapter.read(value.projectId);
    assert.equal(first.id, repeated.id);
    assert.equal(first.id, directReplay.id);
    assert.equal(value.operations.listOutputArtifacts({ projectId: value.projectId, includeArchived: true }).length, 1);
    assert.equal(view.root?.revision, 2);
    assert.equal(view.derivedVersionCount, 0);
    assert.equal(view.artifact?.provenance.workVersionSource?.pinnedRevision, 1);
    assert.equal(view.sourceValidation?.status, "current");
    assert.equal(view.recovery.pendingAppend, false);
    assert.equal(view.multiverseExpansion, "HOLD");
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("artifact save uses optimistic concurrency and duplicate operation creates no second revision", async () => {
  const value = fixture();
  try {
    value.adapter.createRoot(value.projectId);
    await value.adapter.createArtifact(value.projectId);
    const saved = value.adapter.saveArtifact(value.projectId);
    const repeated = value.adapter.saveArtifact(value.projectId);
    const directReplay = value.operations.updateOutputArtifact({
      projectId: value.projectId,
      artifactId: saved.id,
      expectedVersion: "stale-replay-version",
      title: saved.title,
      content: saved.content,
      structure: saved.structure,
      revisionOperationId: `author.creation-source.save-artifact-r2.r0:${value.projectId}`
    });
    const view = await value.adapter.read(value.projectId);
    assert.equal(saved.id, repeated.id);
    assert.equal(directReplay.conflict, false);
    assert.equal(directReplay.artifact.currentRevisionId, saved.currentRevisionId);
    assert.equal(view.revisionHistory?.revisions.length, 2);
    assert.equal(view.artifact?.currentRevisionId, saved.currentRevisionId);
    const conflict = value.operations.updateOutputArtifact({ projectId: value.projectId, artifactId: saved.id, expectedVersion: "0".repeat(64), content: "stale" });
    assert.equal(conflict.conflict, true);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("crash after artifact save reconciles only the missing WorkVersion append after restart", async () => {
  let injected = false;
  const value = fixture((boundary) => {
    if (boundary === "after-artifact-save" && !injected) { injected = true; throw new Error("fixture crash after artifact save"); }
  });
  try {
    value.adapter.createRoot(value.projectId);
    await assert.rejects(() => value.adapter.createArtifact(value.projectId), /fixture crash/);
    assert.equal(value.operations.listOutputArtifacts({ projectId: value.projectId, includeArchived: true }).length, 1);
    const restartedOperations = createStoryStudioWorkspaceOperations({ rootPath: value.rootPath, stateFilePath: value.stateFilePath });
    const restarted = createWorkVersionBoundCreationFixtureAdapter({ operations: restartedOperations });
    assert.equal(restarted.reconcile(value.projectId).reason, "appended-root-r2");
    assert.equal(restarted.reconcile(value.projectId).reason, "already-complete");
    const view = await restarted.read(value.projectId);
    assert.equal(view.root?.revision, 2);
    assert.equal(view.artifact?.provenance.workVersionSource?.pinnedRevision, 1);
    assert.equal(restartedOperations.listOutputArtifacts({ projectId: value.projectId, includeArchived: true }).length, 1);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("root source advance becomes historical, missing/corrupt fail closed, and archive stays valid", async () => {
  const value = fixture();
  try {
    value.adapter.createRoot(value.projectId);
    await value.adapter.createArtifact(value.projectId);
    value.adapter.saveArtifact(value.projectId);
    value.adapter.advanceRoot(value.projectId);
    const historical = await value.adapter.read(value.projectId);
    assert.equal(historical.root?.revision, 3);
    assert.equal(historical.sourceValidation?.status, "historical_valid");
    assert.equal(historical.sourceValidation?.sourceReadable, true);
    assert.equal((await value.adapter.read(value.projectId, { fixtureCase: "missing" })).sourceValidation?.sourceDependentOperationsAllowed, false);
    assert.equal((await value.adapter.read(value.projectId, { fixtureCase: "corrupt" })).sourceValidation?.status, "unverifiable_corrupt");
    value.adapter.archiveRoot(value.projectId);
    assert.equal((await value.adapter.read(value.projectId)).sourceValidation?.status, "archived_valid");
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("legacy OutputArtifact remains readable without automatic WorkVersion binding", async () => {
  const value = fixture();
  try {
    const legacy = value.operations.createOutputArtifact({ projectId: value.projectId, type: "novel", title: "早期创作稿" });
    const before = value.operations.readOutputArtifact({ projectId: value.projectId, artifactId: legacy.id });
    const view = await value.adapter.read(value.projectId);
    const after = value.operations.readOutputArtifact({ projectId: value.projectId, artifactId: legacy.id });
    assert.equal(view.legacyArtifact?.id, legacy.id);
    assert.equal(view.artifact, null);
    assert.equal(before.version, after.version);
    assert.equal(after.provenance.workVersionSource, null);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("Neutral Story Package WorkVersion source is deterministic", async () => {
  const value = fixture();
  try {
    const input = {
      projectRef: { projectId: value.projectId, title: "潮痕来信 · 创作来源隔离演示" },
      scope: { kind: "unit" as const, unitIds: [value.storyUnit.id], label: value.storyUnit.title },
      sourceRevision: { revisionId: "root:r1", revisionHash: "a".repeat(64), capturedAt: "2026-08-24T09:50:00.000Z", sourceOwners: ["story-unit", "event"], workVersion: { projectId: value.projectId, workVersionId: "work-version.root.fixture", kind: "root" as const, pinnedRevision: 1, manifestId: "work-version-manifest.fixture", manifestDigest: "b".repeat(64) } },
      storyUnits: [value.storyUnit], selectedUnitIds: [value.storyUnit.id], createdAt: "2026-08-24T09:50:00.000Z"
    };
    const first = await buildNeutralStoryPackage(input);
    const second = await buildNeutralStoryPackage(input);
    assert.equal(first.contentHash, second.contentHash);
    assert.equal(first.packageId, second.packageId);
    assert.deepEqual(first.sourceRevision.workVersion, input.sourceRevision.workVersion);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("source validation rejects derived binding before owner resolution", () => {
  const binding = {
    schemaVersion: "tianyan-work-version-output-artifact-source/r0" as const,
    sourceKind: "work-version" as const,
    projectId: "project.fixture",
    workVersionId: "work-version.derived.fixture",
    workVersionKind: "derived" as unknown as "root",
    pinnedRevision: 1,
    manifestId: "work-version-manifest.fixture",
    manifestDigest: "a".repeat(64),
    selectedStoryUnitRefs: [{ unitId: "unit.fixture", unitVersion: "v1" }],
    selectedEventRefs: [{ eventId: "event.fixture", eventRevision: "v1" }],
    sourceAnchorRefs: ["anchor.fixture"],
    neutralStoryPackageId: "package.fixture",
    neutralStoryPackageDigest: `sha256:${"b".repeat(64)}` as const,
    sourceOwnerReceiptRefs: ["receipt.fixture"],
    creationOperationReceipt: { operationId: "operation.fixture", idempotencyKey: "idempotency.fixture", payloadDigest: `sha256:${"c".repeat(64)}` as const },
    createdAt: "2026-08-24T10:00:00.000Z"
  };
  assert.throws(() => projectWorkVersionOutputArtifactSourceValidation({ binding, currentVersion: null, pinnedManifest: null, integrity: "missing" }), /root WorkVersion/);
});

test("historical_valid source uses the shared owner-referenced semantic compare primitive", async () => {
  const value = fixture();
  try {
    await prepareHistorical(value);
    const compare = await value.adapter.sourceDriftCompare(value.projectId);
    assert.equal(compare.schemaVersion, "tianyan-owner-referenced-semantic-compare/r0");
    assert.equal(compare.version, "tianyan-creation-source-drift-compare/r0");
    assert.equal(compare.baseRevision, 1);
    assert.equal(compare.currentRevision, 3);
    assert.equal(compare.status, "ready");
    assert.deepEqual(new Set(compare.differences.map((entry) => entry.kind)), new Set(["added", "removed", "changed", "unchanged", "unknown", "conflict", "missing"]));
    assert.ok(compare.ownerDigestChanges.some((entry) => entry.ownerKind === "event-hierarchy" && entry.changed));
    assert.ok(compare.differences.filter((entry) => entry.dimension.includes("Character") || ["WorldState", "Relation"].includes(entry.dimension)).every((entry) => !entry.authorConfirmable));
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("keep old source is a read-only choice with zero artifact or WorkVersion writes", async () => {
  const value = fixture();
  try {
    const before = await prepareHistorical(value);
    const compare = await value.adapter.sourceDriftCompare(value.projectId);
    const after = await value.adapter.read(value.projectId);
    assert.equal(compare.status, "ready");
    assert.equal(after.root?.revision, before.root?.revision);
    assert.equal(after.artifact?.currentRevisionId, before.artifact?.currentRevisionId);
    assert.equal(after.artifact?.provenance.workVersionSource?.pinnedRevision, 1);
    assert.equal(after.writes.outputArtifactRevisions, 0);
    assert.equal(after.writes.workVersionRevisions, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("author reconciliation appends one OutputArtifact revision pinned to r3 and root r4 without rewriting body", async () => {
  const value = fixture();
  try {
    const before = await prepareHistorical(value);
    const compare = await value.adapter.sourceDriftCompare(value.projectId);
    const oldHistory = value.operations.getDocumentRevisionHistory({ projectId: value.projectId, ref: { kind: "artifact", id: before.artifact!.id } });
    const oldRevisionId = oldHistory.revisions.at(-1)!.id;
    const oldPreview = value.operations.previewDocumentRevision({ projectId: value.projectId, ref: { kind: "artifact", id: before.artifact!.id }, revisionId: oldRevisionId });
    await value.adapter.reconcileSource(value.projectId, { selectedDifferenceIds: compare.confirmableDifferenceIds.slice(0, 2), expectedRootRevision: 3 });
    const after = await value.adapter.read(value.projectId);
    const newPreview = value.operations.previewDocumentRevision({ projectId: value.projectId, ref: { kind: "artifact", id: after.artifact!.id }, revisionId: oldRevisionId });
    assert.equal(after.root?.revision, 4);
    assert.equal(after.artifact?.provenance.workVersionSource?.pinnedRevision, 3);
    assert.equal(after.authorText, before.authorText);
    assert.equal(after.reconciliation?.status, "completed");
    assert.equal(after.reconciliation?.bodyUnchanged, true);
    assert.equal(after.package?.digest, after.artifact?.provenance.workVersionSource?.neutralStoryPackageDigest);
    assert.equal(after.reconciliation?.workVersionReceiptVerified, true);
    assert.equal(after.reconciliation?.receipt.fromRevision, 1);
    assert.equal(after.reconciliation?.receipt.toRevision, 3);
    assert.equal(after.revisionHistory?.revisions.length, 3);
    assert.equal(after.writes.outputArtifactRevisions, 1);
    assert.equal(after.writes.workVersionRevisions, 1);
    assert.deepEqual(newPreview.preview, oldPreview.preview);
    assert.deepEqual(after.writes, { outputArtifactRevisions: 1, workVersionRevisions: 1, provider: 0, plugin: 0, canon: 0, event: 0, worldState: 0, character: 0, relation: 0, session: 0, archive: 0, memory: 0 });
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("duplicate source reconciliation returns the same Artifact and WorkVersion revisions", async () => {
  const value = fixture();
  try {
    await prepareHistorical(value);
    const compare = await value.adapter.sourceDriftCompare(value.projectId);
    const selectedDifferenceIds = compare.confirmableDifferenceIds.slice(0, 2);
    const first = await value.adapter.reconcileSource(value.projectId, { selectedDifferenceIds, expectedRootRevision: 3 });
    const repeated = await value.adapter.reconcileSource(value.projectId, { selectedDifferenceIds, expectedRootRevision: 3 });
    const view = await value.adapter.read(value.projectId);
    assert.equal(first.currentRevisionId, repeated.currentRevisionId);
    assert.equal(view.root?.revision, 4);
    assert.equal(view.revisionHistory?.revisions.length, 3);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("root optimistic concurrency fails closed after compare with zero reconciliation writes", async () => {
  const value = fixture();
  try {
    const before = await prepareHistorical(value);
    const compare = await value.adapter.sourceDriftCompare(value.projectId);
    value.adapter.advanceRootForConcurrencyTest(value.projectId);
    await assert.rejects(() => value.adapter.reconcileSource(value.projectId, { selectedDifferenceIds: compare.confirmableDifferenceIds.slice(0, 1), expectedRootRevision: 3 }), /主线已再次更新/);
    const after = await value.adapter.read(value.projectId);
    assert.equal(after.root?.revision, 4);
    assert.equal(after.artifact?.currentRevisionId, before.artifact?.currentRevisionId);
    assert.equal(after.artifact?.provenance.workVersionSource?.pinnedRevision, 1);
    assert.equal(after.reconciliation, null);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("crash after Artifact reconciliation append recovers only root r4 after restart", async () => {
  let injected = false;
  const value = fixture((boundary) => {
    if (boundary === "after-source-reconciliation-artifact-append" && !injected) { injected = true; throw new Error("fixture crash after source reconciliation artifact append"); }
  });
  try {
    await prepareHistorical(value);
    const compare = await value.adapter.sourceDriftCompare(value.projectId);
    await assert.rejects(() => value.adapter.reconcileSource(value.projectId, { selectedDifferenceIds: compare.confirmableDifferenceIds.slice(0, 2), expectedRootRevision: 3 }), /fixture crash/);
    assert.equal((await value.adapter.read(value.projectId)).reconciliation?.status, "artifact_revision_appended");
    const restartedOperations = createStoryStudioWorkspaceOperations({ rootPath: value.rootPath, stateFilePath: value.stateFilePath });
    const restarted = createWorkVersionBoundCreationFixtureAdapter({ operations: restartedOperations });
    assert.equal(restarted.recoverSourceReconciliation(value.projectId).reason, "appended-root-r4");
    assert.equal(restarted.recoverSourceReconciliation(value.projectId).reason, "already-complete");
    const recovered = await restarted.read(value.projectId);
    assert.equal(recovered.root?.revision, 4);
    assert.equal(recovered.revisionHistory?.revisions.length, 3);
    assert.equal(recovered.reconciliation?.status, "completed");
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("lost response after WorkVersion append replays the same completed result", async () => {
  let injected = false;
  const value = fixture((boundary) => {
    if (boundary === "after-source-reconciliation-work-version-append" && !injected) { injected = true; throw new Error("fixture lost response after WorkVersion append"); }
  });
  try {
    await prepareHistorical(value);
    const compare = await value.adapter.sourceDriftCompare(value.projectId);
    const selectedDifferenceIds = compare.confirmableDifferenceIds.slice(0, 2);
    await assert.rejects(() => value.adapter.reconcileSource(value.projectId, { selectedDifferenceIds, expectedRootRevision: 3 }), /lost response/);
    const replay = await value.adapter.reconcileSource(value.projectId, { selectedDifferenceIds, expectedRootRevision: 3 });
    const view = await value.adapter.read(value.projectId);
    assert.equal(replay.currentRevisionId, view.artifact?.currentRevisionId);
    assert.equal(view.root?.revision, 4);
    assert.equal(view.revisionHistory?.revisions.length, 3);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("missing, corrupt and simulated concurrent compare states block author confirmation", async () => {
  const value = fixture();
  try {
    await prepareHistorical(value);
    const missing = await value.adapter.sourceDriftCompare(value.projectId, { fixtureCase: "missing" });
    const corrupt = await value.adapter.sourceDriftCompare(value.projectId, { fixtureCase: "corrupt" });
    const concurrency = await value.adapter.sourceDriftCompare(value.projectId, { fixtureCase: "concurrency" });
    assert.equal(missing.status, "blocked_missing_reference");
    assert.equal(corrupt.status, "blocked_corrupt_reference");
    assert.equal(concurrency.status, "blocked_concurrency");
    assert.equal(missing.confirmableDifferenceIds.length, 0);
    assert.equal(corrupt.confirmableDifferenceIds.length, 0);
    assert.equal(concurrency.confirmableDifferenceIds.length, 0);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("project-scoped Creation Source Port exposes the required owner-coordination contract", () => {
  const value = fixture();
  try {
    const port = createCreationSourceSelectionPort({
      operations: value.operations,
      canonReadProjection: {
        listVerifiedCanonEvents: () => ({ status: "ready", eventIds: [value.event.id], invalidRecordCount: 0 })
      }
    });
    for (const method of [
      "resolveActiveProject",
      "resolveRootWorkVersion",
      "validateWorkVersionSource",
      "buildNeutralStoryPackage",
      "createOrOpenOutputArtifact",
      "getArtifactSourceProjection",
      "compareArtifactSourceWithCurrentRoot",
      "keepPinnedSource",
      "prepareSourceReconciliation",
      "confirmSourceReconciliation",
      "recoverSourceState"
    ]) assert.equal(typeof port[method as keyof typeof port], "function", method);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});

test("normal project-scoped Artifact source persists no Nuwa runtime identity", async () => {
  const value = fixture();
  try {
    const port = createCreationSourceSelectionPort({
      operations: value.operations,
      canonReadProjection: {
        listVerifiedCanonEvents: () => ({ status: "ready", eventIds: [value.event.id], invalidRecordCount: 0 })
      }
    });
    port.createRoot(value.projectId);
    const artifact = await port.createArtifact(value.projectId, {
      storyUnitId: value.storyUnit.id,
      eventIds: [value.event.id]
    });
    const persisted = JSON.stringify(artifact);
    assert.doesNotMatch(persisted, /nuwaRunPack|nuwa-runpack|runId|temporaryBranchId|rehearsalStepId|simulationReceiptId/u);
    assert.equal(artifact.provenance.workVersionSource?.workVersionKind, "root");
    assert.equal(artifact.provenance.workVersionSource?.selectedStoryUnitRefs[0].unitId, value.storyUnit.id);
    assert.equal(artifact.provenance.workVersionSource?.selectedEventRefs[0].eventId, value.event.id);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
});
