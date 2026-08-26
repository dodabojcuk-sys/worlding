import { sha256, stableJson } from "./continuityValidation.ts";
import {
  normalizeStoryStudioEventReference,
  storyStudioEventReferenceKey,
  type StoryStudioEventReference
} from "../storyContracts/storyStudioEventReference.ts";
import {
  normalizeTianyiObjectContextRef,
  tianyiObjectContextRefKey,
  type TianyiObjectContextRef
} from "./tianyiObjectContext.ts";

export const TIANYI_GROUNDED_CONTEXT_REQUEST_VERSION = "story-tianyi-grounded-context-request/v1" as const;
export const TIANYI_GROUNDED_SOURCE_MANIFEST_VERSION = "story-tianyi-grounded-source-manifest/v1" as const;
export const TIANYI_GROUNDED_CONTEXT_HARD_BUDGET = 56_000;

export type TianyiGroundedAccessMode = "author" | "character";
export type TianyiGroundedTaskKind = "grounded-answer";
export type TianyiGroundedSourceType = "writing" | "scene" | "world-object" | "rule" | "memory";
export type TianyiGroundedSourceLane = "scene" | "subject" | "constraint" | "memory" | "evidence";
export type TianyiGroundedDecision = "included" | "excluded" | "budget-omitted" | "conflicting";
export type TianyiGroundedReasonCode =
  | "SUBJECT_KNOWLEDGE_UNPROVEN"
  | "INACTIVE_RULE"
  | "RULE_SCOPE_MISMATCH"
  | "UNAPPROVED_MEMORY"
  | "TASK_IRRELEVANT"
  | "STALE_REFERENCE"
  | "CROSS_PROJECT_REFERENCE"
  | "BUDGET_OMITTED"
  | "SOURCE_CONFLICT"
  | "SOURCE_MISSING";

export type TianyiGroundedContextRequest = {
  version: typeof TIANYI_GROUNDED_CONTEXT_REQUEST_VERSION;
  projectId: string;
  sessionId: string;
  taskKind: TianyiGroundedTaskKind;
  accessMode: TianyiGroundedAccessMode;
  subjectRef: TianyiObjectContextRef | null;
  sceneRef: TianyiObjectContextRef | null;
  explicitRefs: TianyiObjectContextRef[];
  /** Optional only to preserve replay of pre-Phase 1B archived requests. */
  eventRefs?: StoryStudioEventReference[];
};

export type TianyiGroundedResolvedCandidate = {
  sourceType: TianyiGroundedSourceType;
  projectId: string;
  sourceId: string;
  sourceKey: string;
  contentHash: string;
  requestedContentHash: string;
  lane: TianyiGroundedSourceLane;
  wireContent: string | null;
  knowledgeSubjectRefs: string[];
  preAuthorizationReason: TianyiGroundedReasonCode | null;
};

export type TianyiGroundedSourceManifestEntry = {
  sourceType: TianyiGroundedSourceType;
  projectId: string;
  sourceId: string;
  sourceKey: string;
  contentHash: string;
  wireContentHash: string;
  lane: TianyiGroundedSourceLane;
  decision: TianyiGroundedDecision;
  reasonCode: TianyiGroundedReasonCode | null;
  deterministicOrder: number;
  estimatedBudget: number;
};

export type TianyiGroundedSourceManifest = {
  version: typeof TIANYI_GROUNDED_SOURCE_MANIFEST_VERSION;
  request: {
    projectId: string;
    sessionId: string;
    taskKind: TianyiGroundedTaskKind;
    accessMode: TianyiGroundedAccessMode;
    subjectRef: string | null;
    sceneRef: string | null;
    explicitRefs: string[];
    eventRefs?: string[];
  };
  hardBudget: number;
  included: TianyiGroundedSourceManifestEntry[];
  excluded: TianyiGroundedSourceManifestEntry[];
  budgetOmitted: TianyiGroundedSourceManifestEntry[];
  conflicting: TianyiGroundedSourceManifestEntry[];
  digest: string;
};

export type TianyiCompiledGroundedContext = {
  request: TianyiGroundedContextRequest;
  manifest: TianyiGroundedSourceManifest;
  includedContent: ReadonlyMap<string, string>;
};

