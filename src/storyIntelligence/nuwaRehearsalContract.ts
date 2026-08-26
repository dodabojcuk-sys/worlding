import { normalizeNfc, parseStrictJson, requireHash } from "../storyContinuity/continuityValidation.ts";

export const NUWA_REHEARSAL_REVISION_VERSION = "story-studio-nuwa-rehearsal-revision/v1" as const;
export const NUWA_REHEARSAL_READ_MODEL_VERSION = "story-studio-nuwa-rehearsal-read-model/v1" as const;
export const NUWA_REHEARSAL_MAX_BYTES = 512 * 1024;

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export const NUWA_REHEARSAL_EVENT_TYPES = [
  "agent_speech",
  "agent_action",
  "conscious_thought",
  "inner_monologue",
  "subconscious_tendency",
  "psychological_state",
  "environment_change",
  "narration",
  "agent_coordination",
  "memory_delta",
  "relationship_delta",
  "temporary_variable_applied",
  "creative_boost_applied",
  "intervention_proposed",
  "intervention_applied",
  "candidate_emitted",
  "system_checkpoint",
  "run_note"
] as const;

export type NuwaRehearsalEventType = typeof NUWA_REHEARSAL_EVENT_TYPES[number];
export type NuwaRehearsalStatus = "planned" | "running" | "completed" | "failed" | "cancelled" | "ready-for-candidate-review";
export type NuwaRehearsalScope = "current_run" | "current_unit";
export type NuwaRehearsalReviewStatus = "pending" | "approved" | "rejected";

export type NuwaRehearsalAgentRef = {
  objectId: string;
  objectKind: "character";
  displayName: string;
  sourceRevision: string;
};

export type NuwaRehearsalAgentResolver = (ref: Pick<NuwaRehearsalAgentRef, "objectId" | "objectKind">) => {
  displayName: string;
  sourceRevision: string;
} | null;

export type NuwaTemporaryVariable = {
  variableId: string;
  name: string;
  value: string;
  scope: NuwaRehearsalScope;
  enabled: boolean;
  source: string;
  introducedAtRevision: number;
  expiresAfterRevision: number | null;
  revokedAtRevision: number | null;
};

export type NuwaCreativeBoost = {
  boostId: string;
  label: string;
  instruction: string;
  scope: NuwaRehearsalScope;
  enabled: boolean;
  source: string;
  introducedAtRevision: number;
  disabledAtRevision: number | null;
};

export type NuwaInterventionProposal = {
  interventionId: string;
  targetAgentRef: NuwaRehearsalAgentRef;
  reason: string;
  proposedChange: string;
  expectedImpact: string;
  risk: "low" | "medium" | "high";
  status: "pending" | "approved" | "rejected" | "applied_to_run_revision";
  source: string;
  createdAt: string;
  approvedForRevision: number | null;
  applicationOperationId: string | null;
  applicationReceipt: {
    runId: string;
    runRevision: number;
    eventId: string;
    operationId: string;
    appliedAt: string;
  } | null;
};

export type NuwaMemoryDelta = {
  deltaId: string;
  agentRef: NuwaRehearsalAgentRef;
  before: string;
  proposedAfter: string;
  reason: string;
  sourceEventId: string;
  reviewStatus: NuwaRehearsalReviewStatus;
};

export type NuwaRelationshipDelta = {
  deltaId: string;
  sourceAgentRef: NuwaRehearsalAgentRef;
  targetAgentRef: NuwaRehearsalAgentRef;
  before: string;
  proposedAfter: string;
  reason: string;
  sourceEventId: string;
  reviewStatus: NuwaRehearsalReviewStatus;
};

type NuwaRehearsalEventBase<T extends NuwaRehearsalEventType, P> = {
  eventId: string;
  unitId: string;
  runId: string;
  runRevision: number;
  sequence: number;
  eventType: T;
  actorAgentRef: NuwaRehearsalAgentRef | null;
  targetRefs: string[];
  source: { kind: "provider" | "director" | "system"; sourceRef: string };
  payload: P;
  createdAt: string;
};

