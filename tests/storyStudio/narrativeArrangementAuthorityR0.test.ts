import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { createWorkspacePackagePort } from "../../src/storyWorkspace/workspacePackagePort.mjs";
import { readWorkspaceNote } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";
import { WORK_VERSION_REQUIRED_OWNER_KINDS, createStoryStudioWorkVersionAuthority } from "../../src/storyWorkspace/workVersionAuthority.ts";
import { resolveWorkVersionOwnerSnapshotRefs, type WorkVersionOwnerProjectionBundle } from "../../src/storyWorkspace/workVersionSnapshotResolver.ts";

const PROJECT_ID = "narrative-arrangement-authority-r0";
const NOW = "2026-09-03T01:00:00.000Z";
const ARRANGEMENT_KEY = "narrative_arrangements_r0";
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

function completeOwnerRefs(seed: string) {
  const bundle = Object.fromEntries(WORK_VERSION_REQUIRED_OWNER_KINDS.map((ownerKind, index) => [ownerKind, {
    ownerIdentity: `${ownerKind}.${PROJECT_ID}`,
    projectionSchemaVersion: `${ownerKind}/fixture-v1`,
    revisionToken: `${seed}.revision.${index + 1}`,
    stableReferenceIds: [`${ownerKind}.ref.${PROJECT_ID}`],
    provenanceReceiptIds: [`receipt.${ownerKind}.${seed}`],
    canonicalProjection: { ownerKind, seed, fixture: PROJECT_ID }
  }])) as WorkVersionOwnerProjectionBundle;
  return resolveWorkVersionOwnerSnapshotRefs(bundle);
}

function fixture() {
  const fixtureRoot = mkdtempSync(path.join(os.tmpdir(), "tianyan-narrative-arrangement-r0-"));
  const sourceLibrary = path.join(fixtureRoot, "source");
  const targetLibrary = path.join(fixtureRoot, "target");
  const backupRoot = path.join(fixtureRoot, "backup");
  mkdirSync(sourceLibrary);
  mkdirSync(targetLibrary);
  mkdirSync(backupRoot);
  const stateFilePath = path.join(fixtureRoot, "source-state.json");
  const operations = createStoryStudioWorkspaceOperations({ rootPath: sourceLibrary, stateFilePath });
  operations.createProject({ title: "叙事编排权威夹具", folderSlug: PROJECT_ID });
  const eventA = operations.createWorldObject({ projectId: PROJECT_ID, type: "event", title: "A 后发生但先讲", status: "planned", body: "# A 后发生但先讲\n\nworld_time: 2049-05-02\n" });
  const eventZ = operations.createWorldObject({ projectId: PROJECT_ID, type: "event", title: "Z 先发生但后讲", status: "planned", body: "# Z 先发生但后讲\n\nworld_time: 2049-05-01\n" });
  const eventRepeat = operations.createWorldObject({ projectId: PROJECT_ID, type: "event", title: "重复揭示", status: "planned" });
  const main = operations.createStoryUnit({ projectId: PROJECT_ID, title: "主路径一", order: 0, linkedEntityIds: [eventZ.id, eventA.id, eventRepeat.id] });
  const next = operations.createStoryUnit({ projectId: PROJECT_ID, title: "主路径二", order: 1, linkedEntityIds: [eventZ.id, eventA.id, eventRepeat.id] });
  const branchA = operations.createStoryUnit({ projectId: PROJECT_ID, title: "分支 A", kind: "branch", parentUnitId: main.id, branchPointEventId: eventZ.id, order: 2, linkedEntityIds: [eventRepeat.id] });
  const branchB = operations.createStoryUnit({ projectId: PROJECT_ID, title: "分支 B", kind: "branch", parentUnitId: main.id, branchPointEventId: eventZ.id, order: 3, linkedEntityIds: [eventRepeat.id] });
  const projectPath = operations.resolveProjectWorkspacePath({ projectId: PROJECT_ID });
  const rootVersion = createStoryStudioWorkVersionAuthority({ projectRoot: projectPath }).createRootCheckpoint({
    displayName: "叙事编排主作品",
    authorActionId: "author.work-version.root",
    idempotencyKey: "idempotency.work-version.root",
    expectedRevision: 0,
    createdAt: NOW,
    ownerSnapshotRefs: completeOwnerRefs("root"),
    optionalNuwaProvenanceRefs: []
  });
  return { fixtureRoot, sourceLibrary, targetLibrary, backupRoot, stateFilePath, operations, projectPath, workVersionId: rootVersion.identity.workVersionId, eventA, eventZ, eventRepeat, main, next, branchA, branchB };
}

