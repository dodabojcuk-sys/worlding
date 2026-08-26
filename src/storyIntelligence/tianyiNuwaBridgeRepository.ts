import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import { stableHash, stableJson } from "./storySnapshotBuilder.ts";
import { NUWA_AUTHOR_LOOP_SEEDS } from "./storyIntelligenceTypes.ts";
import { normalizeNuwaAttentionContext, type NuwaAttentionContext } from "./nuwaAttentionContext.ts";

export const TIANYI_NUWA_EXECUTION_BRIEF_VERSION = "story-studio-tianyi-nuwa-execution-brief/v1" as const;
export const NUWA_RESULT_RECEIPT_VERSION = "story-studio-nuwa-result-receipt/v1" as const;

export const STORY_STUDIO_INTELLIGENCE_MODES = ["world", "writing", "intelligence", "localization", "publish"] as const;
export type StoryStudioIntelligenceMode = typeof STORY_STUDIO_INTELLIGENCE_MODES[number];

export type TianyiNuwaExecutionBrief = {
  version: typeof TIANYI_NUWA_EXECUTION_BRIEF_VERSION;
  briefId: string;
  revision: number;
  authorGoal: string;
  /** The author's original question, kept separate from the execution wording. */
  sourceQuestion?: string;
  sourceProject: { projectId: string; projectRevision: string };
  currentContext: { mode: StoryStudioIntelligenceMode; documentId: string; objectIds: string[]; selectionRef: string };
  startingPoint?: { beatId: string; checkpoint: string };
  participatingActorIds?: string[];
  observationCriteria?: { success: string[]; failure: string[] };
  createdAt?: string;
  provenance?: { source: "tianyi"; sessionId: string; contextHash: string };
  selectedContextReceiptIds: string[];
  selectedArchiveMessageRefs: Array<{ sessionId: string; messageId: string }>;
  approvedMemoryRefs: string[];
  mustKeep: string[];
  mustAvoid: string[];
  unresolvedQuestions: string[];
  expectedOutputKind: "candidate-routes";
  requestedRunCount?: number;
  fixedSeeds?: number[];
  allowedAgents: string[];
  allowedSkills: string[];
  capabilityBudget: { maxAgentRuns: number; maxSkillCalls: number; maxTokens: number; timeoutSeconds: number };
  sensitivity: "project-private" | "personal-sensitive";
  authorApprovalState: "draft" | "approved";
  expectedHashes: { brief: string; sourceSet: string };
  operationId: string;
  originatingTianyiSessionId: string;
  returnDestination: { mode: StoryStudioIntelligenceMode; documentId: string; selectionRef: string };
  /** Immutable projection of the exact snapshot used by this Brief. */
  attentionContext?: NuwaAttentionContext;
};

export type NuwaResultReceipt = {
  version: typeof NUWA_RESULT_RECEIPT_VERSION;
  resultReceiptId: string;
  briefId: string;
  briefRevision: number;
  operationId: string;
  agentsUsed: string[];
  skillsUsed: string[];
  sourceRefs: string[];
  candidateRouteIds: string[];
  disagreements: string[];
  unresolvedQuestions: string[];
  staleState: "current" | "stale" | "partial";
  impactReviewEligible: boolean;
  returnDestination: { tianyiSessionId: string; mode: StoryStudioIntelligenceMode; documentId: string; selectionRef: string };
};

export type ExecutionResolvedSource = {
  kind: "story-snapshot" | "context-receipt" | "archive-message" | "approved-memory";
  id: string;
  hash: string;
};

export type ExecutionBriefRunBinding = {
  version: "story-studio-tianyi-nuwa-run-binding/v1";
  briefId: string;
  briefRevision: number;
  operationId: string;
  explorationId: string;
  runId: string;
};

