import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  archiveConfirmedRelation,
  confirmRelation,
  confirmRelationCandidate,
  createRelationCandidate,
  createRelationCorrectionCandidate,
  createRelationType,
  inspectRelationEvidence,
  listRelationTypes,
  previewLegacyRelationTypeAdoption,
  queryRelationDuplicateSuggestions,
  queryRelations,
  readRelationRepository,
  rejectRelation,
  rejectRelationCandidate,
  resolveRelationType,
  retireRelationType,
  updateRelationCandidate,
  updateRelationType
} from "../../src/storyWorkspace/relationRepository.mjs";
import * as relationRepository from "../../src/storyWorkspace/relationRepository.mjs";
import { createStoryWorkspace, createWorkspaceNote } from "../../src/storyWorkspace/storyWorkspaceRepository.mjs";

function createFixture() {
  const rootPath = mkdtempSync(path.join(os.tmpdir(), "story-relation-safe-r0-"));
  const project = createStoryWorkspace({ rootPath, title: "Relation safe" });
  const source = createWorkspaceNote(rootPath, { id: "character.source", type: "character", title: "来源", status: "active", body: "# 来源\n" });
  const target = createWorkspaceNote(rootPath, { id: "character.target", type: "character", title: "目标", status: "active", body: "# 目标\n" });
  return { rootPath, project, source, target };
}

function createType(rootPath: string, operationId = "type.create.r0", label = "守护") {
  return createRelationType(rootPath, { operationId, label, now: "2026-08-19T00:00:00.000Z" }).type;
}

function createCandidate(fixture: ReturnType<typeof createFixture>, typeId: string, operationId = "relation.create.r0", extra: Record<string, unknown> = {}) {
  return createRelationCandidate(fixture.rootPath, {
    operationId,
    sourceObjectId: fixture.source.id,
    targetObjectId: fixture.target.id,
    relationTypeId: typeId,
    direction: "forward",
    now: "2026-08-19T00:00:01.000Z",
    ...extra
  });
}

test("Relation Type metadata is operation-allocated, reusable, rename-safe, collision-guarded, and retire-only", () => {
  const fixture = createFixture();
  const type = createType(fixture.rootPath);
  assert.doesNotMatch(type.relationTypeId, /守护/u);
  assert.equal(createType(fixture.rootPath, "type.create.reusable", "持有").relationTypeId !== type.relationTypeId, true);
  const first = createCandidate(fixture, type.relationTypeId, "relation.reusable.one");
  const second = createRelationCandidate(fixture.rootPath, {
    operationId: "relation.reusable.two",
    sourceObjectId: fixture.target.id,
    targetObjectId: fixture.source.id,
    relationTypeId: type.relationTypeId,
    direction: "reverse"
  });
  assert.equal(first.relation.relationTypeId, second.relation.relationTypeId);
  assert.throws(() => createRelationType(fixture.rootPath, { operationId: "type.collision", label: "  守护  " }), /active Relation type already uses/i);

  const renamed = updateRelationType(fixture.rootPath, {
    operationId: "type.rename",
    relationTypeId: type.relationTypeId,
    expectedTypeRevision: 1,
    expectedRepositoryRevision: 4,
    label: "保护",
    now: "2026-08-19T00:00:02.000Z"
  });
  assert.equal(renamed.type.relationTypeId, type.relationTypeId);
  assert.equal(resolveRelationType(fixture.rootPath, type.relationTypeId)?.label, "保护");
  assert.equal(readRelationRepository(fixture.rootPath).relations.find((item) => item.relationId === first.relation.relationId)?.relationLabelSnapshot, "守护");

  const retired = retireRelationType(fixture.rootPath, {
    operationId: "type.retire",
    relationTypeId: type.relationTypeId,
    expectedTypeRevision: renamed.type.typeRevision,
    expectedRepositoryRevision: renamed.repositoryRevision,
    now: "2026-08-19T00:00:03.000Z"
  });
  assert.equal(retired.type.lifecycle, "retired");
  assert.throws(() => createCandidate(fixture, type.relationTypeId, "relation.retired"), /Retired Relation types/i);
  assert.throws(() => retireRelationType(fixture.rootPath, { operationId: "type.restore", relationTypeId: type.relationTypeId, expectedTypeRevision: retired.type.typeRevision, expectedRepositoryRevision: retired.repositoryRevision }), /Retired|restore/i);
});

