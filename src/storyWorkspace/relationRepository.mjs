import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import { listWorkspaceNotes, openStoryWorkspace } from "./storyWorkspaceRepository.mjs";

export const RELATION_REPOSITORY_V1_VERSION = "story-relation-repository/v1";
export const RELATION_REPOSITORY_VERSION = "story-relation-repository/v2";
export const RELATION_TYPE_METADATA_VERSION = "story-relation-type-definition/v1";
export const RELATION_PROJECTION_VERSION = "story-relation-projection/v1";
export const UNRESOLVED_RELATION_TYPE_ID = "relation-type.unresolved";
export const UNRESOLVED_RELATION_TYPE_LABEL = "关系类型待确认";

const RELATION_DIRECTORY = ".world-os/relations";
const RELATION_FILE = `${RELATION_DIRECTORY}/relations.json`;
const MAX_RELATION_FILE_BYTES = 4 * 1024 * 1024;

/**
 * The repository is the only writable semantic relation owner. Graph files
 * may retain layout and relation references, but never relation payloads.
 */
export function readRelationRepository(rootPath) {
  const root = prepareRoot(rootPath);
  return readStore(root);
}

export function queryRelations(rootPath, query = {}) {
  const store = readRelationRepository(rootPath);
  const text = query.text == null ? "" : normalizeSearchText(query.text);
  const titles = text ? new Map(listWorkspaceNotes(prepareRoot(rootPath)).map((note) => [note.id, note.title])) : null;
  return store.relations
    .filter((relation) => query.includeArchived === true || !relation.archived)
    .filter((relation) => !query.reviewState || relation.reviewState === query.reviewState)
    .filter((relation) => !query.objectId || relation.sourceObjectId === query.objectId || relation.targetObjectId === query.objectId)
    .filter((relation) => !query.relationTypeId || relation.relationTypeId === query.relationTypeId)
    .filter((relation) => !query.direction || relation.direction === query.direction)
    .filter((relation) => !text || relationMatchesText(relation, text, titles, store))
    .map(clone);
}

export function retrieveRelationEvidence(rootPath, relationId) {
  const relation = queryRelations(rootPath, { includeArchived: true }).find((item) => item.relationId === requireText(relationId, "Relation id", 180));
  if (!relation) throw new Error("Relation does not exist.");
  return clone(relation.evidenceRefs);
}

export function retrieveDecisionReceipt(rootPath, relationId) {
  const id = requireText(relationId, "Relation id", 180);
  const store = readRelationRepository(rootPath);
  return store.receipts.filter((receipt) => receipt.relationId === id).map(clone);
}

export function createRelationCandidate(rootPath, input) {
  return createRelationCandidateInternal(rootPath, input);
}

/** Persists an untyped edge inside the sole Relation owner without inventing a RelationType. */
export function createUnresolvedRelationCandidate(rootPath, input) {
  return createRelationCandidateInternal(rootPath, input, { unresolvedType: true });
}

export function confirmRelation(rootPath, input) {
  return confirmRelationCandidate(rootPath, input);
}

export function rejectRelation(rootPath, input) {
  return rejectRelationCandidate(rootPath, input);
}

export function archiveRelation(rootPath, input) {
  return archiveConfirmedRelation(rootPath, input);
}

export function listRelationTypes(rootPath) {
  const store = readRelationRepository(rootPath);
  return [...store.relationTypes, ...store.legacyInlineTypes].map(clone).sort(compareRelationTypes);
}

export function resolveRelationType(rootPath, relationTypeId) {
  const id = requireText(relationTypeId, "Relation type id", 180);
  const store = readRelationRepository(rootPath);
  const type = [...store.relationTypes, ...store.legacyInlineTypes].find((item) => item.relationTypeId === id);
  return type ? clone(type) : null;
}

export function createRelationType(rootPath, input) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayTypeOperation(store, operationId);
  if (replay) return replay;
  const actor = requireText(input?.actor || "author", "Relation type actor", 120);
  assertExpectedRepositoryRevision(store, input?.expectedRepositoryRevision);
  const label = normalizeRelationTypeLabel(input?.label);
  assertActiveRelationTypeLabelAvailable(store, label);
  const now = normalizeTimestamp(input?.now);
  const relationTypeId = relationTypeIdFromOperation(operationId);
  if (store.relationTypes.some((type) => type.relationTypeId === relationTypeId)) {
    throw new Error("Relation type operation identity is already in use.");
  }
  const nextStore = prepareStoreForWrite(store);
  const repositoryRevision = nextStore.revision + 1;
  const type = {
    version: RELATION_TYPE_METADATA_VERSION,
    relationTypeId,
    label,
    description: optionalDescription(input?.description),
    lifecycle: "active",
    typeRevision: 1,
    repositoryRevision,
    provenance: {
      kind: "manual-author",
      actor,
      operationId,
      sourceRef: optionalSourceRef(input?.sourceRef)
    },
    createdAt: now,
    updatedAt: now,
    operationReceipt: null
  };
  const receipt = appendReceipt(nextStore, {
    scope: "relation-type",
    relationTypeId,
    action: "create-relation-type",
    actor,
    operationId,
    inputRevision: store.revision,
    resultRevision: type.typeRevision,
    repositoryRevision,
    beforeSemanticHash: null,
    afterSemanticHash: relationTypeSemanticHash(type),
    authorActionReceiptId: optionalReceiptId(input?.authorActionReceiptId),
    timestamp: now,
    createdAt: now
  });
  type.operationReceipt = receipt;
  nextStore.revision = repositoryRevision;
  nextStore.relationTypes = [...nextStore.relationTypes, type].sort(compareRelationTypes);
  writeStore(root, nextStore);
  return { type: clone(type), receipt: clone(receipt), idempotent: false, repositoryRevision };
}

export function updateRelationType(rootPath, input) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayTypeOperation(store, operationId);
  if (replay) return replay;
  const typeId = requireText(input?.relationTypeId, "Relation type id", 180);
  const current = store.relationTypes.find((type) => type.relationTypeId === typeId);
  if (!current) throw new Error("Relation type is not adopted metadata.");
  assertExpectedRepositoryRevision(store, input?.expectedRepositoryRevision);
  assertExpectedRevision(current.typeRevision, input?.expectedTypeRevision, "Relation type revision is stale.");
  const label = input?.label === undefined ? current.label : normalizeRelationTypeLabel(input.label);
  assertActiveRelationTypeLabelAvailable(store, label, typeId);
  const now = normalizeTimestamp(input?.now);
  const nextStore = prepareStoreForWrite(store);
  const repositoryRevision = nextStore.revision + 1;
  const nextType = {
    ...current,
    label,
    description: input?.description === undefined ? current.description : optionalDescription(input.description),
    typeRevision: current.typeRevision + 1,
    repositoryRevision,
    updatedAt: now,
    provenance: { ...current.provenance, lastActor: requireText(input?.actor || "author", "Relation type actor", 120), lastOperationId: operationId }
  };
  const receipt = appendReceipt(nextStore, {
    scope: "relation-type",
    relationTypeId: typeId,
    action: "update-relation-type",
    actor: requireText(input?.actor || "author", "Relation type actor", 120),
    operationId,
    inputRevision: current.typeRevision,
    resultRevision: nextType.typeRevision,
    repositoryRevision,
    beforeSemanticHash: relationTypeSemanticHash(current),
    afterSemanticHash: relationTypeSemanticHash(nextType),
    authorActionReceiptId: optionalReceiptId(input?.authorActionReceiptId),
    timestamp: now,
    createdAt: now
  });
  nextType.operationReceipt = receipt;
  nextStore.revision = repositoryRevision;
  nextStore.relationTypes = nextStore.relationTypes.map((type) => type.relationTypeId === typeId ? nextType : type).sort(compareRelationTypes);
  writeStore(root, nextStore);
  return { type: clone(nextType), receipt: clone(receipt), idempotent: false, repositoryRevision };
}

