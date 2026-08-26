export const CONTINUITY_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
export const CONTINUITY_MAX_ID_LENGTH = 96;

export const PERSONA_VERSION = "story-tianyi-persona/v1" as const;
export const RELATIONSHIP_POLICY_VERSION = "story-tianyi-relationship-policy/v1" as const;
export const MEMORY_VERSION = "story-tianyi-memory/v1" as const;
export const GLOBAL_MEMORY_GRANT_VERSION = "story-tianyi-global-memory-grant/v1" as const;
export const INTERACTION_EVENT_VERSION = "story-tianyi-interaction-event/v1" as const;
export const CONTEXT_RECEIPT_VERSION = "story-tianyi-context-receipt/v1" as const;
export const CONTEXT_RECEIPT_V2_VERSION = "story-tianyi-context-receipt/v2" as const;
export const CONTEXT_RECEIPT_V3_VERSION = "story-tianyi-context-receipt/v3" as const;
export const CONTEXT_RECEIPT_V4_VERSION = "story-tianyi-context-receipt/v4" as const;
export const CONTEXT_RECEIPT_V5_VERSION = "story-tianyi-context-receipt/v5" as const;
export const STOPPING_POINT_VERSION = "story-tianyi-stopping-point/v1" as const;
export const TOMBSTONE_VERSION = "story-tianyi-continuity-tombstone/v1" as const;
export const PACK_VERSION = "story-tianyi-continuity-pack/v1" as const;
export const HISTORY_VERSION = "story-tianyi-continuity-history/v1" as const;

export type ContinuityScope = "author-global" | "project";
export type ContinuityOwnerKind =
  | "persona"
  | "relationship-policy"
  | "memory"
  | "global-memory-grant"
  | "session"
  | "context-receipt"
  | "stopping-point";

export type ContinuityOwnerRef = {
  kind: ContinuityOwnerKind;
  id: string;
  agentId: string;
  scope: ContinuityScope;
  projectId: string | null;
};

export type Persona = {
  world_os: typeof PERSONA_VERSION;
  id: string;
  type: "tianyi-persona";
  display_name: string;
  persona_revision: number;
  tone: "warm-professional";
  working_style: string;
  ai_identity_disclosure: "required";
  status: "active" | "revoked";
  refusal_boundaries: string[];
  body: string;
};

export type RelationshipPolicy = {
  version: typeof RELATIONSHIP_POLICY_VERSION;
  agentId: string;
  policyRevision: number;
  mode: "warm-professional";
  aiIdentityDisclosure: true;
  minorVirtualIntimacyAllowed: false;
  prohibitedPatterns: string[];
  exitControls: string[];
};

export type MemorySensitivity = "ordinary" | "personal" | "sensitive" | "restricted";
export type MemoryApprovalState = "candidate" | "author-approved" | "rejected";
export type MemoryKind =
  | "working-preference"
  | "shared-decision"
  | "unresolved-thread"
  | "author-provided-fact"
  | "continuity-note";

export type MemoryItem = {
  world_os: typeof MEMORY_VERSION;
  id: string;
  type: "tianyi-memory";
  agent_id: string;
  scope: ContinuityScope;
  project_id: string;
  kind: MemoryKind;
  sensitivity: MemorySensitivity;
  approval_state: MemoryApprovalState;
  model_involvement: "none" | "candidate-proposed" | "deterministic-fixture" | "provider-proposed";
  created_revision: number;
  last_confirmed_revision: number;
  review_after: string;
  expires_after: string;
  state: "active" | "revoked";
  source_refs: string[];
  knowledge_subject_refs?: string[];
  body: string;
};

export type GlobalMemoryGrant = {
  version: typeof GLOBAL_MEMORY_GRANT_VERSION;
  id: string;
  agentId: string;
  memoryId: string;
  memoryContentHash: string;
  projectId: string;
  state: "active" | "revoked";
  approvedRevision: number;
};

export const INTERACTION_EVENT_TYPES = [
  "session-opened",
  "author-message",
  "creative-response",
  "creative-summary-revised",
  "creative-candidate-proposed",
  "creative-candidate-edited",
  "creative-candidate-decided",
  "creative-session-state",
  "creative-provider-unavailable",
  "creative-session-recovering",
  "creative-session-recovered",
  "creative-session-paused",
  "creative-session-completed",
  "grounded-attempt",
  "bounded-action",
  "tianyi-response",
  "memory-candidate-proposed",
  "memory-candidate-decided",
  "stopping-point-proposed",
  "stopping-point-decided",
  "runtime-changed",
  "source-returned",
  "nuwa-result-returned",
  "session-rolled-over",
  "retained-message",
  "message-deleted",
  "session-closed"
] as const;

export type InteractionEventType = typeof INTERACTION_EVENT_TYPES[number];
export type TianyiResponseClassification =
  | "confirmed-fact"
  | "inference"
  | "candidate-suggestion"
  | "unavailable-evidence";

export type InteractionEvent = {
  version: typeof INTERACTION_EVENT_VERSION;
  eventId: string;
  sessionId: string;
  sequence: number;
  type: InteractionEventType;
  recordedAt: string;
  actor: "author" | "tianyi" | "system";
  content: string;
  responseClassifications: TianyiResponseClassification[];
  memoryCandidateIds: string[];
  receiptId: string | null;
  operationId: string;
};

export type ContextReceiptSource = {
  id: string;
  kind: string;
  hash: string;
  range: { startLine: number; endLine: number };
  excerpt: string;
  transfer: "local-only";
  redactions: string[];
};

