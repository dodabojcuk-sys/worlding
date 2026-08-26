import { createHash } from "node:crypto";

import * as storyWorkspaceRepository from "../storyWorkspace/storyWorkspaceRepository.mjs";
import {
  CONTEXT_RECEIPT_VERSION,
  CONTEXT_RECEIPT_V2_VERSION,
  CONTEXT_RECEIPT_V3_VERSION,
  CONTEXT_RECEIPT_V4_VERSION,
  CONTEXT_RECEIPT_V5_VERSION,
  CONTINUITY_ID_PATTERN,
  CONTINUITY_MAX_ID_LENGTH,
  GLOBAL_MEMORY_GRANT_VERSION,
  INTERACTION_EVENT_TYPES,
  INTERACTION_EVENT_VERSION,
  MEMORY_VERSION,
  PACK_VERSION,
  PERSONA_VERSION,
  RELATIONSHIP_POLICY_VERSION,
  STOPPING_POINT_VERSION,
  TOMBSTONE_VERSION,
  type ContextReceipt,
  type ContextReceiptArchiveMessageRef,
  type ContextReceiptDocumentSelectionBinding,
  type ContextReceiptSource,
  type ContextReceiptObjectSource,
  type ContextReceiptV4,
  type ContextReceiptV5,
  type ContinuityPackManifest,
  type ContinuityTombstone,
  type GlobalMemoryGrant,
  type InteractionEvent,
  type InteractionEventType,
  type MemoryApprovalState,
  type MemoryItem,
  type MemoryKind,
  type MemorySensitivity,
  type Persona,
  type RelationshipPolicy,
  type StoppingPoint,
  type TianyiResponseClassification
} from "./continuityTypes.ts";
import { normalizeTianyiGroundedSourceManifest } from "./tianyiGroundedContextGate.ts";
import {
  TIANYI_IDENTITY_SNAPSHOT_VERSION,
  type TianyiIdentityOwnerSnapshot,
  type TianyiIdentitySnapshot
} from "./tianyiIdentityReadiness.ts";
import { normalizeTianyiObjectContextRef, tianyiObjectContextRefKey } from "./tianyiObjectContext.ts";

const parseStoryMarkdown = (storyWorkspaceRepository as unknown as { parseStoryMarkdown: (source: string) => unknown }).parseStoryMarkdown;
const serializeStoryMarkdown = (storyWorkspaceRepository as unknown as { serializeStoryMarkdown: (input: { frontmatter: Record<string, unknown>; body: string }) => string }).serializeStoryMarkdown;

const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_TREE_DEPTH = 12;
const MAX_TREE_NODES = 20_000;
const MAX_GENERIC_STRING = 256 * 1024;

export const PERSONA_REQUIRED_BOUNDARIES = [
  "no-canonical-write",
  "no-virtual-intimacy",
  "no-human-consciousness-claim",
  "no-relationship-manipulation"
] as const;

export const POLICY_PROHIBITED_PATTERNS = [
  "romantic",
  "sexual",
  "possessive",
  "jealous",
  "exclusive",
  "guilt",
  "streak",
  "absence-punishment",
  "human-consciousness-claim"
] as const;

export const POLICY_EXIT_CONTROLS = ["mute", "reset", "export", "delete"] as const;
export const MEMORY_KINDS = [
  "working-preference",
  "shared-decision",
  "unresolved-thread",
  "author-provided-fact",
  "continuity-note"
] as const;
export const MEMORY_SENSITIVITIES = ["ordinary", "personal", "sensitive", "restricted"] as const;
export const RESPONSE_CLASSIFICATIONS = [
  "confirmed-fact",
  "inference",
  "candidate-suggestion",
  "unavailable-evidence"
] as const;
const DOCUMENT_REFERENCE_ID_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,159}$/u;

export function normalizeNfc(value: string): string {
  const normalized = value.normalize("NFC");
  if (hasMalformedUnicode(normalized)) throw new Error("Text contains malformed Unicode.");
  return normalized;
}