export function retireRelationType(rootPath, input) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayTypeOperation(store, operationId);
  if (replay) return replay;
  const typeId = requireText(input?.relationTypeId, "Relation type id", 180);
  const current = store.relationTypes.find((type) => type.relationTypeId === typeId);
  if (!current) throw new Error("Relation type is not adopted metadata.");
  assertExpectedRepositoryRevision(store, input?.expectedRepositoryRevision);
  assertExpectedRevision(current.typeRevision, input?.expectedTypeRevision, "Relation type revision is stale.");
  if (current.lifecycle === "retired") throw new Error("Retired Relation types cannot be restored.");
  const now = normalizeTimestamp(input?.now);
  const nextStore = prepareStoreForWrite(store);
  const repositoryRevision = nextStore.revision + 1;
  const nextType = {
    ...current,
    lifecycle: "retired",
    typeRevision: current.typeRevision + 1,
    repositoryRevision,
    updatedAt: now,
    provenance: { ...current.provenance, lastActor: requireText(input?.actor || "author", "Relation type actor", 120), lastOperationId: operationId }
  };
  const receipt = appendReceipt(nextStore, {
    scope: "relation-type",
    relationTypeId: typeId,
    action: "retire-relation-type",
    actor: requireText(input?.actor || "author", "Relation type actor", 120),
    operationId,
    inputRevision: current.typeRevision,
    resultRevision: nextType.typeRevision,
    repositoryRevision,
    beforeSemanticHash: relationTypeSemanticHash(current),
    afterSemanticHash: relationTypeSemanticHash(nextType),
    authorActionReceiptId: optionalReceiptId(input?.authorActionReceiptId),
    timestamp: now,
    createdAt: now
  });
  nextType.operationReceipt = receipt;
  nextStore.revision = repositoryRevision;
  nextStore.relationTypes = nextStore.relationTypes.map((type) => type.relationTypeId === typeId ? nextType : type).sort(compareRelationTypes);
  writeStore(root, nextStore);
  return { type: clone(nextType), receipt: clone(receipt), idempotent: false, repositoryRevision };
}

export function previewLegacyRelationTypeAdoption(rootPath, input) {
  const store = readRelationRepository(rootPath);
  const relationTypeId = requireText(input?.relationTypeId, "Legacy relation type id", 180);
  const type = store.legacyInlineTypes.find((item) => item.relationTypeId === relationTypeId);
  if (!type) throw new Error("Legacy inline Relation type does not exist.");
  const relationIds = store.relations.filter((relation) => relation.relationTypeId === relationTypeId).map((relation) => relation.relationId).sort();
  const previewHash = fingerprint({ repositoryRevision: store.revision, relationTypeId, label: type.label, relationIds });
  return {
    version: "story-relation-type-adoption-preview/v1",
    relationTypeId,
    label: type.label,
    relationIds,
    repositoryRevision: store.revision,
    previewHash,
    readOnly: true
  };
}

export function adoptLegacyRelationType(rootPath, input) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayTypeOperation(store, operationId);
  if (replay) return replay;
  const preview = previewLegacyRelationTypeAdoption(root, input);
  if (preview.previewHash !== requireText(input?.previewHash, "Legacy type adoption preview", 128)) throw new Error("Legacy type adoption preview is stale.");
  if (store.relationTypes.some((type) => type.relationTypeId === preview.relationTypeId)) throw new Error("Legacy Relation type has already been adopted.");
  assertExpectedRepositoryRevision(store, input?.expectedRepositoryRevision);
  const label = input?.label === undefined ? preview.label : normalizeRelationTypeLabel(input.label);
  assertActiveRelationTypeLabelAvailable(store, label);
  const actor = requireText(input?.actor || "author", "Relation type actor", 120);
  const now = normalizeTimestamp(input?.now);
  const nextStore = prepareStoreForWrite(store);
  const repositoryRevision = nextStore.revision + 1;
  const type = {
    version: RELATION_TYPE_METADATA_VERSION,
    relationTypeId: preview.relationTypeId,
    label,
    description: optionalDescription(input?.description),
    lifecycle: "active",
    typeRevision: 1,
    repositoryRevision,
    provenance: { kind: "legacy-adoption", actor, operationId, legacyTypeId: preview.relationTypeId },
    createdAt: now,
    updatedAt: now,
    operationReceipt: null,
    legacyAdoption: true
  };
  const receipt = appendReceipt(nextStore, {
    scope: "relation-type",
    relationTypeId: type.relationTypeId,
    action: "adopt-legacy-relation-type",
    actor,
    operationId,
    inputRevision: store.revision,
    resultRevision: type.typeRevision,
    repositoryRevision,
    beforeSemanticHash: null,
    afterSemanticHash: relationTypeSemanticHash(type),
    authorActionReceiptId: optionalReceiptId(input?.authorActionReceiptId),
    timestamp: now,
    createdAt: now
  });
  type.operationReceipt = receipt;
  nextStore.revision = repositoryRevision;
  nextStore.relationTypes = [...nextStore.relationTypes, type].sort(compareRelationTypes);
  writeStore(root, nextStore);
  return { type: clone(type), receipt: clone(receipt), idempotent: false, repositoryRevision };
}

export function updateRelationCandidate(rootPath, input) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayRelationOperation(store, operationId);
  if (replay) return replay;
  const relationId = requireText(input?.relationId, "Relation id", 180);
  const current = findRelation(store, relationId);
  assertExpectedRevision(current.revision, input?.expectedRelationRevision ?? input?.expectedRevision, "Relation revision is stale.");
  assertCandidateIsEditable(current);
  if (input?.sourceObjectId !== undefined || input?.targetObjectId !== undefined) {
    throw new Error("Candidate updates cannot change Relation endpoints.");
  }
  const typeId = input?.relationTypeId === undefined ? current.relationTypeId : requireText(input.relationTypeId, "Relation type id", 180);
  const typeChanged = typeId !== current.relationTypeId;
  const type = typeChanged ? requireActiveRelationType(store, typeId) : resolveRelationTypeInStore(store, typeId);
  if (!type) throw new Error("Relation type cannot be resolved.");
  const evidenceRefs = input?.evidenceRefs === undefined
    ? current.evidenceRefs
    : preserveManualAuthorEvidence(store, current, normalizeEvidenceSet(input.evidenceRefs));
  const next = {
    ...current,
    relationTypeId: typeId,
    relationLabelSnapshot: typeChanged ? type.label : current.relationLabelSnapshot,
    direction: input?.direction === undefined ? current.direction : requireDirection(input.direction),
    evidenceRefs,
    temporal: input?.temporal === undefined ? current.temporal || null : normalizeTemporalMetadata(input.temporal),
    revision: current.revision + 1,
    decisionReceipt: null
  };
  return commitRelationMutation(root, store, current, next, {
    action: "update-relation-candidate",
    operationId,
    actor: input?.actor,
    inputRevision: current.revision,
    source: current.provenance,
    authorActionReceiptId: input?.authorActionReceiptId,
    now: input?.now,
    decision: "candidate"
  });
}

export function confirmRelationCandidate(rootPath, input, options = {}) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayRelationOperation(store, operationId);
  if (replay) return replay;
  const relationId = requireText(input?.relationId, "Relation id", 180);
  const current = findRelation(store, relationId);
  assertExpectedRevision(current.revision, input?.expectedRelationRevision ?? input?.expectedRevision, "Relation revision is stale.");
  assertCandidateIsEditable(current);
  if (current.relationTypeId === UNRESOLVED_RELATION_TYPE_ID) throw new Error("Relation type must be selected before confirmation.");
  assertRelationEvidenceConfirmable(store, current, options);
  const next = { ...current, reviewState: "confirmed", archived: false, revision: current.revision + 1, decisionReceipt: null };
  return commitRelationMutation(root, store, current, next, {
    action: "confirm-relation-candidate",
    operationId,
    actor: input?.actor,
    inputRevision: current.revision,
    source: current.provenance,
    authorActionReceiptId: input?.authorActionReceiptId,
    now: input?.now,
    decision: "confirmed"
  });
}

export function rejectRelationCandidate(rootPath, input) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayRelationOperation(store, operationId);
  if (replay) return replay;
  const relationId = requireText(input?.relationId, "Relation id", 180);
  const current = findRelation(store, relationId);
  assertExpectedRevision(current.revision, input?.expectedRelationRevision ?? input?.expectedRevision, "Relation revision is stale.");
  assertCandidateIsEditable(current);
  const next = { ...current, reviewState: "rejected", archived: true, revision: current.revision + 1, decisionReceipt: null };
  return commitRelationMutation(root, store, current, next, {
    action: "reject-relation-candidate",
    operationId,
    actor: input?.actor,
    inputRevision: current.revision,
    source: current.provenance,
    authorActionReceiptId: input?.authorActionReceiptId,
    now: input?.now,
    decision: "rejected"
  });
}