const BRIEF_ROOT_FIELDS = [
  "version", "briefId", "revision", "authorGoal", "sourceQuestion", "sourceProject", "currentContext",
  "startingPoint", "participatingActorIds", "observationCriteria", "createdAt", "provenance",
  "selectedContextReceiptIds", "selectedArchiveMessageRefs", "approvedMemoryRefs", "mustKeep",
  "mustAvoid", "unresolvedQuestions", "expectedOutputKind", "allowedAgents", "allowedSkills",
  "requestedRunCount", "fixedSeeds", "capabilityBudget", "sensitivity", "authorApprovalState", "expectedHashes", "operationId",
  "originatingTianyiSessionId", "returnDestination"
] as const;
const AUTHOR_LOOP_BRIEF_FIELDS = ["sourceQuestion", "startingPoint", "participatingActorIds", "observationCriteria", "createdAt", "provenance"] as const;
const RECEIPT_ROOT_FIELDS = [
  "version", "resultReceiptId", "briefId", "briefRevision", "operationId", "agentsUsed",
  "skillsUsed", "sourceRefs", "candidateRouteIds", "disagreements", "unresolvedQuestions",
  "staleState", "impactReviewEligible", "returnDestination"
] as const;
const MAX_ARTIFACT_BYTES = 64 * 1024;

