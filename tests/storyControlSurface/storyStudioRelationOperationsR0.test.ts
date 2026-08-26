import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioRelationOperations } from "../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { importSourceDocumentR0 } from "../../src/storyControlSurface/sourceImportReviewR0.ts";
import { createStoryWorkspace, createWorkspaceNote } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function createFixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-relation-evidence-r0-"));
  const project = createStoryWorkspace({ rootPath, title: "Relation evidence" });
  const projectId = "relation-evidence";
  const sourceObject = createWorkspaceNote(rootPath, { id: "character.source", type: "character", title: "来源", status: "active", body: "# 来源\n" });
  const targetObject = createWorkspaceNote(rootPath, { id: "character.target", type: "character", title: "目标", status: "active", body: "# 目标\n" });
  const sourceDocument = importSourceDocumentR0({ projectPath: rootPath, projectId, filename: "evidence.md", content: "# 线索\n原文锚点\n" }).document;
  const revision = sourceDocument.revisions[0];
  const segment = revision.segments.find((item) => item.text === "原文锚点")!;
  const anchor = {
    sourceDocumentId: sourceDocument.sourceDocumentId,
    revisionId: revision.revisionId,
    revisionHash: revision.revisionHash,
    lineStart: segment.lineStart,
    lineEnd: segment.lineEnd,
    charStart: segment.charStart,
    charEnd: segment.charEnd,
    excerptHash: sha256(segment.text),
    excerpt: segment.text,
    blockId: segment.blockId
  };
  let canonVerified = true;
  const workspaceOperations = {
    resolveProjectWorkspacePath: ({ projectId }: { projectId: string }) => {
      assert.equal(projectId, "relation-evidence");
      return rootPath;
    },
    readWorldObject: ({ projectId, objectId }: { projectId: string; objectId: string }) => {
      assert.equal(projectId, "relation-evidence");
      return { id: objectId, type: "event", status: "committed", revisionToken: "b".repeat(64) };
    }
  };
  const operations = createStoryStudioRelationOperations({
    workspaceOperations,
    verifyCanonEventRead: () => canonVerified
  });
  return { rootPath, project, projectId, sourceObject, targetObject, sourceDocument, anchor, operations, setCanonVerified: (value: boolean) => { canonVerified = value; } };
}

test("SourceAnchor and confirmed Event evidence are re-read, freshness-guarded, and never write Canon/Event/WorldState", () => {
  const fixture = createFixture();
  const type = fixture.operations.createRelationType({ projectId: fixture.projectId, operationId: "type.evidence", label: "证实" });
  const sourceCandidate = fixture.operations.createRelationCandidate({
    projectId: fixture.projectId,
    operationId: "relation.source.current",
    sourceObjectId: fixture.sourceObject.id,
    targetObjectId: fixture.targetObject.id,
    relationTypeId: type.type.relationTypeId,
    direction: "forward",
    evidenceRefs: [{ kind: "source-anchor", anchor: fixture.anchor }]
  });
  const sourceConfirmed = fixture.operations.confirmRelationCandidate({ projectId: fixture.projectId, relationId: sourceCandidate.relation.relationId, expectedRelationRevision: sourceCandidate.relation.revision, operationId: "relation.source.confirm" });
  assert.equal(sourceConfirmed.relation.reviewState, "confirmed");
  assert.equal(fixture.operations.relationEvidence({ projectId: fixture.projectId, relationId: sourceConfirmed.relation.relationId }).warnings.length, 0);

  importSourceDocumentR0({ projectPath: fixture.rootPath, projectId: fixture.projectId, filename: "evidence.md", content: "# 线索\n原文锚点已改变\n" });
  const staleCandidate = fixture.operations.createRelationCandidate({
    projectId: fixture.projectId,
    operationId: "relation.source.stale",
    sourceObjectId: fixture.sourceObject.id,
    targetObjectId: fixture.targetObject.id,
    relationTypeId: type.type.relationTypeId,
    evidenceRefs: [{ kind: "source-anchor", anchor: fixture.anchor }]
  });
  assert.throws(() => fixture.operations.confirmRelationCandidate({ projectId: fixture.projectId, relationId: staleCandidate.relation.relationId, expectedRelationRevision: staleCandidate.relation.revision, operationId: "relation.source.stale.confirm" }), /stale|revision|source/i);

  const eventCandidate = fixture.operations.createRelationCandidate({
    projectId: fixture.projectId,
    operationId: "relation.event.current",
    sourceObjectId: fixture.sourceObject.id,
    targetObjectId: fixture.targetObject.id,
    relationTypeId: type.type.relationTypeId,
    evidenceRefs: [{ kind: "confirmed-event", reference: { version: "story-studio-event-reference/v1", projectId: fixture.projectId, eventId: "event.confirmed", revisionToken: "b".repeat(64), state: "committed", requestedUse: "constraint" } }]
  });
  const eventConfirmed = fixture.operations.confirmRelationCandidate({ projectId: fixture.projectId, relationId: eventCandidate.relation.relationId, expectedRelationRevision: eventCandidate.relation.revision, operationId: "relation.event.confirm" });
  assert.equal(eventConfirmed.relation.reviewState, "confirmed");
  fixture.setCanonVerified(false);
  const eventStaleCandidate = fixture.operations.createRelationCandidate({
    projectId: fixture.projectId,
    operationId: "relation.event.stale",
    sourceObjectId: fixture.sourceObject.id,
    targetObjectId: fixture.targetObject.id,
    relationTypeId: type.type.relationTypeId,
    evidenceRefs: [{ kind: "confirmed-event", reference: { version: "story-studio-event-reference/v1", projectId: fixture.projectId, eventId: "event.confirmed", revisionToken: "b".repeat(64), state: "committed", requestedUse: "constraint" } }]
  });
  assert.throws(() => fixture.operations.confirmRelationCandidate({ projectId: fixture.projectId, relationId: eventStaleCandidate.relation.relationId, expectedRelationRevision: eventStaleCandidate.relation.revision, operationId: "relation.event.stale.confirm" }), /Canon|stale|verified/i);
});

