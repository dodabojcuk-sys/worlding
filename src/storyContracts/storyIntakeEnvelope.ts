import { createHash } from "node:crypto";

export const STORY_INTAKE_ENVELOPE_VERSION = "tianyan-story-intake-envelope/v1" as const;
export const STORY_INTAKE_REQUEST_VERSION = "tianyan-story-intake-request/v1" as const;
export const STORY_INTAKE_ENVELOPE_MAX_SERIALIZED_LENGTH = 11_000;
export const STORY_INTAKE_CANDIDATE_TYPES = [
  "character",
  "item",
  "location",
  "event",
  "relation",
  "story_unit",
  "narrative_path_membership",
  "unresolved"
] as const;

export type StoryIntakeCandidateType = typeof STORY_INTAKE_CANDIDATE_TYPES[number];
export type StoryIntakeLifecycleStatus = "pending-review" | "deferred" | "pending-archive" | "rejected" | "confirmed";
export type StoryIntakeIdentityDecision = "link_existing" | "propose_new" | "ambiguous";
export type StoryIntakeSourceRef = { sessionId: string; eventId: string; contentHash: string };
export type StoryIntakeBaseVersion = { workVersionId: string; revision: number; manifestId: string | null };
export type StoryIntakeSourceSpan = { start: number; end: number; excerpt: string };
export type StoryIntakeProposedLink = {
  relation: "precedes" | "involves" | "occurs-at" | "belongs-to-story-unit" | "member-of-narrative-path" | "related-to";
  targetCandidateId: string;
  label: string | null;
};
export type StoryIntakeCandidate = {
  candidateId: string;
  type: StoryIntakeCandidateType;
  proposedName: string | null;
  proposedTitle: string | null;
  summary: string;
  sourceRef: StoryIntakeSourceRef;
  sourceSpan: StoryIntakeSourceSpan;
  sourceEvidence: StoryIntakeSourceSpan;
  confidence: number;
  uncertainties: string[];
  existingEntityMatch: null | { objectId: string; objectType: "character" | "item" | "location"; title: string; revisionToken: string };
  identityDecision: StoryIntakeIdentityDecision;
  baseVersion: StoryIntakeBaseVersion;
  proposedRelations: StoryIntakeProposedLink[];
  warnings: string[];
  lifecycleStatus: StoryIntakeLifecycleStatus;
  formalApplication: null | {
    owner: "story-workspace-object" | "story-studio-event-owner" | "story-unit-owner" | "narrative-arrangement-owner" | "relation-owner";
    objectId: string;
    proposalId: string | null;
    receiptId: string;
    appliedAt: string;
  };
  narrativePath: null | { kind: "main" | "side" | "hidden" | "character" | "item" | "location" | "custom"; label: string };
};
export type StoryIntakeEnvelope = {
  version: typeof STORY_INTAKE_ENVELOPE_VERSION;
  envelopeId: string;
  projectId: string;
  sessionId: string;
  runId: string;
  sourceRef: StoryIntakeSourceRef;
  baseVersion: StoryIntakeBaseVersion;
  candidates: StoryIntakeCandidate[];
  provider: { runtime: "pi"; structuredTool: "propose_story_intake"; providerCalls: number; requestedProviderId: string | null; requestedModelId: string | null; responseModelId: string | null };
  formalStoryWrites: number;
  createdAt: string;
};

export type StoryIntakeToolArguments = {
  candidates: Array<{
    localRef: string;
    type: StoryIntakeCandidateType;
    proposedName: string | null;
    proposedTitle: string | null;
    summary: string;
    sourceSpan: { excerpt: string };
    confidence: number;
    uncertainties: string[];
    existingEntityId: string | null;
    identityDecision: StoryIntakeIdentityDecision;
    proposedRelations: Array<{ relation: StoryIntakeProposedLink["relation"]; targetLocalRef: string; label: string | null }>;
    warnings: string[];
    narrativePath: StoryIntakeCandidate["narrativePath"];
  }>;
};