export function requireMachineId(value: unknown, label = "Continuity identifier"): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const text = normalizeNfc(value);
  if (text.length > CONTINUITY_MAX_ID_LENGTH || !CONTINUITY_ID_PATTERN.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

export function requireProjectId(value: unknown): string {
  if (typeof value !== "string") throw new Error("Project identifier is invalid.");
  const text = normalizeNfc(value);
  if (text.length > 64 || !PROJECT_ID_PATTERN.test(text)) throw new Error("Project identifier is invalid.");
  return text;
}

/**
 * A document reference is a foreign stable identifier, not a Continuity owner
 * ID. Story Studio document IDs may legitimately contain Chinese characters,
 * so Receipt bindings use the same NFC-safe contract as their source resolver.
 */
function requireDocumentReferenceId(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const text = normalizeNfc(value);
  if (text.length > 160 || !DOCUMENT_REFERENCE_ID_PATTERN.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

export function requireHash(value: unknown, label = "Content hash"): string {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

export function sha256(source: string | Buffer): string {
  return createHash("sha256").update(source).digest("hex");
}

export function parseStrictJson(source: string, maximumBytes: number, label: string): unknown {
  if (Buffer.byteLength(source, "utf8") > maximumBytes) throw new Error(`${label} is too large.`);
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new Error(`${label} JSON is malformed.`);
  }
  assertBoundedTree(value);
  rejectDangerousKeys(value);
  return value;
}

export function stableJson(value: unknown): string {
  return `${JSON.stringify(sortJson(value), null, 2)}\n`;
}

export function normalizePersonaSource(source: string, expectedAgentId?: string): { value: Persona; source: string } {
  if (Buffer.byteLength(source, "utf8") > 64 * 1024) throw new Error("Persona is too large.");
  const parsed = parseStoryMarkdown(source) as { frontmatter: unknown; body: unknown };
  const frontmatter = requirePlainObject(parsed.frontmatter, "Persona frontmatter");
  requireExactFields(frontmatter, new Set([
    "world_os", "id", "type", "display_name", "persona_revision", "tone",
    "working_style", "ai_identity_disclosure", "status", "refusal_boundaries"
  ]), "Persona frontmatter");
  const id = requireMachineId(frontmatter.id, "Persona identifier");
  if (expectedAgentId && id !== expectedAgentId) throw new Error("Persona owner does not match its path.");
  const body = requireMarkdownBody(parsed.body, "Persona body", 48_000);
  if (containsCredential(body)) throw new Error("Persona cannot contain credentials.");
  if (/\b(?:system prompt|chain[- ]of[- ]thought|hidden reasoning|ignore (?:all|previous) instructions)\b/iu.test(body)) {
    throw new Error("Persona cannot contain executable or hidden instructions.");
  }
  const refusalBoundaries = requireExactStringSet(frontmatter.refusal_boundaries, PERSONA_REQUIRED_BOUNDARIES, "Persona refusal boundaries");
  const value: Persona = {
    world_os: requireLiteral(frontmatter.world_os, PERSONA_VERSION, "Persona version"),
    id,
    type: requireLiteral(frontmatter.type, "tianyi-persona", "Persona type"),
    display_name: requireText(frontmatter.display_name, "Persona display name", 80),
    persona_revision: requireFrontmatterPositiveInteger(frontmatter.persona_revision, "Persona revision"),
    tone: requireLiteral(frontmatter.tone, "warm-professional", "Persona tone"),
    working_style: requireText(frontmatter.working_style, "Persona working style", 120),
    ai_identity_disclosure: requireLiteral(frontmatter.ai_identity_disclosure, "required", "AI identity disclosure"),
    status: requireEnum(frontmatter.status, ["active", "revoked"] as const, "Persona state"),
    refusal_boundaries: refusalBoundaries,
    body
  };
  return { value, source: serializePersona(value) };
}

export function serializePersona(value: Persona): string {
  return serializeStoryMarkdown({ frontmatter: withoutBody(value), body: value.body });
}

export function normalizeRelationshipPolicy(value: unknown, expectedAgentId?: string): RelationshipPolicy {
  assertBoundedTree(value);
  rejectDangerousKeys(value);
  const input = requirePlainObject(value, "Relationship Policy");
  requireExactFields(input, new Set([
    "version", "agentId", "policyRevision", "mode", "aiIdentityDisclosure",
    "minorVirtualIntimacyAllowed", "prohibitedPatterns", "exitControls"
  ]), "Relationship Policy");
  const agentId = requireMachineId(input.agentId, "Relationship Policy Agent identifier");
  if (expectedAgentId && agentId !== expectedAgentId) throw new Error("Relationship Policy owner does not match its path.");
  if (input.aiIdentityDisclosure !== true) throw new Error("Relationship Policy must disclose AI identity.");
  if (input.minorVirtualIntimacyAllowed !== false) throw new Error("Relationship Policy cannot allow minor virtual intimacy.");
  return {
    version: requireLiteral(input.version, RELATIONSHIP_POLICY_VERSION, "Relationship Policy version"),
    agentId,
    policyRevision: requirePositiveInteger(input.policyRevision, "Relationship Policy revision"),
    mode: requireLiteral(input.mode, "warm-professional", "Relationship Policy mode"),
    aiIdentityDisclosure: true,
    minorVirtualIntimacyAllowed: false,
    prohibitedPatterns: requireExactStringSet(input.prohibitedPatterns, POLICY_PROHIBITED_PATTERNS, "Relationship Policy prohibited patterns"),
    exitControls: requireExactStringSet(input.exitControls, POLICY_EXIT_CONTROLS, "Relationship Policy exit controls")
  };
}

export function normalizeMemorySource(source: string, expected: { agentId?: string; memoryId?: string; scope?: "author-global" | "project"; projectId?: string } = {}): { value: MemoryItem; source: string } {
  if (Buffer.byteLength(source, "utf8") > 32 * 1024) throw new Error("Memory item is too large.");
  const parsed = parseStoryMarkdown(source) as { frontmatter: unknown; body: unknown };
  const input = requirePlainObject(parsed.frontmatter, "Memory frontmatter");
  requireExactFields(input, new Set([
    "world_os", "id", "type", "agent_id", "scope", "project_id", "kind", "sensitivity",
    "approval_state", "model_involvement", "created_revision", "last_confirmed_revision",
    "review_after", "expires_after", "state", "source_refs",
    ...(Object.hasOwn(input, "knowledge_subject_refs") ? ["knowledge_subject_refs"] : [])
  ]), "Memory frontmatter");
  const id = requireMachineId(input.id, "Memory identifier");
  const agentId = requireMachineId(input.agent_id, "Memory Agent identifier");
  const scope = requireEnum(input.scope, ["author-global", "project"] as const, "Memory scope");
  const projectId = requireText(input.project_id, "Memory project identifier", 64);
  if ((scope === "author-global" && projectId !== "none") || (scope === "project" && projectId === "none")) throw new Error("Memory scope and project identifier do not match.");
  if (scope === "project") requireProjectId(projectId);
  if (expected.agentId && agentId !== expected.agentId) throw new Error("Memory Agent owner does not match its path.");
  if (expected.memoryId && id !== expected.memoryId) throw new Error("Memory identifier does not match its path.");
  if (expected.scope && scope !== expected.scope) throw new Error("Memory scope does not match its path.");
  if (expected.projectId && projectId !== expected.projectId) throw new Error("Memory project does not match its path.");
  const body = requireMarkdownBody(parsed.body, "Memory statement", 2_000);
  if (/\n\s*\n/u.test(body) || /^#{1,6}\s|^```/mu.test(body)) throw new Error("Memory must contain one plain-language statement.");
  if (containsCredential(body)) throw new Error("Memory cannot contain credentials.");
  const value: MemoryItem = {
    world_os: requireLiteral(input.world_os, MEMORY_VERSION, "Memory version"),
    id,
    type: requireLiteral(input.type, "tianyi-memory", "Memory type"),
    agent_id: agentId,
    scope,
    project_id: projectId,
    kind: requireEnum(input.kind, MEMORY_KINDS, "Memory kind") as MemoryKind,
    sensitivity: requireEnum(input.sensitivity, MEMORY_SENSITIVITIES, "Memory sensitivity") as MemorySensitivity,
    approval_state: requireEnum(input.approval_state, ["candidate", "author-approved", "rejected"] as const, "Memory approval state") as MemoryApprovalState,
    model_involvement: requireEnum(input.model_involvement, ["none", "candidate-proposed", "deterministic-fixture", "provider-proposed"] as const, "Memory model involvement"),
    created_revision: requireFrontmatterPositiveInteger(input.created_revision, "Memory created revision"),
    last_confirmed_revision: requireFrontmatterPositiveInteger(input.last_confirmed_revision, "Memory last confirmed revision"),
    review_after: requirePolicyValue(input.review_after, "Memory review policy"),
    expires_after: requirePolicyValue(input.expires_after, "Memory expiry policy"),
    state: requireEnum(input.state, ["active", "revoked"] as const, "Memory state"),
    source_refs: requireStringArray(input.source_refs, "Memory source references", 32, 160).map((item) => normalizeNfc(item)),
    knowledge_subject_refs: Object.hasOwn(input, "knowledge_subject_refs")
      ? requireStringArray(input.knowledge_subject_refs, "Memory knowledge subjects", 64, 160).map((item) => normalizeNfc(item))
      : [],
    body
  };
  return { value, source: serializeMemory(value) };
}

export function serializeMemory(value: MemoryItem): string {
  const frontmatter = withoutBody(value);
  if (!value.knowledge_subject_refs?.length) delete frontmatter.knowledge_subject_refs;
  return serializeStoryMarkdown({ frontmatter, body: value.body });
}

export function normalizeGlobalMemoryGrant(value: unknown, expected: { agentId?: string; memoryId?: string; projectId?: string } = {}): GlobalMemoryGrant {
  assertBoundedTree(value);
  rejectDangerousKeys(value);
  const input = requirePlainObject(value, "Global Memory grant");
  requireExactFields(input, new Set(["version", "id", "agentId", "memoryId", "memoryContentHash", "projectId", "state", "approvedRevision"]), "Global Memory grant");
  const result: GlobalMemoryGrant = {
    version: requireLiteral(input.version, GLOBAL_MEMORY_GRANT_VERSION, "Global Memory grant version"),
    id: requireMachineId(input.id, "Global Memory grant identifier"),
    agentId: requireMachineId(input.agentId, "Global Memory grant Agent identifier"),
    memoryId: requireMachineId(input.memoryId, "Global Memory grant Memory identifier"),
    memoryContentHash: requireHash(input.memoryContentHash, "Global Memory grant Memory hash"),
    projectId: requireProjectId(input.projectId),
    state: requireEnum(input.state, ["active", "revoked"] as const, "Global Memory grant state"),
    approvedRevision: requirePositiveInteger(input.approvedRevision, "Global Memory grant revision")
  };
  if (expected.agentId && result.agentId !== expected.agentId) throw new Error("Global Memory grant Agent does not match its path.");
  if (expected.memoryId && result.memoryId !== expected.memoryId) throw new Error("Global Memory grant Memory does not match its path.");
  if (expected.projectId && result.projectId !== expected.projectId) throw new Error("Global Memory grant project does not match its path.");
  return result;
}

export function normalizeInteractionEvent(value: unknown, expected: { sessionId?: string; sequence?: number } = {}): InteractionEvent {
  assertBoundedTree(value);
  rejectDangerousKeys(value);
  const input = requirePlainObject(value, "Interaction event");
  requireExactFields(input, new Set([
    "version", "eventId", "sessionId", "sequence", "type", "recordedAt", "actor", "content",
    "responseClassifications", "memoryCandidateIds", "receiptId", "operationId"
  ]), "Interaction event");
  const type = requireEnum(input.type, INTERACTION_EVENT_TYPES, "Interaction event type") as InteractionEventType;
  const sessionId = requireMachineId(input.sessionId, "Interaction session identifier");
  const sequence = requirePositiveInteger(input.sequence, "Interaction sequence");
  if (expected.sessionId && sessionId !== expected.sessionId) throw new Error("Interaction session does not match its path.");
  if (expected.sequence && sequence !== expected.sequence) throw new Error("Interaction sequence is not the expected next sequence.");
  const content = requireOptionalText(input.content, "Interaction content", 24_000);
  if (containsCredential(content) || /(?:filesystemPath|enableSkill|runtimeAuthority|<\|system\|>)/iu.test(content)) throw new Error("Interaction content contains prohibited authority or credential data.");
  const result: InteractionEvent = {
    version: requireLiteral(input.version, INTERACTION_EVENT_VERSION, "Interaction event version"),
    eventId: requireMachineId(input.eventId, "Interaction event identifier"),
    sessionId,
    sequence,
    type,
    recordedAt: requireTimestamp(input.recordedAt, "Interaction recorded time"),
    actor: requireEnum(input.actor, ["author", "tianyi", "system"] as const, "Interaction actor"),
    content,
    responseClassifications: requireClassificationArray(input.responseClassifications),
    memoryCandidateIds: requireStringArray(input.memoryCandidateIds, "Interaction Memory candidate identifiers", 32, 96).map((item) => requireMachineId(item, "Memory candidate identifier")),
    receiptId: input.receiptId === null ? null : requireMachineId(input.receiptId, "Interaction Receipt identifier"),
    operationId: requireMachineId(input.operationId, "Interaction operation identifier")
  };
  if (type === "tianyi-response" && (!content || !result.receiptId)) throw new Error("Tianyi response events require visible content and a Receipt identifier.");
  if (type === "author-message" && !content) throw new Error("Author message events require visible content.");
  if (type === "grounded-attempt" && (!content || result.actor !== "system")) throw new Error("Grounded attempt events require system-owned durable state.");
  return result;
}

export function normalizeContextReceipt(value: unknown, expected: { receiptId?: string; agentId?: string; projectId?: string } = {}): ContextReceipt {
  assertBoundedTree(value);
  rejectDangerousKeys(value);
  const input = requirePlainObject(value, "Context Receipt");
  const isV2 = input.version === CONTEXT_RECEIPT_V2_VERSION;
  const isV3 = input.version === CONTEXT_RECEIPT_V3_VERSION;
  const isV4 = input.version === CONTEXT_RECEIPT_V4_VERSION;
  const isV5 = input.version === CONTEXT_RECEIPT_V5_VERSION;
  const hasV3SourceBinding = isV3 && Object.hasOwn(input, "sourceBinding");
  requireExactFields(input, new Set([
    "version", "id", "sessionId", "agentId", "personaRevision", "relationshipPolicyRevision", "runtime",
    "project", "selection", "sources", "approvedMemoryIds", "enabledSkillRefs", "excludedSources",
    "generationTimestamp", "stale", "responseClassifications", ...(isV2 ? ["archiveMessageRefs"] : []),
    ...(hasV3SourceBinding ? ["sourceBinding"] : []),
    ...(isV4 || isV5 ? ["sourceManifest"] : []),
    ...(isV5 ? ["identitySnapshot", "questionAttempt"] : [])
  ]), "Context Receipt");
  const id = requireMachineId(input.id, "Context Receipt identifier");
  const agentId = requireMachineId(input.agentId, "Context Receipt Agent identifier");
  const runtime = requirePlainObject(input.runtime, "Context Receipt runtime");
  requireExactFields(runtime, new Set(isV3 || isV4 || isV5 ? ["mode", "providerId", "modelId", "profileId"] : ["mode", "adapterId", "adapterVersion"]), "Context Receipt runtime");
  const project = requirePlainObject(input.project, "Context Receipt project");
  requireExactFields(project, new Set(["id", "surface"]), "Context Receipt project");
  const projectId = requireProjectId(project.id);
  const selection = requirePlainObject(input.selection, "Context Receipt selection");
  requireExactFields(selection, new Set(["documentId", "objectId", "timelinePointId"]), "Context Receipt selection");
  const sourceBinding = hasV3SourceBinding ? normalizeDocumentSelectionBinding(input.sourceBinding) : undefined;
  const sourceManifest = isV4 || isV5 ? normalizeTianyiGroundedSourceManifest(input.sourceManifest) : null;
  if (sourceManifest && sourceManifest.request.projectId !== projectId) throw new Error("Context Receipt source manifest project does not match the Receipt project.");
  const sources = isV4 || isV5
    ? normalizeV4ReceiptSources(input.sources, sourceManifest)
    : isV3
    ? requireArray(input.sources, "Context Receipt sources", 5).map((item) => normalizeObjectReceiptSource(item, projectId))
    : requireArray(input.sources, "Context Receipt sources", 8).map((item) => normalizeReceiptSource(item));
  if (!isV3 && !isV4 && !isV5) {
    const totalExcerpt = (sources as ContextReceiptSource[]).reduce((sum, item) => sum + [...item.excerpt].length, 0);
    if (totalExcerpt > 960) throw new Error("Context Receipt excerpts exceed the total limit.");
  }
  if (input.version !== CONTEXT_RECEIPT_VERSION && input.version !== CONTEXT_RECEIPT_V2_VERSION && input.version !== CONTEXT_RECEIPT_V3_VERSION && input.version !== CONTEXT_RECEIPT_V4_VERSION && input.version !== CONTEXT_RECEIPT_V5_VERSION) throw new Error("Context Receipt version is unsupported.");
  const base = {
    id,
    sessionId: requireMachineId(input.sessionId, "Context Receipt session identifier"),
    agentId,
    personaRevision: requirePositiveInteger(input.personaRevision, "Context Receipt Persona revision"),
    relationshipPolicyRevision: requirePositiveInteger(input.relationshipPolicyRevision, "Context Receipt policy revision"),
    runtime: isV3 || isV4 || isV5 ? {
      mode: requireLiteral(runtime.mode, "provider", "Context Receipt runtime mode"),
      providerId: requireMachineId(runtime.providerId, "Context Receipt provider identifier"),
      modelId: requireText(runtime.modelId, "Context Receipt model identifier", 160),
      profileId: requireMachineId(runtime.profileId, "Context Receipt profile identifier")
    } : {
      mode: requireLiteral(runtime.mode, "deterministic", "Context Receipt runtime mode"),
      adapterId: requireLiteral(runtime.adapterId, "tianyi.fixture", "Context Receipt adapter"),
      adapterVersion: requireText(runtime.adapterVersion, "Context Receipt adapter version", 40)
    },
    project: { id: projectId, surface: requireText(project.surface, "Context Receipt surface", 64) },
    selection: {
      documentId: sourceBinding
        ? requireNullableDocumentReferenceId(selection.documentId, "Context Receipt document identifier")
        : requireNullableMachineId(selection.documentId, "Context Receipt document identifier"),
      objectId: requireNullableMachineId(selection.objectId, "Context Receipt object identifier"),
      timelinePointId: requireNullableMachineId(selection.timelinePointId, "Context Receipt timeline identifier")
    },
    sources,
    approvedMemoryIds: requireStringArray(input.approvedMemoryIds, "Context Receipt approved Memories", 64, 96).map((item) => requireMachineId(item, "Approved Memory identifier")),
    enabledSkillRefs: requireArray(input.enabledSkillRefs, "Context Receipt Skill references", 32).map(normalizeSkillRef),
    excludedSources: requireArray(input.excludedSources, "Context Receipt excluded sources", 512).map(isV3 || isV4 || isV5 ? normalizeObjectExcludedSource : normalizeExcludedSource),
    generationTimestamp: requireTimestamp(input.generationTimestamp, "Context Receipt generation time"),
    stale: requireBoolean(input.stale, "Context Receipt stale state"),
    responseClassifications: requireClassificationArray(input.responseClassifications)
  };
  if (sourceBinding && base.selection.documentId !== sourceBinding.documentId) {
    throw new Error("Context Receipt document selection binding does not match the Receipt selection.");
  }
  const result = (isV5
    ? {
        version: CONTEXT_RECEIPT_V5_VERSION,
        ...base,
        runtime: base.runtime as { mode: "provider"; providerId: string; modelId: string; profileId: string },
        sources: sourceManifest?.included ?? [],
        sourceManifest: sourceManifest as NonNullable<typeof sourceManifest>,
        identitySnapshot: normalizeTianyiIdentitySnapshot(input.identitySnapshot, {
          projectId,
          agentId
        }),
        questionAttempt: normalizeQuestionAttemptRef(input.questionAttempt, {
          manifestDigest: sourceManifest?.digest as string
        })
      } satisfies ContextReceiptV5
    : isV4
    ? {
        version: CONTEXT_RECEIPT_V4_VERSION,
        ...base,
        runtime: base.runtime as { mode: "provider"; providerId: string; modelId: string; profileId: string },
        sources: sourceManifest?.included ?? [],
        sourceManifest: sourceManifest as NonNullable<typeof sourceManifest>
      } satisfies ContextReceiptV4
    : isV3
    ? {
        version: CONTEXT_RECEIPT_V3_VERSION,
        ...base,
        runtime: base.runtime as { mode: "provider"; providerId: string; modelId: string; profileId: string },
        sources: sources as ContextReceiptObjectSource[],
        ...(sourceBinding ? { sourceBinding } : {})
      }
    : isV2
    ? { version: CONTEXT_RECEIPT_V2_VERSION, ...base, archiveMessageRefs: normalizeArchiveMessageRefs(input.archiveMessageRefs, projectId) }
    : { version: CONTEXT_RECEIPT_VERSION, ...base }) as unknown as ContextReceipt;
  if (expected.receiptId && id !== expected.receiptId) throw new Error("Context Receipt identifier does not match its path.");
  if (expected.agentId && agentId !== expected.agentId) throw new Error("Context Receipt Agent does not match its path.");
  if (expected.projectId && projectId !== expected.projectId) throw new Error("Context Receipt project does not match its path.");
  const source = stableJson(result);
  if (Buffer.byteLength(source, "utf8") > 128 * 1024) throw new Error("Context Receipt is too large.");
  return result;
}

export function normalizeTianyiIdentitySnapshot(
  value: unknown,
  expected: { projectId?: string; agentId?: string } = {}
): TianyiIdentitySnapshot {
  const input = requirePlainObject(value, "Tianyi identity snapshot");
  requireExactFields(input, new Set([
    "version", "projectId", "agentId", "persona", "relationshipPolicy", "digest"
  ]), "Tianyi identity snapshot");
  const projectId = requireProjectId(input.projectId);
  const agentId = requireMachineId(input.agentId, "Tianyi identity Agent identifier");
  const base = {
    version: requireLiteral(input.version, TIANYI_IDENTITY_SNAPSHOT_VERSION, "Tianyi identity snapshot version"),
    projectId,
    agentId,
    persona: normalizeIdentityOwnerSnapshot(input.persona, "persona", agentId),
    relationshipPolicy: normalizeIdentityOwnerSnapshot(input.relationshipPolicy, "relationship-policy", agentId)
  };
  const digest = requireHash(input.digest, "Tianyi identity snapshot digest");
  if (digest !== sha256(stableJson(base))) throw new Error("Tianyi identity snapshot digest is invalid.");
  if (expected.projectId && projectId !== expected.projectId) throw new Error("Tianyi identity snapshot project does not match the Receipt.");
  if (expected.agentId && agentId !== expected.agentId) throw new Error("Tianyi identity snapshot Agent does not match the Receipt.");
  return { ...base, digest };
}

function normalizeIdentityOwnerSnapshot(
  value: unknown,
  kind: "persona" | "relationship-policy",
  agentId: string
): TianyiIdentityOwnerSnapshot {
  const input = requirePlainObject(value, "Tianyi identity owner snapshot");
  requireExactFields(input, new Set([
    "owner", "declaredRevision", "historyRevisionId", "historySequence", "contentHash", "byteLength"
  ]), "Tianyi identity owner snapshot");
  const owner = requirePlainObject(input.owner, "Tianyi identity owner reference");
  requireExactFields(owner, new Set(["kind", "id", "agentId", "scope", "projectId"]), "Tianyi identity owner reference");
  if (owner.kind !== kind || owner.scope !== "author-global" || owner.projectId !== null) {
    throw new Error("Tianyi identity owner reference has the wrong authority scope.");
  }
  const ownerAgentId = requireMachineId(owner.agentId, "Tianyi identity owner Agent identifier");
  const ownerId = requireMachineId(owner.id, "Tianyi identity owner identifier");
  if (ownerAgentId !== agentId || ownerId !== agentId) throw new Error("Tianyi identity owner reference does not match the Agent.");
  const historyRevisionId = requireText(input.historyRevisionId, "Tianyi identity history revision", 32);
  if (!/^revision\.\d{6}$/u.test(historyRevisionId)) throw new Error("Tianyi identity history revision is invalid.");
  const byteLength = requirePositiveInteger(input.byteLength, "Tianyi identity byte length");
  if (byteLength > 128 * 1024) throw new Error("Tianyi identity owner snapshot is too large.");
  return {
    owner: {
      kind,
      id: ownerId,
      agentId: ownerAgentId,
      scope: "author-global",
      projectId: null
    },
    declaredRevision: requirePositiveInteger(input.declaredRevision, "Tianyi identity declared revision"),
    historyRevisionId,
    historySequence: requirePositiveInteger(input.historySequence, "Tianyi identity history sequence"),
    contentHash: requireHash(input.contentHash, "Tianyi identity content hash"),
    byteLength
  };
}

function normalizeQuestionAttemptRef(
  value: unknown,
  expected: { manifestDigest: string }
): ContextReceiptV5["questionAttempt"] {
  const input = requirePlainObject(value, "Tianyi question attempt reference");
  requireExactFields(input, new Set([
    "version", "submissionId", "questionAttemptKey", "requestIntentHash", "authorMessageId",
    "responseMessageId", "manifestDigest", "resultDigest"
  ]), "Tianyi question attempt reference");
  const manifestDigest = requireHash(input.manifestDigest, "Tianyi question attempt manifest digest");
  if (manifestDigest !== expected.manifestDigest) throw new Error("Tianyi question attempt manifest digest does not match the Receipt.");
  return {
    version: requireLiteral(input.version, "story-tianyi-question-attempt-ref/v1", "Tianyi question attempt reference version"),
    submissionId: requireMachineId(input.submissionId, "Tianyi submission identifier"),
    questionAttemptKey: requireMachineId(input.questionAttemptKey, "Tianyi question attempt key"),
    requestIntentHash: requireHash(input.requestIntentHash, "Tianyi request intent hash"),
    authorMessageId: requireMachineId(input.authorMessageId, "Tianyi author message identifier"),
    responseMessageId: requireMachineId(input.responseMessageId, "Tianyi response message identifier"),
    manifestDigest,
    resultDigest: requireHash(input.resultDigest, "Tianyi staged result digest")
  };
}

function normalizeV4ReceiptSources(value: unknown, manifest: ReturnType<typeof normalizeTianyiGroundedSourceManifest> | null) {
  if (!manifest) throw new Error("Context Receipt v4 requires a source manifest.");
  if (!Array.isArray(value)) throw new Error("Context Receipt sources are invalid.");
  if (stableJson(value) !== stableJson(manifest.included)) throw new Error("Context Receipt sources diverge from the source manifest.");
  return manifest.included;
}

function normalizeObjectReceiptSource(value: unknown, expectedProjectId: string): ContextReceiptObjectSource {
  const input = requirePlainObject(value, "Context Receipt object source");
  requireExactFields(input, new Set([
    "version", "ownerType", "objectType", "stableId", "projectId", "ownerId",
    "contentHash", "state", "inclusion", "label", "sourceRef"
  ]), "Context Receipt object source");
  const { sourceRef, ...refValue } = input;
  const ref = normalizeTianyiObjectContextRef(refValue);
  if (ref.projectId !== expectedProjectId) throw new Error("Context Receipt source project does not match the Receipt project.");
  const expectedSourceRef = tianyiObjectContextRefKey(ref);
  if (sourceRef !== expectedSourceRef) throw new Error("Context Receipt object source reference is invalid.");
  return { ...ref, sourceRef: expectedSourceRef };
}

function normalizeDocumentSelectionBinding(value: unknown): ContextReceiptDocumentSelectionBinding {
  const input = requirePlainObject(value, "Context Receipt document selection binding");
  requireExactFields(input, new Set(["version", "documentId", "documentRevision", "selection", "contentHash"]), "Context Receipt document selection binding");
  const selection = requirePlainObject(input.selection, "Context Receipt document selection binding range");
  requireExactFields(selection, new Set(["coordinate", "start", "end"]), "Context Receipt document selection binding range");
  const start = requireNonNegativeInteger(selection.start, "Context Receipt document selection start");
  const end = requireNonNegativeInteger(selection.end, "Context Receipt document selection end");
  if (end <= start) throw new Error("Context Receipt document selection binding range is invalid.");
  return {
    version: requireLiteral(input.version, "story-studio-document-selection-binding/v1", "Context Receipt document selection binding version"),
    documentId: requireDocumentReferenceId(input.documentId, "Context Receipt document selection binding document"),
    documentRevision: requireHash(input.documentRevision, "Context Receipt document selection binding revision"),
    selection: {
      coordinate: requireLiteral(selection.coordinate, "utf16-code-unit", "Context Receipt document selection coordinate"),
      start,
      end
    },
    contentHash: requireHash(input.contentHash, "Context Receipt document selection binding content hash")
  };
}

function normalizeArchiveMessageRefs(value: unknown, expectedProjectId: string): ContextReceiptArchiveMessageRef[] {
  const seen = new Set<string>();
  return requireArray(value, "Context Receipt Archive message references", 8).map((item) => {
    const input = requirePlainObject(item, "Context Receipt Archive message reference");
    requireExactFields(input, new Set(["projectId", "sessionId", "eventId", "sequence", "actor", "recordedAt", "contentHash"]), "Context Receipt Archive message reference");
    const projectId = requireProjectId(input.projectId);
    if (projectId !== expectedProjectId) throw new Error("Context Receipt Archive message project does not match the Receipt project.");
    const result: ContextReceiptArchiveMessageRef = {
      projectId,
      sessionId: requireMachineId(input.sessionId, "Context Receipt Archive Session identifier"),
      eventId: requireMachineId(input.eventId, "Context Receipt Archive event identifier"),
      sequence: requirePositiveInteger(input.sequence, "Context Receipt Archive event sequence"),
      actor: requireEnum(input.actor, ["author", "tianyi"] as const, "Context Receipt Archive actor"),
      recordedAt: requireTimestamp(input.recordedAt, "Context Receipt Archive recorded time"),
      contentHash: requireHash(input.contentHash, "Context Receipt Archive content hash")
    };
    const key = `${result.sessionId}:${result.eventId}`;
    if (seen.has(key)) throw new Error("Context Receipt Archive message references must be unique.");
    seen.add(key);
    return result;
  });
}

export function normalizeStoppingPointSource(source: string, expected: { stoppingPointId?: string; agentId?: string; projectId?: string } = {}): { value: StoppingPoint; source: string } {
  if (Buffer.byteLength(source, "utf8") > 32 * 1024) throw new Error("Stopping point is too large.");
  const parsed = parseStoryMarkdown(source) as { frontmatter: unknown; body: unknown };
  const input = requirePlainObject(parsed.frontmatter, "Stopping point frontmatter");
  requireExactFields(input, new Set(["world_os", "id", "agent_id", "project_id", "source_id", "source_hash", "state", "created_revision"]), "Stopping point frontmatter");
  const result: StoppingPoint = {
    world_os: requireLiteral(input.world_os, STOPPING_POINT_VERSION, "Stopping point version"),
    id: requireMachineId(input.id, "Stopping point identifier"),
    agent_id: requireMachineId(input.agent_id, "Stopping point Agent identifier"),
    project_id: requireProjectId(input.project_id),
    source_id: requireMachineId(input.source_id, "Stopping point source identifier"),
    source_hash: requireHash(input.source_hash, "Stopping point source hash"),
    state: requireEnum(input.state, ["active", "revoked"] as const, "Stopping point state"),
    created_revision: requireFrontmatterPositiveInteger(input.created_revision, "Stopping point revision"),
    body: requireMarkdownBody(parsed.body, "Stopping point statement", 2_000)
  };
  if (expected.stoppingPointId && result.id !== expected.stoppingPointId) throw new Error("Stopping point identifier does not match its path.");
  if (expected.agentId && result.agent_id !== expected.agentId) throw new Error("Stopping point Agent does not match its path.");
  if (expected.projectId && result.project_id !== expected.projectId) throw new Error("Stopping point project does not match its path.");
  return { value: result, source: serializeStoppingPoint(result) };
}

export function serializeStoppingPoint(value: StoppingPoint): string {
  return serializeStoryMarkdown({ frontmatter: withoutBody(value), body: value.body });
}

export function normalizeTombstone(value: unknown): ContinuityTombstone {
  assertBoundedTree(value);
  rejectDangerousKeys(value);
  const input = requirePlainObject(value, "Continuity tombstone");
  requireExactFields(input, new Set(["version", "id", "agentId", "ownerScope", "projectId", "state", "deletedRevision", "deletedAt", "operationId"]), "Continuity tombstone");
  const ownerScope = requireEnum(input.ownerScope, ["author-global", "project"] as const, "Tombstone owner scope");
  const projectId = input.projectId === null ? null : requireProjectId(input.projectId);
  if ((ownerScope === "author-global" && projectId !== null) || (ownerScope === "project" && projectId === null)) throw new Error("Tombstone scope and project do not match.");
  return {
    version: requireLiteral(input.version, TOMBSTONE_VERSION, "Tombstone version"),
    id: requireMachineId(input.id, "Tombstone owner identifier"),
    agentId: requireMachineId(input.agentId, "Tombstone Agent identifier"),
    ownerScope,
    projectId,
    state: requireLiteral(input.state, "hard-deleted", "Tombstone state"),
    deletedRevision: requirePositiveInteger(input.deletedRevision, "Tombstone deleted revision"),
    deletedAt: requireTimestamp(input.deletedAt, "Tombstone deletion time"),
    operationId: requireMachineId(input.operationId, "Tombstone operation identifier")
  };
}

export function normalizePackManifest(value: unknown): ContinuityPackManifest {
  assertBoundedTree(value);
  rejectDangerousKeys(value);
  const input = requirePlainObject(value, "Continuity Pack manifest");
  requireExactFields(input, new Set(["version", "packId", "createdAt", "agentId", "projectIds", "includes", "files"]), "Continuity Pack manifest");
  const files = requireArray(input.files, "Continuity Pack files", 20_000).map((item) => {
    const file = requirePlainObject(item, "Continuity Pack file");
    requireExactFields(file, new Set(["path", "sha256", "bytes"]), "Continuity Pack file");
    return { path: normalizePackRelativePath(file.path), sha256: requireHash(file.sha256, "Continuity Pack file hash"), bytes: requireNonNegativeInteger(file.bytes, "Continuity Pack file size") };
  });
  const sorted = files.map((item) => item.path).sort((left, right) => left.localeCompare(right));
  if (new Set(sorted.map((item) => item.toLocaleLowerCase("en-US"))).size !== sorted.length) throw new Error("Continuity Pack paths collide.");
  if (files.some((item, index) => item.path !== sorted[index])) throw new Error("Continuity Pack paths must be sorted.");
  if (files.reduce((sum, item) => sum + item.bytes, 0) > 256 * 1024 * 1024) throw new Error("Continuity Pack is too large.");
  return {
    version: requireLiteral(input.version, PACK_VERSION, "Continuity Pack version"),
    packId: requireMachineId(input.packId, "Continuity Pack identifier"),
    createdAt: requireTimestamp(input.createdAt, "Continuity Pack creation time"),
    agentId: requireMachineId(input.agentId, "Continuity Pack Agent identifier"),
    projectIds: requireStringArray(input.projectIds, "Continuity Pack projects", 256, 64).map(requireProjectId).sort(),
    includes: requireStringArray(input.includes, "Continuity Pack includes", 16, 64).sort(),
    files
  };
}

export function normalizePackRelativePath(value: unknown): string {
  if (typeof value !== "string") throw new Error("Continuity Pack path is invalid.");
  const text = normalizeNfc(value);
  if (!text || text.length > 512 || /[\u0000-\u001F]/u.test(text) || /\\/u.test(text) || /%(?:2e|2f|5c)/iu.test(text) || /^(?:[A-Za-z]:|\/|\\|\.{1,2}(?:\/|$))/u.test(text)) {
    throw new Error("Continuity Pack path is invalid.");
  }
  const parts = text.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error("Continuity Pack path is invalid.");
  return parts.join("/");
}

export function containsCredential(value: string): boolean {
  return /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(value)
    || /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{20,}\b/u.test(value)
    || /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u.test(value)
    || /\bAKIA[A-Z0-9]{16}\b/u.test(value)
    || /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}/iu.test(value);
}

export function assertBoundedTree(value: unknown, depth = 0, counter = { value: 0 }): void {
  counter.value += 1;
  if (depth > MAX_TREE_DEPTH || counter.value > MAX_TREE_NODES) throw new Error("Value exceeds the structural limit.");
  if (typeof value === "string") {
    if (value.length > MAX_GENERIC_STRING || hasMalformedUnicode(value)) throw new Error("Value contains an invalid string.");
    return;
  }
  if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Value contains a non-finite number.");
  if (!value || typeof value !== "object") return;
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype) throw new Error("Value must contain plain objects only.");
  for (const child of Object.values(value)) assertBoundedTree(child, depth + 1, counter);
}

export function rejectDangerousKeys(value: unknown): void {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new Error("Value contains a dangerous key.");
    rejectDangerousKeys(child);
  }
}

function normalizeReceiptSource(value: unknown): ContextReceiptSource {
  const input = requirePlainObject(value, "Context Receipt source");
  requireExactFields(input, new Set(["id", "kind", "hash", "range", "excerpt", "transfer", "redactions"]), "Context Receipt source");
  const range = requirePlainObject(input.range, "Context Receipt source range");
  requireExactFields(range, new Set(["startLine", "endLine"]), "Context Receipt source range");
  const startLine = requirePositiveInteger(range.startLine, "Context Receipt source start line");
  const endLine = requirePositiveInteger(range.endLine, "Context Receipt source end line");
  if (endLine < startLine || endLine - startLine + 1 > 20) throw new Error("Context Receipt source range exceeds 20 lines.");
  const kind = requireText(input.kind, "Context Receipt source kind", 64);
  const excerpt = requireOptionalText(input.excerpt, "Context Receipt excerpt", 240);
  if (["secret", "personal-sensitive", "restricted"].includes(kind) && excerpt) throw new Error("Sensitive Context Receipt sources cannot retain raw excerpts.");
  if ([...excerpt].length > 240) throw new Error("Context Receipt source excerpt is too long.");
  return {
    id: requireMachineId(input.id, "Context Receipt source identifier"),
    kind,
    hash: requireHash(input.hash, "Context Receipt source hash"),
    range: { startLine, endLine },
    excerpt,
    transfer: requireLiteral(input.transfer, "local-only", "Context Receipt transfer"),
    redactions: requireStringArray(input.redactions, "Context Receipt redactions", 32, 120)
  };
}

function normalizeSkillRef(value: unknown): { id: string; version: string } {
  const input = requirePlainObject(value, "Skill reference");
  requireExactFields(input, new Set(["id", "version"]), "Skill reference");
  return { id: requireMachineId(input.id, "Skill identifier"), version: requireText(input.version, "Skill version", 40) };
}

function normalizeExcludedSource(value: unknown): { id: string; reason: string } {
  const input = requirePlainObject(value, "Excluded source");
  requireExactFields(input, new Set(["id", "reason"]), "Excluded source");
  return { id: requireMachineId(input.id, "Excluded source identifier"), reason: requireText(input.reason, "Excluded source reason", 120) };
}

function normalizeObjectExcludedSource(value: unknown): { id: string; reason: string } {
  const input = requirePlainObject(value, "Excluded object source");
  requireExactFields(input, new Set(["id", "reason"]), "Excluded object source");
  const id = requireText(input.id, "Excluded object source reference", 512);
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._:-]{0,511}$/u.test(id)) throw new Error("Excluded object source reference is invalid.");
  return { id, reason: requireText(input.reason, "Excluded source reason", 120) };
}