export type NuwaRehearsalEvent =
  | NuwaRehearsalEventBase<"agent_speech", { text: string }>
  | NuwaRehearsalEventBase<"agent_action", { description: string }>
  | NuwaRehearsalEventBase<"conscious_thought", { text: string }>
  | NuwaRehearsalEventBase<"inner_monologue", { text: string }>
  | NuwaRehearsalEventBase<"subconscious_tendency", { text: string }>
  | NuwaRehearsalEventBase<"psychological_state", { text: string }>
  | NuwaRehearsalEventBase<"environment_change", { description: string }>
  | NuwaRehearsalEventBase<"narration", { text: string }>
  | NuwaRehearsalEventBase<"agent_coordination", { description: string }>
  | NuwaRehearsalEventBase<"memory_delta", { deltaId: string }>
  | NuwaRehearsalEventBase<"relationship_delta", { deltaId: string }>
  | NuwaRehearsalEventBase<"temporary_variable_applied", { variableId: string }>
  | NuwaRehearsalEventBase<"creative_boost_applied", { boostId: string }>
  | NuwaRehearsalEventBase<"intervention_proposed", { interventionId: string }>
  | NuwaRehearsalEventBase<"intervention_applied", { interventionId: string; operationId: string }>
  | NuwaRehearsalEventBase<"candidate_emitted", { candidateRef: string }>
  | NuwaRehearsalEventBase<"system_checkpoint", { label: string }>
  | NuwaRehearsalEventBase<"run_note", { text: string }>;

export type NuwaRehearsalRevision = {
  version: typeof NUWA_REHEARSAL_REVISION_VERSION;
  unitId: string;
  explorationId: string;
  briefId: string;
  briefRevision: number;
  runId: string;
  runRevision: number;
  parentRunRevision: number | null;
  status: NuwaRehearsalStatus;
  roster: NuwaRehearsalAgentRef[];
  temporaryVariables: NuwaTemporaryVariable[];
  creativeBoosts: NuwaCreativeBoost[];
  interventionProposals: NuwaInterventionProposal[];
  orderedEvents: NuwaRehearsalEvent[];
  memoryDeltas: NuwaMemoryDelta[];
  relationshipDeltas: NuwaRelationshipDelta[];
  candidateRefs: string[];
  inheritance: { temporaryVariables: boolean; creativeBoosts: boolean };
  createdAt: string;
  updatedAt: string;
};

export type NuwaRehearsalReadModel = {
  version: typeof NUWA_REHEARSAL_READ_MODEL_VERSION;
  runId: string;
  latestRevision: number | null;
  revisions: NuwaRehearsalRevision[];
};

export function parseNuwaRehearsalRevision(input: {
  source: string;
  expectedRunId: string;
  expectedUnitId?: string;
  expectedRunRevision?: number;
  resolveAgent?: NuwaRehearsalAgentResolver;
}): NuwaRehearsalRevision {
  return normalizeNuwaRehearsalRevision(
    parseStrictJson(input.source, NUWA_REHEARSAL_MAX_BYTES, "Nuwa rehearsal revision"),
    input
  );
}