function mutationBase(value: ReturnType<typeof fixture>, read: ReturnType<ReturnType<typeof createStoryStudioWorkspaceOperations>["readNarrativeArrangement"]>, operationId: string, second: number) {
  return {
    projectId: PROJECT_ID,
    workVersionId: value.workVersionId,
    narrativePathId: value.main.id,
    expectedOwnerVersion: read.ownerVersion!,
    expectedRevision: read.arrangement!.currentRevision,
    operationId,
    authorActionId: `author.${operationId}`,
    sourceKind: "author-action" as const,
    sourceRef: `author-action:author.${operationId}`,
    createdAt: `2026-09-03T01:00:${String(second).padStart(2, "0")}.000Z`
  };
}

test("Story Unit owner persists formal order, optimistic conflicts, receipts, rollback and cross-Unit movement without touching Event facts", () => {
  const value = fixture();
  try {
    const ownerBeforeLegacyRead = readFileSync(path.join(value.projectPath, value.main.relativeId), "utf8");
    const legacy = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id });
    assert.equal(legacy.arrangement, null);
    assert.deepEqual(legacy.projection.placed, []);
    assert.deepEqual(new Set(Object.keys(legacy.projection.unplaced)), new Set([value.eventA.id, value.eventZ.id, value.eventRepeat.id]));
    assert.equal(readFileSync(path.join(value.projectPath, value.main.relativeId), "utf8"), ownerBeforeLegacyRead, "legacy read must not write");

    const created = value.operations.createNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id, ownerStoryUnitId: value.main.id, expectedOwnerVersion: value.main.version, expectedRevision: 0, operationId: "arrangement.main.create", authorActionId: "author.arrangement.main.create", createdAt: NOW });
    assert.equal(created.conflict, false);
    assert.equal(created.arrangement?.sourceLineageId, value.workVersionId);
    assert.equal(created.receipt?.action, "create");

    let read = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id });
    const insertZInput = { ...mutationBase(value, read, "insert.event-z", 1), eventId: value.eventZ.id, storyUnitId: value.main.id, role: "primary" as const, position: { kind: "end" as const } };
    const insertedZ = value.operations.insertNarrativePlacement(insertZInput);
    assert.equal(insertedZ.conflict, false);
    assert.equal(insertedZ.receipt?.beforeRevision, 1);
    assert.equal(insertedZ.receipt?.afterRevision, 2);
    const replayedZ = value.operations.insertNarrativePlacement(insertZInput);
    assert.equal(replayedZ.conflict, false);
    assert.equal(replayedZ.replayed, true);
    assert.equal(replayedZ.receipt?.receiptId, insertedZ.receipt?.receiptId);

    read = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id });
    const insertedA = value.operations.insertNarrativePlacement({ ...mutationBase(value, read, "insert.event-a.before-z", 2), eventId: value.eventA.id, storyUnitId: value.main.id, role: "flashback", position: { kind: "before", anchorPlacementId: insertedZ.receipt!.afterPlacementIds[0]! } });
    assert.equal(insertedA.conflict, false);
    read = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id });
    assert.deepEqual(read.projection.placed.map((placement) => placement.eventId), [value.eventA.id, value.eventZ.id], "author order must beat Event id and world time");

    const eventBeforeMove = value.operations.readWorldObject({ projectId: PROJECT_ID, objectId: value.eventZ.id });
    const linkedBeforeMove = value.operations.readStoryUnit({ projectId: PROJECT_ID, unitId: value.main.id }).linkedEntityIds;
    const moved = value.operations.moveNarrativePlacement({ ...mutationBase(value, read, "move.event-z.cross-unit", 3), placementId: insertedZ.receipt!.afterPlacementIds[0]!, storyUnitId: value.next.id, position: { kind: "start" } });
    assert.equal(moved.conflict, false);
    const eventAfterMove = value.operations.readWorldObject({ projectId: PROJECT_ID, objectId: value.eventZ.id });
    assert.equal(eventAfterMove.revisionToken, eventBeforeMove.revisionToken);
    assert.equal(eventAfterMove.body, eventBeforeMove.body);
    assert.deepEqual(value.operations.readStoryUnit({ projectId: PROJECT_ID, unitId: value.main.id }).linkedEntityIds, linkedBeforeMove);
    read = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id });
    assert.deepEqual(read.projection.placed.map((placement) => [placement.eventId, placement.storyUnitId]), [[value.eventA.id, value.main.id], [value.eventZ.id, value.next.id]]);

    const staleRevision = value.operations.removeNarrativePlacement({ ...mutationBase(value, read, "remove.stale-revision", 4), expectedRevision: 2, placementId: insertedZ.receipt!.afterPlacementIds[0]! });
    assert.equal(staleRevision.conflict, true);
    assert.equal(staleRevision.code, "stale-arrangement-revision");
    const badAnchor = value.operations.moveNarrativePlacement({ ...mutationBase(value, read, "move.bad-anchor", 5), placementId: insertedZ.receipt!.afterPlacementIds[0]!, storyUnitId: value.next.id, position: { kind: "after", anchorPlacementId: "placement.missing" } });
    assert.equal(badAnchor.conflict, true);
    assert.equal(badAnchor.code, "anchor-not-found");

    const beforeOtherSave = readWorkspaceNote(value.projectPath, value.main.relativeId);
    const arrangementPayloadBefore = beforeOtherSave.frontmatter[ARRANGEMENT_KEY];
    const savedUnit = value.operations.updateStoryUnit({ projectId: PROJECT_ID, unitId: value.main.id, expectedVersion: beforeOtherSave.contentHash, summary: "普通 Story Unit 保存仍保留未知顶层编排 payload。" });
    assert.equal(savedUnit.conflict, false);
    const afterOtherSave = readWorkspaceNote(value.projectPath, value.main.relativeId);
    assert.equal(afterOtherSave.frontmatter[ARRANGEMENT_KEY], arrangementPayloadBefore, "ordinary Story Unit save must preserve the new payload byte-for-byte");
    const staleOwner = value.operations.removeNarrativePlacement({ ...mutationBase(value, read, "remove.stale-owner", 6), placementId: insertedZ.receipt!.afterPlacementIds[0]! });
    assert.equal(staleOwner.conflict, true);
    assert.equal(staleOwner.code, "stale-owner-version");

    read = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id });
    const removed = value.operations.removeNarrativePlacement({ ...mutationBase(value, read, "remove.event-z", 7), placementId: insertedZ.receipt!.afterPlacementIds[0]! });
    assert.equal(removed.conflict, false);
    read = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id });
    assert.deepEqual(read.projection.placed.map((placement) => placement.eventId), [value.eventA.id]);
    const rolledBack = value.operations.rollbackNarrativeArrangement({ ...mutationBase(value, read, "rollback.before-remove", 8), targetRevision: moved.arrangement!.currentRevision });
    assert.equal(rolledBack.conflict, false);
    assert.equal(rolledBack.receipt?.rollbackOfRevision, moved.arrangement!.currentRevision);
    read = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id });
    assert.deepEqual(read.projection.placed.map((placement) => [placement.eventId, placement.storyUnitId]), [[value.eventA.id, value.main.id], [value.eventZ.id, value.next.id]]);
  } finally {
    rmSync(value.fixtureRoot, { recursive: true, force: true });
  }
});