export function archiveConfirmedRelation(rootPath, input) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayRelationOperation(store, operationId);
  if (replay) return replay;
  const relationId = requireText(input?.relationId, "Relation id", 180);
  const current = findRelation(store, relationId);
  assertExpectedRevision(current.revision, input?.expectedRelationRevision ?? input?.expectedRevision, "Relation revision is stale.");
  if (current.reviewState !== "confirmed" || current.archived) throw new Error("Only an active confirmed Relation can be archived.");
  const next = { ...current, archived: true, revision: current.revision + 1, decisionReceipt: null };
  return commitRelationMutation(root, store, current, next, {
    action: "archive-confirmed-relation",
    operationId,
    actor: input?.actor,
    inputRevision: current.revision,
    source: current.provenance,
    authorActionReceiptId: input?.authorActionReceiptId,
    now: input?.now,
    decision: "archived"
  });
}

export function appendRelationEvidence(rootPath, input, options = {}) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayRelationOperation(store, operationId);
  if (replay) return replay;
  const relationId = requireText(input?.relationId, "Relation id", 180);
  const current = findRelation(store, relationId);
  assertExpectedRevision(current.revision, input?.expectedRelationRevision ?? input?.expectedRevision, "Relation revision is stale.");
  if (current.reviewState !== "confirmed" || current.archived) throw new Error("Only an active confirmed Relation can receive evidence.");
  const additional = normalizeEvidenceSet(input?.evidenceRefs);
  if (!additional.length) throw new Error("At least one Relation evidence reference is required.");
  if (additional.some((evidence) => evidence.kind === "manual-author")) {
    throw new Error("Manual author provenance is created with the Relation and cannot be appended as source evidence.");
  }
  assertEvidenceSetCurrent(store, current, additional, options);
  const next = {
    ...current,
    evidenceRefs: mergeEvidence(current.evidenceRefs, additional),
    revision: current.revision + 1,
    decisionReceipt: null
  };
  return commitRelationMutation(root, store, current, next, {
    action: "append-relation-evidence",
    operationId,
    actor: input?.actor,
    inputRevision: current.revision,
    source: current.provenance,
    authorActionReceiptId: input?.authorActionReceiptId,
    now: input?.now,
    decision: "confirmed"
  });
}

export function createRelationCorrectionCandidate(rootPath, input) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayRelationOperation(store, operationId);
  if (replay) return replay;
  const supersedesRelationId = requireText(input?.supersedesRelationId || input?.relationId, "Relation to correct", 180);
  const superseded = findRelation(store, supersedesRelationId);
  assertExpectedRevision(superseded.revision, input?.expectedRelationRevision ?? input?.expectedRevision, "Relation revision is stale.");
  if (superseded.reviewState !== "confirmed" || superseded.archived) throw new Error("Only an active confirmed Relation can create a correction candidate.");
  const correctionRelationId = input?.correctionRelationId || input?.newRelationId || `relation.correction.${fingerprint({ workspaceIdentity: store.workspaceIdentity, operationId }).slice(0, 32)}`;
  const relation = buildCandidateRelation(root, store, { ...input, relationId: correctionRelationId }, {
    supersedesRelationId,
    correction: true
  });
  return commitRelationMutation(root, store, null, relation, {
    action: "create-relation-correction-candidate",
    operationId,
    actor: input?.actor,
    inputRevision: superseded.revision,
    source: { kind: "correction", supersedesRelationId },
    supersedesRelationId,
    authorActionReceiptId: input?.authorActionReceiptId,
    now: input?.now,
    decision: "candidate"
  });
}

export function queryRelationDuplicateSuggestions(rootPath, input) {
  const store = readRelationRepository(rootPath);
  const sourceObjectId = requireText(input?.sourceObjectId, "Relation source object", 160);
  const targetObjectId = requireText(input?.targetObjectId, "Relation target object", 160);
  const relationTypeId = requireText(input?.relationTypeId, "Relation type id", 180);
  const direction = requireDirection(input?.direction);
  const candidateSnapshot = normalizeRelationSnapshot(input?.relationLabelSnapshot, "Relation label snapshot");
  const type = resolveRelationTypeInStore(store, relationTypeId) || store.legacyInlineTypes.find((item) => item.relationTypeId === relationTypeId);
  if (!type) throw new Error("Relation type cannot be resolved.");
  const typeLabel = normalizeRelationSnapshot(type.label, "Relation type label");
  const matches = store.relations.filter((relation) =>
    relation.sourceObjectId === sourceObjectId
    && relation.targetObjectId === targetObjectId
    && relation.relationTypeId === relationTypeId
    && relation.direction === direction
    && normalizeRelationSnapshot(relation.relationLabelSnapshot, "Relation label snapshot") === typeLabel
    && candidateSnapshot === typeLabel
  ).map(clone);
  return {
    version: "story-relation-duplicate-suggestion/v1",
    suggestions: matches.filter((relation) => !relation.archived && (relation.reviewState === "candidate" || relation.reviewState === "confirmed")),
    history: matches.filter((relation) => relation.archived || relation.reviewState === "rejected")
  };
}

export function inspectRelationEvidence(rootPath, input, options = {}) {
  const store = readRelationRepository(rootPath);
  const relationId = requireText(input?.relationId, "Relation id", 180);
  const relation = findRelation(store, relationId);
  const statuses = evaluateRelationEvidence(store, relation, options);
  return {
    relationId,
    statuses,
    warnings: statuses.filter((status) => status.status !== "current").map(clone)
  };
}

export function relationStorePath(rootPath) {
  return path.join(prepareRoot(rootPath), RELATION_FILE);
}

export function previewGraphRelationMigration(rootPath, input) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const workspaceIdentity = store.workspaceIdentity;
  const graphDocumentId = requireText(input.graphDocumentId, "Graph document id", 160);
  const sourceRevision = requireText(input.sourceRevision, "Graph source revision", 160);
  const content = normalizeGraphInput(input.content);
  const rows = buildRows({ root, store, workspaceIdentity, graphDocumentId, sourceRevision, content, currentContent: input.currentContent || null });
  return {
    version: RELATION_PROJECTION_VERSION,
    workspaceIdentity,
    graphDocumentId,
    sourceRevision,
    previewedAt: new Date().toISOString(),
    conversionVersion: RELATION_PROJECTION_VERSION,
    relationRefs: rows.map((row) => row.ref),
    relations: rows.map((row) => row.relation),
    diagnostics: rows.flatMap((row) => row.diagnostics)
  };
}

/**
 * Fixture-only deterministic apply. Production callers must use the normal
 * graph create/update gateway; real legacy projects never auto-migrate.
 */
export function applyGraphRelationFixtureMigration(rootPath, input) {
  if (input?.fixture !== true) throw new Error("Relation fixture migration requires an explicit fixture flag.");
  return reconcileGraphRelations(rootPath, { ...input, mode: "fixture" });
}