export function normalizeNuwaRehearsalRevision(
  value: unknown,
  expected: {
    expectedRunId: string;
    expectedUnitId?: string;
    expectedRunRevision?: number;
    resolveAgent?: NuwaRehearsalAgentResolver;
  }
): NuwaRehearsalRevision {
  const input = exactObject(value, [
    "version", "unitId", "explorationId", "briefId", "briefRevision", "runId", "runRevision", "parentRunRevision", "status",
    "roster", "temporaryVariables", "creativeBoosts", "interventionProposals", "orderedEvents", "memoryDeltas", "relationshipDeltas",
    "candidateRefs", "inheritance", "createdAt", "updatedAt"
  ], "Nuwa rehearsal revision");
  if (input.version !== NUWA_REHEARSAL_REVISION_VERSION) throw new Error("Nuwa rehearsal revision version is unsupported.");
  const runId = stableRef(input.runId, "Nuwa rehearsal run identifier");
  const unitId = stableRef(input.unitId, "Nuwa rehearsal unit identifier");
  const runRevision = integer(input.runRevision, "Nuwa rehearsal run revision", 1, 99_999);
  if (runId !== stableRef(expected.expectedRunId, "Expected Nuwa run identifier")) throw new Error("Nuwa rehearsal revision belongs to another run.");
  if (expected.expectedUnitId && unitId !== stableRef(expected.expectedUnitId, "Expected Nuwa unit identifier")) throw new Error("Nuwa rehearsal revision belongs to another unit.");
  if (expected.expectedRunRevision && runRevision !== expected.expectedRunRevision) throw new Error("Nuwa rehearsal revision number is not the expected immutable revision.");
  const explorationId = stableRef(input.explorationId, "Nuwa rehearsal Exploration identifier");
  if (unitId !== explorationId) throw new Error("Nuwa rehearsal unit identity must be the existing Exploration identity.");
  const roster = array(input.roster, "Nuwa rehearsal roster", 32).map(normalizeAgentRef);
  if (roster.length < 2) throw new Error("Nuwa rehearsal requires at least two formal character Agents.");
  if (new Set(roster.map((agent) => agent.objectId)).size !== roster.length) throw new Error("Nuwa rehearsal roster cannot contain duplicate Agents.");
  if (expected.resolveAgent) {
    for (const agent of roster) {
      const resolved = expected.resolveAgent(agent);
      if (!resolved) throw new Error(`Nuwa rehearsal Agent does not exist: ${agent.objectId}.`);
      if (resolved.displayName !== agent.displayName || resolved.sourceRevision !== agent.sourceRevision) {
        throw new Error(`Nuwa rehearsal Agent source revision is stale: ${agent.objectId}.`);
      }
    }
  }
  const temporaryVariables = array(input.temporaryVariables, "Nuwa temporary variables", 64).map(normalizeTemporaryVariable);
  const creativeBoosts = array(input.creativeBoosts, "Nuwa creative boosts", 32).map(normalizeCreativeBoost);
  const interventionProposals = array(input.interventionProposals, "Nuwa intervention proposals", 64).map(normalizeIntervention);
  const memoryDeltas = array(input.memoryDeltas, "Nuwa memory deltas", 256).map(normalizeMemoryDelta);
  const relationshipDeltas = array(input.relationshipDeltas, "Nuwa relationship deltas", 256).map(normalizeRelationshipDelta);
  const orderedEvents = array(input.orderedEvents, "Nuwa rehearsal events", 2_000).map((event) => normalizeEvent(event, { unitId, runId, runRevision }));
  const inheritanceInput = exactObject(input.inheritance, ["temporaryVariables", "creativeBoosts"], "Nuwa rehearsal inheritance");
  const result: NuwaRehearsalRevision = {
    version: NUWA_REHEARSAL_REVISION_VERSION,
    unitId,
    explorationId,
    briefId: stableRef(input.briefId, "Nuwa rehearsal Brief identifier"),
    briefRevision: integer(input.briefRevision, "Nuwa rehearsal Brief revision", 1, 9_999),
    runId,
    runRevision,
    parentRunRevision: input.parentRunRevision == null ? null : integer(input.parentRunRevision, "Nuwa rehearsal parent revision", 1, 99_998),
    status: rehearsalStatus(input.status),
    roster,
    temporaryVariables,
    creativeBoosts,
    interventionProposals,
    orderedEvents,
    memoryDeltas,
    relationshipDeltas,
    candidateRefs: uniqueRefs(input.candidateRefs, "Nuwa rehearsal Candidate references", 128),
    inheritance: {
      temporaryVariables: boolean(input.inheritance && inheritanceInput.temporaryVariables, "Temporary variable inheritance"),
      creativeBoosts: boolean(input.inheritance && inheritanceInput.creativeBoosts, "Creative boost inheritance")
    },
    createdAt: timestamp(input.createdAt, "Nuwa rehearsal creation time"),
    updatedAt: timestamp(input.updatedAt, "Nuwa rehearsal update time")
  };
  validateRevisionRelations(result);
  return result;
}

export function assertNuwaRehearsalInheritance(previous: NuwaRehearsalRevision, next: NuwaRehearsalRevision): void {
  if (next.parentRunRevision !== previous.runRevision || next.runRevision !== previous.runRevision + 1) {
    throw new Error("Nuwa rehearsal revisions must form an immutable contiguous chain.");
  }
  if (next.unitId !== previous.unitId || next.runId !== previous.runId || next.explorationId !== previous.explorationId) {
    throw new Error("Nuwa rehearsal revision cannot cross its unit or run.");
  }
  assertInheritedCollection({
    inherited: next.inheritance.temporaryVariables,
    previous: previous.temporaryVariables.filter((item) => item.scope === "current_unit" && item.enabled && item.revokedAtRevision == null),
    next: next.temporaryVariables,
    id: (item) => item.variableId,
    label: "temporary variable"
  });
  assertInheritedCollection({
    inherited: next.inheritance.creativeBoosts,
    previous: previous.creativeBoosts.filter((item) => item.scope === "current_unit" && item.enabled && item.disabledAtRevision == null),
    next: next.creativeBoosts,
    id: (item) => item.boostId,
    label: "creative boost"
  });
}

