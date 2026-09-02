import { createHash } from "node:crypto";

import * as relationRepositoryModule from "../storyWorkspace/relationRepository.mjs";
import { readSourceImportR0, type SourceAnchorR0 } from "./sourceImportReviewR0.ts";
import {
  assertStoryStudioEventReferenceEligibility,
  normalizeStoryStudioEventReference,
  type StoryStudioEventReference
} from "../storyContracts/storyStudioEventReference.ts";

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
  scope?: "relation" | "relation-type";
  relationId?: string;
  relationTypeId?: string;
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
  authorActionReceiptId?: string;
  actor?: string;
  operationId: string;
  now?: string;
  [key: string]: unknown;
};

export function createStoryStudioRelationOperations(input: {
  workspaceOperations: WorkspaceOperationsR0;
  verifyCanonEventRead?: (value: { projectId: string; eventId: string }) => boolean;
}) {
  function projectPath(projectId: string): string {
    return input.workspaceOperations.resolveProjectWorkspacePath({ projectId });
  }

  function evidenceResolver(projectId: string, rootPath: string) {
    return (evidence: RelationEvidenceRefR0) => resolveEvidence(rootPath, projectId, evidence, input.workspaceOperations, input.verifyCanonEventRead);
  }

  function projectRelation(projectId: string, relation: RelationRecordR0): RelationReadProjectionR0 {
    const rootPath = projectPath(projectId);
    const type = relationRepository.resolveRelationType(rootPath, relation.relationTypeId);
    const evidence = relationRepository.inspectRelationEvidence(rootPath, { relationId: relation.relationId }, { resolveEvidence: evidenceResolver(projectId, rootPath) }) as unknown as { warnings: RelationEvidenceStatusR0[] };
    return {
      ...relation,
      currentTypeLabel: type?.label || null,
      relationType: type,
      relationTypeResolution: relation.relationTypeId === "relation-type.unresolved" ? "unresolved" : "resolved",
      evidenceWarnings: evidence.warnings as RelationEvidenceStatusR0[]
    };
  }

  return {
    listRelations(request: { projectId: string; includeArchived?: boolean; reviewState?: RelationReviewStateR0; objectId?: string; relationTypeId?: string; direction?: RelationDirectionR0; text?: string }): { repositoryVersion: string; repositoryRevision: number; relations: RelationReadProjectionR0[] } {
      const rootPath = projectPath(request.projectId);
      const store = relationRepository.readRelationRepository(rootPath);
      const relations = relationRepository.queryRelations(rootPath, request).map((relation) => projectRelation(request.projectId, relation));
      return { repositoryVersion: String(store.version), repositoryRevision: store.revision, relations };
    },

    readRelation(request: { projectId: string; relationId: string }): { relation: RelationReadProjectionR0; receipts: RelationReceiptR0[] } {
      const rootPath = projectPath(request.projectId);
      const relation = relationRepository.queryRelations(rootPath, { includeArchived: true }).find((item) => item.relationId === request.relationId);
      if (!relation) throw new Error("Relation does not exist.");
      return { relation: projectRelation(request.projectId, relation), receipts: relationRepository.readRelationRepository(rootPath).receipts.filter((receipt) => receipt.relationId === relation.relationId) };
    },

    listRelationTypes(request: { projectId: string }): { repositoryRevision: number; types: RelationTypeDefinitionR0[] } {
      const rootPath = projectPath(request.projectId);
      const store = relationRepository.readRelationRepository(rootPath);
      return { repositoryRevision: store.revision, types: relationRepository.listRelationTypes(rootPath) as RelationTypeDefinitionR0[] };
    },

    resolveRelationType(request: { projectId: string; relationTypeId: string }): RelationTypeDefinitionR0 | null {
      return relationRepository.resolveRelationType(projectPath(request.projectId), request.relationTypeId);
    },

    duplicateSuggestions(request: { projectId: string; sourceObjectId: string; targetObjectId: string; relationTypeId: string; direction: RelationDirectionR0; relationLabelSnapshot: string }) {
      return relationRepository.queryRelationDuplicateSuggestions(projectPath(request.projectId), request);
    },

    relationEvidence(request: { projectId: string; relationId: string }): { relationId: string; statuses: RelationEvidenceStatusR0[]; warnings: RelationEvidenceStatusR0[] } {
      const rootPath = projectPath(request.projectId);
      return relationRepository.inspectRelationEvidence(rootPath, { relationId: request.relationId }, { resolveEvidence: evidenceResolver(request.projectId, rootPath) }) as unknown as { relationId: string; statuses: RelationEvidenceStatusR0[]; warnings: RelationEvidenceStatusR0[] };
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
      return relationRepository.createRelationCandidate(projectPath(request.projectId), withoutProject(request)) as RelationMutationResultR0;
    },

    createUnresolvedRelationCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.createUnresolvedRelationCandidate(projectPath(request.projectId), withoutProject(request)) as RelationMutationResultR0;
    },

    updateRelationCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.updateRelationCandidate(projectPath(request.projectId), withoutProject(request)) as RelationMutationResultR0;
    },

    confirmRelationCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      const rootPath = projectPath(request.projectId);
      return relationRepository.confirmRelationCandidate(rootPath, withoutProject(request), { resolveEvidence: evidenceResolver(request.projectId, rootPath) }) as RelationMutationResultR0;
    },

    rejectRelationCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.rejectRelationCandidate(projectPath(request.projectId), withoutProject(request)) as RelationMutationResultR0;
    },

    archiveConfirmedRelation(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.archiveConfirmedRelation(projectPath(request.projectId), withoutProject(request)) as RelationMutationResultR0;
    },

    appendRelationEvidence(request: RelationOperationInput): RelationMutationResultR0 {
      const rootPath = projectPath(request.projectId);
      return relationRepository.appendRelationEvidence(rootPath, withoutProject(request), { resolveEvidence: evidenceResolver(request.projectId, rootPath) }) as RelationMutationResultR0;
    },

    createRelationCorrectionCandidate(request: RelationOperationInput): RelationMutationResultR0 {
      return relationRepository.createRelationCorrectionCandidate(projectPath(request.projectId), withoutProject(request)) as RelationMutationResultR0;
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
  verifyCanonEventRead?: (value: { projectId: string; eventId: string }) => boolean
): { status: "current" | "stale" | "unsupported"; code: string; message: string } {
  if (evidence.kind === "source-anchor") return resolveSourceAnchor(projectPath, projectId, evidence.anchor || evidence);
  if (evidence.kind === "confirmed-event") return resolveConfirmedEvent(projectId, evidence.reference || evidence.eventReference || evidence, workspaceOperations, verifyCanonEventRead);
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
  verifyCanonEventRead?: (value: { projectId: string; eventId: string }) => boolean
): { status: "current" | "stale"; code: string; message: string } {
  try {
    const reference = normalizeStoryStudioEventReference(value) as StoryStudioEventReference;
    if (reference.projectId !== projectId) return staleEvidence("event-project-mismatch", "Confirmed Event belongs to another project.");
    const event = workspaceOperations.readWorldObject({ projectId, objectId: reference.eventId });
    const canonVerified = Boolean(verifyCanonEventRead?.({ projectId, eventId: reference.eventId }));
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