export function normalizeTianyiNuwaExecutionBrief(value: unknown): TianyiNuwaExecutionBrief {
  assertBoundedArtifact(value, "Execution Brief");
  const raw = value as Record<string, unknown>;
  const hasRunContract = Boolean(raw && typeof raw === "object" && Object.hasOwn(raw, "requestedRunCount") && Object.hasOwn(raw, "fixedSeeds"));
  const hasPartialRunContract = Boolean(raw && typeof raw === "object" && (Object.hasOwn(raw, "requestedRunCount") || Object.hasOwn(raw, "fixedSeeds")));
  if (hasPartialRunContract && !hasRunContract) throw new Error("Execution Brief run contract must include requestedRunCount and fixedSeeds.");
  const hasAuthorLoopContract = AUTHOR_LOOP_BRIEF_FIELDS.every((field) => Object.hasOwn(raw, field));
  const hasPartialAuthorLoopContract = AUTHOR_LOOP_BRIEF_FIELDS.some((field) => Object.hasOwn(raw, field));
  if (hasPartialAuthorLoopContract && !hasAuthorLoopContract) throw new Error("Execution Brief author-loop context must be complete.");
  // Existing v1 files predate the bounded three-run author loop. Read them
  // without writing and supply the deterministic defaults in memory.
  const hasAttentionContext = Object.hasOwn(raw, "attentionContext");
  const input = exactObject({
    ...raw,
    requestedRunCount: raw.requestedRunCount ?? NUWA_AUTHOR_LOOP_SEEDS.length,
    fixedSeeds: raw.fixedSeeds ?? [...NUWA_AUTHOR_LOOP_SEEDS]
  }, [...(hasAuthorLoopContract ? BRIEF_ROOT_FIELDS : BRIEF_ROOT_FIELDS.filter((field) => !AUTHOR_LOOP_BRIEF_FIELDS.includes(field as typeof AUTHOR_LOOP_BRIEF_FIELDS[number]))), ...(hasAttentionContext ? ["attentionContext"] : [])], "Execution Brief");
  const sourceProject = exactObject(input.sourceProject, ["projectId", "projectRevision"], "Execution Brief source project");
  const currentContext = exactObject(input.currentContext, ["mode", "documentId", "objectIds", "selectionRef"], "Execution Brief current context");
  const capabilityBudget = exactObject(input.capabilityBudget, ["maxAgentRuns", "maxSkillCalls", "maxTokens", "timeoutSeconds"], "Execution Brief capability budget");
  const expectedHashes = exactObject(input.expectedHashes, ["brief", "sourceSet"], "Execution Brief expected hashes");
  const returnDestination = exactObject(input.returnDestination, ["mode", "documentId", "selectionRef"], "Execution Brief return destination");
  const selectedArchiveMessageRefs = array(input.selectedArchiveMessageRefs, "Execution Brief Archive messages", 16).map((value) => {
    const ref = exactObject(value, ["sessionId", "messageId"], "Execution Brief Archive message");
    return { sessionId: stableId(ref.sessionId, "Archive Session identifier"), messageId: stableId(ref.messageId, "Archive message identifier") };
  });
  const result: TianyiNuwaExecutionBrief = {
    version: literal(input.version, TIANYI_NUWA_EXECUTION_BRIEF_VERSION, "Execution Brief version"),
    briefId: stableId(input.briefId, "Execution Brief identifier"),
    revision: integer(input.revision, "Execution Brief revision", 1, 9_999),
    authorGoal: text(input.authorGoal, "Execution Brief author goal", 2_000),
    ...(hasAuthorLoopContract ? {
      sourceQuestion: text(input.sourceQuestion, "Execution Brief source question", 2_000)
    } : {}),
    sourceProject: {
      projectId: projectId(sourceProject.projectId),
      projectRevision: hash(sourceProject.projectRevision, "Execution Brief project revision")
    },
    currentContext: {
      mode: mode(currentContext.mode),
      documentId: stableId(currentContext.documentId, "Execution Brief context document"),
      objectIds: idArray(currentContext.objectIds, "Execution Brief context objects", 32),
      selectionRef: stableId(currentContext.selectionRef, "Execution Brief selection reference")
    },
    ...(hasAuthorLoopContract ? {
      startingPoint: (() => {
        const point = exactObject(input.startingPoint, ["beatId", "checkpoint"], "Execution Brief starting point");
        return { beatId: stableId(point.beatId, "Execution Brief starting Beat"), checkpoint: stableId(point.checkpoint, "Execution Brief checkpoint") };
      })(),
      participatingActorIds: idArray(input.participatingActorIds, "Execution Brief participating Actors", 16),
      observationCriteria: (() => {
        const criteria = exactObject(input.observationCriteria, ["success", "failure"], "Execution Brief observation criteria");
        return {
          success: stringArray(criteria.success, "Execution Brief success criteria", 8, 500),
          failure: stringArray(criteria.failure, "Execution Brief failure criteria", 8, 500)
        };
      })(),
      createdAt: text(input.createdAt, "Execution Brief createdAt", 64),
      provenance: (() => {
        const provenance = exactObject(input.provenance, ["source", "sessionId", "contextHash"], "Execution Brief provenance");
        return {
          source: literal(provenance.source, "tianyi", "Execution Brief provenance source"),
          sessionId: stableId(provenance.sessionId, "Execution Brief provenance Session"),
          contextHash: hash(provenance.contextHash, "Execution Brief provenance context hash")
        };
      })()
    } : {}),
    selectedContextReceiptIds: idArray(input.selectedContextReceiptIds, "Execution Brief Context Receipts", 16),
    selectedArchiveMessageRefs,
    approvedMemoryRefs: idArray(input.approvedMemoryRefs, "Execution Brief Memory references", 16),
    mustKeep: stringArray(input.mustKeep, "Execution Brief must-keep constraints", 32, 500),
    mustAvoid: stringArray(input.mustAvoid, "Execution Brief must-avoid constraints", 32, 500),
    unresolvedQuestions: stringArray(input.unresolvedQuestions, "Execution Brief unresolved questions", 32, 500),
    expectedOutputKind: literal(input.expectedOutputKind, "candidate-routes", "Execution Brief output kind"),
    ...(hasRunContract ? {
      requestedRunCount: integer(input.requestedRunCount, "Execution Brief requested run count", 1, 5),
      fixedSeeds: integerArray(input.fixedSeeds, "Execution Brief fixed seeds", 5)
    } : {}),
    allowedAgents: idArray(input.allowedAgents, "Execution Brief Agents", 6),
    allowedSkills: idArray(input.allowedSkills, "Execution Brief Skills", 8),
    capabilityBudget: {
      maxAgentRuns: integer(capabilityBudget.maxAgentRuns, "Execution Brief Agent budget", 1, 6),
      maxSkillCalls: integer(capabilityBudget.maxSkillCalls, "Execution Brief Skill budget", 0, 8),
      maxTokens: integer(capabilityBudget.maxTokens, "Execution Brief token budget", 1, 32_000),
      timeoutSeconds: integer(capabilityBudget.timeoutSeconds, "Execution Brief timeout", 1, 300)
    },
    sensitivity: enumValue(input.sensitivity, ["project-private", "personal-sensitive"] as const, "Execution Brief sensitivity"),
    authorApprovalState: enumValue(input.authorApprovalState, ["draft", "approved"] as const, "Execution Brief approval"),
    expectedHashes: {
      brief: hash(expectedHashes.brief, "Execution Brief hash"),
      sourceSet: hash(expectedHashes.sourceSet, "Execution Brief source-set hash")
    },
    operationId: stableId(input.operationId, "Execution Brief operation identifier"),
    originatingTianyiSessionId: stableId(input.originatingTianyiSessionId, "Execution Brief Tianyi Session"),
    returnDestination: {
      mode: mode(returnDestination.mode),
      documentId: stableId(returnDestination.documentId, "Execution Brief return document"),
      selectionRef: stableId(returnDestination.selectionRef, "Execution Brief return selection")
    },
    ...(hasAttentionContext ? { attentionContext: normalizeNuwaAttentionContext(input.attentionContext) } : {})
  };
  if (new Set(selectedArchiveMessageRefs.map((ref) => `${ref.sessionId}\u0000${ref.messageId}`)).size !== selectedArchiveMessageRefs.length) {
    throw new Error("Execution Brief Archive messages must be unique.");
  }
  if (hasRunContract && (result.requestedRunCount !== NUWA_AUTHOR_LOOP_SEEDS.length || result.fixedSeeds!.length !== result.requestedRunCount)) {
    throw new Error("Execution Brief author loop requires exactly three fixed seeds.");
  }
  return result;
}