export function reconcileGraphRelations(rootPath, input) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const graphDocumentId = requireText(input.graphDocumentId, "Graph document id", 160);
  const sourceRevision = requireText(input.sourceRevision, "Graph source revision", 160);
  const content = normalizeGraphInput(input.content);
  const currentContent = input.currentContent ? normalizeGraphInput(input.currentContent) : null;
  if (input.mode !== "create" && input.mode !== "fixture" && currentContent?.relationAuthority?.status !== "ready") {
    throw new Error("Graph relation authority migration is required before this legacy graph can be edited.");
  }

  const rows = buildRows({
    root,
    store,
    workspaceIdentity: store.workspaceIdentity,
    graphDocumentId,
    sourceRevision,
    content,
    currentContent
  });
  const nextRelationIds = new Set(rows.map((row) => row.relation.relationId));
  const currentRelationIds = new Set(currentContent?.relationRefs?.map((ref) => ref.relationId) || []);
  const now = new Date().toISOString();
  const nextStore = clone(store);
  const relationsById = new Map(nextStore.relations.map((relation) => [relation.relationId, relation]));
  let changed = false;

  for (const row of rows) {
    const existing = relationsById.get(row.relation.relationId);
    if (!existing) {
      relationsById.set(row.relation.relationId, {
        ...row.relation,
        revision: 1,
        archived: false,
        decisionReceipt: null
      });
      const receipt = appendReceipt(nextStore, {
        relationId: row.relation.relationId,
        action: "create",
        operationId: row.operationId,
        actor: "author",
        source: row.relation.provenance,
        inputRevision: sourceRevision,
        resultRevision: 1,
        decision: row.relation.reviewState,
        createdAt: now
      });
      relationsById.set(row.relation.relationId, { ...relationsById.get(row.relation.relationId), decisionReceipt: receipt });
      changed = true;
      continue;
    }
    assertRelationIdentity(existing, row.relation);
    if (hasOperationReceipt(nextStore, row.operationId)) continue;
    const nextFields = {
      ...existing,
      sourceObjectId: row.relation.sourceObjectId,
      targetObjectId: row.relation.targetObjectId,
      relationTypeId: row.relation.relationTypeId,
      relationLabelSnapshot: row.relation.relationLabelSnapshot,
      direction: row.relation.direction,
      reviewState: row.relation.reviewState,
      evidenceRefs: mergeEvidence(existing.evidenceRefs, row.relation.evidenceRefs),
      provenance: row.relation.provenance,
      sourceRevision,
      archived: false,
      revision: existing.revision + 1
    };
    const changedFields = JSON.stringify(relationComparable(existing)) !== JSON.stringify(relationComparable(nextFields));
    if (!changedFields) continue;
    relationsById.set(existing.relationId, nextFields);
    const receipt = appendReceipt(nextStore, {
      relationId: existing.relationId,
      action: row.relation.reviewState === "candidate" ? "candidate" : "confirm",
      operationId: row.operationId,
      actor: "author",
      source: row.relation.provenance,
      inputRevision: sourceRevision,
      resultRevision: nextFields.revision,
      decision: nextFields.reviewState,
      createdAt: now
    });
    nextFields.decisionReceipt = receipt;
    relationsById.set(existing.relationId, nextFields);
    changed = true;
  }

  for (const relationId of currentRelationIds) {
    if (nextRelationIds.has(relationId)) continue;
    const existing = relationsById.get(relationId);
    if (!existing || existing.archived) continue;
    const operationId = `graph-archive:${graphDocumentId}:${sourceRevision}:${relationId}`;
    if (hasOperationReceipt(nextStore, operationId)) continue;
    const rejected = existing.reviewState === "candidate";
    const archived = { ...existing, reviewState: rejected ? "rejected" : existing.reviewState, archived: true, revision: existing.revision + 1 };
    relationsById.set(relationId, archived);
    const receipt = appendReceipt(nextStore, {
      relationId,
      action: rejected ? "reject" : "archive",
      operationId,
      actor: "author",
      source: existing.provenance,
      inputRevision: sourceRevision,
      resultRevision: archived.revision,
      decision: rejected ? "rejected" : "archived",
      createdAt: now
    });
    archived.decisionReceipt = receipt;
    relationsById.set(relationId, archived);
    changed = true;
  }

  if (changed) {
    nextStore.revision += 1;
    nextStore.relations = [...relationsById.values()].sort((left, right) => left.relationId.localeCompare(right.relationId));
    writeStore(root, nextStore);
  }
  const projected = projectRelationContent(root, {
    ...content,
    relationRefs: rows.map((row) => row.ref),
    relationAuthority: { version: RELATION_PROJECTION_VERSION, status: "ready", repositoryRevision: nextStore.revision }
  });
  return {
    content: projected,
    store: nextStore,
    changed,
    relationRefs: rows.map((row) => row.ref),
    relations: rows.map((row) => row.relation)
  };
}

export function projectGraphContent(rootPath, input) {
  const root = prepareRoot(rootPath);
  const content = normalizeGraphInput(input.content || input);
  if (content.relationAuthority?.status !== "ready") return projectLegacyGraphContent(root, content, input.graphDocumentId || "legacy.graph");
  return projectRelationContent(root, content);
}

function projectRelationContent(root, content) {
  const store = readStore(root);
  const relationsById = new Map(store.relations.map((relation) => [relation.relationId, relation]));
  const edges = [];
  const proposals = [];
  for (const ref of content.relationRefs || []) {
    const relation = relationsById.get(ref.relationId);
    if (!relation) throw new Error(`Graph references missing relation: ${ref.relationId}`);
    if (relation.archived) continue;
    const edge = {
      id: ref.visualId,
      relationId: relation.relationId,
      source: ref.source,
      target: ref.target,
      relation: relation.relationLabelSnapshot,
      direction: relation.direction
    };
    if (ref.kind === "candidate" || relation.reviewState === "candidate") {
      proposals.push({
        ...edge,
        origin: relation.provenance.origin === "tree" ? "tree" : "graph",
        sourceDocumentId: relation.provenance.sourceDocumentId || null
      });
    } else if (relation.reviewState === "confirmed") {
      edges.push(edge);
    }
  }
  return {
    nodes: content.nodes,
    edges,
    proposals,
    relationRefs: content.relationRefs || [],
    relationAuthority: content.relationAuthority || { version: RELATION_PROJECTION_VERSION, status: "ready", repositoryRevision: store.revision },
    filters: content.filters
  };
}

export function projectLegacyGraphContent(root, content, graphDocumentId) {
  const relations = [...(content.edges || []), ...(content.proposals || [])];
  const relationRefs = relations.map((edge) => ({
    relationId: edge.relationId || legacyRelationId("legacy-workspace", graphDocumentId, edge.id),
    visualId: edge.id,
    source: edge.source,
    target: edge.target,
    kind: content.proposals?.some((proposal) => proposal.id === edge.id) ? "candidate" : "confirmed"
  }));
  const relationIdsByVisualId = new Map(relationRefs.map((ref) => [ref.visualId, ref.relationId]));
  return {
    nodes: content.nodes,
    edges: (content.edges || []).map((edge) => ({ ...edge, relationId: relationIdsByVisualId.get(edge.id) })),
    proposals: (content.proposals || []).map((proposal) => ({ ...proposal, relationId: relationIdsByVisualId.get(proposal.id) })),
    relationRefs,
    relationAuthority: { version: RELATION_PROJECTION_VERSION, status: "legacy-readonly", migrationRequired: true },
    filters: content.filters || { objectTypes: [] }
  };
}

function buildRows({ root, store, workspaceIdentity, graphDocumentId, sourceRevision, content, currentContent }) {
  const notes = new Set(listWorkspaceNotes(root).map((note) => note.id));
  const nodesById = new Map(content.nodes.map((node) => [node.id, node]));
  const currentRows = [
    ...(currentContent?.edges || []).map((row) => ({ ...row, kind: "confirmed" })),
    ...(currentContent?.proposals || []).map((row) => ({ ...row, kind: "candidate" }))
  ];
  const currentById = new Map(currentRows.map((row) => [row.id, row]));
  const currentByRelationId = new Map(currentRows.filter((row) => row.relationId).map((row) => [row.relationId, row]));
  const currentBySignature = new Map(currentRows.map((row) => [rowSignature(row), row]));
  const currentByLooseSignature = new Map(currentRows.map((row) => [rowLooseSignature(row), row]));
  const rows = [];
  for (const sourceRow of [...content.edges.map((edge) => ({ ...edge, kind: "confirmed" })), ...content.proposals.map((proposal) => ({ ...proposal, kind: "candidate" }))]) {
    const sourceNode = nodesById.get(sourceRow.source);
    const targetNode = nodesById.get(sourceRow.target);
    if (!sourceNode || !targetNode) throw new Error("Graph relation endpoint is not a known GraphNode.");
    if (!notes.has(sourceNode.objectId) || !notes.has(targetNode.objectId)) throw new Error("Graph relation endpoint is not a stable WorldObject reference.");
    if (sourceNode.objectId === targetNode.objectId) throw new Error("Graph relation cannot connect an object to itself.");
    const prior = sourceRow.relationId
      ? currentByRelationId.get(sourceRow.relationId) || currentById.get(sourceRow.id)
      : currentById.get(sourceRow.id) || currentBySignature.get(rowSignature(sourceRow)) || currentByLooseSignature.get(rowLooseSignature(sourceRow));
    let relationId = sourceRow.relationId || prior?.relationId || legacyRelationId(workspaceIdentity, graphDocumentId, sourceRow.id);
    const storedWithSameId = store.relations.find((item) => item.relationId === relationId);
    if (storedWithSameId && (
      storedWithSameId.sourceObjectId !== sourceNode.objectId
      || storedWithSameId.targetObjectId !== targetNode.objectId
      || storedWithSameId.relationLabelSnapshot !== sourceRow.relation
      || storedWithSameId.direction !== normalizeDirection(sourceRow.direction)
    )) {
      relationId = legacyRelationId(workspaceIdentity, graphDocumentId, `${sourceRow.id}:${rowLooseSignature(sourceRow)}:${sourceNode.objectId}:${targetNode.objectId}`);
    }
    const legacyEdgePayloadHash = fingerprint({
      id: sourceRow.id,
      source: sourceRow.source,
      target: sourceRow.target,
      relation: sourceRow.relation,
      direction: normalizeDirection(sourceRow.direction),
      evidenceRefs: sourceRow.evidenceRefs || [],
      origin: sourceRow.origin || null,
      sourceDocumentId: sourceRow.sourceDocumentId || null
    });
    const evidenceRefs = Array.isArray(sourceRow.evidenceRefs) && sourceRow.evidenceRefs.length
      ? clone(sourceRow.evidenceRefs)
      : [{ kind: "legacy-unanchored", graphDocumentId, legacyEdgeId: sourceRow.id, sourceRevision, payloadHash: legacyEdgePayloadHash, conversionVersion: RELATION_PROJECTION_VERSION }];
    const provenance = {
      kind: "graph",
      origin: sourceRow.origin === "tree" ? "tree" : "graph",
      sourceDocumentId: sourceRow.sourceDocumentId || graphDocumentId,
      workspaceIdentity,
      graphDocumentId,
      legacyEdgeId: sourceRow.id,
      legacyEdgePayloadHash,
      conversionVersion: RELATION_PROJECTION_VERSION
    };
    const relation = {
      relationId,
      sourceObjectId: sourceNode.objectId,
      targetObjectId: targetNode.objectId,
      relationTypeId: legacyRelationTypeId(sourceRow.relation),
      relationLabelSnapshot: requireText(sourceRow.relation, "Graph relation", 80),
      direction: normalizeDirection(sourceRow.direction),
      reviewState: sourceRow.kind === "candidate" ? "candidate" : "confirmed",
      evidenceRefs,
      provenance,
      sourceRevision,
      revision: store.relations.find((item) => item.relationId === relationId)?.revision || 0,
      archived: false,
      decisionReceipt: null
    };
    rows.push({
      relation,
      ref: { relationId, visualId: sourceRow.id, source: sourceRow.source, target: sourceRow.target, kind: sourceRow.kind },
      operationId: `graph-reconcile:${graphDocumentId}:${sourceRevision}:${relationId}:${fingerprint(relation)}`,
      diagnostics: evidenceRefs.some((evidence) => evidence.kind === "legacy-unanchored") ? [{ code: "legacy-unanchored", relationId, message: "关系没有精确来源锚点。" }] : []
    });
  }
  const refs = new Set();
  for (const row of rows) {
    if (refs.has(row.ref.relationId)) throw new Error(`Graph relation identity collision: ${row.ref.relationId}`);
    refs.add(row.ref.relationId);
  }
  return rows;
}