const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SESSION_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u;
const LANE_PRIORITY: Record<TianyiGroundedSourceLane, number> = {
  scene: 0,
  subject: 1,
  constraint: 2,
  memory: 3,
  evidence: 4
};

export function normalizeTianyiGroundedContextRequest(value: unknown): TianyiGroundedContextRequest {
  const input = plainObject(value, "Tianyi grounded context request");
  const hasEventRefs = Object.prototype.hasOwnProperty.call(input, "eventRefs");
  exactOneOf(input, [
    ["version", "projectId", "sessionId", "taskKind", "accessMode", "subjectRef", "sceneRef", "explicitRefs"],
    ["version", "projectId", "sessionId", "taskKind", "accessMode", "subjectRef", "sceneRef", "explicitRefs", "eventRefs"]
  ], "Tianyi grounded context request");
  if (input.version !== TIANYI_GROUNDED_CONTEXT_REQUEST_VERSION) throw new Error("Tianyi grounded context request version is invalid.");
  const projectId = requireProjectId(input.projectId);
  const sessionId = requireSessionId(input.sessionId);
  if (input.taskKind !== "grounded-answer") throw new Error("Tianyi grounded task kind is invalid.");
  if (input.accessMode !== "author" && input.accessMode !== "character") throw new Error("Tianyi grounded access mode is invalid.");
  const subjectRef = input.subjectRef === null ? null : normalizeTianyiObjectContextRef(input.subjectRef);
  const sceneRef = input.sceneRef === null ? null : normalizeTianyiObjectContextRef(input.sceneRef);
  if (!Array.isArray(input.explicitRefs) || input.explicitRefs.length > 5) throw new Error("Tianyi grounded explicit references are invalid.");
  const explicitRefs = input.explicitRefs.map(normalizeTianyiObjectContextRef);
  const eventRefs = hasEventRefs ? normalizeEventReferences(input.eventRefs) : undefined;

  if (input.accessMode === "character") {
    if (!subjectRef || subjectRef.ownerType !== "markdown-object" || subjectRef.objectType !== "character") {
      throw new Error("Character access requires an explicit character subject.");
    }
    if (subjectRef.projectId !== projectId) throw new Error("Tianyi grounded subject belongs to another project.");
  } else if (subjectRef !== null) {
    throw new Error("Author access must not carry a character subject.");
  }
  if (sceneRef && (sceneRef.ownerType !== "markdown-writing" || sceneRef.objectType !== "scene")) {
    throw new Error("Tianyi grounded scene reference is invalid.");
  }
  if (sceneRef?.projectId !== undefined && sceneRef.projectId !== projectId) {
    throw new Error("Tianyi grounded scene belongs to another project.");
  }
  if ([subjectRef, sceneRef, ...explicitRefs].some(isGenericEventReference)) {
    throw new Error("Tianyi grounded event sources require an explicit Story Studio event reference.");
  }
  if (eventRefs?.some((reference) => reference.projectId !== projectId)) {
    throw new Error("Tianyi grounded event reference belongs to another project.");
  }

  return {
    version: TIANYI_GROUNDED_CONTEXT_REQUEST_VERSION,
    projectId,
    sessionId,
    taskKind: "grounded-answer",
    accessMode: input.accessMode,
    subjectRef,
    sceneRef,
    explicitRefs,
    ...(eventRefs ? { eventRefs } : {})
  };
}

/**
 * Compiles one immutable, source-complete decision manifest. Resolvers must
 * return canonical owner hashes and must never place unauthorized bytes in a
 * candidate whose pre-authorization reason already denies the source.
 */