test("v1 Relation stores read, list, search, and project legacy-inline types without writing bytes", () => {
  const fixture = createFixture();
  const empty = readRelationRepository(fixture.rootPath);
  const relationPath = path.join(fixture.rootPath, ".world-os/relations/relations.json");
  mkdirSync(path.dirname(relationPath), { recursive: true });
  writeFileSync(relationPath, `${JSON.stringify({
    version: "story-relation-repository/v1",
    workspaceIdentity: empty.workspaceIdentity,
    revision: 4,
    relations: [{
      relationId: "relation.legacy.read",
      sourceObjectId: fixture.source.id,
      targetObjectId: fixture.target.id,
      relationTypeId: "relation-type.legacy",
      relationLabelSnapshot: "旧标签",
      direction: "forward",
      reviewState: "confirmed",
      evidenceRefs: [{ kind: "legacy-unanchored", graphDocumentId: "graph.legacy", legacyEdgeId: "edge.legacy", sourceRevision: "rev.1", payloadHash: "a".repeat(64), conversionVersion: "story-relation-projection/v1" }],
      provenance: { kind: "graph" },
      sourceRevision: "rev.1",
      revision: 1,
      archived: false,
      decisionReceipt: null
    }],
    receipts: []
  }, null, 2)}\n`, "utf8");
  const before = readFileSync(relationPath);
  const listed = readRelationRepository(fixture.rootPath);
  assert.equal(listed.version, "story-relation-repository/v1");
  assert.equal(queryRelations(fixture.rootPath, { text: "旧标签" }).length, 1);
  const types = listRelationTypes(fixture.rootPath);
  assert.equal(types[0].legacyInline, true);
  assert.equal(types[0].readOnly, true);
  const preview = previewLegacyRelationTypeAdoption(fixture.rootPath, { relationTypeId: "relation-type.legacy" });
  assert.equal(preview.readOnly, true);
  assert.deepEqual(readFileSync(relationPath), before);
  assert.equal(existsSync(path.join(fixture.rootPath, ".world-os/relations/relations.json.tmp")), false);
});

