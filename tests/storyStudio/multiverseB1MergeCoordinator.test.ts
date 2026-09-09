import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCreationSourceSelectionPort } from "../../apps/story-studio/server/creationSourceSelectionPort.mjs";
import { createMultiverseB1MergeCoordinator } from "../../src/storyControlSurface/multiverseB1MergeCoordinator.ts";
import { createStoryStudioRelationOperations } from "../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";
import { compareMultiverseB1Versions, type MultiverseVersionSnapshot } from "../../src/storyWorkspace/multiverseB1.ts";

function fixture() {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "multiverse-b1-owner-"));
  const rootPath = path.join(tempRoot, "projects");
  const projectId = "multiverse-b1-owner";
  const operations = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath: path.join(tempRoot, "state.json") });
  operations.createProject({ title: "铜钥匙融入隔离故事", folderSlug: projectId });
  const awu = operations.createWorldObject({ projectId, type: "character", title: "阿芜" });
  const lin = operations.createWorldObject({ projectId, type: "character", title: "林昭" });
  let key = operations.createWorldObject({ projectId, type: "item", title: "铜钥匙" });
  const seed = operations.createWorldObject({ projectId, type: "event", title: "北闸旧闻", body: "北闸的封闭消息仍未向所有人公开。", status: "planned" });
  const sourceRef = { sourceKind: "event-line" as const, ownerId: "story-studio.event", entityId: seed.id, entityVersion: seed.revisionToken, capturedAt: "2026-09-09T14:00:00.000Z", staleState: "fresh" as const };
  const unit = operations.createStoryUnit({ projectId, title: "北闸替代路线", summary: "阿芜和林昭处理铜钥匙。", sourceRefs: [sourceRef], items: [{ id: "story-item.key", kind: "event-scope", authority: "author-intent", possibilityStatus: "selected-for-output", content: { summary: "铜钥匙交接" }, sourceRefs: [sourceRef], createdBy: "author" }] });
  const relations = createStoryStudioRelationOperations({ workspaceOperations: operations });
  const creation = createCreationSourceSelectionPort({ operations, relationOperations: relations });
  const rootVersion = creation.createRoot(projectId);
  const trust = relations.createRelationType({ projectId, operationId: "b1-owner.trust-type", label: "信任" });
  const derived = creation.createDerivedWorkVersion(projectId, { displayName: "阿芜持有铜钥匙", parentVersionId: rootVersion.identity.workVersionId, expectedParentRevision: rootVersion.identity.currentRevision, expectedParentManifestId: rootVersion.identity.headManifestId, authorActionId: "author.b1-owner.if", idempotencyKey: "b1-owner:create-if", createdAt: "2026-09-09T14:01:00.000Z" });
  key = operations.readWorldObject({ projectId, objectId: key.id });
  const sourceEvent = operations.createConfirmedEventOnce({ projectId, workVersionId: derived.identity.workVersionId, targetEventRef: "event.author-confirmed-111111111111111111111111", title: "阿芜把铜钥匙交给林昭", body: "阿芜只把铜钥匙交给林昭，并说明北闸已封。", provenance: { sourceChangeSetId: "b1-owner-source", sourceChangeSetRevision: "a".repeat(64), authorDecisionRef: "author.b1-owner.if", applyOperationKey: "b1-owner.if-event", intentHash: "b".repeat(64) }, operationId: "b1-owner.if-event" }).event!;
  const sourceRelation = relations.createRelationCandidate({ projectId, workVersionId: derived.identity.workVersionId, relationId: "relation.awu-lin.trust", sourceObjectId: awu.id, targetObjectId: lin.id, relationTypeId: trust.type.relationTypeId, direction: "both", operationId: "b1-owner.if-relation" });
  relations.confirmRelationCandidate({ projectId, workVersionId: derived.identity.workVersionId, relationId: sourceRelation.relation.relationId, expectedRelationRevision: sourceRelation.relation.revision, operationId: "b1-owner.if-relation-confirm" });
  operations.applyWorldStateN4({ projectId, objectId: key.id, workVersionId: derived.identity.workVersionId, expectedObjectRevision: key.revisionToken, expectedRevision: 0, operationId: "b1-owner.if-state", effectiveAt: "2026-09-09T14:02:00.000Z", value: { kind: "holder", state: "held", holder: { id: lin.id, revision: lin.revisionToken } }, evidence: { kind: "confirmed-event", event: { id: sourceEvent.id, revision: sourceEvent.revisionToken } }, now: "2026-09-09T14:02:00.000Z" });
  const sourceUnit = operations.readStoryUnit({ projectId, unitId: unit.id });
  operations.createNarrativeArrangement({ projectId, workVersionId: derived.identity.workVersionId, narrativePathId: unit.id, ownerStoryUnitId: unit.id, expectedOwnerVersion: sourceUnit.version, expectedRevision: 0, operationId: "b1-owner.if-arrangement", authorActionId: "author.b1-owner.if", createdAt: "2026-09-09T14:02:00.000Z" });
  const arrangement = operations.readNarrativeArrangement({ projectId, workVersionId: derived.identity.workVersionId, narrativePathId: unit.id });
  operations.insertNarrativePlacement({ projectId, workVersionId: derived.identity.workVersionId, narrativePathId: unit.id, expectedOwnerVersion: arrangement.ownerVersion, expectedRevision: 0, operationId: "b1-owner.if-placement", authorActionId: "author.b1-owner.if", sourceKind: "author-action", sourceRef: "b1-owner-if", createdAt: "2026-09-09T14:02:00.000Z", eventId: sourceEvent.id, storyUnitId: unit.id, role: "primary", position: { kind: "end" } });
  const root = creation.resolveWorkVersion(projectId, rootVersion.identity.workVersionId);
  const source = creation.resolveWorkVersion(projectId, derived.identity.workVersionId);
  const empty = () => ({ Event: [], Relation: [], WorldState: [], NarrativePlacement: [] });
  const base: MultiverseVersionSnapshot = { projectId, workVersionId: root.identity.workVersionId, revision: root.identity.currentRevision, manifestDigest: root.manifest.canonicalDigest, objects: empty() };
  const sourceSnapshot: MultiverseVersionSnapshot = { projectId, workVersionId: source.identity.workVersionId, revision: source.identity.currentRevision, manifestDigest: source.manifest.canonicalDigest, objects: {
    Event: [{ id: sourceEvent.id, value: { title: sourceEvent.title, body: sourceEvent.body }, sourceRefs: [sourceEvent.id] }],
    Relation: [{ id: sourceRelation.relation.relationId, value: { sourceObjectId: awu.id, targetObjectId: lin.id, relationTypeId: trust.type.relationTypeId, direction: "both" }, sourceRefs: [sourceEvent.id] }],
    WorldState: [{ id: "state.copper-key", value: { objectId: key.id, supportingEventId: sourceEvent.id, value: { kind: "holder", state: "held", holder: { id: lin.id, revision: lin.revisionToken } } }, sourceRefs: [sourceEvent.id], dependencyIds: [sourceEvent.id] }],
    NarrativePlacement: [{ id: "placement.copper-key", value: { narrativePathId: unit.id, eventId: sourceEvent.id, role: "primary", position: { kind: "end" } }, sourceRefs: [sourceEvent.id], dependencyIds: [sourceEvent.id] }]
  } };
  const target: MultiverseVersionSnapshot = { ...base, objects: empty() };
  return { tempRoot, projectId, operations, relations, creation, rootVersion, derived, sourceEvent, sourceRelation, key, unit, comparison: compareMultiverseB1Versions({ base, source: sourceSnapshot, target }) };
}