export function compileTianyiGroundedContext(input: {
  request: TianyiGroundedContextRequest;
  candidates: TianyiGroundedResolvedCandidate[];
  hardBudget?: number;
}): TianyiCompiledGroundedContext {
  const request = normalizeTianyiGroundedContextRequest(input.request);
  const hardBudget = requireBudget(input.hardBudget ?? TIANYI_GROUNDED_CONTEXT_HARD_BUDGET);
  const subjectId = request.subjectRef?.stableId ?? null;
  const normalized = input.candidates.map(normalizeCandidate).sort(compareCandidates);
  const conflictKeys = conflictingSourceKeys(normalized);
  const seen = new Set<string>();
  const included: TianyiGroundedSourceManifestEntry[] = [];
  const excluded: TianyiGroundedSourceManifestEntry[] = [];
  const budgetOmitted: TianyiGroundedSourceManifestEntry[] = [];
  const conflicting: TianyiGroundedSourceManifestEntry[] = [];
  const includedContent = new Map<string, string>();
  let usedBudget = 0;
  let order = 0;

  for (const candidate of normalized) {
    if (seen.has(candidate.sourceKey)) continue;
    seen.add(candidate.sourceKey);
    const estimatedBudget = candidate.wireContent === null ? 0 : estimateBudget(candidate.wireContent);
    const base = {
      sourceType: candidate.sourceType,
      projectId: candidate.projectId,
      sourceId: candidate.sourceId,
      sourceKey: candidate.sourceKey,
      contentHash: candidate.contentHash,
      wireContentHash: candidate.wireContent === null ? sha256("") : sha256(candidate.wireContent),
      lane: candidate.lane,
      deterministicOrder: order,
      estimatedBudget
    };
    order += 1;

    if (candidate.projectId !== request.projectId) {
      excluded.push({ ...base, decision: "excluded", reasonCode: "CROSS_PROJECT_REFERENCE" });
      continue;
    }
    if (candidate.preAuthorizationReason) {
      excluded.push({ ...base, decision: "excluded", reasonCode: candidate.preAuthorizationReason });
      continue;
    }
    if (candidate.requestedContentHash !== candidate.contentHash && !conflictKeys.has(candidate.sourceKey)) {
      excluded.push({ ...base, decision: "excluded", reasonCode: "STALE_REFERENCE" });
      continue;
    }
    if (request.accessMode === "character" && (!subjectId || !candidate.knowledgeSubjectRefs.includes(subjectId))) {
      excluded.push({ ...base, decision: "excluded", reasonCode: "SUBJECT_KNOWLEDGE_UNPROVEN" });
      continue;
    }
    if (conflictKeys.has(candidate.sourceKey)) {
      conflicting.push({ ...base, decision: "conflicting", reasonCode: "SOURCE_CONFLICT" });
      continue;
    }
    if (candidate.wireContent === null) {
      excluded.push({ ...base, decision: "excluded", reasonCode: "SOURCE_MISSING" });
      continue;
    }
    if (usedBudget + estimatedBudget > hardBudget) {
      budgetOmitted.push({ ...base, decision: "budget-omitted", reasonCode: "BUDGET_OMITTED" });
      continue;
    }
    usedBudget += estimatedBudget;
    included.push({ ...base, decision: "included", reasonCode: null });
    includedContent.set(candidate.sourceKey, candidate.wireContent);
  }

  const withoutDigest = {
    version: TIANYI_GROUNDED_SOURCE_MANIFEST_VERSION,
    request: {
      projectId: request.projectId,
      sessionId: request.sessionId,
      taskKind: request.taskKind,
      accessMode: request.accessMode,
      subjectRef: request.subjectRef ? tianyiObjectContextRefKey(request.subjectRef) : null,
      sceneRef: request.sceneRef ? tianyiObjectContextRefKey(request.sceneRef) : null,
      explicitRefs: request.explicitRefs.map(tianyiObjectContextRefKey),
      ...(request.eventRefs ? { eventRefs: request.eventRefs.map(storyStudioEventReferenceKey) } : {})
    },
    hardBudget,
    included,
    excluded,
    budgetOmitted,
    conflicting
  };
  const manifest = deepFreeze({ ...withoutDigest, digest: sha256(stableJson(withoutDigest)) });
  return {
    request: deepFreeze(structuredClone(request)),
    manifest,
    includedContent: readonlyMap(includedContent)
  };
}

