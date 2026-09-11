import { createHash } from "node:crypto";

import * as relationRepositoryModule from "../storyWorkspace/relationRepository.mjs";
import { readSourceImportR0, type SourceAnchorR0 } from "./sourceImportReviewR0.ts";
import {
  assertStoryStudioEventReferenceEligibility,
  normalizeStoryStudioEventReference,
  type StoryStudioEventReference
} from "../storyContracts/storyStudioEventReference.ts";
import { createStoryStudioWorkVersionAuthority } from "../storyWorkspace/workVersionAuthority.ts";

export type RelationDirectionR0 = "forward" | "reverse" | "both" | "none";
export type RelationReviewStateR0 = "candidate" | "confirmed" | "rejected";
export type RelationEvidenceRefR0 = { kind: string; [key: string]: unknown };
export type RelationTemporalMetadataR0 = {
  version: "story-relation-temporal/v1";
  validFrom: string | null;
  validTo: string | null;
  orderConstraint?: "source-before-target" | "source-after-target";
  confidence: "high" | "medium" | "low" | "unknown";
  sourceAnchors: string[];
};

export type RelationReceiptR0 = {
  receiptId: string;
  scope?: "relation" | "relation-type" | "relation-version-fork";
  relationId?: string;
  relationTypeId?: string;
  workVersionId?: string | null;
  action: string;
  actor: string;
  operationId: string;
  inputRevision: number | string | null;
  resultRevision: number;
  repositoryRevision?: number;
  timestamp: string;
  createdAt?: string;
  beforeSemanticHash?: string | null;
  afterSemanticHash?: string;
  authorActionReceiptId?: string | null;
  decision?: string;
  [key: string]: unknown;
};

export type RelationRecordR0 = {
  relationId: string;
  /** null is mainline/legacy; a stable id is one derived IF slice. */
  workVersionId?: string;
  inheritedFromWorkVersionId?: string;
  sourceObjectId: string;
  targetObjectId: string;
  relationTypeId: string;
  relationLabelSnapshot: string;
  direction: RelationDirectionR0;
  reviewState: RelationReviewStateR0;
  evidenceRefs: RelationEvidenceRefR0[];
  provenance: Record<string, unknown>;
  sourceRevision: string;
  revision: number;
  archived: boolean;
  supersedesRelationId: string | null;
  decisionReceipt: RelationReceiptR0 | null;
  temporal?: RelationTemporalMetadataR0 | null;
};

export type RelationTypeDefinitionR0 = {
  version: "story-relation-type-definition/v1";
  relationTypeId: string;
  label: string;
  description: string | null;
  lifecycle: "active" | "retired";
  typeRevision: number;
  repositoryRevision: number;
  provenance: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  operationReceipt: RelationReceiptR0 | null;
  legacyInline?: boolean;
  legacyAdoption?: boolean;
  readOnly?: boolean;
  resolution?: string;
};

export type RelationEvidenceStatusR0 = {
  index: number;
  kind: string;
  status: "current" | "stale" | "unsupported" | "legacy-unanchored";
  eligible: boolean;
  message: string;
  code: string | null;
};

export type RelationReadProjectionR0 = RelationRecordR0 & {
  currentTypeLabel: string | null;
  relationType: RelationTypeDefinitionR0 | null;
  relationTypeResolution?: "resolved" | "unresolved";
  evidenceWarnings: RelationEvidenceStatusR0[];
};

export type RelationMutationResultR0 = {
  relation: RelationRecordR0;
  receipt: RelationReceiptR0;
  idempotent: boolean;
  repositoryRevision?: number;
};

export type RelationTypeMutationResultR0 = {
  type: RelationTypeDefinitionR0;
  receipt: RelationReceiptR0;
  idempotent: boolean;
  repositoryRevision?: number;
};

type WorkspaceOperationsR0 = {
  resolveProjectWorkspacePath(input: { projectId: string }): string;
  readWorldObject(input: { projectId: string; objectId: string }): { id: string; type: string; status: string; revisionToken: string };
};