export function normalizeNuwaResultReceipt(value: unknown): NuwaResultReceipt {
  assertBoundedArtifact(value, "Nuwa Result Receipt");
  const input = exactObject(value, RECEIPT_ROOT_FIELDS, "Nuwa Result Receipt");
  const returnDestination = exactObject(input.returnDestination, ["tianyiSessionId", "mode", "documentId", "selectionRef"], "Nuwa Result Receipt return destination");
  const staleState = enumValue(input.staleState, ["current", "stale", "partial"] as const, "Nuwa Result Receipt stale state");
  const impactReviewEligible = boolean(input.impactReviewEligible, "Nuwa Result Receipt Impact Review eligibility");
  if (staleState !== "current" && impactReviewEligible) throw new Error("Stale or partial Nuwa results cannot enter Impact Review.");
  return {
    version: literal(input.version, NUWA_RESULT_RECEIPT_VERSION, "Nuwa Result Receipt version"),
    resultReceiptId: stableId(input.resultReceiptId, "Nuwa Result Receipt identifier"),
    briefId: stableId(input.briefId, "Nuwa Result Receipt Brief identifier"),
    briefRevision: integer(input.briefRevision, "Nuwa Result Receipt Brief revision", 1, 9_999),
    operationId: stableId(input.operationId, "Nuwa Result Receipt operation identifier"),
    agentsUsed: idArray(input.agentsUsed, "Nuwa Result Receipt Agents", 6),
    skillsUsed: idArray(input.skillsUsed, "Nuwa Result Receipt Skills", 8),
    sourceRefs: array(input.sourceRefs, "Nuwa Result Receipt sources", 64).map(resultSourceRef),
    candidateRouteIds: idArray(input.candidateRouteIds, "Nuwa Result Receipt routes", 5),
    disagreements: stringArray(input.disagreements, "Nuwa Result Receipt disagreements", 32, 500),
    unresolvedQuestions: stringArray(input.unresolvedQuestions, "Nuwa Result Receipt unresolved questions", 32, 500),
    staleState,
    impactReviewEligible,
    returnDestination: {
      tianyiSessionId: stableId(returnDestination.tianyiSessionId, "Nuwa Result Receipt Tianyi Session"),
      mode: mode(returnDestination.mode),
      documentId: stableId(returnDestination.documentId, "Nuwa Result Receipt return document"),
      selectionRef: stableId(returnDestination.selectionRef, "Nuwa Result Receipt return selection")
    }
  };
}