export type StoryIntakeRequest = {
  version: typeof STORY_INTAKE_REQUEST_VERSION;
  sourceRef: StoryIntakeSourceRef;
};

const ID_PATTERN = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/iu;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const TYPES = new Set<string>(STORY_INTAKE_CANDIDATE_TYPES);
const LINKS = new Set<StoryIntakeProposedLink["relation"]>(["precedes", "involves", "occurs-at", "belongs-to-story-unit", "member-of-narrative-path", "related-to"]);
const PATH_KINDS = new Set<NonNullable<StoryIntakeCandidate["narrativePath"]>["kind"]>(["main", "side", "hidden", "character", "item", "location", "custom"]);
const NAME_TYPES = new Set<StoryIntakeCandidateType>(["character", "item", "location"]);

export function parseStoryIntakeRequest(value: unknown): StoryIntakeRequest | null {
  if (value == null) return null;
  const input = requireRecord(value, "Story Intake request");
  requireExactKeys(input, ["version", "sourceRef"], "Story Intake request");
  if (input.version !== STORY_INTAKE_REQUEST_VERSION) throw new Error("Story Intake request version is invalid.");
  return { version: STORY_INTAKE_REQUEST_VERSION, sourceRef: parseSourceRef(input.sourceRef) };
}

export function buildStoryIntakeEnvelope(input: {
  projectId: string;
  sessionId: string;
  runId: string;
  sourceRef: StoryIntakeSourceRef;
  sourceText: string;
  baseVersion: StoryIntakeBaseVersion;
  toolArguments: unknown;
  providerCalls: number;
  requestedProviderId?: string | null;
  requestedModelId?: string | null;
  responseModelId?: string | null;
  existingEntities?: Array<{ objectId: string; objectType: "character" | "item" | "location"; title: string; revisionToken: string }>;
  createdAt: string;
}): StoryIntakeEnvelope {
  const projectId = requireId(input.projectId, "Project identifier", 160);
  const sessionId = requireId(input.sessionId, "Session identifier", 160);
  const runId = requireId(input.runId, "Run identifier", 180);
  const sourceRef = parseSourceRef(input.sourceRef);
  if (sourceRef.sessionId !== sessionId) throw new Error("Story Intake source belongs to a different TianyiConversation.");
  const sourceText = requireText(input.sourceText, "Story Intake source", 24_000);
  const baseVersion = parseBaseVersion(input.baseVersion);
  const args = requireRecord(input.toolArguments, "propose_story_intake arguments");
  requireExactKeys(args, ["candidates"], "propose_story_intake arguments");
  if (!Array.isArray(args.candidates) || args.candidates.length < 1 || args.candidates.length > 24) throw new Error("Story Intake must contain between 1 and 24 candidates.");
  const localRefs = new Set<string>();
  const drafts = args.candidates.map((value, index) => {
    const candidate = requireRecord(value, `Story Intake candidate ${index + 1}`);
    requireExactKeys(candidate, ["localRef", "type", "proposedName", "proposedTitle", "summary", "sourceSpan", "confidence", "uncertainties", "existingEntityId", "identityDecision", "proposedRelations", "warnings", "narrativePath"], `Story Intake candidate ${index + 1}`);
    const localRef = requireId(candidate.localRef, "Candidate local reference", 80);
    if (localRefs.has(localRef)) throw new Error("Story Intake candidate local references must be unique.");
    localRefs.add(localRef);
    const type = requireCandidateType(candidate.type);
    const proposedName = candidate.proposedName === null ? null : requireText(candidate.proposedName, "Candidate proposed name", 160);
    const proposedTitle = candidate.proposedTitle === null ? null : requireText(candidate.proposedTitle, "Candidate proposed title", 200);
    if (NAME_TYPES.has(type) ? !proposedName || proposedTitle !== null : !proposedTitle || proposedName !== null) throw new Error("Story Intake candidate name/title does not match its type.");
    const summary = requireText(candidate.summary, "Candidate summary", 800);
    const sourceSpan = parseSourceSpan(candidate.sourceSpan, sourceText);
    const confidence = typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence) && candidate.confidence >= 0 && candidate.confidence <= 1 ? candidate.confidence : (() => { throw new Error("Story Intake confidence must be between 0 and 1."); })();
    const uncertainties = parseTextList(candidate.uncertainties, "Candidate uncertainties", 1, 8, 320);
    const identityDecision = requireIdentityDecision(candidate.identityDecision);
    const existingEntityId = candidate.existingEntityId === null ? null : requireId(candidate.existingEntityId, "Existing entity identifier", 180);
    const existingEntityMatch = existingEntityId === null ? null : (input.existingEntities ?? []).find((entity) => entity.objectId === existingEntityId) ?? (() => { throw new Error("Story Intake existing entity match is outside the authorized project index."); })();
    if (identityDecision === "link_existing" && !existingEntityMatch) throw new Error("link_existing requires an authorized existing entity match.");
    if (identityDecision === "propose_new" && existingEntityMatch) throw new Error("propose_new cannot silently link an existing entity.");
    if (!NAME_TYPES.has(type) && (existingEntityMatch || identityDecision !== "propose_new")) throw new Error("Only entity candidates may make identity-link decisions.");
    const proposedRelations = parseToolLinks(candidate.proposedRelations);
    const warnings = parseTextList(candidate.warnings, "Candidate warnings", 0, 8, 320);
    const narrativePath = parseNarrativePath(candidate.narrativePath, type);
    return { localRef, type, proposedName, proposedTitle, summary, sourceSpan, confidence, uncertainties, existingEntityMatch, identityDecision, proposedRelations, warnings, narrativePath };
  });
  const candidateIdByLocalRef = new Map(drafts.map((candidate) => [candidate.localRef, deterministicId("candidate.story-intake", runId, candidate.localRef)]));
  const candidates: StoryIntakeCandidate[] = drafts.map((candidate) => ({
    candidateId: candidateIdByLocalRef.get(candidate.localRef)!,
    type: candidate.type,
    proposedName: candidate.proposedName,
    proposedTitle: candidate.proposedTitle,
    summary: candidate.summary,
    sourceRef,
    sourceSpan: candidate.sourceSpan,
    sourceEvidence: candidate.sourceSpan,
    confidence: candidate.confidence,
    uncertainties: candidate.uncertainties,
    existingEntityMatch: candidate.existingEntityMatch,
    identityDecision: candidate.identityDecision,
    baseVersion,
    proposedRelations: candidate.proposedRelations.map((link) => {
      const targetCandidateId = candidateIdByLocalRef.get(link.targetLocalRef);
      if (!targetCandidateId) throw new Error(`Story Intake relation target does not exist: ${link.targetLocalRef}.`);
      return { relation: link.relation, targetCandidateId, label: link.label };
    }),
    warnings: candidate.warnings,
    lifecycleStatus: "pending-review",
    formalApplication: null,
    narrativePath: candidate.narrativePath
  }));
  if (!Number.isSafeInteger(input.providerCalls) || input.providerCalls < 1 || input.providerCalls > 3) throw new Error("Story Intake Provider call count is invalid.");
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error("Story Intake created timestamp is invalid.");
  const envelope: StoryIntakeEnvelope = {
    version: STORY_INTAKE_ENVELOPE_VERSION,
    envelopeId: deterministicId("story-intake-envelope", runId, sourceRef.contentHash),
    projectId,
    sessionId,
    runId,
    sourceRef,
    baseVersion,
    candidates,
    provider: { runtime: "pi", structuredTool: "propose_story_intake", providerCalls: input.providerCalls, requestedProviderId: input.requestedProviderId ?? null, requestedModelId: input.requestedModelId ?? null, responseModelId: input.responseModelId ?? null },
    formalStoryWrites: 0,
    createdAt: new Date(input.createdAt).toISOString()
  };
  if (JSON.stringify(envelope).length > STORY_INTAKE_ENVELOPE_MAX_SERIALIZED_LENGTH) throw new Error("Story Intake candidate envelope exceeds the bounded archive payload; reduce candidates or evidence verbosity.");
  return envelope;
}