type RelationRepositoryStoreR0 = {
  version: string;
  revision: number;
  relations: RelationRecordR0[];
  relationTypes: RelationTypeDefinitionR0[];
  legacyInlineTypes: RelationTypeDefinitionR0[];
  receipts: RelationReceiptR0[];
};

type RelationRepositoryModuleR0 = {
  adoptLegacyRelationType(rootPath: string, input: Record<string, unknown>): unknown;
  appendRelationEvidence(rootPath: string, input: Record<string, unknown>, options?: Record<string, unknown>): unknown;
  archiveConfirmedRelation(rootPath: string, input: Record<string, unknown>): unknown;
  confirmRelationCandidate(rootPath: string, input: Record<string, unknown>, options?: Record<string, unknown>): unknown;
  createRelationCandidate(rootPath: string, input: Record<string, unknown>): unknown;
  createUnresolvedRelationCandidate(rootPath: string, input: Record<string, unknown>): unknown;
  createRelationCorrectionCandidate(rootPath: string, input: Record<string, unknown>): unknown;
  forkRelationWorkVersion(rootPath: string, input: Record<string, unknown>): unknown;
  createRelationType(rootPath: string, input: Record<string, unknown>): unknown;
  inspectRelationEvidence(rootPath: string, input: Record<string, unknown>, options?: Record<string, unknown>): unknown;
  listRelationTypes(rootPath: string): unknown;
  previewLegacyRelationTypeAdoption(rootPath: string, input: Record<string, unknown>): unknown;
  queryRelationDuplicateSuggestions(rootPath: string, input: Record<string, unknown>): unknown;
  queryRelations(rootPath: string, query?: Record<string, unknown>): RelationRecordR0[];
  readRelationRepository(rootPath: string): RelationRepositoryStoreR0;
  rejectRelationCandidate(rootPath: string, input: Record<string, unknown>): unknown;
  resolveRelationType(rootPath: string, relationTypeId: string): RelationTypeDefinitionR0 | null;
  retireRelationType(rootPath: string, input: Record<string, unknown>): unknown;
  updateRelationCandidate(rootPath: string, input: Record<string, unknown>): unknown;
  updateRelationType(rootPath: string, input: Record<string, unknown>): unknown;
};

const relationRepository = relationRepositoryModule as unknown as RelationRepositoryModuleR0;

type RelationOperationInput = {
  projectId: string;
  /** The public WorkVersion identity; root is normalized to the legacy null slice. */
  workVersionId?: string | null;
  authorActionReceiptId?: string;
  actor?: string;
  operationId: string;
  now?: string;
  [key: string]: unknown;
};