test("safe state operations enforce candidate-only creation, revision guards, immutable endpoints, tombstones, correction lineage, and exactly-once receipts", () => {
  const fixture = createFixture();
  const type = createType(fixture.rootPath);
  assert.throws(() => confirmRelation(fixture.rootPath, { operationId: "direct.confirmed", sourceObjectId: fixture.source.id, targetObjectId: fixture.target.id, relationTypeId: type.relationTypeId }), /does not exist|Relation/i);
  assert.throws(() => rejectRelation(fixture.rootPath, { operationId: "direct.rejected", sourceObjectId: fixture.source.id, targetObjectId: fixture.target.id, relationTypeId: type.relationTypeId }), /does not exist|Relation/i);
  const candidate = createCandidate(fixture, type.relationTypeId);
  assert.equal(candidate.relation.reviewState, "candidate");
  const replayBefore = readFileSync(path.join(fixture.rootPath, ".world-os/relations/relations.json"));
  assert.equal(createCandidate(fixture, type.relationTypeId, "relation.create.r0").idempotent, true);
  assert.deepEqual(readFileSync(path.join(fixture.rootPath, ".world-os/relations/relations.json")), replayBefore);
  assert.match(candidate.receipt.afterSemanticHash || "", /^[a-f0-9]{64}$/u);
  assert.equal(candidate.receipt.beforeSemanticHash, null);

  assert.throws(() => updateRelationCandidate(fixture.rootPath, { operationId: "relation.stale", relationId: candidate.relation.relationId, expectedRelationRevision: 99, direction: "both" }), /stale/i);
  assert.throws(() => updateRelationCandidate(fixture.rootPath, { operationId: "relation.endpoint-change", relationId: candidate.relation.relationId, expectedRelationRevision: 1, sourceObjectId: fixture.target.id, direction: "both" }), /endpoints/i);
  const updated = updateRelationCandidate(fixture.rootPath, { operationId: "relation.update", relationId: candidate.relation.relationId, expectedRelationRevision: 1, direction: "both" });
  const confirmed = confirmRelationCandidate(fixture.rootPath, { operationId: "relation.confirm", relationId: candidate.relation.relationId, expectedRelationRevision: updated.relation.revision });
  assert.equal(confirmed.relation.reviewState, "confirmed");
  assert.match(confirmed.receipt.beforeSemanticHash || "", /^[a-f0-9]{64}$/u);
  assert.match(confirmed.receipt.afterSemanticHash || "", /^[a-f0-9]{64}$/u);
  assert.notEqual(confirmed.receipt.beforeSemanticHash, confirmed.receipt.afterSemanticHash);
  assert.throws(() => updateRelationCandidate(fixture.rootPath, { operationId: "relation.confirmed-edit", relationId: candidate.relation.relationId, expectedRelationRevision: confirmed.relation.revision, direction: "none" }), /Only|pending|archived/i);

  const correction = createRelationCorrectionCandidate(fixture.rootPath, {
    operationId: "relation.correction",
    relationId: candidate.relation.relationId,
    expectedRelationRevision: confirmed.relation.revision,
    sourceObjectId: fixture.target.id,
    targetObjectId: fixture.source.id,
    relationTypeId: type.relationTypeId,
    direction: "reverse"
  });
  assert.equal(correction.relation.reviewState, "candidate");
  assert.equal(correction.relation.supersedesRelationId, candidate.relation.relationId);
  assert.equal(readRelationRepository(fixture.rootPath).relations.some((item) => item.relationId === candidate.relation.relationId && !item.archived), true);

  const archived = archiveConfirmedRelation(fixture.rootPath, { operationId: "relation.archive", relationId: candidate.relation.relationId, expectedRelationRevision: confirmed.relation.revision });
  assert.equal(archived.relation.archived, true);
  assert.throws(() => archiveConfirmedRelation(fixture.rootPath, { operationId: "relation.archive.restore", relationId: candidate.relation.relationId, expectedRelationRevision: archived.relation.revision }), /Only|archived|restored/i);
  assert.throws(() => confirmRelationCandidate(fixture.rootPath, { operationId: "relation.archive.confirm", relationId: candidate.relation.relationId, expectedRelationRevision: archived.relation.revision }), /archived|restored/i);
  assert.equal(typeof relationRepository.deleteRelation, "undefined");
});

test("exact duplicate suggestions are read-only, ordered, and history-separated", () => {
  const fixture = createFixture();
  const type = createType(fixture.rootPath);
  const first = createCandidate(fixture, type.relationTypeId, "relation.duplicate.one");
  const second = createCandidate(fixture, type.relationTypeId, "relation.duplicate.two");
  const exact = queryRelationDuplicateSuggestions(fixture.rootPath, { sourceObjectId: fixture.source.id, targetObjectId: fixture.target.id, relationTypeId: type.relationTypeId, direction: "forward", relationLabelSnapshot: type.label });
  assert.deepEqual(exact.suggestions.map((item) => item.relationId).sort(), [first.relation.relationId, second.relation.relationId].sort());
  assert.equal(queryRelationDuplicateSuggestions(fixture.rootPath, { sourceObjectId: fixture.target.id, targetObjectId: fixture.source.id, relationTypeId: type.relationTypeId, direction: "reverse", relationLabelSnapshot: type.label }).suggestions.length, 0);
  const rejected = rejectRelationCandidate(fixture.rootPath, { operationId: "relation.duplicate.reject", relationId: first.relation.relationId, expectedRelationRevision: first.relation.revision });
  const after = queryRelationDuplicateSuggestions(fixture.rootPath, { sourceObjectId: fixture.source.id, targetObjectId: fixture.target.id, relationTypeId: type.relationTypeId, direction: "forward", relationLabelSnapshot: type.label });
  assert.equal(after.suggestions.some((item) => item.relationId === rejected.relation.relationId), false);
  assert.equal(after.history.some((item) => item.relationId === rejected.relation.relationId), true);
  assert.equal(inspectRelationEvidence(fixture.rootPath, { relationId: second.relation.relationId }).warnings.length, 0);
});