export function serializeTianyiGroundedProviderSources(compiled: TianyiCompiledGroundedContext): Array<{
  manifest: TianyiGroundedSourceManifestEntry;
  content: string;
}> {
  return compiled.manifest.included.map((entry) => {
    const content = compiled.includedContent.get(entry.sourceKey);
    if (content === undefined || sha256(content) !== entry.wireContentHash) {
      throw new Error("Tianyi grounded packet diverged from its source manifest.");
    }
    return { manifest: entry, content };
  });
}

export function normalizeTianyiGroundedSourceManifest(value: unknown): TianyiGroundedSourceManifest {
  const input = plainObject(value, "Tianyi grounded source manifest");
  exact(input, ["version", "request", "hardBudget", "included", "excluded", "budgetOmitted", "conflicting", "digest"], "Tianyi grounded source manifest");
  if (input.version !== TIANYI_GROUNDED_SOURCE_MANIFEST_VERSION) throw new Error("Tianyi grounded source manifest version is invalid.");
  const requestInput = plainObject(input.request, "Tianyi grounded source manifest request");
  const hasEventRefs = Object.prototype.hasOwnProperty.call(requestInput, "eventRefs");
  exactOneOf(requestInput, [
    ["projectId", "sessionId", "taskKind", "accessMode", "subjectRef", "sceneRef", "explicitRefs"],
    ["projectId", "sessionId", "taskKind", "accessMode", "subjectRef", "sceneRef", "explicitRefs", "eventRefs"]
  ], "Tianyi grounded source manifest request");
  const projectId = requireProjectId(requestInput.projectId);
  const request = {
    projectId,
    sessionId: requireSessionId(requestInput.sessionId),
    taskKind: oneOf(requestInput.taskKind, ["grounded-answer"] as const, "Tianyi grounded task kind"),
    accessMode: oneOf(requestInput.accessMode, ["author", "character"] as const, "Tianyi grounded access mode"),
    subjectRef: requestInput.subjectRef === null ? null : requireSourceKey(requestInput.subjectRef),
    sceneRef: requestInput.sceneRef === null ? null : requireSourceKey(requestInput.sceneRef),
    explicitRefs: stringArray(requestInput.explicitRefs, 5, requireSourceKey, "Tianyi grounded explicit source references"),
    ...(hasEventRefs ? { eventRefs: stringArray(requestInput.eventRefs, 4, requireSourceKey, "Tianyi grounded explicit event references") } : {})
  };
  if (request.accessMode === "author" && request.subjectRef !== null) throw new Error("Author manifest cannot carry a subject.");
  if (request.accessMode === "character" && request.subjectRef === null) throw new Error("Character manifest requires a subject.");

  const included = manifestEntries(input.included, "included", projectId);
  const excluded = manifestEntries(input.excluded, "excluded", projectId);
  const budgetOmitted = manifestEntries(input.budgetOmitted, "budget-omitted", projectId);
  const conflicting = manifestEntries(input.conflicting, "conflicting", projectId);
  const all = [...included, ...excluded, ...budgetOmitted, ...conflicting];
  if (new Set(all.map((entry) => entry.sourceKey)).size !== all.length) throw new Error("Tianyi grounded manifest source decisions must be unique.");
  if (new Set(all.map((entry) => entry.deterministicOrder)).size !== all.length) throw new Error("Tianyi grounded manifest order must be unique.");
  const expectedOrder = [...all].sort((left, right) => left.deterministicOrder - right.deterministicOrder);
  if (expectedOrder.some((entry, index) => entry.deterministicOrder !== index)) throw new Error("Tianyi grounded manifest order is not contiguous.");

  const withoutDigest = {
    version: TIANYI_GROUNDED_SOURCE_MANIFEST_VERSION,
    request,
    hardBudget: requireBudget(input.hardBudget),
    included,
    excluded,
    budgetOmitted,
    conflicting
  };
  const digest = requireHash(input.digest);
  if (digest !== sha256(stableJson(withoutDigest))) throw new Error("Tianyi grounded source manifest digest is invalid.");
  return deepFreeze({ ...withoutDigest, digest });
}