export function createStoryStudioRelationOperations(input: {
  workspaceOperations: WorkspaceOperationsR0;
  verifyCanonEventRead?: (value: { projectId: string; eventId: string; workVersionId?: string | null }) => boolean;
}) {
  function projectPath(projectId: string): string {
    return input.workspaceOperations.resolveProjectWorkspacePath({ projectId });
  }

  function relationWorkVersionScope(projectId: string, requested: string | null | undefined): string | null | undefined {
    const authority = createStoryStudioWorkVersionAuthority({ projectRoot: projectPath(projectId) });
    const versions = authority.listVersions();
    if (requested === undefined) {
      // Compatibility data predates WorkVersion receipts.  Until a project has
      // a version authority, preserve its single mainline slice rather than
      // guessing that old facts belong to every later IF.
      return versions.length ? null : undefined;
    }
    if (requested === null) return null;
    const version = authority.getVersion(requested);
    // `authority` is opened through this project's resolved workspace path;
    // the persisted project id is an internal workspace identity and need not
    // equal the public folder slug used by the control surface.
    return version.identity.kind === "root" ? null : version.identity.workVersionId;
  }

  function scopedRelationRequest<T extends RelationOperationInput>(request: T): Record<string, unknown> {
    return { ...withoutProject(request), workVersionId: relationWorkVersionScope(request.projectId, request.workVersionId) };
  }

  function evidenceResolver(projectId: string, rootPath: string, workVersionId: string | null | undefined) {
    return (evidence: RelationEvidenceRefR0) => resolveEvidence(rootPath, projectId, evidence, input.workspaceOperations, input.verifyCanonEventRead, workVersionId);
  }

  function projectRelation(projectId: string, relation: RelationRecordR0): RelationReadProjectionR0 {
    const rootPath = projectPath(projectId);
    const type = relationRepository.resolveRelationType(rootPath, relation.relationTypeId);
    const evidence = relationRepository.inspectRelationEvidence(rootPath, { relationId: relation.relationId, workVersionId: relation.workVersionId || null }, { resolveEvidence: evidenceResolver(projectId, rootPath, relation.workVersionId || null) }) as unknown as { warnings: RelationEvidenceStatusR0[] };
    const { workVersionId, inheritedFromWorkVersionId, ...record } = relation;
    return {
      ...record,
      ...(workVersionId ? { workVersionId } : {}),
      ...(inheritedFromWorkVersionId ? { inheritedFromWorkVersionId } : {}),
      currentTypeLabel: type?.label || null,
      relationType: type,
      relationTypeResolution: relation.relationTypeId === "relation-type.unresolved" ? "unresolved" : "resolved",
      evidenceWarnings: evidence.warnings as RelationEvidenceStatusR0[]
    };
  }

  return {
    listRelations(request: { projectId: string; workVersionId?: string | null; includeArchived?: boolean; reviewState?: RelationReviewStateR0; objectId?: string; relationTypeId?: string; direction?: RelationDirectionR0; text?: string }): { repositoryVersion: string; repositoryRevision: number; relations: RelationReadProjectionR0[] } {
      const rootPath = projectPath(request.projectId);
      const store = relationRepository.readRelationRepository(rootPath);
      const workVersionId = relationWorkVersionScope(request.projectId, request.workVersionId);
      const relations = relationRepository.queryRelations(rootPath, { ...request, workVersionId }).map((relation) => projectRelation(request.projectId, relation));
      return { repositoryVersion: String(store.version), repositoryRevision: store.revision, relations };
    },

    readRelation(request: { projectId: string; relationId: string; workVersionId?: string | null }): { relation: RelationReadProjectionR0; receipts: RelationReceiptR0[] } {
      const rootPath = projectPath(request.projectId);
      const workVersionId = relationWorkVersionScope(request.projectId, request.workVersionId);
      const relation = relationRepository.queryRelations(rootPath, { includeArchived: true, ...(workVersionId !== undefined ? { workVersionId } : {}) }).find((item) => item.relationId === request.relationId);
      if (!relation) throw new Error("Relation does not exist.");
      return { relation: projectRelation(request.projectId, relation), receipts: relationRepository.readRelationRepository(rootPath).receipts.filter((receipt) => receipt.relationId === relation.relationId && (receipt.workVersionId || null) === (relation.workVersionId || null)) };
    },

    listRelationTypes(request: { projectId: string }): { repositoryRevision: number; types: RelationTypeDefinitionR0[] } {
      const rootPath = projectPath(request.projectId);
      const store = relationRepository.readRelationRepository(rootPath);
      return { repositoryRevision: store.revision, types: relationRepository.listRelationTypes(rootPath) as RelationTypeDefinitionR0[] };
    },

    resolveRelationType(request: { projectId: string; relationTypeId: string }): RelationTypeDefinitionR0 | null {
      return relationRepository.resolveRelationType(projectPath(request.projectId), request.relationTypeId);
    },

    duplicateSuggestions(request: { projectId: string; workVersionId?: string | null; sourceObjectId: string; targetObjectId: string; relationTypeId: string; direction: RelationDirectionR0; relationLabelSnapshot: string }) {
      return relationRepository.queryRelationDuplicateSuggestions(projectPath(request.projectId), { ...request, workVersionId: relationWorkVersionScope(request.projectId, request.workVersionId) });
    },

    relationEvidence(request: { projectId: string; relationId: string; workVersionId?: string | null }): { relationId: string; statuses: RelationEvidenceStatusR0[]; warnings: RelationEvidenceStatusR0[] } {
      const rootPath = projectPath(request.projectId);
      const workVersionId = relationWorkVersionScope(request.projectId, request.workVersionId);
      return relationRepository.inspectRelationEvidence(rootPath, { relationId: request.relationId, ...(workVersionId !== undefined ? { workVersionId } : {}) }, { resolveEvidence: evidenceResolver(request.projectId, rootPath, workVersionId) }) as unknown as { relationId: string; statuses: RelationEvidenceStatusR0[]; warnings: RelationEvidenceStatusR0[] };
    },

    createRelationType(request: RelationOperationInput): RelationTypeMutationResultR0 {
      return relationRepository.createRelationType(projectPath(request.projectId), withoutProject(request)) as RelationTypeMutationResultR0;
    },

    updateRelationType(request: RelationOperationInput): RelationTypeMutationResultR0 {
      return relationRepository.updateRelationType(projectPath(request.projectId), withoutProject(request)) as RelationTypeMutationResultR0;
    },

    retireRelationType(request: RelationOperationInput): RelationTypeMutationResultR0 {
      return relationRepository.retireRelationType(projectPath(request.projectId), withoutProject(request)) as RelationTypeMutationResultR0;
    },

    previewLegacyRelationTypeAdoption(request: { projectId: string; relationTypeId: string }) {
      return relationRepository.previewLegacyRelationTypeAdoption(projectPath(request.projectId), request);
    },

    adoptLegacyRelationType(request: RelationOperationInput): RelationTypeMutationResultR0 {
      return relationRepository.adoptLegacyRelationType(projectPath(request.projectId), withoutProject(request)) as RelationTypeMutationResultR0;
    },

    createRelationCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.createRelationCandidate(projectPath(request.projectId), scopedRelationRequest(request)) as RelationMutationResultR0;
    },

    createUnresolvedRelationCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.createUnresolvedRelationCandidate(projectPath(request.projectId), scopedRelationRequest(request)) as RelationMutationResultR0;
    },

    updateRelationCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.updateRelationCandidate(projectPath(request.projectId), scopedRelationRequest(request)) as RelationMutationResultR0;
    },

    confirmRelationCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      const rootPath = projectPath(request.projectId);
      const scoped = scopedRelationRequest(request);
      return relationRepository.confirmRelationCandidate(rootPath, scoped, { resolveEvidence: evidenceResolver(request.projectId, rootPath, scoped.workVersionId as string | null | undefined) }) as RelationMutationResultR0;
    },

    rejectRelationCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.rejectRelationCandidate(projectPath(request.projectId), scopedRelationRequest(request)) as RelationMutationResultR0;
    },

    archiveConfirmedRelation(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.archiveConfirmedRelation(projectPath(request.projectId), scopedRelationRequest(request)) as RelationMutationResultR0;
    },

    appendRelationEvidence(request: RelationOperationInput): RelationMutationResultR0 {
      const rootPath = projectPath(request.projectId);
      const scoped = scopedRelationRequest(request);
      return relationRepository.appendRelationEvidence(rootPath, scoped, { resolveEvidence: evidenceResolver(request.projectId, rootPath, scoped.workVersionId as string | null | undefined) }) as RelationMutationResultR0;
    },

    createRelationCorrectionCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.createRelationCorrectionCandidate(projectPath(request.projectId), scopedRelationRequest(request)) as RelationMutationResultR0;
    },

    forkRelationWorkVersion(request: { projectId: string; parentWorkVersionId: string | null; childWorkVersionId: string; operationId: string; now?: string }) {
      const parentWorkVersionId = relationWorkVersionScope(request.projectId, request.parentWorkVersionId);
      const childWorkVersionId = relationWorkVersionScope(request.projectId, request.childWorkVersionId);
      if (!childWorkVersionId) throw new Error("Relation IF fork target must be a derived WorkVersion.");
      return relationRepository.forkRelationWorkVersion(projectPath(request.projectId), { parentWorkVersionId: parentWorkVersionId || null, inheritedFromWorkVersionId: request.parentWorkVersionId, childWorkVersionId, operationId: request.operationId, ...(request.now ? { now: request.now } : {}) });
    }
  };
}