function validateRevisionRelations(revision: NuwaRehearsalRevision): void {
  if ((revision.runRevision === 1) !== (revision.parentRunRevision == null)) throw new Error("Only the first Nuwa rehearsal revision can omit its parent revision.");
  if (revision.parentRunRevision != null && revision.parentRunRevision !== revision.runRevision - 1) throw new Error("Nuwa rehearsal parent revision must be the immediately preceding revision.");
  for (const collection of [revision.temporaryVariables, revision.creativeBoosts, revision.interventionProposals, revision.memoryDeltas, revision.relationshipDeltas]) {
    const ids = collection.map((item) => "variableId" in item ? item.variableId : "boostId" in item ? item.boostId : "interventionId" in item ? item.interventionId : item.deltaId);
    if (new Set(ids).size !== ids.length) throw new Error("Nuwa rehearsal nested identifiers must be unique within their collection.");
  }
  if (new Set(revision.orderedEvents.map((event) => event.eventId)).size !== revision.orderedEvents.length) throw new Error("Nuwa rehearsal event identifiers must be unique.");
  revision.orderedEvents.forEach((event, index) => {
    if (event.sequence !== index + 1) throw new Error("Nuwa rehearsal event sequence must be contiguous and strictly ordered.");
  });
  const rosterIds = new Set(revision.roster.map((agent) => agent.objectId));
  const variableById = new Map(revision.temporaryVariables.map((item) => [item.variableId, item]));
  const boostById = new Map(revision.creativeBoosts.map((item) => [item.boostId, item]));
  const interventionById = new Map(revision.interventionProposals.map((item) => [item.interventionId, item]));
  const memoryIds = new Set(revision.memoryDeltas.map((item) => item.deltaId));
  const relationshipIds = new Set(revision.relationshipDeltas.map((item) => item.deltaId));
  const emittedCandidates = new Set<string>();
  const eventIds = new Set(revision.orderedEvents.map((event) => event.eventId));
  for (const event of revision.orderedEvents) {
    if (event.actorAgentRef && !rosterIds.has(event.actorAgentRef.objectId)) throw new Error("Nuwa rehearsal event actor is outside the current roster.");
    if (["agent_speech", "agent_action", "conscious_thought", "inner_monologue", "subconscious_tendency", "psychological_state"].includes(event.eventType) && !event.actorAgentRef) {
      throw new Error("Agent speech, action, and narrative psychology require a roster actor.");
    }
    if (event.eventType === "memory_delta" && !memoryIds.has(event.payload.deltaId)) throw new Error("Nuwa rehearsal memory event references a missing delta.");
    if (event.eventType === "relationship_delta" && !relationshipIds.has(event.payload.deltaId)) throw new Error("Nuwa rehearsal relationship event references a missing delta.");
    if (event.eventType === "temporary_variable_applied" && !variableById.get(event.payload.variableId)?.enabled) throw new Error("Nuwa rehearsal variable event references a disabled or missing variable.");
    if (event.eventType === "creative_boost_applied" && !boostById.get(event.payload.boostId)?.enabled) throw new Error("Nuwa rehearsal boost event references a disabled or missing boost.");
    if (event.eventType === "intervention_applied") {
      const intervention = interventionById.get(event.payload.interventionId);
      if (!intervention || intervention.status !== "applied_to_run_revision" || intervention.applicationOperationId !== event.payload.operationId) {
        throw new Error("Nuwa rehearsal intervention event lacks an approved applied proposal.");
      }
    }
    if (event.eventType === "candidate_emitted") emittedCandidates.add(event.payload.candidateRef);
  }
  for (const delta of revision.memoryDeltas) if (!rosterIds.has(delta.agentRef.objectId)) throw new Error("Nuwa rehearsal memory delta references an Agent outside the roster.");
  for (const delta of revision.memoryDeltas) if (!eventIds.has(delta.sourceEventId)) throw new Error("Nuwa rehearsal memory delta source event is missing.");
  for (const delta of revision.relationshipDeltas) {
    if (!rosterIds.has(delta.sourceAgentRef.objectId) || !rosterIds.has(delta.targetAgentRef.objectId)) throw new Error("Nuwa rehearsal relationship delta references an Agent outside the roster.");
    if (!eventIds.has(delta.sourceEventId)) throw new Error("Nuwa rehearsal relationship delta source event is missing.");
  }
  for (const variable of revision.temporaryVariables) {
    if (variable.introducedAtRevision > revision.runRevision || (variable.expiresAfterRevision != null && revision.runRevision > variable.expiresAfterRevision && variable.enabled)) {
      throw new Error("Nuwa temporary variable lifetime is inconsistent with the run revision.");
    }
    if (variable.scope === "current_run" && variable.introducedAtRevision !== revision.runRevision) throw new Error("A current-run temporary variable cannot leak into another run revision.");
  }
  for (const boost of revision.creativeBoosts) {
    if (boost.introducedAtRevision > revision.runRevision) throw new Error("Nuwa creative boost lifetime is inconsistent with the run revision.");
    if (boost.scope === "current_run" && boost.introducedAtRevision !== revision.runRevision) throw new Error("A current-run creative boost cannot leak into another run revision.");
  }
  for (const intervention of revision.interventionProposals) {
    if (!rosterIds.has(intervention.targetAgentRef.objectId)) throw new Error("Nuwa rehearsal intervention target is outside the roster.");
    if (intervention.status === "pending" && intervention.applicationReceipt) throw new Error("A pending intervention cannot have side effects.");
    if (intervention.applicationReceipt) {
      if (
        intervention.applicationReceipt.runId !== revision.runId
        || intervention.applicationReceipt.runRevision !== revision.runRevision
        || !revision.orderedEvents.some((event) => event.eventId === intervention.applicationReceipt?.eventId && event.eventType === "intervention_applied")
      ) throw new Error("Nuwa intervention application receipt crosses its run revision.");
    }
  }
  if (revision.candidateRefs.some((ref) => !emittedCandidates.has(ref))) throw new Error("Nuwa rehearsal Candidate references must be emitted by an ordered event.");
  if ([...emittedCandidates].some((ref) => !revision.candidateRefs.includes(ref))) throw new Error("Every emitted Candidate must be represented in the Run Pack revision.");
}