/** Read-boundary migration only. New envelopes are always serialized with the
 * canonical v1 `type` values and never write legacy `kind` aliases. */
export function migrateStoryIntakeEnvelopeV1(value: unknown): StoryIntakeEnvelope | null {
  if (value == null) return null;
  const envelope = requireRecord(value, "Story Intake envelope");
  if (envelope.version !== STORY_INTAKE_ENVELOPE_VERSION || !Array.isArray(envelope.candidates)) throw new Error("Story Intake envelope version is invalid.");
  const candidates = envelope.candidates.map((rawValue, index) => {
    const raw = requireRecord(rawValue, `Story Intake persisted candidate ${index + 1}`);
    const legacyValue = typeof raw.kind === "string" ? raw.kind : raw.type;
    const type = migrateCandidateType(legacyValue);
    const { kind: _legacyKind, proposedLinks: legacyLinks, ...rest } = raw;
    const warnings = Array.isArray(rest.warnings) ? [...rest.warnings] : [];
    if (legacyValue === "organization" || legacyValue === "rule") warnings.push(`旧候选类型 ${legacyValue} 已迁移为 unresolved；需作者重新归类。`);
    return {
      ...rest,
      type,
      proposedRelations: Array.isArray(rest.proposedRelations) ? rest.proposedRelations : Array.isArray(legacyLinks) ? legacyLinks : [],
      warnings
    } as unknown as StoryIntakeCandidate;
  });
  return { ...structuredClone(envelope), candidates } as unknown as StoryIntakeEnvelope;
}