test("existing Story Unit branch identities isolate arrangements and reject implicit merge", () => {
  const value = fixture();
  try {
    const createBranch = (unit: typeof value.branchA, suffix: string) => value.operations.createNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: unit.id, ownerStoryUnitId: unit.id, expectedOwnerVersion: unit.version, expectedRevision: 0, operationId: `arrangement.branch.${suffix}.create`, authorActionId: `author.branch.${suffix}.create`, createdAt: NOW });
    assert.equal(createBranch(value.branchA, "a").conflict, false);
    assert.equal(createBranch(value.branchB, "b").conflict, false);
    let readA = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.branchA.id });
    let readB = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.branchB.id });
    const insertA = value.operations.insertNarrativePlacement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.branchA.id, expectedOwnerVersion: readA.ownerVersion!, expectedRevision: readA.arrangement!.currentRevision, operationId: "branch.a.insert", authorActionId: "author.branch.a.insert", sourceKind: "author-action", sourceRef: "author-action:branch-a", createdAt: "2026-09-03T01:01:00.000Z", eventId: value.eventRepeat.id, storyUnitId: value.branchA.id, role: "recap", position: { kind: "end" } });
    const insertB = value.operations.insertNarrativePlacement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.branchB.id, expectedOwnerVersion: readB.ownerVersion!, expectedRevision: readB.arrangement!.currentRevision, operationId: "branch.b.insert", authorActionId: "author.branch.b.insert", sourceKind: "author-action", sourceRef: "author-action:branch-b", createdAt: "2026-09-03T01:01:01.000Z", eventId: value.eventRepeat.id, storyUnitId: value.branchB.id, role: "reinterpretation", position: { kind: "end" } });
    assert.equal(insertA.conflict, false);
    assert.equal(insertB.conflict, false);
    readA = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.branchA.id });
    readB = value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.branchB.id });
    assert.notEqual(readA.arrangement?.arrangementId, readB.arrangement?.arrangementId);
    assert.equal(readA.projection.placed[0]?.role, "recap");
    assert.equal(readB.projection.placed[0]?.role, "reinterpretation");
    const branchBRevision = readB.arrangement!.currentRevision;
    const implicitMerge = value.operations.moveNarrativePlacement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.branchA.id, expectedOwnerVersion: readA.ownerVersion!, expectedRevision: readA.arrangement!.currentRevision, operationId: "branch.a.implicit-merge", authorActionId: "author.branch.a.implicit-merge", sourceKind: "author-action", sourceRef: "author-action:branch-a-merge", createdAt: "2026-09-03T01:01:02.000Z", placementId: readA.projection.placed[0]!.placementId, storyUnitId: value.branchB.id, position: { kind: "end" } });
    assert.equal(implicitMerge.conflict, true);
    assert.equal(implicitMerge.code, "branch-mismatch");
    assert.equal(value.operations.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.branchB.id }).arrangement?.currentRevision, branchBRevision);
  } finally {
    rmSync(value.fixtureRoot, { recursive: true, force: true });
  }
});