function normalizeGraphInput(value) {
  const input = value && typeof value === "object" ? value : {};
  const nodes = Array.isArray(input.nodes) ? input.nodes.map((node) => ({
    id: requireText(node?.id, "Graph node id", 120),
    objectId: requireText(node?.objectId, "Graph node object", 160),
    x: finiteNumber(node?.x, "Graph node x"),
    y: finiteNumber(node?.y, "Graph node y")
  })) : [];
  if (new Set(nodes.map((node) => node.id)).size !== nodes.length) throw new Error("Graph node IDs must be unique.");
  const edges = Array.isArray(input.edges) ? input.edges.map((edge) => normalizeGraphRow(edge, "confirmed")) : [];
  const proposals = Array.isArray(input.proposals) ? input.proposals.map((proposal) => ({ ...normalizeGraphRow(proposal, "candidate"), origin: ["graph", "tree"].includes(proposal?.origin) ? proposal.origin : "graph", sourceDocumentId: proposal?.sourceDocumentId || null })) : [];
  const ids = [...edges, ...proposals].map((row) => row.id);
  if (new Set(ids).size !== ids.length) throw new Error("Graph relationship IDs must be unique.");
  const relationRefs = Array.isArray(input.relationRefs) ? input.relationRefs.map((ref) => ({
    relationId: requireText(ref?.relationId, "Graph relation reference", 180),
    visualId: requireText(ref?.visualId, "Graph relation visual id", 120),
    source: requireText(ref?.source, "Graph relation source", 120),
    target: requireText(ref?.target, "Graph relation target", 120),
    kind: ref?.kind === "candidate" ? "candidate" : "confirmed"
  })) : [];
  return {
    nodes,
    edges,
    proposals,
    relationRefs,
    relationAuthority: input.relationAuthority && typeof input.relationAuthority === "object" ? clone(input.relationAuthority) : null,
    filters: { objectTypes: Array.isArray(input.filters?.objectTypes) ? [...new Set(input.filters.objectTypes.map(String).filter(Boolean))].sort() : [] }
  };
}

function normalizeGraphRow(row, kind) {
  const source = requireText(row?.source, "Graph relation source", 120);
  const target = requireText(row?.target, "Graph relation target", 120);
  if (source === target) throw new Error("Graph relation cannot connect a node to itself.");
  return {
    id: requireText(row?.id, kind === "candidate" ? "Graph proposal id" : "Graph edge id", 120),
    relationId: row?.relationId ? requireText(row.relationId, "Graph relation id", 180) : null,
    source,
    target,
    relation: requireText(row?.relation, "Graph relation", 80),
    direction: normalizeDirection(row?.direction),
    evidenceRefs: Array.isArray(row?.evidenceRefs) ? clone(row.evidenceRefs) : []
  };
}

function relationComparable(relation) {
  return {
    sourceObjectId: relation.sourceObjectId,
    targetObjectId: relation.targetObjectId,
    relationTypeId: relation.relationTypeId,
    relationLabelSnapshot: relation.relationLabelSnapshot,
    direction: relation.direction,
    reviewState: relation.reviewState,
    evidenceRefs: relation.evidenceRefs,
    temporal: relation.temporal || null,
    provenance: relation.provenance,
    sourceRevision: relation.sourceRevision,
    archived: relation.archived,
    supersedesRelationId: relation.supersedesRelationId || null
  };
}

function assertRelationIdentity(existing, next) {
  if (existing.sourceObjectId !== next.sourceObjectId || existing.targetObjectId !== next.targetObjectId) {
    throw new Error("Relation identity collision cannot be repaired by changing endpoints.");
  }
}

function appendReceipt(store, receipt) {
  const receiptId = receipt.receiptId || nextReceiptId(store);
  if (store.receipts.some((item) => item.receiptId === receiptId)) throw new Error("Relation receipt identity already exists.");
  const timestamp = receipt.timestamp || receipt.createdAt || new Date().toISOString();
  const next = { receiptId, timestamp, createdAt: timestamp, ...receipt };
  store.receipts.push(next);
  return next;
}

function nextReceiptId(store) {
  let sequence = store.receipts.length + 1;
  let candidate = `relation-receipt.${sequence}`;
  const existing = new Set(store.receipts.map((receipt) => receipt.receiptId));
  while (existing.has(candidate)) {
    sequence += 1;
    candidate = `relation-receipt.${sequence}`;
  }
  return candidate;
}

function hasOperationReceipt(store, operationId) {
  return store.receipts.some((receipt) => receipt.operationId === operationId);
}