export function updateStoryIntakeCandidateLifecycle(envelope: StoryIntakeEnvelope, candidateId: string, lifecycleStatus: Exclude<StoryIntakeLifecycleStatus, "confirmed">): StoryIntakeEnvelope {
  if (!(["pending-review", "deferred", "pending-archive", "rejected"] as string[]).includes(lifecycleStatus)) throw new Error("Story Intake lifecycle status is invalid.");
  const target = envelope.candidates.find((candidate) => candidate.candidateId === candidateId);
  if (!target) throw new Error("Story Intake candidate does not exist.");
  if (target.lifecycleStatus === "confirmed") throw new Error("A formally applied Story Intake candidate cannot return to a candidate-only lifecycle.");
  return { ...structuredClone(envelope), candidates: envelope.candidates.map((candidate) => candidate.candidateId === candidateId ? { ...candidate, lifecycleStatus } : candidate) };
}

/** Revalidates an unchanged candidate envelope after its exact batch receipt was
 * fully compensated. Candidate identity, source evidence and lifecycle stay
 * intact; only the version precondition advances to the verified current root. */
export function rebaseStoryIntakeEnvelopeAfterUndo(envelope: StoryIntakeEnvelope, baseVersion: StoryIntakeBaseVersion): StoryIntakeEnvelope {
  if (envelope.candidates.some((candidate) => candidate.formalApplication !== null || candidate.lifecycleStatus === "confirmed")) throw new Error("Story Intake 批次仍有未撤销的正式应用，不能更新 BaseVersion。");
  if (baseVersion.workVersionId !== envelope.baseVersion.workVersionId || baseVersion.revision < envelope.baseVersion.revision) throw new Error("Story Intake 撤销后的 BaseVersion 不属于同一条前进的主版本。");
  const nextBase = structuredClone(baseVersion);
  return { ...structuredClone(envelope), baseVersion: nextBase, candidates: envelope.candidates.map((candidate) => ({ ...candidate, baseVersion: structuredClone(nextBase) })) };
}