test("legacy-unanchored and unknown evidence remain readable warnings and cannot confirm", () => {
  const fixture = createFixture();
  const type = fixture.operations.createRelationType({ projectId: fixture.projectId, operationId: "type.legacy-evidence", label: "关联" });
  for (const [operationId, evidence, pattern] of [
    ["relation.legacy-evidence", { kind: "legacy-unanchored", graphDocumentId: "graph.old", legacyEdgeId: "edge.old", sourceRevision: "rev.1", payloadHash: "a".repeat(64), conversionVersion: "story-relation-projection/v1" }, /legacy|read-only/i],
    ["relation.unknown-evidence", { kind: "unknown-existing", payload: { ignored: true } }, /unsupported|read-only/i]
  ] as const) {
    const candidate = fixture.operations.createRelationCandidate({ projectId: fixture.projectId, operationId, sourceObjectId: fixture.sourceObject.id, targetObjectId: fixture.targetObject.id, relationTypeId: type.type.relationTypeId, evidenceRefs: [evidence] });
    const detail = fixture.operations.relationEvidence({ projectId: fixture.projectId, relationId: candidate.relation.relationId });
    assert.equal(detail.warnings.length > 0, true);
    assert.throws(() => fixture.operations.confirmRelationCandidate({ projectId: fixture.projectId, relationId: candidate.relation.relationId, expectedRelationRevision: candidate.relation.revision, operationId: `${operationId}.confirm` }), pattern);
  }
});

test("item-holder temporal metadata is versioned, revision-bound, and restart-readable", () => {
  const fixture = createFixture();
  const type = fixture.operations.createRelationType({ projectId: fixture.projectId, operationId: "type.holder-temporal", label: "持有" });
  const candidate = fixture.operations.createRelationCandidate({
    projectId: fixture.projectId,
    operationId: "relation.holder-temporal.create",
    sourceObjectId: fixture.sourceObject.id,
    targetObjectId: fixture.targetObject.id,
    relationTypeId: type.type.relationTypeId,
    direction: "forward",
    temporal: { version: "story-relation-temporal/v1", validFrom: "2026-01-01", validTo: null, confidence: "medium", sourceAnchors: ["fixture:scene-1"] }
  });
  assert.deepEqual(candidate.relation.temporal, { version: "story-relation-temporal/v1", validFrom: "2026-01-01", validTo: null, confidence: "medium", sourceAnchors: ["fixture:scene-1"] });
  const updated = fixture.operations.updateRelationCandidate({
    projectId: fixture.projectId,
    relationId: candidate.relation.relationId,
    expectedRelationRevision: candidate.relation.revision,
    operationId: "relation.holder-temporal.update",
    temporal: { version: "story-relation-temporal/v1", validFrom: "2026-01-01", validTo: "2026-06-01", confidence: "high", sourceAnchors: ["fixture:scene-1", "fixture:scene-2"] }
  });
  assert.equal(updated.relation.temporal?.validTo, "2026-06-01");
  const restarted = createStoryStudioRelationOperations({
    workspaceOperations: {
      resolveProjectWorkspacePath: ({ projectId }: { projectId: string }) => { assert.equal(projectId, fixture.projectId); return fixture.rootPath; },
      readWorldObject: ({ projectId, objectId }: { projectId: string; objectId: string }) => ({ id: objectId, type: "event", status: "committed", revisionToken: "b".repeat(64) })
    },
    verifyCanonEventRead: () => true
  });
  assert.equal(restarted.listRelations({ projectId: fixture.projectId, includeArchived: true }).relations.find((relation) => relation.relationId === candidate.relation.relationId)?.temporal?.confidence, "high");
});