test("B1-C materializes selected Owner facts, recovers a lost response, and compensates without changing the IF", () => {
  const value = fixture();
  try {
    let failOnce = true;
    const interrupted = createMultiverseB1MergeCoordinator({ operations: { ...value.operations, applyWorldStateN4: (input: unknown) => { if (failOnce) { failOnce = false; throw new Error("simulated dropped response before WorldState receipt"); } return value.operations.applyWorldStateN4(input as any); } }, relationOperations: value.relations, creationSourcePort: value.creation });
    const request = { comparison: value.comparison, selectedChangeIds: value.comparison.differences.filter((item) => item.selection === "available").map((item) => item.changeId), operationId: "b1-owner.merge", idempotencyKey: "b1-owner.merge-key", authorActionId: "author.b1-owner.merge", createdAt: "2026-09-09T14:03:00.000Z" };
    assert.throws(() => interrupted.apply(request), /simulated dropped response/);
    const stored = interrupted.read({ projectId: value.projectId, idempotencyKey: request.idempotencyKey });
    assert.equal(stored?.status, "recovery-required");
    assert.equal(stored?.ownerReceipts.some((item) => item.ownerKind === "Event"), true);
    const coordinator = createMultiverseB1MergeCoordinator({ operations: value.operations, relationOperations: value.relations, creationSourcePort: value.creation });
    const applied = coordinator.apply(request);
    const replay = coordinator.apply(request);
    assert.equal(applied.status, "applied");
    assert.equal(replay.resultVersion?.revision, applied.resultVersion?.revision, "same request recovers the durable result rather than writing twice");
    const mergedRelation = value.relations.readRelation({ projectId: value.projectId, workVersionId: value.rootVersion.identity.workVersionId, relationId: value.sourceRelation.relation.relationId }).relation;
    assert.equal(mergedRelation.reviewState, "confirmed");
    const rootState = value.operations.readWorldStateN4({ projectId: value.projectId, objectId: value.key.id, workVersionId: value.rootVersion.identity.workVersionId, observedAt: "2026-09-09T14:04:00.000Z" });
    assert.equal(rootState.history.length, 1);
    const rootArrangement = value.operations.readNarrativeArrangement({ projectId: value.projectId, workVersionId: value.rootVersion.identity.workVersionId, narrativePathId: value.unit.id });
    assert.equal(rootArrangement.arrangement?.currentRevision, 2, "creation is revision 1 and the selected placement is revision 2");
    assert.equal(rootArrangement.projection.placed.length, 1);
    assert.equal(value.relations.readRelation({ projectId: value.projectId, workVersionId: value.derived.identity.workVersionId, relationId: value.sourceRelation.relation.relationId }).relation.archived, false, "root merge cannot mutate IF relation");
    assert.equal(value.operations.readWorldStateN4({ projectId: value.projectId, objectId: value.key.id, workVersionId: value.derived.identity.workVersionId, observedAt: "2026-09-09T14:04:00.000Z" }).history.length, 1, "root merge cannot mutate IF state");
    let compensationFailsOnce = true;
    const interruptedCompensation = createMultiverseB1MergeCoordinator({ operations: value.operations, relationOperations: { ...value.relations, archiveConfirmedRelation: (input: unknown) => { if (compensationFailsOnce) { compensationFailsOnce = false; throw new Error("simulated dropped response before Relation compensation receipt"); } return value.relations.archiveConfirmedRelation(input as any); } }, creationSourcePort: value.creation });
    const compensationRequest = { projectId: value.projectId, idempotencyKey: request.idempotencyKey, operationId: "b1-owner.compensate", authorActionId: "author.b1-owner.compensate", createdAt: "2026-09-09T14:05:00.000Z" };
    assert.throws(() => interruptedCompensation.compensate(compensationRequest), /simulated dropped response/);
    assert.equal(interruptedCompensation.read({ projectId: value.projectId, idempotencyKey: request.idempotencyKey })?.status, "recovery-required");
    const compensated = coordinator.compensate(compensationRequest);
    assert.equal(compensated.status, "compensated");
    assert.equal(value.relations.readRelation({ projectId: value.projectId, workVersionId: value.rootVersion.identity.workVersionId, relationId: value.sourceRelation.relation.relationId }).relation.archived, true);
    const rolledBackArrangement = value.operations.readNarrativeArrangement({ projectId: value.projectId, workVersionId: value.rootVersion.identity.workVersionId, narrativePathId: value.unit.id });
    assert.equal(rolledBackArrangement.arrangement?.currentRevision, 3, "rollback is a later auditable narrative revision");
    assert.equal(rolledBackArrangement.projection.placed.length, 0);
    const restored = value.operations.readWorldStateN4({ projectId: value.projectId, objectId: value.key.id, workVersionId: value.rootVersion.identity.workVersionId, observedAt: "2026-09-09T14:06:00.000Z" });
    assert.equal(restored.history.length, 2);
    assert.equal(restored.history.at(-1)?.compensatesChangeId, rootState.history[0]?.changeId);
    assert.equal(value.relations.readRelation({ projectId: value.projectId, workVersionId: value.derived.identity.workVersionId, relationId: value.sourceRelation.relation.relationId }).relation.archived, false, "compensation retains IF evidence");
  } finally { rmSync(value.tempRoot, { recursive: true, force: true }); }
});