function normalizeAgentRef(value: unknown): NuwaRehearsalAgentRef {
  const input = exactObject(value, ["objectId", "objectKind", "displayName", "sourceRevision"], "Nuwa rehearsal Agent reference");
  if (input.objectKind !== "character") throw new Error("Nuwa rehearsal currently accepts formal character Agents only.");
  return {
    objectId: stableRef(input.objectId, "Nuwa rehearsal Agent object identifier"),
    objectKind: "character",
    displayName: text(input.displayName, "Nuwa rehearsal Agent display name", 120),
    sourceRevision: requireHash(input.sourceRevision, "Nuwa rehearsal Agent source revision")
  };
}

function normalizeTemporaryVariable(value: unknown): NuwaTemporaryVariable {
  const input = exactObject(value, ["variableId", "name", "value", "scope", "enabled", "source", "introducedAtRevision", "expiresAfterRevision", "revokedAtRevision"], "Nuwa temporary variable");
  const introducedAtRevision = integer(input.introducedAtRevision, "Temporary variable introduced revision", 1, 99_999);
  const expiresAfterRevision = input.expiresAfterRevision == null ? null : integer(input.expiresAfterRevision, "Temporary variable expiry", introducedAtRevision, 99_999);
  const revokedAtRevision = input.revokedAtRevision == null ? null : integer(input.revokedAtRevision, "Temporary variable revocation", introducedAtRevision, 99_999);
  const enabled = boolean(input.enabled, "Temporary variable enabled state");
  if (enabled && revokedAtRevision != null) throw new Error("A revoked temporary variable cannot remain enabled.");
  return {
    variableId: stableRef(input.variableId, "Temporary variable identifier"),
    name: text(input.name, "Temporary variable name", 120),
    value: text(input.value, "Temporary variable value", 2_000),
    scope: scope(input.scope),
    enabled,
    source: stableRef(input.source, "Temporary variable source"),
    introducedAtRevision,
    expiresAfterRevision,
    revokedAtRevision
  };
}

