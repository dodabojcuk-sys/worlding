import type { ContinuityContext } from "./continuityFilesystem.ts";
import type { OwnerCodec, OwnerWriteMetadata } from "./continuityOwnerRepository.ts";
import {
  createOwner,
  listOwnerRevisions,
  previewOwnerRevision,
  readOwner,
  restoreOwnerRevision,
  updateOwner
} from "./continuityOwnerRepository.ts";
import {
  PERSONA_VERSION,
  RELATIONSHIP_POLICY_VERSION,
  type Persona,
  type RelationshipPolicy
} from "./continuityTypes.ts";
import {
  normalizePersonaSource,
  normalizeRelationshipPolicy,
  POLICY_EXIT_CONTROLS,
  POLICY_PROHIBITED_PATTERNS,
  serializePersona,
  stableJson
} from "./continuityValidation.ts";

const PERSONA_CODEC: OwnerCodec<Persona> = {
  kind: "persona",
  maximumBytes: 64 * 1024,
  normalizeSource(source, location) {
    return normalizePersonaSource(source, location.owner.agentId);
  },
  serialize(value) {
    return serializePersona(value);
  }
};

const POLICY_CODEC: OwnerCodec<RelationshipPolicy> = {
  kind: "relationship-policy",
  maximumBytes: 32 * 1024,
  normalizeSource(source, location) {
    const value = normalizeRelationshipPolicy(JSON.parse(source) as unknown, location.owner.agentId);
    return { value, source: stableJson(value) };
  },
  serialize(value) {
    return stableJson(normalizeRelationshipPolicy(value));
  }
};

export function defaultTianyiPersona(agentId = "agent.tianyi"): Persona {
  return {
    world_os: PERSONA_VERSION,
    id: agentId,
    type: "tianyi-persona",
    display_name: "天意",
    persona_revision: 1,
    tone: "warm-professional",
    working_style: "evidence-first",
    ai_identity_disclosure: "required",
    status: "active",
    refusal_boundaries: [
      "no-canonical-write",
      "no-virtual-intimacy",
      "no-human-consciousness-claim",
      "no-relationship-manipulation"
    ],
    body: "Tianyi is a calm long-term creative partner who helps the author resume work, inspect evidence, and preserve author choice."
  };
}

export function defaultTianyiRelationshipPolicy(agentId = "agent.tianyi"): RelationshipPolicy {
  return {
    version: RELATIONSHIP_POLICY_VERSION,
    agentId,
    policyRevision: 1,
    mode: "warm-professional",
    aiIdentityDisclosure: true,
    minorVirtualIntimacyAllowed: false,
    prohibitedPatterns: [...POLICY_PROHIBITED_PATTERNS],
    exitControls: [...POLICY_EXIT_CONTROLS]
  };
}

export async function initializePersona(context: ContinuityContext, metadata: OwnerWriteMetadata, value = defaultTianyiPersona(context.agentId)) {
  return createOwner(context, context.agentId, value, PERSONA_CODEC, { ...metadata, source: "create" });
}

export async function readPersona(context: ContinuityContext) {
  return readOwner(context, context.agentId, PERSONA_CODEC);
}

export async function updatePersona(context: ContinuityContext, expectedContentHash: string, value: Persona, metadata: Omit<OwnerWriteMetadata, "source">) {
  return updateOwner(context, context.agentId, expectedContentHash, value, PERSONA_CODEC, { ...metadata, source: "update" });
}

export async function listPersonaRevisions(context: ContinuityContext) {
  return listOwnerRevisions(context, context.agentId, PERSONA_CODEC);
}

export async function previewPersonaRevision(context: ContinuityContext, revisionId: string) {
  return previewOwnerRevision(context, context.agentId, revisionId, PERSONA_CODEC);
}

export async function restorePersonaRevision(context: ContinuityContext, expectedContentHash: string, revisionId: string, metadata: Omit<OwnerWriteMetadata, "source" | "restoredFromRevisionId">) {
  return restoreOwnerRevision(context, context.agentId, expectedContentHash, revisionId, PERSONA_CODEC, metadata);
}

export async function initializeRelationshipPolicy(context: ContinuityContext, metadata: OwnerWriteMetadata, value = defaultTianyiRelationshipPolicy(context.agentId)) {
  return createOwner(context, context.agentId, value, POLICY_CODEC, { ...metadata, source: "create" });
}

export async function readRelationshipPolicy(context: ContinuityContext) {
  return readOwner(context, context.agentId, POLICY_CODEC);
}

export async function updateRelationshipPolicy(context: ContinuityContext, expectedContentHash: string, value: RelationshipPolicy, metadata: Omit<OwnerWriteMetadata, "source">) {
  return updateOwner(context, context.agentId, expectedContentHash, value, POLICY_CODEC, { ...metadata, source: "update" });
}

export async function listRelationshipPolicyRevisions(context: ContinuityContext) {
  return listOwnerRevisions(context, context.agentId, POLICY_CODEC);
}

export async function previewRelationshipPolicyRevision(context: ContinuityContext, revisionId: string) {
  return previewOwnerRevision(context, context.agentId, revisionId, POLICY_CODEC);
}

export async function restoreRelationshipPolicyRevision(context: ContinuityContext, expectedContentHash: string, revisionId: string, metadata: Omit<OwnerWriteMetadata, "source" | "restoredFromRevisionId">) {
  return restoreOwnerRevision(context, context.agentId, expectedContentHash, revisionId, POLICY_CODEC, metadata);
}

export const personaCodec = PERSONA_CODEC;
export const relationshipPolicyCodec = POLICY_CODEC;
