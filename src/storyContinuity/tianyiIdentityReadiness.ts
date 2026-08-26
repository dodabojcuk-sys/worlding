import {
  defaultTianyiPersona,
  defaultTianyiRelationshipPolicy,
  initializePersona,
  initializeRelationshipPolicy,
  listPersonaRevisions,
  listRelationshipPolicyRevisions,
  previewPersonaRevision,
  previewRelationshipPolicyRevision,
  readPersona,
  readRelationshipPolicy
} from "./personaPolicyRepositories.ts";
import {
  type ContinuityContext
} from "./continuityFilesystem.ts";
import {
  ContinuityError,
  type ContinuityOwnerRef,
  type ContinuityReadResult,
  type Persona,
  type RelationshipPolicy
} from "./continuityTypes.ts";
import { sha256, stableJson } from "./continuityValidation.ts";

export const TIANYI_IDENTITY_SNAPSHOT_VERSION = "story-tianyi-identity-snapshot/v1" as const;

export type TianyiIdentityOwnerSnapshot = {
  owner: ContinuityOwnerRef;
  declaredRevision: number;
  historyRevisionId: string;
  historySequence: number;
  contentHash: string;
  byteLength: number;
};

export type TianyiIdentitySnapshot = {
  version: typeof TIANYI_IDENTITY_SNAPSHOT_VERSION;
  projectId: string;
  agentId: string;
  persona: TianyiIdentityOwnerSnapshot;
  relationshipPolicy: TianyiIdentityOwnerSnapshot;
  digest: string;
};

export type TianyiIdentityFaultMilestone =
  | "before-persona-create"
  | "after-persona-create"
  | "before-policy-create"
  | "after-policy-create"
  | "before-snapshot";

export class TianyiIdentityReadinessError extends ContinuityError {
  readonly identityState: "CONFLICTED" | "HISTORY_MISSING" | "REVISION_DRIFT" | "CORRUPT";

  constructor(
    identityState: "CONFLICTED" | "HISTORY_MISSING" | "REVISION_DRIFT" | "CORRUPT",
    message: string
  ) {
    super(`tianyi-identity-${identityState.toLowerCase().replaceAll("_", "-")}`, message);
    this.name = "TianyiIdentityReadinessError";
    this.identityState = identityState;
  }
}

/**
 * Ensures the author-global Tianyi Persona/Relationship Policy pair exists,
 * has complete owner histories, and can be frozen for one project request.
 * Owner-level create conflicts converge on the exact canonical defaults.
 * Avoiding a long-lived pair lock also means process termination cannot strand
 * a workflow lock between the two durable owners.
 */
export async function ensureTianyiIdentityReady(input: {
  rootPath: string;
  agentId: string;
  projectId: string;
  recordedAt: string;
  onFaultMilestone?(milestone: TianyiIdentityFaultMilestone): void | Promise<void>;
}): Promise<TianyiIdentitySnapshot> {
  const context: ContinuityContext = {
    rootPath: input.rootPath,
    agentId: input.agentId,
    scope: "author-global"
  };
  for (let convergenceAttempt = 0; convergenceAttempt < 4; convergenceAttempt += 1) {
    let persona = await readSafely(() => readPersona(context));
    let policy = await readSafely(() => readRelationshipPolicy(context));

    if (!persona && !policy) {
      await input.onFaultMilestone?.("before-persona-create");
      const createdPersona = await initializePersona(context, {
        source: "create",
        recordedAt: input.recordedAt,
        operationId: bootstrapOperationId(input.agentId)
      });
      if (!createdPersona.ok) continue;
      await input.onFaultMilestone?.("after-persona-create");
      persona = createdPersona.current;
      await input.onFaultMilestone?.("before-policy-create");
      const createdPolicy = await initializeRelationshipPolicy(context, {
        source: "create",
        recordedAt: input.recordedAt,
        operationId: bootstrapOperationId(input.agentId)
      });
      if (!createdPolicy.ok) continue;
      await input.onFaultMilestone?.("after-policy-create");
      policy = createdPolicy.current;
    } else if (persona && !policy) {
      await requireCanonicalSurvivor(context, "persona", persona);
      await input.onFaultMilestone?.("before-policy-create");
      const createdPolicy = await initializeRelationshipPolicy(context, {
        source: "create",
        recordedAt: input.recordedAt,
        operationId: bootstrapOperationId(input.agentId)
      });
      if (!createdPolicy.ok) continue;
      await input.onFaultMilestone?.("after-policy-create");
      policy = createdPolicy.current;
    } else if (!persona && policy) {
      await requireCanonicalSurvivor(context, "policy", policy);
      await input.onFaultMilestone?.("before-persona-create");
      const createdPersona = await initializePersona(context, {
        source: "create",
        recordedAt: input.recordedAt,
        operationId: bootstrapOperationId(input.agentId)
      });
      if (!createdPersona.ok) continue;
      await input.onFaultMilestone?.("after-persona-create");
      persona = createdPersona.current;
    }

    if (!persona || !policy) throw conflicted("Tianyi identity pair is incomplete.");
    if (persona.value.status !== "active") throw conflicted("Tianyi Persona is not active.");
    await input.onFaultMilestone?.("before-snapshot");
    return buildSnapshot(context, input.projectId, persona, policy);
  }
  throw conflicted("Concurrent Tianyi identity bootstrap did not converge.");
}