function normalizeCreativeBoost(value: unknown): NuwaCreativeBoost {
  const input = exactObject(value, ["boostId", "label", "instruction", "scope", "enabled", "source", "introducedAtRevision", "disabledAtRevision"], "Nuwa creative boost");
  const introducedAtRevision = integer(input.introducedAtRevision, "Creative boost introduced revision", 1, 99_999);
  const disabledAtRevision = input.disabledAtRevision == null ? null : integer(input.disabledAtRevision, "Creative boost disabled revision", introducedAtRevision, 99_999);
  const enabled = boolean(input.enabled, "Creative boost enabled state");
  if (enabled && disabledAtRevision != null) throw new Error("A disabled creative boost cannot remain enabled.");
  return {
    boostId: stableRef(input.boostId, "Creative boost identifier"),
    label: text(input.label, "Creative boost label", 120),
    instruction: text(input.instruction, "Creative boost instruction", 2_000),
    scope: scope(input.scope),
    enabled,
    source: stableRef(input.source, "Creative boost source"),
    introducedAtRevision,
    disabledAtRevision
  };
}

function normalizeIntervention(value: unknown): NuwaInterventionProposal {
  const input = exactObject(value, ["interventionId", "targetAgentRef", "reason", "proposedChange", "expectedImpact", "risk", "status", "source", "createdAt", "approvedForRevision", "applicationOperationId", "applicationReceipt"], "Nuwa intervention proposal");
  const status = enumValue(input.status, ["pending", "approved", "rejected", "applied_to_run_revision"] as const, "Nuwa intervention status");
  const applicationReceipt = input.applicationReceipt == null ? null : normalizeInterventionReceipt(input.applicationReceipt);
  const applicationOperationId = input.applicationOperationId == null ? null : stableRef(input.applicationOperationId, "Intervention application operation");
  const approvedForRevision = input.approvedForRevision == null ? null : integer(input.approvedForRevision, "Intervention approved revision", 1, 99_999);
  if (status === "pending" || status === "rejected") {
    if (approvedForRevision != null || applicationOperationId || applicationReceipt) throw new Error("Unapproved intervention proposals cannot have application state.");
  }
  if (status === "approved" && (approvedForRevision == null || applicationOperationId || applicationReceipt)) throw new Error("Approved intervention must target the next explicit revision without an application receipt.");
  if (status === "applied_to_run_revision" && (approvedForRevision == null || !applicationOperationId || !applicationReceipt)) throw new Error("Applied intervention is missing its application receipt.");
  if (applicationReceipt && applicationOperationId !== applicationReceipt.operationId) throw new Error("Intervention operation and receipt do not match.");
  return {
    interventionId: stableRef(input.interventionId, "Intervention identifier"),
    targetAgentRef: normalizeAgentRef(input.targetAgentRef),
    reason: text(input.reason, "Intervention reason", 1_000),
    proposedChange: text(input.proposedChange, "Intervention proposed change", 2_000),
    expectedImpact: text(input.expectedImpact, "Intervention expected impact", 2_000),
    risk: enumValue(input.risk, ["low", "medium", "high"] as const, "Intervention risk"),
    status,
    source: stableRef(input.source, "Intervention source"),
    createdAt: timestamp(input.createdAt, "Intervention creation time"),
    approvedForRevision,
    applicationOperationId,
    applicationReceipt
  };
}

function normalizeInterventionReceipt(value: unknown): NuwaInterventionProposal["applicationReceipt"] {
  const input = exactObject(value, ["runId", "runRevision", "eventId", "operationId", "appliedAt"], "Intervention application receipt");
  return {
    runId: stableRef(input.runId, "Intervention receipt run"),
    runRevision: integer(input.runRevision, "Intervention receipt revision", 1, 99_999),
    eventId: stableRef(input.eventId, "Intervention receipt event"),
    operationId: stableRef(input.operationId, "Intervention receipt operation"),
    appliedAt: timestamp(input.appliedAt, "Intervention receipt time")
  } as NuwaInterventionProposal["applicationReceipt"];
}

function normalizeMemoryDelta(value: unknown): NuwaMemoryDelta {
  const input = exactObject(value, ["deltaId", "agentRef", "before", "proposedAfter", "reason", "sourceEventId", "reviewStatus"], "Nuwa memory delta");
  return {
    deltaId: stableRef(input.deltaId, "Memory delta identifier"),
    agentRef: normalizeAgentRef(input.agentRef),
    before: text(input.before, "Memory delta before state", 2_000, true),
    proposedAfter: text(input.proposedAfter, "Memory delta proposed state", 2_000),
    reason: text(input.reason, "Memory delta reason", 1_000),
    sourceEventId: stableRef(input.sourceEventId, "Memory delta source event"),
    reviewStatus: reviewStatus(input.reviewStatus)
  };
}