export function confirmStoryIntakeCandidate(envelope: StoryIntakeEnvelope, candidateId: string, application: NonNullable<StoryIntakeCandidate["formalApplication"]>): StoryIntakeEnvelope {
  const candidate = envelope.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) throw new Error("Story Intake candidate does not exist.");
  if (candidate.lifecycleStatus === "confirmed" && candidate.formalApplication) return structuredClone(envelope);
  if (candidate.lifecycleStatus === "rejected") throw new Error("A rejected Story Intake candidate must be restored before formal confirmation.");
  if (candidate.type === "unresolved") throw new Error("Unresolved content stays candidate-only and cannot be marked as a formal write.");
  if (["character", "item", "location"].includes(candidate.type) && candidate.identityDecision !== "propose_new") throw new Error("Only an explicit propose_new identity decision can create a new formal object in this slice.");
  const expectedOwner = storyIntakeOwnerFor(candidate.type);
  if (application.owner !== expectedOwner) throw new Error(`Story Intake ${candidate.type} candidate does not use its safe formal Story Intake writer (${expectedOwner}).`);
  return { ...structuredClone(envelope), candidates: envelope.candidates.map((item) => item.candidateId === candidateId ? { ...item, lifecycleStatus: "confirmed", formalApplication: structuredClone(application) } : item), formalStoryWrites: envelope.formalStoryWrites + 1 };
}

function storyIntakeOwnerFor(type: StoryIntakeCandidate["type"]): string {
  if (["character", "item", "location"].includes(type)) return "story-workspace-object";
  if (type === "event") return "story-studio-event-owner";
  if (type === "story_unit") return "story-unit-owner";
  if (type === "narrative_path_membership") return "narrative-arrangement-owner";
  if (type === "relation") return "relation-owner";
  throw new Error(`Story Intake ${type} candidate does not have a formal Owner.`);
}

export function undoStoryIntakeCandidateApplication(envelope: StoryIntakeEnvelope, candidateId: string, receiptId: string): StoryIntakeEnvelope {
  const candidate = envelope.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) throw new Error("Story Intake candidate does not exist.");
  if (!candidate.formalApplication || candidate.formalApplication.receiptId !== receiptId) throw new Error("Story Intake undo receipt does not match the applied candidate.");
  return {
    ...structuredClone(envelope),
    candidates: envelope.candidates.map((item) => item.candidateId === candidateId ? { ...item, lifecycleStatus: "pending-review", formalApplication: null } : item),
    formalStoryWrites: Math.max(0, envelope.formalStoryWrites - 1)
  };
}

function parseSourceRef(value: unknown): StoryIntakeSourceRef {
  const input = requireRecord(value, "Story Intake source reference");
  requireExactKeys(input, ["sessionId", "eventId", "contentHash"], "Story Intake source reference");
  const contentHash = typeof input.contentHash === "string" && HASH_PATTERN.test(input.contentHash) ? input.contentHash : (() => { throw new Error("Story Intake source hash is invalid."); })();
  return { sessionId: requireId(input.sessionId, "Source Session identifier", 160), eventId: requireId(input.eventId, "Source Event identifier", 180), contentHash };
}

function parseBaseVersion(value: unknown): StoryIntakeBaseVersion {
  const input = requireRecord(value, "Story Intake BaseVersion");
  requireExactKeys(input, ["workVersionId", "revision", "manifestId"], "Story Intake BaseVersion");
  const revision = Number.isSafeInteger(input.revision) && Number(input.revision) >= 0 ? Number(input.revision) : (() => { throw new Error("Story Intake BaseVersion revision is invalid."); })();
  return { workVersionId: requireId(input.workVersionId, "WorkVersion identifier", 160), revision, manifestId: input.manifestId === null ? null : requireId(input.manifestId, "WorkVersion manifest identifier", 200) };
}