async function buildSnapshot(
  context: ContinuityContext,
  projectId: string,
  persona: ContinuityReadResult<Persona>,
  policy: ContinuityReadResult<RelationshipPolicy>
): Promise<TianyiIdentitySnapshot> {
  const personaHistory = await requireLatestHistory(
    "Persona",
    persona,
    await listPersonaRevisions(context),
    (id) => previewPersonaRevision(context, id)
  );
  const policyHistory = await requireLatestHistory(
    "Relationship Policy",
    policy,
    await listRelationshipPolicyRevisions(context),
    (id) => previewRelationshipPolicyRevision(context, id)
  );
  const value = {
    version: TIANYI_IDENTITY_SNAPSHOT_VERSION,
    projectId,
    agentId: context.agentId,
    persona: {
      owner: structuredClone(persona.owner),
      declaredRevision: persona.value.persona_revision,
      historyRevisionId: personaHistory.id,
      historySequence: personaHistory.sequence,
      contentHash: persona.contentHash,
      byteLength: persona.byteLength
    },
    relationshipPolicy: {
      owner: structuredClone(policy.owner),
      declaredRevision: policy.value.policyRevision,
      historyRevisionId: policyHistory.id,
      historySequence: policyHistory.sequence,
      contentHash: policy.contentHash,
      byteLength: policy.byteLength
    }
  };
  return { ...value, digest: sha256(stableJson(value)) };
}

async function requireCanonicalSurvivor(
  context: ContinuityContext,
  kind: "persona",
  owner: ContinuityReadResult<Persona>
): Promise<void>;
async function requireCanonicalSurvivor(
  context: ContinuityContext,
  kind: "policy",
  owner: ContinuityReadResult<RelationshipPolicy>
): Promise<void>;
async function requireCanonicalSurvivor(
  context: ContinuityContext,
  kind: "persona" | "policy",
  owner: ContinuityReadResult<Persona> | ContinuityReadResult<RelationshipPolicy>
): Promise<void> {
  const expected = kind === "persona"
    ? defaultTianyiPersona(context.agentId)
    : defaultTianyiRelationshipPolicy(context.agentId);
  if (stableJson(owner.value) !== stableJson(expected)) {
    throw conflicted("Tianyi identity half-pair contains non-default material.");
  }
  if (kind === "persona") {
    await requireLatestHistory(
      "Persona",
      owner as ContinuityReadResult<Persona>,
      await listPersonaRevisions(context),
      (id) => previewPersonaRevision(context, id)
    );
  } else {
    await requireLatestHistory(
      "Relationship Policy",
      owner as ContinuityReadResult<RelationshipPolicy>,
      await listRelationshipPolicyRevisions(context),
      (id) => previewRelationshipPolicyRevision(context, id)
    );
  }
}

async function requireLatestHistory<T>(
  label: string,
  owner: ContinuityReadResult<T>,
  revisions: Array<{ id: string; sequence: number; contentHash: string; byteLength: number }>,
  preview: (revisionId: string) => Promise<{ source: string }>
): Promise<{ id: string; sequence: number }> {
  const latest = revisions.at(-1);
  if (!latest) {
    throw new TianyiIdentityReadinessError("HISTORY_MISSING", `${label} owner has no durable revision history.`);
  }
  if (latest.contentHash !== owner.contentHash || latest.byteLength !== owner.byteLength) {
    throw new TianyiIdentityReadinessError("REVISION_DRIFT", `${label} owner does not match its latest durable revision.`);
  }
  let source: string;
  try {
    source = (await preview(latest.id)).source;
  } catch (error) {
    throw new TianyiIdentityReadinessError(
      "CORRUPT",
      `${label} history snapshot failed integrity validation: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
  if (sha256(source) !== owner.contentHash || Buffer.byteLength(source, "utf8") !== owner.byteLength) {
    throw new TianyiIdentityReadinessError("REVISION_DRIFT", `${label} snapshot bytes do not match the current owner.`);
  }
  return { id: latest.id, sequence: latest.sequence };
}

async function readSafely<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    throw new TianyiIdentityReadinessError(
      "CORRUPT",
      `Tianyi identity owner failed validation: ${error instanceof Error ? error.message : "unknown error"}`
    );
  }
}

function bootstrapOperationId(agentId: string): string {
  return `operation.identity-bootstrap.${sha256(agentId).slice(0, 24)}`;
}

function conflicted(message: string): TianyiIdentityReadinessError {
  return new TianyiIdentityReadinessError("CONFLICTED", message);
}