function normalizeRelationshipDelta(value: unknown): NuwaRelationshipDelta {
  const input = exactObject(value, ["deltaId", "sourceAgentRef", "targetAgentRef", "before", "proposedAfter", "reason", "sourceEventId", "reviewStatus"], "Nuwa relationship delta");
  return {
    deltaId: stableRef(input.deltaId, "Relationship delta identifier"),
    sourceAgentRef: normalizeAgentRef(input.sourceAgentRef),
    targetAgentRef: normalizeAgentRef(input.targetAgentRef),
    before: text(input.before, "Relationship delta before state", 2_000, true),
    proposedAfter: text(input.proposedAfter, "Relationship delta proposed state", 2_000),
    reason: text(input.reason, "Relationship delta reason", 1_000),
    sourceEventId: stableRef(input.sourceEventId, "Relationship delta source event"),
    reviewStatus: reviewStatus(input.reviewStatus)
  };
}

function normalizeEvent(value: unknown, owner: { unitId: string; runId: string; runRevision: number }): NuwaRehearsalEvent {
  const input = exactObject(value, ["eventId", "unitId", "runId", "runRevision", "sequence", "eventType", "actorAgentRef", "targetRefs", "source", "payload", "createdAt"], "Nuwa rehearsal event");
  const eventType = enumValue(input.eventType, NUWA_REHEARSAL_EVENT_TYPES, "Nuwa rehearsal event type");
  const unitId = stableRef(input.unitId, "Nuwa rehearsal event unit");
  const runId = stableRef(input.runId, "Nuwa rehearsal event run");
  const runRevision = integer(input.runRevision, "Nuwa rehearsal event revision", 1, 99_999);
  if (unitId !== owner.unitId || runId !== owner.runId || runRevision !== owner.runRevision) throw new Error("Nuwa rehearsal event crosses its unit or run revision.");
  const base = {
    eventId: stableRef(input.eventId, "Nuwa rehearsal event identifier"),
    unitId,
    runId,
    runRevision,
    sequence: integer(input.sequence, "Nuwa rehearsal event sequence", 1, 2_000),
    actorAgentRef: input.actorAgentRef == null ? null : normalizeAgentRef(input.actorAgentRef),
    targetRefs: uniqueRefs(input.targetRefs, "Nuwa rehearsal event targets", 32),
    source: normalizeEventSource(input.source),
    createdAt: timestamp(input.createdAt, "Nuwa rehearsal event time")
  };
  const payload = input.payload;
  if (eventType === "agent_speech") return { ...base, eventType, payload: payloadText(payload, "text", "Agent speech", 4_000) };
  if (eventType === "agent_action") return { ...base, eventType, payload: payloadText(payload, "description", "Agent action", 4_000) };
  if (eventType === "conscious_thought") return { ...base, eventType, payload: payloadText(payload, "text", "Conscious thought", 4_000) };
  if (eventType === "inner_monologue") return { ...base, eventType, payload: payloadText(payload, "text", "Inner monologue", 4_000) };
  if (eventType === "subconscious_tendency") return { ...base, eventType, payload: payloadText(payload, "text", "Subconscious tendency", 4_000) };
  if (eventType === "psychological_state") return { ...base, eventType, payload: payloadText(payload, "text", "Psychological state", 4_000) };
  if (eventType === "environment_change") return { ...base, eventType, payload: payloadText(payload, "description", "Environment change", 4_000) };
  if (eventType === "narration") return { ...base, eventType, payload: payloadText(payload, "text", "Narration", 4_000) };
  if (eventType === "agent_coordination") return { ...base, eventType, payload: payloadText(payload, "description", "Agent coordination", 4_000) };
  if (eventType === "system_checkpoint") return { ...base, eventType, payload: payloadText(payload, "label", "System checkpoint", 1_000) };
  if (eventType === "run_note") return { ...base, eventType, payload: payloadText(payload, "text", "Run note", 2_000) };
  if (eventType === "memory_delta") return { ...base, eventType, payload: payloadRef(payload, "deltaId", "Memory delta") };
  if (eventType === "relationship_delta") return { ...base, eventType, payload: payloadRef(payload, "deltaId", "Relationship delta") };
  if (eventType === "temporary_variable_applied") return { ...base, eventType, payload: payloadRef(payload, "variableId", "Temporary variable") };
  if (eventType === "creative_boost_applied") return { ...base, eventType, payload: payloadRef(payload, "boostId", "Creative boost") };
  if (eventType === "intervention_proposed") return { ...base, eventType, payload: payloadRef(payload, "interventionId", "Intervention") };
  if (eventType === "candidate_emitted") return { ...base, eventType, payload: payloadRef(payload, "candidateRef", "Candidate") };
  const interventionPayload = exactObject(payload, ["interventionId", "operationId"], "Applied intervention event payload");
  return {
    ...base,
    eventType: "intervention_applied",
    payload: {
      interventionId: stableRef(interventionPayload.interventionId, "Intervention identifier"),
      operationId: stableRef(interventionPayload.operationId, "Intervention application operation")
    }
  };
}