function normalizeCandidate(value: TianyiGroundedResolvedCandidate): TianyiGroundedResolvedCandidate {
  const sourceType = oneOf(value.sourceType, ["writing", "scene", "world-object", "rule", "memory"] as const, "Tianyi grounded source type");
  const lane = oneOf(value.lane, ["scene", "subject", "constraint", "memory", "evidence"] as const, "Tianyi grounded source lane");
  const sourceId = requireSourceId(value.sourceId);
  const sourceKey = requireSourceKey(value.sourceKey);
  const knowledgeSubjectRefs = Array.isArray(value.knowledgeSubjectRefs)
    ? [...new Set(value.knowledgeSubjectRefs.map(requireSourceId))].sort()
    : [];
  return {
    sourceType,
    projectId: requireProjectId(value.projectId),
    sourceId,
    sourceKey,
    contentHash: requireHash(value.contentHash),
    requestedContentHash: requireHash(value.requestedContentHash),
    lane,
    wireContent: value.wireContent === null ? null : normalizeContent(value.wireContent),
    knowledgeSubjectRefs,
    preAuthorizationReason: value.preAuthorizationReason === null
      ? null
      : oneOf(value.preAuthorizationReason, [
          "INACTIVE_RULE", "RULE_SCOPE_MISMATCH", "UNAPPROVED_MEMORY", "TASK_IRRELEVANT",
          "STALE_REFERENCE", "CROSS_PROJECT_REFERENCE", "SOURCE_MISSING"
        ] as const, "Tianyi grounded source reason")
  };
}

function manifestEntries(
  value: unknown,
  decision: TianyiGroundedDecision,
  projectId: string
): TianyiGroundedSourceManifestEntry[] {
  if (!Array.isArray(value) || value.length > 512) throw new Error("Tianyi grounded manifest entries are invalid.");
  return value.map((item) => {
    const input = plainObject(item, "Tianyi grounded manifest entry");
    exact(input, [
      "sourceType", "projectId", "sourceId", "sourceKey", "contentHash", "wireContentHash",
      "lane", "decision", "reasonCode", "deterministicOrder", "estimatedBudget"
    ], "Tianyi grounded manifest entry");
    if (input.decision !== decision) throw new Error("Tianyi grounded manifest entry decision is invalid.");
    const reasonCode = input.reasonCode === null
      ? null
      : oneOf(input.reasonCode, [
          "SUBJECT_KNOWLEDGE_UNPROVEN", "INACTIVE_RULE", "RULE_SCOPE_MISMATCH", "UNAPPROVED_MEMORY",
          "TASK_IRRELEVANT", "STALE_REFERENCE", "CROSS_PROJECT_REFERENCE", "BUDGET_OMITTED",
          "SOURCE_CONFLICT", "SOURCE_MISSING"
        ] as const, "Tianyi grounded source reason");
    if ((decision === "included") !== (reasonCode === null)) throw new Error("Tianyi grounded manifest entry reason is invalid.");
    const entryProjectId = requireProjectId(input.projectId);
    if (entryProjectId !== projectId && reasonCode !== "CROSS_PROJECT_REFERENCE") {
      throw new Error("Tianyi grounded manifest entry belongs to another project.");
    }
    return {
      sourceType: oneOf(input.sourceType, ["writing", "scene", "world-object", "rule", "memory"] as const, "Tianyi grounded source type"),
      projectId: entryProjectId,
      sourceId: requireSourceId(input.sourceId),
      sourceKey: requireSourceKey(input.sourceKey),
      contentHash: requireHash(input.contentHash),
      wireContentHash: requireHash(input.wireContentHash),
      lane: oneOf(input.lane, ["scene", "subject", "constraint", "memory", "evidence"] as const, "Tianyi grounded source lane"),
      decision,
      reasonCode,
      deterministicOrder: requireNonNegativeInteger(input.deterministicOrder, "Tianyi grounded manifest order"),
      estimatedBudget: requireNonNegativeInteger(input.estimatedBudget, "Tianyi grounded source budget")
    };
  });
}