test("NarrativeArrangement survives portable export/import as Story Unit-owned data", () => {
  const value = fixture();
  try {
    const created = value.operations.createNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id, ownerStoryUnitId: value.main.id, expectedOwnerVersion: value.main.version, expectedRevision: 0, operationId: "arrangement.portable.create", authorActionId: "author.arrangement.portable.create", createdAt: NOW });
    assert.equal(created.conflict, false);
    const inserted = value.operations.insertNarrativePlacement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id, expectedOwnerVersion: created.ownerVersion, expectedRevision: created.arrangement!.currentRevision, operationId: "arrangement.portable.insert", authorActionId: "author.arrangement.portable.insert", sourceKind: "author-action", sourceRef: "author-action:portable", createdAt: "2026-09-03T01:02:00.000Z", eventId: value.eventA.id, storyUnitId: value.main.id, role: "primary", position: { kind: "end" } });
    assert.equal(inserted.conflict, false);

    const sourcePort = createWorkspacePackagePort({ libraryRoot: value.sourceLibrary, backupRoot: value.backupRoot, resolveProjectPath: ({ projectId }: { projectId: string }) => path.join(value.sourceLibrary, projectId) });
    const exported = sourcePort.exportProject({ projectId: PROJECT_ID, workVersionIds: [value.workVersionId] });
    const packageText = readFileSync(exported.packagePath, "utf8");
    const targetPort = createWorkspacePackagePort({ libraryRoot: value.targetLibrary, resolveProjectPath: ({ projectId }: { projectId: string }) => path.join(value.targetLibrary, projectId) });
    targetPort.importProject({ packageText });
    const imported = createStoryStudioWorkspaceOperations({ rootPath: value.targetLibrary, stateFilePath: path.join(value.fixtureRoot, "target-state.json") });
    const read = imported.readNarrativeArrangement({ projectId: PROJECT_ID, workVersionId: value.workVersionId, narrativePathId: value.main.id });
    assert.equal(read.arrangement?.currentVersion, inserted.arrangement?.currentVersion);
    assert.deepEqual(read.projection.placed.map((placement) => placement.eventId), [value.eventA.id]);
    assert.equal(read.projection.conflicts.length, 0);
  } finally {
    rmSync(value.fixtureRoot, { recursive: true, force: true });
  }
});

test("production sources keep Event/Canon/WorldState/Relation and browser storage out of narrative ownership", () => {
  const operationsSource = readFileSync("src/storyControlSurface/storyStudioWorkspaceOperations.ts", "utf8");
  const transportSource = readFileSync("apps/story-studio/src/lib/localTransport.ts", "utf8");
  const contractSource = readFileSync("src/storyContracts/narrativeArrangement.ts", "utf8");
  assert.match(operationsSource, /NARRATIVE_ARRANGEMENT_FRONTMATTER_KEY = "narrative_arrangements_r0"/u);
  assert.doesNotMatch(contractSource, /eventBody|eventTitle|worldTime|canon|worldState|relationId/iu);
  assert.doesNotMatch([operationsSource, transportSource].join("\n"), /localStorage[^\n]*narrative|narrative[^\n]*localStorage/iu);
  assert.equal(digest(readFileSync("apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx", "utf8")).length, 64);
});