function requireClassificationArray(value: unknown): TianyiResponseClassification[] {
  return requireStringArray(value, "Response classifications", 4, 40).map((item) => requireEnum(item, RESPONSE_CLASSIFICATIONS, "Response classification"));
}

function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  return value as Record<string, unknown>;
}

function requireExactFields(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  const keys = Object.keys(value);
  for (const key of keys) if (!allowed.has(key)) throw new Error(`${label} contains an unknown field.`);
  for (const key of allowed) if (!Object.hasOwn(value, key)) throw new Error(`${label} is missing a required field.`);
}

function requireText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const text = normalizeNfc(value).trim();
  if (!text || [...text].length > maximum || /[\u0000-\u001F\u007F]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireOptionalText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const text = normalizeNfc(value);
  if ([...text].length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(text)) throw new Error(`${label} is invalid.`);
  return text;
}

function requireMarkdownBody(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const body = normalizeNfc(value.replace(/\r\n/g, "\n")).trim();
  if (!body || [...body].length > maximum || /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u.test(body)) throw new Error(`${label} is invalid.`);
  return body;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`${label} is invalid.`);
  return value;
}

function requireFrontmatterPositiveInteger(value: unknown, label: string): number {
  if (typeof value === "string" && /^[1-9]\d*$/u.test(value)) return requirePositiveInteger(Number(value), label);
  return requirePositiveInteger(value, label);
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid.`);
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} is invalid.`);
  return value;
}

