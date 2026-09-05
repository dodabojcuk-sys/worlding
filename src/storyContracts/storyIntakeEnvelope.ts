import { createHash } from "node:crypto";

export const STORY_INTAKE_ENVELOPE_VERSION = "tianyan-story-intake-envelope/v1" as const;
export const STORY_INTAKE_REQUEST_VERSION = "tianyan-story-intake-request/v1" as const;
export const STORY_INTAKE_ENVELOPE_MAX_SERIALIZED_LENGTH = 9_000;
export const STORY_INTAKE_CANDIDATE_KINDS = [
  "character",
  "item",
  "location",
  "organization",
  "rule",
  "event",
  "relation",
  "storyUnit",
  "narrativePathMembership"
] as const;

export type StoryIntakeCandidateKind = typeof STORY_INTAKE_CANDIDATE_KINDS[number];
export type StoryIntakeLifecycleStatus = "pending-review" | "deferred" | "pending-archive" | "rejected";
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
  kind: StoryIntakeCandidateKind;
  proposedName: string | null;
  proposedTitle: string | null;
  sourceRef: StoryIntakeSourceRef;
  sourceSpan: StoryIntakeSourceSpan;
  confidence: number;
  uncertainties: string[];
  baseVersion: StoryIntakeBaseVersion;
  proposedLinks: StoryIntakeProposedLink[];
  lifecycleStatus: StoryIntakeLifecycleStatus;
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
  provider: { runtime: "pi"; structuredTool: "propose_story_intake"; providerCalls: number };
  formalStoryWrites: 0;
  createdAt: string;
};

export type StoryIntakeToolArguments = {
  candidates: Array<{
    localRef: string;
    kind: StoryIntakeCandidateKind;
    proposedName: string | null;
    proposedTitle: string | null;
    sourceSpan: { excerpt: string };
    confidence: number;
    uncertainties: string[];
    proposedLinks: Array<{ relation: StoryIntakeProposedLink["relation"]; targetLocalRef: string; label: string | null }>;
    narrativePath: StoryIntakeCandidate["narrativePath"];
  }>;
};

export type StoryIntakeRequest = {
  version: typeof STORY_INTAKE_REQUEST_VERSION;
  sourceRef: StoryIntakeSourceRef;
};

const ID_PATTERN = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/iu;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const KINDS = new Set<string>(STORY_INTAKE_CANDIDATE_KINDS);
const LINKS = new Set<StoryIntakeProposedLink["relation"]>(["precedes", "involves", "occurs-at", "belongs-to-story-unit", "member-of-narrative-path", "related-to"]);
const PATH_KINDS = new Set<NonNullable<StoryIntakeCandidate["narrativePath"]>["kind"]>(["main", "side", "hidden", "character", "item", "location", "custom"]);
const NAME_KINDS = new Set<StoryIntakeCandidateKind>(["character", "item", "location", "organization", "rule"]);

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
    requireExactKeys(candidate, ["localRef", "kind", "proposedName", "proposedTitle", "sourceSpan", "confidence", "uncertainties", "proposedLinks", "narrativePath"], `Story Intake candidate ${index + 1}`);
    const localRef = requireId(candidate.localRef, "Candidate local reference", 80);
    if (localRefs.has(localRef)) throw new Error("Story Intake candidate local references must be unique.");
    localRefs.add(localRef);
    const kind = requireKind(candidate.kind);
    const proposedName = candidate.proposedName === null ? null : requireText(candidate.proposedName, "Candidate proposed name", 160);
    const proposedTitle = candidate.proposedTitle === null ? null : requireText(candidate.proposedTitle, "Candidate proposed title", 200);
    if (NAME_KINDS.has(kind) ? !proposedName || proposedTitle !== null : !proposedTitle || proposedName !== null) throw new Error("Story Intake candidate name/title does not match its kind.");
    const sourceSpan = parseSourceSpan(candidate.sourceSpan, sourceText);
    const confidence = typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence) && candidate.confidence >= 0 && candidate.confidence <= 1 ? candidate.confidence : (() => { throw new Error("Story Intake confidence must be between 0 and 1."); })();
    const uncertainties = parseTextList(candidate.uncertainties, "Candidate uncertainties", 1, 8, 320);
    const proposedLinks = parseToolLinks(candidate.proposedLinks);
    const narrativePath = parseNarrativePath(candidate.narrativePath, kind);
    return { localRef, kind, proposedName, proposedTitle, sourceSpan, confidence, uncertainties, proposedLinks, narrativePath };
  });
  const candidateIdByLocalRef = new Map(drafts.map((candidate) => [candidate.localRef, deterministicId("candidate.story-intake", runId, candidate.localRef)]));
  const candidates: StoryIntakeCandidate[] = drafts.map((candidate) => ({
    candidateId: candidateIdByLocalRef.get(candidate.localRef)!,
    kind: candidate.kind,
    proposedName: candidate.proposedName,
    proposedTitle: candidate.proposedTitle,
    sourceRef,
    sourceSpan: candidate.sourceSpan,
    confidence: candidate.confidence,
    uncertainties: candidate.uncertainties,
    baseVersion,
    proposedLinks: candidate.proposedLinks.map((link) => {
      const targetCandidateId = candidateIdByLocalRef.get(link.targetLocalRef);
      if (!targetCandidateId) throw new Error(`Story Intake link target does not exist: ${link.targetLocalRef}.`);
      return { relation: link.relation, targetCandidateId, label: link.label };
    }),
    lifecycleStatus: "pending-review",
    narrativePath: candidate.narrativePath
  }));
  if (!Number.isSafeInteger(input.providerCalls) || input.providerCalls < 1 || input.providerCalls > 4) throw new Error("Story Intake Provider call count is invalid.");
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
    provider: { runtime: "pi", structuredTool: "propose_story_intake", providerCalls: input.providerCalls },
    formalStoryWrites: 0,
    createdAt: new Date(input.createdAt).toISOString()
  };
  if (JSON.stringify(envelope).length > STORY_INTAKE_ENVELOPE_MAX_SERIALIZED_LENGTH) throw new Error("Story Intake candidate envelope exceeds the bounded archive payload; reduce candidates or evidence verbosity.");
  return envelope;
}