function conflictingSourceKeys(candidates: TianyiGroundedResolvedCandidate[]): Set<string> {
  const revisions = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    if (candidate.preAuthorizationReason === "CROSS_PROJECT_REFERENCE" || candidate.preAuthorizationReason === "SOURCE_MISSING") continue;
    const values = revisions.get(candidate.sourceKey) ?? new Set<string>();
    values.add(candidate.requestedContentHash);
    revisions.set(candidate.sourceKey, values);
  }
  return new Set([...revisions].filter(([, hashes]) => hashes.size > 1).map(([sourceKey]) => sourceKey));
}

function compareCandidates(left: TianyiGroundedResolvedCandidate, right: TianyiGroundedResolvedCandidate): number {
  return LANE_PRIORITY[left.lane] - LANE_PRIORITY[right.lane]
    || left.sourceKey.localeCompare(right.sourceKey)
    || left.requestedContentHash.localeCompare(right.requestedContentHash);
}

function estimateBudget(value: string): number {
  return Math.max(1, Array.from(value.normalize("NFC")).length);
}

function readonlyMap(source: Map<string, string>): ReadonlyMap<string, string> {
  const snapshot = new Map(source);
  return Object.freeze({
    get: snapshot.get.bind(snapshot),
    has: snapshot.has.bind(snapshot),
    entries: snapshot.entries.bind(snapshot),
    keys: snapshot.keys.bind(snapshot),
    values: snapshot.values.bind(snapshot),
    forEach: snapshot.forEach.bind(snapshot),
    get size() { return snapshot.size; },
    [Symbol.iterator]: snapshot[Symbol.iterator].bind(snapshot)
  }) as ReadonlyMap<string, string>;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function plainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are invalid.`);
  }
}

function exactOneOf(value: Record<string, unknown>, keySets: readonly (readonly string[])[], label: string): void {
  if (keySets.some((keys) => hasExactKeys(value, keys))) return;
  throw new Error(`${label} fields are invalid.`);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function normalizeEventReferences(value: unknown): StoryStudioEventReference[] {
  if (!Array.isArray(value) || value.length > 4) throw new Error("Tianyi grounded explicit event references are invalid.");
  const unique = new Map<string, StoryStudioEventReference>();
  for (const item of value) {
    const reference = normalizeStoryStudioEventReference(item);
    const key = storyStudioEventReferenceKey(reference);
    if (!unique.has(key)) unique.set(key, reference);
  }
  return [...unique.values()];
}

function isGenericEventReference(value: TianyiObjectContextRef | null): boolean {
  return value?.ownerType === "markdown-object" && value.objectType === "event";
}

function oneOf<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) throw new Error(`${label} is invalid.`);
  return value as T[number];
}

function requireProjectId(value: unknown): string {
  if (typeof value !== "string" || !PROJECT_ID_PATTERN.test(value)) throw new Error("Tianyi grounded project identifier is invalid.");
  return value;
}

function requireSessionId(value: unknown): string {
  if (typeof value !== "string" || value.length > 96 || !SESSION_ID_PATTERN.test(value)) throw new Error("Tianyi grounded Session identifier is invalid.");
  return value;
}

function requireSourceId(value: unknown): string {
  if (typeof value !== "string" || !value || [...value].length > 200 || /[\u0000-\u001F\u007F]/u.test(value)) {
    throw new Error("Tianyi grounded source identifier is invalid.");
  }
  return value.normalize("NFC");
}

function requireSourceKey(value: unknown): string {
  if (typeof value !== "string" || !value || [...value].length > 512 || /[\u0000-\u001F\u007F]/u.test(value)) {
    throw new Error("Tianyi grounded source key is invalid.");
  }
  return value.normalize("NFC");
}

function requireHash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error("Tianyi grounded source hash is invalid.");
  return value;
}

function normalizeContent(value: string): string {
  const normalized = value.normalize("NFC");
  if (!normalized || Buffer.byteLength(normalized, "utf8") > 2 * 1024 * 1024) throw new Error("Tianyi grounded source content is invalid.");
  return normalized;
}

function requireBudget(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 2_000_000) throw new Error("Tianyi grounded context budget is invalid.");
  return Number(value);
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${label} is invalid.`);
  return Number(value);
}

function stringArray<T>(
  value: unknown,
  maximum: number,
  normalize: (item: unknown) => T,
  label: string
): T[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} are invalid.`);
  return value.map(normalize);
}