function normalizeEventSource(value: unknown): NuwaRehearsalEvent["source"] {
  const input = exactObject(value, ["kind", "sourceRef"], "Nuwa rehearsal event source");
  return {
    kind: enumValue(input.kind, ["provider", "director", "system"] as const, "Nuwa rehearsal event source kind"),
    sourceRef: stableRef(input.sourceRef, "Nuwa rehearsal event source reference")
  };
}

function payloadText<K extends "text" | "description" | "label">(value: unknown, key: K, label: string, maximum: number): Record<K, string> {
  const input = exactObject(value, [key], `${label} payload`);
  return { [key]: text(input[key], label, maximum) } as Record<K, string>;
}

function payloadRef<K extends "deltaId" | "variableId" | "boostId" | "interventionId" | "candidateRef">(value: unknown, key: K, label: string): Record<K, string> {
  const input = exactObject(value, [key], `${label} payload`);
  return { [key]: stableRef(input[key], `${label} reference`) } as Record<K, string>;
}

function assertInheritedCollection<T>(input: { inherited: boolean; previous: T[]; next: T[]; id: (item: T) => string; label: string }): void {
  if (!input.inherited) return;
  const nextById = new Map(input.next.map((item) => [input.id(item), item]));
  for (const item of input.previous) if (!nextById.has(input.id(item))) throw new Error(`Inherited Nuwa ${input.label} is missing from the next revision.`);
}

function exactObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid.`);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some((key) => FORBIDDEN_KEYS.has(key)) || keys.length !== fields.length || keys.some((key) => !fields.includes(key))) throw new Error(`${label} fields are invalid.`);
  return record;
}

function array(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} are invalid.`);
  return value;
}

function uniqueRefs(value: unknown, label: string, maximum: number): string[] {
  const refs = array(value, label, maximum).map((item) => stableRef(item, label));
  if (new Set(refs).size !== refs.length) throw new Error(`${label} must be unique.`);
  return refs;
}

function stableRef(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = normalizeNfc(value).trim();
  if (!normalized || [...normalized].length > 180 || !/^[\p{L}\p{N}][\p{L}\p{N}._:/@+-]*$/u.test(normalized)) throw new Error(`${label} is invalid.`);
  return normalized;
}

function text(value: unknown, label: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const normalized = normalizeNfc(value).trim();
  if ((!allowEmpty && !normalized) || [...normalized].length > maximum) throw new Error(`${label} is invalid.`);
  return normalized;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || !TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new Error(`${label} is invalid.`);
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) throw new Error(`${label} is invalid.`);
  return Number(value);
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} is invalid.`);
  return value;
}

function enumValue<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (!values.includes(value as T[number])) throw new Error(`${label} is invalid.`);
  return value as T[number];
}

function rehearsalStatus(value: unknown): NuwaRehearsalStatus {
  return enumValue(value, ["planned", "running", "completed", "failed", "cancelled", "ready-for-candidate-review"] as const, "Nuwa rehearsal status");
}

function scope(value: unknown): NuwaRehearsalScope {
  return enumValue(value, ["current_run", "current_unit"] as const, "Nuwa rehearsal scope");
}

function reviewStatus(value: unknown): NuwaRehearsalReviewStatus {
  return enumValue(value, ["pending", "approved", "rejected"] as const, "Nuwa rehearsal delta review status");
}