export function computeExecutionBriefHash(value: TianyiNuwaExecutionBrief): string {
  const { authorApprovalState: _approval, expectedHashes: _hashes, ...payload } = normalizeTianyiNuwaExecutionBrief(value);
  return stableHash(payload);
}

export function computeExecutionSourceSetHash(value: TianyiNuwaExecutionBrief, resolvedSources: ExecutionResolvedSource[]): string {
  const brief = normalizeTianyiNuwaExecutionBrief(value);
  const sources = resolvedSources.map((source) => {
    const normalized = exactObject(source, ["kind", "id", "hash"], "Execution Brief resolved source");
    return {
      kind: enumValue(normalized.kind, ["story-snapshot", "context-receipt", "archive-message", "approved-memory"] as const, "Execution Brief resolved source kind"),
      id: stableId(normalized.id, "Execution Brief resolved source identifier"),
      hash: hash(normalized.hash, "Execution Brief resolved source hash")
    };
  }).sort((left, right) => `${left.kind}\u0000${left.id}`.localeCompare(`${right.kind}\u0000${right.id}`));
  if (new Set(sources.map((source) => `${source.kind}\u0000${source.id}`)).size !== sources.length) throw new Error("Execution Brief resolved sources must be unique.");
  return stableHash({
    sourceProject: brief.sourceProject,
    currentContext: brief.currentContext,
    selectedContextReceiptIds: brief.selectedContextReceiptIds,
    selectedArchiveMessageRefs: brief.selectedArchiveMessageRefs,
    approvedMemoryRefs: brief.approvedMemoryRefs,
    sources
  });
}