export function updateStoryIntakeCandidateLifecycle(envelope: StoryIntakeEnvelope, candidateId: string, lifecycleStatus: StoryIntakeLifecycleStatus): StoryIntakeEnvelope {
  if (!(["pending-review", "deferred", "pending-archive", "rejected"] as string[]).includes(lifecycleStatus)) throw new Error("Story Intake lifecycle status is invalid.");
  if (!envelope.candidates.some((candidate) => candidate.candidateId === candidateId)) throw new Error("Story Intake candidate does not exist.");
  return { ...structuredClone(envelope), candidates: envelope.candidates.map((candidate) => candidate.candidateId === candidateId ? { ...candidate, lifecycleStatus } : candidate), formalStoryWrites: 0 };
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

function parseToolLinks(value: unknown): StoryIntakeToolArguments["candidates"][number]["proposedLinks"] {
  if (!Array.isArray(value) || value.length > 24) throw new Error("Story Intake proposed links are invalid.");
  return value.map((item) => {
    const link = requireRecord(item, "Story Intake proposed link");
    requireExactKeys(link, ["relation", "targetLocalRef", "label"], "Story Intake proposed link");
    if (!LINKS.has(link.relation as StoryIntakeProposedLink["relation"])) throw new Error("Story Intake proposed link relation is invalid.");
    return { relation: link.relation as StoryIntakeProposedLink["relation"], targetLocalRef: requireId(link.targetLocalRef, "Story Intake link target", 80), label: link.label === null ? null : requireText(link.label, "Story Intake link label", 160) };
  });
}

function parseNarrativePath(value: unknown, kind: StoryIntakeCandidateKind): StoryIntakeCandidate["narrativePath"] {
  if (kind !== "narrativePathMembership") {
    if (value !== null) throw new Error("Only narrativePathMembership candidates may define a Narrative Path.");
    return null;
  }
  const input = requireRecord(value, "Narrative Path candidate");
  requireExactKeys(input, ["kind", "label"], "Narrative Path candidate");
  if (!PATH_KINDS.has(input.kind as NonNullable<StoryIntakeCandidate["narrativePath"]>["kind"])) throw new Error("Narrative Path kind is invalid.");
  return { kind: input.kind as NonNullable<StoryIntakeCandidate["narrativePath"]>["kind"], label: requireText(input.label, "Narrative Path label", 120) };
}

function requireKind(value: unknown): StoryIntakeCandidateKind {
  if (typeof value !== "string" || !KINDS.has(value)) throw new Error("Story Intake candidate kind is invalid.");
  return value as StoryIntakeCandidateKind;
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