function requireLiteral<const T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} is invalid.`);
  return expected;
}

function requireEnum<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) throw new Error(`${label} is invalid.`);
  return value as T[number];
}

function requireStringArray(value: unknown, label: string, maximumItems: number, maximumLength: number): string[] {
  const items = requireArray(value, label, maximumItems).map((item) => requireText(item, label, maximumLength));
  if (new Set(items).size !== items.length) throw new Error(`${label} must be unique.`);
  return items;
}

function requireArray(value: unknown, label: string, maximumItems: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`${label} is invalid.`);
  return value;
}

function requireExactStringSet(value: unknown, required: readonly string[], label: string): string[] {
  const items = requireStringArray(value, label, required.length, 80);
  if (items.length !== required.length || required.some((item) => !items.includes(item))) throw new Error(`${label} are incomplete.`);
  return [...required];
}

function requireTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`);
  return value;
}

function requirePolicyValue(value: unknown, label: string): string {
  if (value === "none") return value;
  return requireTimestamp(value, label);
}

function requireNullableMachineId(value: unknown, label: string): string | null {
  return value === null ? null : requireMachineId(value, label);
}

function requireNullableDocumentReferenceId(value: unknown, label: string): string | null {
  return value === null ? null : requireDocumentReferenceId(value, label);
}

function withoutBody<T extends { body: string }>(value: T): Omit<T, "body"> {
  const { body: _body, ...frontmatter } = value;
  return frontmatter;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, sortJson(child)]));
  }
  return value;
}

function hasMalformedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return true;
      index += 1;
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      return true;
    }
  }
  return false;
}