export function writeExecutionBriefRevision(workspacePath: string, value: TianyiNuwaExecutionBrief): TianyiNuwaExecutionBrief {
  const brief = normalizeTianyiNuwaExecutionBrief(value);
  if (computeExecutionBriefHash(brief) !== brief.expectedHashes.brief) throw new Error("Execution Brief hash does not match its revision.");
  const target = executionBriefRevisionPath(workspacePath, brief.briefId, brief.revision);
  if (existsSync(target)) {
    const existing = normalizeTianyiNuwaExecutionBrief(JSON.parse(readFileSync(target, "utf8")) as unknown);
    if (stableJson(existing) !== stableJson(brief)) throw new Error("Execution Brief revision already exists with different content.");
    writeLatestExecutionBriefPointer(workspacePath, existing);
    return existing;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeAtomicJson(target, brief);
  writeAtomicJson(path.join(executionBriefRoot(workspacePath, brief.briefId), "latest.json"), {
    version: "story-studio-tianyi-nuwa-execution-brief-latest/v1",
    briefId: brief.briefId,
    revision: brief.revision
  });
  writeLatestExecutionBriefPointer(workspacePath, brief);
  return structuredClone(brief);
}

export function readLatestExecutionBriefRevision(workspacePath: string): TianyiNuwaExecutionBrief | null {
  const target = path.join(executionBriefCollectionRoot(workspacePath), "latest.json");
  if (!existsSync(target)) return null;
  const latest = exactObject(JSON.parse(readFileSync(target, "utf8")) as unknown, ["version", "briefId", "revision"], "Latest Execution Brief pointer");
  literal(latest.version, "story-studio-tianyi-nuwa-execution-brief-collection-latest/v1", "Latest Execution Brief pointer version");
  const briefId = stableId(latest.briefId, "Latest Execution Brief identifier");
  const revision = integer(latest.revision, "Latest Execution Brief revision", 1, 9_999);
  const brief = readExecutionBriefRevision(workspacePath, briefId, revision);
  if (!brief) throw new Error("Latest Execution Brief pointer references a missing revision.");
  return brief;
}

export function readExecutionBriefRevision(workspacePath: string, briefId: string, revision?: number): TianyiNuwaExecutionBrief | null {
  const id = stableId(briefId, "Execution Brief identifier");
  let selectedRevision = revision;
  if (selectedRevision === undefined) {
    const latestPath = path.join(executionBriefRoot(workspacePath, id), "latest.json");
    if (!existsSync(latestPath)) return null;
    const latest = exactObject(JSON.parse(readFileSync(latestPath, "utf8")) as unknown, ["version", "briefId", "revision"], "Execution Brief latest pointer");
    literal(latest.version, "story-studio-tianyi-nuwa-execution-brief-latest/v1", "Execution Brief latest version");
    if (stableId(latest.briefId, "Execution Brief latest identifier") !== id) throw new Error("Execution Brief latest pointer is invalid.");
    selectedRevision = integer(latest.revision, "Execution Brief latest revision", 1, 9_999);
  }
  const target = executionBriefRevisionPath(workspacePath, id, selectedRevision);
  return existsSync(target) ? normalizeTianyiNuwaExecutionBrief(JSON.parse(readFileSync(target, "utf8")) as unknown) : null;
}

export function approveExecutionBriefRevision(workspacePath: string, value: TianyiNuwaExecutionBrief): TianyiNuwaExecutionBrief {
  const approved = normalizeTianyiNuwaExecutionBrief(value);
  if (approved.authorApprovalState !== "approved") throw new Error("Execution Brief approval state is invalid.");
  if (computeExecutionBriefHash(approved) !== approved.expectedHashes.brief) throw new Error("Execution Brief hash does not match its revision.");
  const current = readExecutionBriefRevision(workspacePath, approved.briefId);
  if (!current || current.revision !== approved.revision) throw new Error("Execution Brief revision is stale.");
  const currentComparable = { ...current, authorApprovalState: "approved" as const };
  if (stableJson(currentComparable) !== stableJson(approved)) throw new Error("Execution Brief approval cannot change revision content.");
  const target = executionBriefRevisionPath(workspacePath, approved.briefId, approved.revision);
  writeAtomicJson(target, approved);
  writeLatestExecutionBriefPointer(workspacePath, approved);
  return structuredClone(approved);
}

export function writeExecutionBriefRunBinding(workspacePath: string, value: ExecutionBriefRunBinding): ExecutionBriefRunBinding {
  const binding = normalizeRunBinding(value);
  const target = executionBriefRunBindingPath(workspacePath, binding.briefId, binding.briefRevision);
  if (existsSync(target)) {
    const existing = normalizeRunBinding(JSON.parse(readFileSync(target, "utf8")) as unknown);
    if (stableJson(existing) !== stableJson(binding)) throw new Error("Execution Brief operation already points to a different Nuwa run.");
    return existing;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeAtomicJson(target, binding);
  return structuredClone(binding);
}

export function readExecutionBriefRunBinding(workspacePath: string, briefId: string, revision: number): ExecutionBriefRunBinding | null {
  const target = executionBriefRunBindingPath(workspacePath, briefId, revision);
  return existsSync(target) ? normalizeRunBinding(JSON.parse(readFileSync(target, "utf8")) as unknown) : null;
}

export function writeNuwaResultReceipt(workspacePath: string, runId: string, value: NuwaResultReceipt): NuwaResultReceipt {
  const receipt = normalizeNuwaResultReceipt(value);
  const runPath = confined(workspacePath, path.join(".world-os", "runs", "nuwa", fileId(runId), "run.json"));
  if (!existsSync(runPath)) throw new Error("Nuwa Result Receipt requires an existing run artifact.");
  const target = resultReceiptPath(workspacePath, runId);
  if (existsSync(target)) {
    const existing = normalizeNuwaResultReceipt(JSON.parse(readFileSync(target, "utf8")) as unknown);
    if (stableJson(existing) !== stableJson(receipt)) throw new Error("Nuwa Result Receipt already exists with different content.");
    return existing;
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeAtomicJson(target, receipt);
  return structuredClone(receipt);
}

export function readNuwaResultReceipt(workspacePath: string, runId: string): NuwaResultReceipt | null {
  const target = resultReceiptPath(workspacePath, runId);
  return existsSync(target) ? normalizeNuwaResultReceipt(JSON.parse(readFileSync(target, "utf8")) as unknown) : null;
}

function executionBriefRoot(workspacePath: string, briefId: string): string {
  return path.join(executionBriefCollectionRoot(workspacePath), fileId(briefId));
}

function executionBriefCollectionRoot(workspacePath: string): string {
  return confined(workspacePath, path.join(".world-os", "runs", "nuwa", "briefs"));
}

function writeLatestExecutionBriefPointer(workspacePath: string, brief: TianyiNuwaExecutionBrief): void {
  const root = executionBriefCollectionRoot(workspacePath);
  mkdirSync(root, { recursive: true });
  writeAtomicJson(path.join(root, "latest.json"), {
    version: "story-studio-tianyi-nuwa-execution-brief-collection-latest/v1",
    briefId: brief.briefId,
    revision: brief.revision
  });
}

function executionBriefRevisionPath(workspacePath: string, briefId: string, revision: number): string {
  return confined(workspacePath, path.join(".world-os", "runs", "nuwa", "briefs", fileId(briefId), "revisions", `revision-${String(revision).padStart(4, "0")}.json`));
}

function executionBriefRunBindingPath(workspacePath: string, briefId: string, revision: number): string {
  return confined(workspacePath, path.join(".world-os", "runs", "nuwa", "briefs", fileId(briefId), `run-revision-${String(revision).padStart(4, "0")}.json`));
}

function resultReceiptPath(workspacePath: string, runId: string): string {
  return confined(workspacePath, path.join(".world-os", "runs", "nuwa", fileId(runId), "report", "result-receipt.json"));
}

function confined(workspacePath: string, relativePath: string): string {
  const workspace = path.resolve(workspacePath);
  const target = path.resolve(workspace, relativePath);
  if (!target.startsWith(`${workspace}${path.sep}`)) throw new Error("Nuwa bridge artifact path is outside the workspace.");
  return target;
}

function writeAtomicJson(target: string, value: unknown): void {
  const source = `${JSON.stringify(value, null, 2)}\n`;
  if (Buffer.byteLength(source, "utf8") > MAX_ARTIFACT_BYTES) throw new Error("Nuwa bridge artifact is too large.");
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, source, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, target);
}

function fileId(value: string): string {
  const id = stableId(value, "Nuwa bridge artifact identifier");
  return id.replace(/[^a-zA-Z0-9._-]/gu, "-");
}

function assertBoundedArtifact(value: unknown, label: string): void {
  if (Buffer.byteLength(JSON.stringify(value), "utf8") > MAX_ARTIFACT_BYTES) throw new Error(`${label} is too large.`);
  const visit = (child: unknown, depth: number): void => {
    if (depth > 8) throw new Error(`${label} is too deeply nested.`);
    if (!child || typeof child !== "object") return;
    if (Array.isArray(child)) { child.forEach((item) => visit(item, depth + 1)); return; }
    for (const [key, nested] of Object.entries(child as Record<string, unknown>)) {
      if (["__proto__", "prototype", "constructor"].includes(key)) throw new Error(`${label} contains a dangerous key.`);
      visit(nested, depth + 1);
    }
  };
  visit(value, 0);
}

function exactObject(value: unknown, fields: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  const object = value as Record<string, unknown>;
  const keys = Object.keys(object);
  if (keys.length !== fields.length || fields.some((field) => !Object.hasOwn(object, field)) || keys.some((key) => !fields.includes(key))) throw new Error(`${label} fields are invalid.`);
  return object;
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string") throw new Error(`${label} is invalid.`);
  const result = value.normalize("NFC").trim();
  if (!result || [...result].length > maximum || /[\u0000-\u001F\u007F]/u.test(result)) throw new Error(`${label} is invalid.`);
  return result;
}

function stableId(value: unknown, label: string): string {
  const result = text(value, label, 180);
  if (/[\\/]|(?:^|\.)\.{1,2}(?:\.|$)|^[a-zA-Z]:/u.test(result)) throw new Error(`${label} must be a stable product identifier.`);
  return result;
}

function resultSourceRef(value: unknown): string {
  const result = stableId(value, "Nuwa Result Receipt source");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@-]{1,179}$/u.test(result)) throw new Error(`Nuwa Result Receipt source must be a structured reference, not prose: ${result}`);
  return result;
}

