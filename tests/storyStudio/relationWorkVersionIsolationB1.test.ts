import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createCreationSourceSelectionPort } from "../../apps/story-studio/server/creationSourceSelectionPort.mjs";
import { createStoryStudioRelationOperations } from "../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "relation-work-version-b1-"));
  const rootPath = path.join(root, "projects");
  const stateFilePath = path.join(root, "state.json");
  const projectId = "relation-work-version-b1";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "关系版本隔离", folderSlug: projectId });
  const source = workspace.createWorldObject({ projectId, type: "character", title: "阿芜" });
  const target = workspace.createWorldObject({ projectId, type: "character", title: "林昭" });
  const event = workspace.createWorldObject({ projectId, type: "event", title: "北闸前的约定", body: "阿芜只把北闸的消息告诉林昭。", status: "planned" });
  workspace.createStoryUnit({
    projectId,
    title: "北闸", summary: "两人确认北闸的消息。",
    sourceRefs: [{ sourceKind: "event-line", ownerId: "story-studio.event", entityId: event.id, entityVersion: event.revisionToken, capturedAt: "2026-09-09T12:00:00.000Z", staleState: "fresh" }],
    items: [{ id: "item.north-gate", kind: "event-scope", authority: "author-intent", possibilityStatus: "selected-for-output", content: { summary: "北闸消息" }, sourceRefs: [{ sourceKind: "event-line", ownerId: "story-studio.event", entityId: event.id, entityVersion: event.revisionToken, capturedAt: "2026-09-09T12:00:00.000Z", staleState: "fresh" }], createdBy: "author" }]
  });
  const relations = createStoryStudioRelationOperations({ workspaceOperations: workspace });
  const creation = createCreationSourceSelectionPort({ operations: workspace, relationOperations: relations });
  return { root, projectId, workspace, relations, creation, source, target };
}

test("B1 Relation Owner forks one relation identity into an IF slice without parent drift or cross-version replay", () => {
  const value = fixture();
  try {
    const root = value.creation.createRoot(value.projectId);
    const type = value.relations.createRelationType({ projectId: value.projectId, operationId: "relation-version.type", label: "信任" });
    const created = value.relations.createRelationCandidate({
      projectId: value.projectId,
      workVersionId: root.identity.workVersionId,
      relationId: "relation.awu-linzhao.trust",
      sourceObjectId: value.source.id,
      targetObjectId: value.target.id,
      relationTypeId: type.type.relationTypeId,
      direction: "both",
      operationId: "relation-version.main.create"
    });
    const main = value.relations.confirmRelationCandidate({
      projectId: value.projectId,
      workVersionId: root.identity.workVersionId,
      relationId: created.relation.relationId,
      expectedRelationRevision: created.relation.revision,
      operationId: "relation-version.main.confirm"
    });

    const derived = value.creation.createDerivedWorkVersion(value.projectId, {
      displayName: "阿芜把铜钥匙交给林昭",
      parentVersionId: root.identity.workVersionId,
      expectedParentRevision: root.identity.currentRevision,
      expectedParentManifestId: root.identity.headManifestId,
      authorActionId: "author.relation-version.create-if",
      idempotencyKey: "relation-version:create-if",
      createdAt: "2026-09-09T13:00:00.000Z"
    });
    const ifBefore = value.relations.readRelation({ projectId: value.projectId, workVersionId: derived.identity.workVersionId, relationId: main.relation.relationId }).relation;
    assert.equal(ifBefore.relationId, main.relation.relationId, "the IF keeps the same formal Relation identity");
    assert.equal(ifBefore.workVersionId, derived.identity.workVersionId);
    assert.equal(ifBefore.inheritedFromWorkVersionId, root.identity.workVersionId);
    assert.equal(ifBefore.reviewState, "confirmed");

    const ifArchived = value.relations.archiveConfirmedRelation({
      projectId: value.projectId,
      workVersionId: derived.identity.workVersionId,
      relationId: main.relation.relationId,
      expectedRelationRevision: ifBefore.revision,
      operationId: "relation-version.if.archive"
    });
    const ifArchiveReplay = value.relations.archiveConfirmedRelation({
      projectId: value.projectId,
      workVersionId: derived.identity.workVersionId,
      relationId: main.relation.relationId,
      expectedRelationRevision: ifBefore.revision,
      operationId: "relation-version.if.archive"
    });
    assert.equal(ifArchiveReplay.idempotent, true, "lost response recovery replays the IF receipt");
    assert.equal(ifArchiveReplay.receipt.receiptId, ifArchived.receipt.receiptId);
    assert.equal(value.relations.readRelation({ projectId: value.projectId, workVersionId: root.identity.workVersionId, relationId: main.relation.relationId }).relation.archived, false, "IF archive must not archive mainline");
    assert.throws(() => value.relations.archiveConfirmedRelation({
      projectId: value.projectId,
      workVersionId: root.identity.workVersionId,
      relationId: main.relation.relationId,
      expectedRelationRevision: main.relation.revision,
      operationId: "relation-version.if.archive"
    }), /another WorkVersion/u, "an idempotency key cannot silently bind the same relation id in another version");

    const mainArchived = value.relations.archiveConfirmedRelation({
      projectId: value.projectId,
      workVersionId: root.identity.workVersionId,
      relationId: main.relation.relationId,
      expectedRelationRevision: main.relation.revision,
      operationId: "relation-version.main.compensation"
    });
    assert.equal(mainArchived.relation.archived, true);
    assert.equal(value.relations.readRelation({ projectId: value.projectId, workVersionId: derived.identity.workVersionId, relationId: main.relation.relationId }).relation.revision, ifArchived.relation.revision, "a later parent compensation does not rewrite the frozen IF slice");

    const restarted = createStoryStudioRelationOperations({ workspaceOperations: value.workspace });
    assert.equal(restarted.readRelation({ projectId: value.projectId, workVersionId: root.identity.workVersionId, relationId: main.relation.relationId }).relation.archived, true);
    assert.equal(restarted.readRelation({ projectId: value.projectId, workVersionId: derived.identity.workVersionId, relationId: main.relation.relationId }).relation.archived, true, "both explicit version slices survive restart without a global relation lookup");
    assert.equal(restarted.listRelations({ projectId: value.projectId, workVersionId: derived.identity.workVersionId, includeArchived: true }).relations.length, 1);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});