export type ContextReceiptArchiveMessageRef = {
  projectId: string;
  sessionId: string;
  eventId: string;
  sequence: number;
  actor: "author" | "tianyi";
  recordedAt: string;
  contentHash: string;
};

export type ContextReceiptV1 = {
  version: typeof CONTEXT_RECEIPT_VERSION;
  id: string;
  sessionId: string;
  agentId: string;
  personaRevision: number;
  relationshipPolicyRevision: number;
  runtime: { mode: "deterministic"; adapterId: "tianyi.fixture"; adapterVersion: string };
  project: { id: string; surface: string };
  selection: { documentId: string | null; objectId: string | null; timelinePointId: string | null };
  sources: ContextReceiptSource[];
  approvedMemoryIds: string[];
  enabledSkillRefs: Array<{ id: string; version: string }>;
  excludedSources: Array<{ id: string; reason: string }>;
  generationTimestamp: string;
  stale: boolean;
  responseClassifications: TianyiResponseClassification[];
};

export type ContextReceiptV2 = Omit<ContextReceiptV1, "version"> & {
  version: typeof CONTEXT_RECEIPT_V2_VERSION;
  archiveMessageRefs: ContextReceiptArchiveMessageRef[];
};

export type ContextReceiptObjectSource = TianyiObjectContextRef & { sourceRef: string };

/**
 * The Golden Loop writes this digest-only binding when the server has resolved
 * a writing selection. Offsets use the browser/JavaScript UTF-16 coordinate
 * system; the raw selection remains outside the Receipt.
 */
export type ContextReceiptDocumentSelectionBinding = {
  version: "story-studio-document-selection-binding/v1";
  documentId: string;
  documentRevision: string;
  selection: { coordinate: "utf16-code-unit"; start: number; end: number };
  contentHash: string;
};

export type ContextReceiptV3 = Omit<ContextReceiptV1, "version" | "runtime" | "sources"> & {
  version: typeof CONTEXT_RECEIPT_V3_VERSION;
  runtime: {
    mode: "provider";
    providerId: string;
    modelId: string;
    profileId: string;
  };
  sources: ContextReceiptObjectSource[];
  /** Optional only for legacy V3 Receipt readability. New Golden Loop Receipts require it. */
  sourceBinding?: ContextReceiptDocumentSelectionBinding;
};

export type ContextReceiptV4 = Omit<ContextReceiptV1, "version" | "runtime" | "sources"> & {
  version: typeof CONTEXT_RECEIPT_V4_VERSION;
  runtime: {
    mode: "provider";
    providerId: string;
    modelId: string;
    profileId: string;
  };
  sources: TianyiGroundedSourceManifestEntry[];
  sourceManifest: TianyiGroundedSourceManifest;
};

export type ContextReceiptV5 = Omit<ContextReceiptV4, "version"> & {
  version: typeof CONTEXT_RECEIPT_V5_VERSION;
  identitySnapshot: TianyiIdentitySnapshot;
  questionAttempt: {
    version: "story-tianyi-question-attempt-ref/v1";
    submissionId: string;
    questionAttemptKey: string;
    requestIntentHash: string;
    authorMessageId: string;
    responseMessageId: string;
    manifestDigest: string;
    resultDigest: string;
  };
};

export type ContextReceipt =
  | ContextReceiptV1
  | ContextReceiptV2
  | ContextReceiptV3
  | ContextReceiptV4
  | ContextReceiptV5;

export type StoppingPoint = {
  world_os: typeof STOPPING_POINT_VERSION;
  id: string;
  agent_id: string;
  project_id: string;
  source_id: string;
  source_hash: string;
  state: "active" | "revoked";
  created_revision: number;
  body: string;
};

export type ContinuityTombstone = {
  version: typeof TOMBSTONE_VERSION;
  id: string;
  agentId: string;
  ownerScope: ContinuityScope;
  projectId: string | null;
  state: "hard-deleted";
  deletedRevision: number;
  deletedAt: string;
  operationId: string;
};

export type ContinuityPackManifest = {
  version: typeof PACK_VERSION;
  packId: string;
  createdAt: string;
  agentId: string;
  projectIds: string[];
  includes: string[];
  files: Array<{ path: string; sha256: string; bytes: number }>;
};

export type ContinuityRevision = {
  id: string;
  sequence: number;
  contentHash: string;
  byteLength: number;
  source: "create" | "update" | "revoke" | "restore" | "append" | "immutable-create";
  recordedAt: string;
  restoredFromRevisionId: string | null;
  operationId: string | null;
};

export type ContinuityHistoryManifest = {
  version: typeof HISTORY_VERSION;
  owner: ContinuityOwnerRef;
  nextSequence: number;
  revisions: ContinuityRevision[];
};

export type ContinuityReadResult<T> = {
  owner: ContinuityOwnerRef;
  value: T;
  contentHash: string;
  relativePath: string;
  byteLength: number;
};

export type ContinuityWriteResult<T> =
  | { ok: true; conflict: false; current: ContinuityReadResult<T>; revision: ContinuityRevision }
  | { ok: false; conflict: true; code: "continuity-conflict"; current: ContinuityReadResult<T> | null };

export type ContinuityDeleteResult =
  | { ok: true; conflict: false; deleted: boolean; tombstone: ContinuityTombstone | null }
  | { ok: false; conflict: true; code: "continuity-conflict" };

export class ContinuityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ContinuityError";
    this.code = code;
  }
}
import type { TianyiObjectContextRef } from "./tianyiObjectContext.ts";
import type {
  TianyiGroundedSourceManifest,
  TianyiGroundedSourceManifestEntry
} from "./tianyiGroundedContextGate.ts";
import type { TianyiIdentitySnapshot } from "./tianyiIdentityReadiness.ts";