function parseSourceSpan(value: unknown, sourceText: string): StoryIntakeSourceSpan {
  const input = requireRecord(value, "Story Intake source evidence");
  requireExactKeys(input, ["excerpt"], "Story Intake source evidence");
  const excerpt = requireText(input.excerpt, "Story Intake source excerpt", 1_200, false);
  const start = sourceText.indexOf(excerpt);
  const end = start + excerpt.length;
  if (start < 0 || sourceText.slice(start, end) !== excerpt) throw new Error("Story Intake source evidence does not exactly match the retained author source.");
  return { start, end, excerpt };
}

function parseToolLinks(value: unknown): StoryIntakeToolArguments["candidates"][number]["proposedRelations"] {
  if (!Array.isArray(value) || value.length > 24) throw new Error("Story Intake proposed links are invalid.");
  return value.map((item) => {
    const link = requireRecord(item, "Story Intake proposed link");
    requireExactKeys(link, ["relation", "targetLocalRef", "label"], "Story Intake proposed link");
    if (!LINKS.has(link.relation as StoryIntakeProposedLink["relation"])) throw new Error("Story Intake proposed link relation is invalid.");
    return { relation: link.relation as StoryIntakeProposedLink["relation"], targetLocalRef: requireId(link.targetLocalRef, "Story Intake link target", 80), label: link.label === null ? null : requireText(link.label, "Story Intake link label", 160) };
  });
}

function parseNarrativePath(value: unknown, type: StoryIntakeCandidateType): StoryIntakeCandidate["narrativePath"] {
  if (type !== "narrative_path_membership") {
    if (value !== null) throw new Error("Only narrative_path_membership candidates may define a Narrative Path.");
    return null;
  }
  const input = requireRecord(value, "Narrative Path candidate");
  requireExactKeys(input, ["kind", "label"], "Narrative Path candidate");
  if (!PATH_KINDS.has(input.kind as NonNullable<StoryIntakeCandidate["narrativePath"]>["kind"])) throw new Error("Narrative Path kind is invalid.");
  return { kind: input.kind as NonNullable<StoryIntakeCandidate["narrativePath"]>["kind"], label: requireText(input.label, "Narrative Path label", 120) };
}

function requireCandidateType(value: unknown): StoryIntakeCandidateType {
  if (typeof value !== "string" || !TYPES.has(value)) throw new Error("Story Intake candidate type is invalid.");
  return value as StoryIntakeCandidateType;
}
function migrateCandidateType(value: unknown): StoryIntakeCandidateType {
  if (value === "storyUnit") return "story_unit";
  if (value === "narrativePathMembership" || value === "storyline") return "narrative_path_membership";
  if (value === "organization" || value === "rule") return "unresolved";
  return requireCandidateType(value);
}
function requireIdentityDecision(value: unknown): StoryIntakeIdentityDecision {
  if (value !== "link_existing" && value !== "propose_new" && value !== "ambiguous") throw new Error("Story Intake identity decision is invalid.");
  return value;
}
function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain JSON object.`);
  return value as Record<string, unknown>;
}
function requireExactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const allowed = new Set(keys);
  if (Object.keys(value).some((key) => !allowed.has(key)) || keys.some((key) => !Object.hasOwn(value, key))) throw new Error(`${label} fields are invalid.`);
}
function requireText(value: unknown, label: string, maximum: number, trim = true): string {
  const text = typeof value === "string" ? (trim ? value.trim() : value) : "";
  if (!text || text.length > maximum) throw new Error(`${label} is empty or too long.`);
  return text;
}
function requireId(value: unknown, label: string, maximum: number): string {
  const id = requireText(value, label, maximum);
  if (!ID_PATTERN.test(id)) throw new Error(`${label} is invalid.`);
  return id;
}
function parseTextList(value: unknown, label: string, minimum: number, maximum: number, itemMaximum: number): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) throw new Error(`${label} is invalid.`);
  const result = value.map((item) => requireText(item, label, itemMaximum));
  if (new Set(result).size !== result.length) throw new Error(`${label} contains duplicates.`);
  return result;
}
function deterministicId(prefix: string, ...parts: string[]): string { return `${prefix}.${createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24)}`; }