function withoutProject(value: RelationOperationInput): Record<string, unknown> {
  const { projectId: _projectId, ...rest } = value;
  return rest;
}

function resolveEvidence(
  projectPath: string,
  projectId: string,
  evidence: RelationEvidenceRefR0,
  workspaceOperations: WorkspaceOperationsR0,
  verifyCanonEventRead?: (value: { projectId: string; eventId: string; workVersionId?: string | null }) => boolean,
  workVersionId?: string | null
): { status: "current" | "stale" | "unsupported"; code: string; message: string } {
  if (evidence.kind === "source-anchor") return resolveSourceAnchor(projectPath, projectId, evidence.anchor || evidence);
  if (evidence.kind === "confirmed-event") return resolveConfirmedEvent(projectId, evidence.reference || evidence.eventReference || evidence, workspaceOperations, verifyCanonEventRead, workVersionId);
  return { status: "unsupported", code: "evidence-kind-unsupported", message: "Relation evidence kind is not freshness-resolvable." };
}

function resolveSourceAnchor(projectPath: string, projectId: string, value: unknown): { status: "current" | "stale"; code: string; message: string } {
  const anchor = value as Partial<SourceAnchorR0>;
  try {
    const document = readSourceImportR0(projectPath, String(anchor.sourceDocumentId || ""));
    if (!document || document.projectId !== projectId) return staleEvidence("source-document-missing", "Source anchor no longer resolves to this project.");
    if (document.currentRevisionId !== anchor.revisionId || document.currentRevisionHash !== anchor.revisionHash) return staleEvidence("source-revision-stale", "Source anchor points to a stale source revision.");
    const revision = document.revisions.find((item) => item.revisionId === anchor.revisionId && item.revisionHash === anchor.revisionHash);
    if (!revision) return staleEvidence("source-revision-missing", "Source anchor revision is unavailable.");
    const segment = revision.segments.find((item) =>
      item.lineStart === anchor.lineStart
      && item.lineEnd === anchor.lineEnd
      && item.charStart === anchor.charStart
      && item.charEnd === anchor.charEnd
      && item.blockId === anchor.blockId
    );
    if (!segment) return staleEvidence("source-range-stale", "Source anchor range or block no longer matches.");
    const excerpt = String(anchor.excerpt || "");
    if (revision.content.slice(anchor.charStart || 0, (anchor.charStart || 0) + excerpt.length) !== excerpt || sha256(excerpt) !== anchor.excerptHash) {
      return staleEvidence("source-excerpt-stale", "Source anchor excerpt no longer matches the current content.");
    }
    return { status: "current", code: "source-anchor-current", message: "Source anchor is current." };
  } catch (error) {
    return staleEvidence("source-anchor-invalid", error instanceof Error ? error.message : "Source anchor is unavailable.");
  }
}