function mergeEvidence(existing, next) {
  const values = [...(Array.isArray(existing) ? existing : []), ...(Array.isArray(next) ? next : [])];
  const seen = new Set();
  return values.filter((item) => {
    const key = JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rowSignature(row) {
  return [row.source, row.target, row.relation, normalizeDirection(row.direction), row.kind || "confirmed"].join("\u0000");
}

function rowLooseSignature(row) {
  return [row.source, row.target, row.relation, normalizeDirection(row.direction)].join("\u0000");
}

function legacyRelationId(workspaceIdentity, graphDocumentId, legacyEdgeId) {
  return `relation.legacy.${fingerprint({ workspaceIdentity, graphDocumentId, legacyEdgeId }).slice(0, 32)}`;
}

function legacyRelationTypeId(label) {
  return `relation-type.${fingerprint(String(label)).slice(0, 24)}`;
}

function fingerprint(value) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function normalizeDirection(value) {
  return ["forward", "reverse", "both", "none"].includes(value) ? value : "none";
}

function readStore(root) {
  const workspace = openStoryWorkspace(root);
  const absolute = path.join(root, RELATION_FILE);
  if (!existsSync(absolute)) return { version: RELATION_REPOSITORY_VERSION, workspaceIdentity: workspace.project.id, revision: 0, relations: [], relationTypes: [], legacyInlineTypes: [], receipts: [] };
  if (lstatSync(absolute).isSymbolicLink()) throw new Error("Relation repository cannot be a symlink.");
  if (readFileSync(absolute).length > MAX_RELATION_FILE_BYTES) throw new Error("Relation repository is too large.");
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(absolute, "utf8"));
  } catch {
    throw new Error("Relation repository contains invalid JSON.");
  }
  if (parsed?.version !== RELATION_REPOSITORY_V1_VERSION && parsed?.version !== RELATION_REPOSITORY_VERSION) throw new Error("Unsupported relation repository version.");
  if (parsed.workspaceIdentity !== workspace.project.id) throw new Error("Relation repository workspace identity does not match the project.");
  const relations = Array.isArray(parsed.relations) ? parsed.relations.map(normalizeStoredRelation) : [];
  const receipts = Array.isArray(parsed.receipts) ? parsed.receipts.map((receipt) => clone(receipt)) : [];
  const relationTypes = parsed.version === RELATION_REPOSITORY_VERSION && Array.isArray(parsed.relationTypes)
    ? parsed.relationTypes.map(normalizeRelationType)
    : [];
  if (new Set(relations.map((relation) => relation.relationId)).size !== relations.length) throw new Error("Relation repository contains duplicate relation IDs.");
  return {
    version: parsed.version,
    workspaceIdentity: parsed.workspaceIdentity,
    revision: Number.isInteger(parsed.revision) && parsed.revision >= 0 ? parsed.revision : 0,
    relations,
    relationTypes,
    legacyInlineTypes: projectLegacyInlineTypes(relations, relationTypes),
    receipts
  };
}

function writeStore(root, store) {
  const absolute = path.join(root, RELATION_FILE);
  mkdirSync(path.dirname(absolute), { recursive: true });
  const serializable = {
    version: RELATION_REPOSITORY_VERSION,
    workspaceIdentity: store.workspaceIdentity,
    revision: store.revision,
    relations: store.relations,
    relationTypes: store.relationTypes,
    receipts: store.receipts
  };
  const content = `${JSON.stringify(serializable, null, 2)}\n`;
  if (Buffer.byteLength(content) > MAX_RELATION_FILE_BYTES) throw new Error("Relation repository is too large.");
  const temporaryPath = `${absolute}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "w" });
  renameSync(temporaryPath, absolute);
}

function normalizeStoredRelation(relation) {
  const relationId = requireText(relation?.relationId, "Relation id", 180);
  return {
    relationId,
    sourceObjectId: requireText(relation?.sourceObjectId, "Relation source object", 160),
    targetObjectId: requireText(relation?.targetObjectId, "Relation target object", 160),
    relationTypeId: requireText(relation?.relationTypeId, "Relation type id", 180),
    relationLabelSnapshot: requireText(relation?.relationLabelSnapshot, "Relation label", 80),
    direction: normalizeDirection(relation?.direction),
    reviewState: ["candidate", "confirmed", "rejected"].includes(relation?.reviewState) ? relation.reviewState : "candidate",
    evidenceRefs: Array.isArray(relation?.evidenceRefs) ? clone(relation.evidenceRefs) : [],
    provenance: relation?.provenance && typeof relation.provenance === "object" ? clone(relation.provenance) : { kind: "unknown" },
    sourceRevision: requireText(relation?.sourceRevision || "unknown", "Relation source revision", 180),
    revision: Number.isInteger(relation?.revision) && relation.revision >= 0 ? relation.revision : 0,
    archived: relation?.archived === true,
    supersedesRelationId: relation?.supersedesRelationId ? requireText(relation.supersedesRelationId, "Superseded Relation id", 180) : null,
    decisionReceipt: relation?.decisionReceipt ? clone(relation.decisionReceipt) : null,
    temporal: normalizeTemporalMetadata(relation?.temporal)
  };
}

function normalizeRelationType(type) {
  const relationTypeId = requireText(type?.relationTypeId, "Relation type id", 180);
  const label = normalizeRelationTypeLabel(type?.label);
  const lifecycle = type?.lifecycle === "retired" ? "retired" : type?.lifecycle === "active" ? "active" : null;
  if (!lifecycle) throw new Error("Relation type lifecycle is invalid.");
  return {
    version: RELATION_TYPE_METADATA_VERSION,
    relationTypeId,
    label,
    description: optionalDescription(type?.description),
    lifecycle,
    typeRevision: Number.isInteger(type?.typeRevision) && type.typeRevision >= 1 ? type.typeRevision : 1,
    repositoryRevision: Number.isInteger(type?.repositoryRevision) && type.repositoryRevision >= 0 ? type.repositoryRevision : 0,
    provenance: type?.provenance && typeof type.provenance === "object" ? clone(type.provenance) : { kind: "unknown" },
    createdAt: typeof type?.createdAt === "string" ? type.createdAt : "unknown",
    updatedAt: typeof type?.updatedAt === "string" ? type.updatedAt : "unknown",
    operationReceipt: type?.operationReceipt ? clone(type.operationReceipt) : null,
    ...(type?.legacyAdoption === true ? { legacyAdoption: true } : {})
  };
}

function projectLegacyInlineTypes(relations, persistedTypes) {
  const persistedIds = new Set(persistedTypes.map((type) => type.relationTypeId));
  const grouped = new Map();
  for (const relation of relations) {
    if (persistedIds.has(relation.relationTypeId)) continue;
    const existing = grouped.get(relation.relationTypeId);
    if (!existing) {
      grouped.set(relation.relationTypeId, {
        version: RELATION_TYPE_METADATA_VERSION,
        relationTypeId: relation.relationTypeId,
        label: relation.relationLabelSnapshot,
        description: null,
        lifecycle: "retired",
        typeRevision: 0,
        repositoryRevision: 0,
        provenance: { kind: "legacy-inline", relationId: relation.relationId },
        createdAt: "unknown",
        updatedAt: "unknown",
        operationReceipt: null,
        legacyInline: true,
        readOnly: true,
        resolution: "unresolved"
      });
    } else if (existing.label !== relation.relationLabelSnapshot) {
      existing.resolution = "unresolved-conflicting-snapshots";
      existing.readOnly = true;
    }
  }
  return [...grouped.values()].sort(compareRelationTypes);
}

function compareRelationTypes(left, right) {
  return left.label.localeCompare(right.label, "zh-CN") || left.relationTypeId.localeCompare(right.relationTypeId);
}

function resolveRelationTypeInStore(store, relationTypeId) {
  return store.relationTypes.find((type) => type.relationTypeId === relationTypeId) || null;
}

function requireActiveRelationType(store, relationTypeId) {
  const type = resolveRelationTypeInStore(store, relationTypeId);
  if (!type) throw new Error("Relation type is unresolved or legacy read-only metadata.");
  if (type.lifecycle !== "active") throw new Error("Retired Relation types cannot be selected for a new Relation.");
  return type;
}

function assertActiveRelationTypeLabelAvailable(store, label, excludingTypeId = null) {
  const key = normalizeRelationTypeLabelKey(label);
  const conflict = store.relationTypes.find((type) =>
    type.relationTypeId !== excludingTypeId
    && type.lifecycle === "active"
    && normalizeRelationTypeLabelKey(type.label) === key
  );
  if (conflict) throw new Error("An active Relation type already uses this label.");
}

function relationTypeIdFromOperation(operationId) {
  return `relation-type.${fingerprint({ kind: "relation-type", operationId }).slice(0, 32)}`;
}

function relationTypeSemanticPayload(type) {
  return {
    relationTypeId: type.relationTypeId,
    label: type.label,
    description: type.description || null,
    lifecycle: type.lifecycle
  };
}

function relationTypeSemanticHash(type) {
  return fingerprint(relationTypeSemanticPayload(type));
}

function normalizeRelationTypeLabel(value) {
  return requireText(value, "Relation type label", 120).normalize("NFC").trim();
}

function normalizeRelationTypeLabelKey(value) {
  return normalizeRelationTypeLabel(value).toLocaleLowerCase();
}

function normalizeRelationSnapshot(value, label) {
  return requireText(value, label, 120).normalize("NFC").trim();
}

function optionalDescription(value) {
  if (value == null || value === "") return null;
  return requireText(value, "Relation type description", 1_000);
}

function optionalSourceRef(value) {
  if (value == null || value === "") return "relation-type-authoring";
  return requireText(value, "Relation type source", 180);
}

function optionalReceiptId(value) {
  if (value == null || value === "") return null;
  return requireText(value, "Author action receipt", 180);
}

function normalizeTimestamp(value) {
  if (value == null || value === "") return new Date().toISOString();
  const timestamp = requireText(value, "Timestamp", 64);
  if (Number.isNaN(Date.parse(timestamp))) throw new Error("Timestamp is invalid.");
  return timestamp;
}

function normalizeSearchText(value) {
  if (typeof value !== "string") throw new Error("Relation search text is invalid.");
  return value.normalize("NFC").trim().toLocaleLowerCase();
}

function relationMatchesText(relation, text, titles, store) {
  const type = resolveRelationTypeInStore(store, relation.relationTypeId) || store.legacyInlineTypes.find((item) => item.relationTypeId === relation.relationTypeId);
  const values = [
    relation.relationLabelSnapshot,
    type?.label || "",
    titles?.get(relation.sourceObjectId) || relation.sourceObjectId,
    titles?.get(relation.targetObjectId) || relation.targetObjectId
  ];
  return values.some((value) => String(value).normalize("NFC").toLocaleLowerCase().includes(text));
}

function prepareStoreForWrite(store) {
  return {
    version: RELATION_REPOSITORY_VERSION,
    workspaceIdentity: store.workspaceIdentity,
    revision: store.revision,
    relations: clone(store.relations),
    relationTypes: clone(store.relationTypes),
    legacyInlineTypes: [],
    receipts: clone(store.receipts)
  };
}

function assertExpectedRepositoryRevision(store, expected) {
  if (expected === undefined || expected === null) return;
  assertExpectedRevision(store.revision, expected, "Relation repository revision is stale.");
}

function assertExpectedRevision(current, expected, message) {
  if (!Number.isInteger(expected) || expected < 0 || current !== expected) throw new Error(message);
}

function requireOperationId(value) {
  return requireText(value, "Relation operation id", 240);
}

function requireDirection(value) {
  if (!(["forward", "reverse", "both", "none"].includes(value))) throw new Error("Relation direction is invalid.");
  return value;
}

function findRelation(store, relationId) {
  const relation = store.relations.find((item) => item.relationId === relationId);
  if (!relation) throw new Error("Relation does not exist.");
  return relation;
}

function replayRelationOperation(store, operationId) {
  const receipt = store.receipts.find((item) => item.operationId === operationId);
  if (!receipt) return null;
  if (receipt.scope && receipt.scope !== "relation") throw new Error("Operation id is already used by a different Relation owner.");
  if (!receipt.relationId) throw new Error("Relation operation receipt is incomplete.");
  const relation = store.relations.find((item) => item.relationId === receipt.relationId);
  if (!relation) throw new Error("Relation operation receipt points to a missing Relation.");
  return { relation: clone(relation), receipt: clone(receipt), idempotent: true };
}

function replayTypeOperation(store, operationId) {
  const receipt = store.receipts.find((item) => item.operationId === operationId);
  if (!receipt) return null;
  if (receipt.scope !== "relation-type" || !receipt.relationTypeId) throw new Error("Operation id is already used by a different Relation owner.");
  const type = store.relationTypes.find((item) => item.relationTypeId === receipt.relationTypeId);
  if (!type) throw new Error("Relation type operation receipt points to missing metadata.");
  return { type: clone(type), receipt: clone(receipt), idempotent: true, repositoryRevision: store.revision };
}

function createRelationCandidateInternal(rootPath, input, options = {}) {
  const root = prepareRoot(rootPath);
  const store = readStore(root);
  const operationId = requireOperationId(input?.operationId);
  const replay = replayRelationOperation(store, operationId);
  if (replay) return replay;
  const relationId = requireText(options.relationId || input?.relationId || `relation.manual.${fingerprint({ workspaceIdentity: store.workspaceIdentity, operationId }).slice(0, 32)}`, "Relation id", 180);
  if (store.relations.some((relation) => relation.relationId === relationId)) throw new Error("Relation already exists; use a state-specific update operation.");
  const relation = buildCandidateRelation(root, store, { ...input, relationId }, options);
  return commitRelationMutation(root, store, null, relation, {
    action: "create-relation-candidate",
    operationId,
    actor: input?.actor,
    inputRevision: 0,
    source: relation.provenance,
    authorActionReceiptId: input?.authorActionReceiptId,
    now: input?.now,
    decision: "candidate",
    supersedesRelationId: relation.supersedesRelationId
  });
}

function buildCandidateRelation(root, store, input, options = {}) {
  const sourceObjectId = requireText(input?.sourceObjectId, "Relation source object", 160);
  const targetObjectId = requireText(input?.targetObjectId, "Relation target object", 160);
  if (sourceObjectId === targetObjectId) throw new Error("Relation cannot connect an object to itself.");
  const known = new Set(listWorkspaceNotes(root).map((note) => note.id));
  if (!known.has(sourceObjectId) || !known.has(targetObjectId)) throw new Error("Relation endpoint is not a stable WorldObject reference.");
  const unresolvedType = options.unresolvedType === true;
  const relationTypeId = unresolvedType ? UNRESOLVED_RELATION_TYPE_ID : requireText(input?.relationTypeId, "Relation type id", 180);
  const type = unresolvedType ? null : requireActiveRelationType(store, relationTypeId);
  if (!unresolvedType && input?.relationLabelSnapshot !== undefined && normalizeRelationSnapshot(input.relationLabelSnapshot, "Relation label snapshot") !== type.label) {
    throw new Error("Relation label snapshot does not match the selected Relation type.");
  }
  const actor = requireText(input?.actor || "author", "Relation actor", 120);
  const now = normalizeTimestamp(input?.now);
  const manualEvidence = {
    kind: "manual-author",
    operationId: requireOperationId(input?.operationId),
    receiptId: nextReceiptId(store),
    actor,
    createdAt: now
  };
  const evidenceRefs = [manualEvidence, ...normalizeEvidenceSet(input?.evidenceRefs)];
  const supersedesRelationId = options.supersedesRelationId ? requireText(options.supersedesRelationId, "Superseded Relation id", 180) : null;
  const authorActionReceiptId = optionalReceiptId(input?.authorActionReceiptId);
  const provenance = unresolvedType
    ? { kind: "prediction-unresolved-type", operationId: input.operationId, actor, sourceRef: optionalSourceRef(input?.sourceRef), ...(authorActionReceiptId ? { authorActionReceiptId } : {}) }
    : options.correction
      ? { kind: "correction", operationId: input.operationId, actor, supersedesRelationId, ...(authorActionReceiptId ? { authorActionReceiptId } : {}) }
      : { kind: "manual-author", operationId: input.operationId, actor, sourceRef: optionalSourceRef(input?.sourceRef), ...(authorActionReceiptId ? { authorActionReceiptId } : {}) };
  return {
    relationId: requireText(input?.relationId, "Relation id", 180),
    sourceObjectId,
    targetObjectId,
    relationTypeId,
    relationLabelSnapshot: unresolvedType ? UNRESOLVED_RELATION_TYPE_LABEL : type.label,
    direction: input?.direction === undefined ? "none" : requireDirection(input.direction),
    reviewState: "candidate",
    evidenceRefs,
    provenance,
    sourceRevision: requireText(input?.sourceRevision || "manual", "Relation source revision", 180),
    revision: 1,
    archived: false,
    supersedesRelationId,
    decisionReceipt: null,
    temporal: normalizeTemporalMetadata(input?.temporal)
  };
}

function normalizeTemporalMetadata(value) {
  if (value == null) return null;
  if (!isPlainObject(value)) throw new Error("Relation temporal metadata must be a plain object.");
  const validFrom = value.validFrom == null || value.validFrom === "" ? null : requireText(value.validFrom, "Relation validFrom", 80);
  const validTo = value.validTo == null || value.validTo === "" ? null : requireText(value.validTo, "Relation validTo", 80);
  if (validFrom && validTo && Date.parse(validFrom) > Date.parse(validTo)) throw new Error("Relation temporal range is invalid.");
  const confidence = ["high", "medium", "low", "unknown"].includes(value.confidence) ? value.confidence : "unknown";
  const sourceAnchors = value.sourceAnchors == null ? [] : value.sourceAnchors;
  if (!Array.isArray(sourceAnchors) || sourceAnchors.length > 32) throw new Error("Relation temporal source anchors are invalid.");
  return {
    version: "story-relation-temporal/v1",
    validFrom,
    validTo,
    ...(value?.orderConstraint === "source-before-target" || value?.orderConstraint === "source-after-target" ? { orderConstraint: value.orderConstraint } : {}),
    confidence,
    sourceAnchors: [...new Set(sourceAnchors.map((item) => requireText(item, "Relation temporal source anchor", 240)))]
  };
}

function normalizeEvidenceSet(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 64) throw new Error("Relation evidence set is invalid.");
  return value.map((evidence) => normalizeEvidence(evidence));
}

function normalizeEvidence(evidence) {
  if (!isPlainObject(evidence)) throw new Error("Relation evidence must be a plain object.");
  const kind = requireText(evidence.kind, "Relation evidence kind", 80);
  if (kind === "manual-author") throw new Error("Manual author evidence is generated by the Relation operation.");
  if (kind === "source-anchor") validateSourceAnchor(evidence.anchor || evidence);
  else if (kind === "confirmed-event") validateEventReference(evidence.reference || evidence.eventReference || evidence);
  else if (kind === "legacy-unanchored") validateLegacyEvidence(evidence);
  return clone(evidence);
}

function validateSourceAnchor(anchor) {
  if (!isPlainObject(anchor)) throw new Error("Source anchor evidence is invalid.");
  for (const key of ["sourceDocumentId", "revisionId", "revisionHash", "excerptHash", "excerpt"]) requireText(anchor[key], `Source anchor ${key}`, 1_000);
  if (!/^[a-f0-9]{64}$/u.test(anchor.revisionHash) || !/^[a-f0-9]{64}$/u.test(anchor.excerptHash)) throw new Error("Source anchor hashes are invalid.");
  for (const key of ["lineStart", "lineEnd", "charStart", "charEnd"]) {
    if (!Number.isInteger(anchor[key]) || anchor[key] < 0 || anchor[key] > 10_000_000) throw new Error("Source anchor range is invalid.");
  }
  if (anchor.lineEnd < anchor.lineStart || anchor.charEnd < anchor.charStart || String(anchor.excerpt).length > 480) throw new Error("Source anchor range is invalid.");
  if (anchor.blockId !== null && typeof anchor.blockId !== "string") throw new Error("Source anchor block is invalid.");
  if (fingerprint(String(anchor.excerpt)) !== anchor.excerptHash) throw new Error("Source anchor excerpt hash does not match its excerpt.");
}

function validateEventReference(reference) {
  if (!isPlainObject(reference)) throw new Error("Confirmed Event evidence is invalid.");
  const keys = ["version", "projectId", "eventId", "revisionToken", "state", "requestedUse"];
  if (Object.keys(reference).sort().join("\u0000") !== [...keys].sort().join("\u0000")) throw new Error("Confirmed Event reference fields are invalid.");
  if (reference.version !== "story-studio-event-reference/v1") throw new Error("Confirmed Event reference version is invalid.");
  if (typeof reference.projectId !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(reference.projectId)) throw new Error("Confirmed Event project is invalid.");
  if (typeof reference.eventId !== "string" || !/^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,159}$/u.test(reference.eventId)) throw new Error("Confirmed Event id is invalid.");
  if (typeof reference.revisionToken !== "string" || !/^[a-f0-9]{64}$/u.test(reference.revisionToken)) throw new Error("Confirmed Event revision is invalid.");
  if (reference.state !== "committed" || reference.requestedUse !== "constraint") throw new Error("Only committed constraint Event evidence is eligible.");
}

function validateLegacyEvidence(evidence) {
  for (const key of ["graphDocumentId", "legacyEdgeId", "sourceRevision", "conversionVersion"]) requireText(evidence[key], `Legacy evidence ${key}`, 240);
  if (typeof evidence.payloadHash !== "string" || !/^[a-f0-9]{64}$/u.test(evidence.payloadHash)) throw new Error("Legacy evidence payload hash is invalid.");
}

function preserveManualAuthorEvidence(store, current, additional) {
  const manual = current.evidenceRefs.filter((evidence) => evidence?.kind === "manual-author");
  if (!manual.length) throw new Error("Relation is missing its manual author provenance.");
  return mergeEvidence(manual, additional);
}

function assertCandidateIsEditable(relation) {
  if (relation.reviewState !== "candidate" || relation.archived) {
    if (relation.reviewState === "rejected" || relation.archived) throw new Error("Rejected or archived Relations cannot be restored.");
    throw new Error("Only a pending Relation candidate can be edited.");
  }
}

function assertRelationEvidenceConfirmable(store, relation, options) {
  const statuses = evaluateRelationEvidence(store, relation, options);
  const blocked = statuses.find((status) => status.status !== "current");
  if (blocked) throw new Error(`Relation evidence is not eligible for confirmation: ${blocked.message}`);
}

function assertEvidenceSetCurrent(store, relation, evidenceRefs, options) {
  const statuses = evaluateRelationEvidence(store, { ...relation, evidenceRefs }, options);
  const blocked = statuses.find((status) => status.status !== "current");
  if (blocked) throw new Error(`Relation evidence is stale or unsupported: ${blocked.message}`);
}

function evaluateRelationEvidence(store, relation, options = {}) {
  return relation.evidenceRefs.map((evidence, index) => {
    const kind = typeof evidence?.kind === "string" ? evidence.kind : "unknown";
    try {
      if (kind === "manual-author") {
        const receipt = store.receipts.find((item) =>
          item.relationId === relation.relationId
          && item.operationId === evidence.operationId
          && item.receiptId === evidence.receiptId
        );
        if (!receipt) return evidenceStatus(index, kind, "unsupported", false, "manual-author evidence does not resolve to this Relation receipt.", "manual-receipt-missing");
        return evidenceStatus(index, kind, "current", true, "作者手动建立。", null);
      }
      if (kind === "source-anchor" || kind === "confirmed-event") {
        if (typeof options.resolveEvidence !== "function") return evidenceStatus(index, kind, "unsupported", false, "Relation evidence freshness resolver is required.", "freshness-resolver-missing");
        const resolved = options.resolveEvidence(evidence, { relation, index });
        const status = resolved?.status === "current" ? "current" : resolved?.status === "stale" ? "stale" : "unsupported";
        return evidenceStatus(index, kind, status, status === "current", resolved?.message || "Relation evidence could not be resolved.", resolved?.code || "evidence-unresolved");
      }
      if (kind === "legacy-unanchored") return evidenceStatus(index, kind, "legacy-unanchored", false, "Legacy graph evidence is read-only and cannot confirm a new Relation.", "legacy-unanchored");
      return evidenceStatus(index, kind, "unsupported", false, "Unsupported legacy Relation evidence is preserved read-only.", "unknown-evidence");
    } catch (error) {
      return evidenceStatus(index, kind, "unsupported", false, error instanceof Error ? error.message : "Relation evidence is invalid.", "evidence-invalid");
    }
  });
}

function evidenceStatus(index, kind, status, eligible, message, code) {
  return { index, kind, status, eligible, message, code };
}

function commitRelationMutation(root, store, current, relation, input) {
  if (!current && store.relations.some((item) => item.relationId === relation.relationId)) throw new Error("Relation already exists; operation identity cannot be reused for another Relation.");
  const actor = requireText(input.actor || "author", "Relation actor", 120);
  const now = normalizeTimestamp(input.now);
  const nextStore = prepareStoreForWrite(store);
  const repositoryRevision = store.revision + 1;
  const receipt = appendReceipt(nextStore, {
    scope: "relation",
    relationId: relation.relationId,
    action: input.action,
    actor,
    operationId: requireOperationId(input.operationId),
    inputRevision: input.inputRevision,
    resultRevision: relation.revision,
    repositoryRevision,
    decision: input.decision,
    source: input.source || relation.provenance,
    supersedesRelationId: input.supersedesRelationId || relation.supersedesRelationId || null,
    beforeSemanticHash: current ? relationSemanticHash(current) : null,
    afterSemanticHash: relationSemanticHash(relation),
    authorActionReceiptId: optionalReceiptId(input.authorActionReceiptId),
    timestamp: now,
    createdAt: now
  });
  const persisted = { ...relation, decisionReceipt: receipt };
  nextStore.revision = repositoryRevision;
  nextStore.relations = [...nextStore.relations.filter((item) => item.relationId !== relation.relationId), persisted].sort((left, right) => left.relationId.localeCompare(right.relationId));
  writeStore(root, nextStore);
  return { relation: clone(persisted), receipt: clone(receipt), idempotent: false, repositoryRevision };
}

function relationSemanticPayload(relation) {
  return {
    relationId: relation.relationId,
    sourceObjectId: relation.sourceObjectId,
    targetObjectId: relation.targetObjectId,
    relationTypeId: relation.relationTypeId,
    relationLabelSnapshot: relation.relationLabelSnapshot,
    direction: relation.direction,
    reviewState: relation.reviewState,
    evidenceRefs: relation.evidenceRefs,
    temporal: relation.temporal || null,
    provenance: relation.provenance,
    sourceRevision: relation.sourceRevision,
    archived: relation.archived,
    supersedesRelationId: relation.supersedesRelationId || null
  };
}

function relationSemanticHash(relation) {
  return fingerprint(relationSemanticPayload(relation));
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
}

function prepareRoot(rootPath) {
  const absolute = path.resolve(String(rootPath || ""));
  openStoryWorkspace(absolute);
  if (lstatSync(absolute).isSymbolicLink()) throw new Error("Workspace root cannot be a symlink.");
  return realpathSync(absolute);
}

function requireText(value, label, maxLength) {
  const text = String(value ?? "").normalize("NFC").trim();
  if (!text || text.length > maxLength || /[\u0000-\u001f]/.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function finiteNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) > 1_000_000) throw new Error(`${label} is invalid.`);
  return number;
}

function clone(value) {
  return structuredClone(value);
}