function projectId(value: unknown): string {
  const result = stableId(value, "Execution Brief project identifier");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error("Execution Brief project identifier is invalid.");
  return result;
}

function hash(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function integer(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} is invalid.`);
  return value;
}

function literal<const T extends string>(value: unknown, expected: T, label: string): T {
  if (value !== expected) throw new Error(`${label} is invalid.`);
  return expected;
}

function enumValue<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value as T[number])) throw new Error(`${label} is invalid.`);
  return value as T[number];
}

function mode(value: unknown): StoryStudioIntelligenceMode {
  return enumValue(value, STORY_STUDIO_INTELLIGENCE_MODES, "Story Studio mode");
}

function array(value: unknown, label: string, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} is invalid.`);
  return value;
}

function stringArray(value: unknown, label: string, maximumItems: number, maximumLength: number): string[] {
  const result = array(value, label, maximumItems).map((item) => text(item, label, maximumLength));
  if (new Set(result).size !== result.length) throw new Error(`${label} must be unique.`);
  return result;
}

function idArray(value: unknown, label: string, maximumItems: number): string[] {
  const result = array(value, label, maximumItems).map((item) => stableId(item, label));
  if (new Set(result).size !== result.length) throw new Error(`${label} must be unique.`);
  return result;
}

function integerArray(value: unknown, label: string, maximumItems: number): number[] {
  const result = array(value, label, maximumItems).map((item) => integer(item, label, 0, 2_147_483_647));
  if (new Set(result).size !== result.length) throw new Error(`${label} must be unique.`);
  return result;
}

function normalizeRunBinding(value: unknown): ExecutionBriefRunBinding {
  assertBoundedArtifact(value, "Execution Brief run binding");
  const input = exactObject(value, ["version", "briefId", "briefRevision", "operationId", "explorationId", "runId"], "Execution Brief run binding");
  return {
    version: literal(input.version, "story-studio-tianyi-nuwa-run-binding/v1", "Execution Brief run binding version"),
    briefId: stableId(input.briefId, "Execution Brief run binding Brief identifier"),
    briefRevision: integer(input.briefRevision, "Execution Brief run binding revision", 1, 9_999),
    operationId: stableId(input.operationId, "Execution Brief run binding operation"),
    explorationId: stableId(input.explorationId, "Execution Brief run binding exploration"),
    runId: stableId(input.runId, "Execution Brief run binding run")
  };
}