function resolveConfirmedEvent(
  projectId: string,
  value: unknown,
  workspaceOperations: WorkspaceOperationsR0,
  verifyCanonEventRead?: (value: { projectId: string; eventId: string; workVersionId?: string | null }) => boolean,
  workVersionId?: string | null
): { status: "current" | "stale"; code: string; message: string } {
  try {
    const reference = normalizeStoryStudioEventReference(value) as StoryStudioEventReference;
    if (reference.projectId !== projectId) return staleEvidence("event-project-mismatch", "Confirmed Event belongs to another project.");
    const event = workspaceOperations.readWorldObject({ projectId, objectId: reference.eventId });
    const canonVerified = Boolean(verifyCanonEventRead?.({ projectId, eventId: reference.eventId, ...(workVersionId ? { workVersionId } : {}) }));
    assertStoryStudioEventReferenceEligibility({
      reference,
      event: { id: event.id, type: event.type, status: event.status, revisionToken: event.revisionToken },
      consumer: "canon-material",
      canonVerified
    });
    return { status: "current", code: "confirmed-event-current", message: "Confirmed Event is current and Canon verified." };
  } catch (error) {
    return staleEvidence("confirmed-event-stale", error instanceof Error ? error.message : "Confirmed Event is unavailable.");
  }
}

function staleEvidence(code: string, message: string): { status: "stale"; code: string; message: string } {
  return { status: "stale", code, message };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
