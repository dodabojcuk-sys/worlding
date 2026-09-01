import { createHash } from "node:crypto";

import {
  normalizeStoryStudioEventReference,
  type StoryStudioEventReference
} from "./storyStudioEventReference.ts";

export const STORY_MODELING_VERSION = "tianyan-story-modeling/v1" as const;

export type StoryModelingTool =
  | "analyze-core-story"
  | "suggest-unit-boundaries"
  | "check-structure-breaks"
  | "compare-branch-units"
  | "smart-relations"
  | "check-broken-links"
  | "suggest-causal-relations"
  | "infer-temporal-position"
  | "check-temporal-conflicts"
  | "update-changed-scope";

export type StoryModelingScope =
  | { kind: "incremental"; changedSourceIds: string[]; dependencySourceIds: string[] }
  | { kind: "selection"; sourceIds: string[]; eventRefs: StoryStudioEventReference[]; unitIds: string[] }
  | { kind: "full-book"; sourceIds: string[] };

export type StoryModelingSource = {
  sourceId: string;
  sourceKind: "chapter" | "scene" | "unit" | "event";
  revision: string;
  contentDigest: `sha256:${string}`;
  characterCount: number;
  dependencySourceIds: string[];
};

export type StoryModelingSourceManifest = {
  version: typeof STORY_MODELING_VERSION;
  projectId: string;
  manifestId: string;
  digest: `sha256:${string}`;
  sources: StoryModelingSource[];
};

export type StoryModelingRecommendation = {
  scopeKind: StoryModelingScope["kind"] | "reuse-cache";
  reason: string;
  authorMayOverride: true;
};

export type StoryModelingPrice = {
  currency: "USD";
  inputPerMillionTokens: number;
  outputPerMillionTokens: number;
  source: string;
};

export type StoryModelingEstimate = {
  sourceCount: number;
  eventCount: number;
  dependencyCount: number;
  providerRequestRange: { min: number; max: number };
  inputTokenRange: { min: number; max: number };
  outputTokenRange: { min: number; max: number };
  totalTokenRange: { min: number; max: number };
  cost: { status: "available"; currency: "USD"; min: number; max: number; priceSource: string } | { status: "unavailable"; reason: "price-metadata-missing" };
};

export type StoryModelingRequest = {
  projectId: string;
  operationId: string;
  tool: StoryModelingTool;
  trigger: "author-requested" | "author-retry";
  scope: StoryModelingScope;
  manifest: StoryModelingSourceManifest;
  eventRefs: StoryStudioEventReference[];
  estimate: StoryModelingEstimate;
  authorConfirmedAt: string;
};

export type StoryModelingRun = {
  version: typeof STORY_MODELING_VERSION;
  runId: string;
  projectId: string;
  operationId: string;
  tool: StoryModelingTool;
  trigger: StoryModelingRequest["trigger"];
  scope: StoryModelingScope;
  sourceManifestId: string;
  sourceManifestDigest: `sha256:${string}`;
  sourceEventRefs: StoryStudioEventReference[];
  estimate: StoryModelingEstimate;
  status: "created" | "running" | "ready" | "failed" | "stopped";
  cacheKey: string;
  provider: { providerId: string; modelId: string; executionKind: "real-provider" | "test-provider" } | null;
  actual: { providerRequests: number; inputTokens: number; outputTokens: number; totalTokens: number; cost: { currency: "USD"; value: number } | null } | null;
  affectedSourceIds: string[];
  result: StoryModelingResult | null;
  createdAt: string;
  completedAt: string | null;
  failureReason: string | null;
};

export type StoryModelingResult = {
  structureFindings: Array<{ id: string; kind: "core-line" | "unit-boundary" | "structure-break" | "branch-comparison"; title: string; summary: string; confidence: number; sourceRefs: string[] }>;
  temporalPlacements: Array<{ eventId: string; kind: "anchored" | "inferred" | "interval" | "conflict" | "unplaced"; x: number; y: number; label: string; interval: { start: number; end: number } | null; confidence: number | null; sourceRefs: string[] }>;
  relationCandidates: SmartRelationCandidate[];
};

export type SmartRelationCandidate = {
  candidateId: string;
  sourceEventId: string;
  targetEventId: string;
  suggestedTypeId: string | null;
  suggestedTypeLabel: string;
  direction: "forward" | "reverse" | "undirected";
  confidence: number;
  rationale: string;
  evidenceRefs: string[];
  reviewState: "candidate" | "accepted" | "rejected";
  sourceRunId: string;
};

export function validateStoryModelingResult(input: { request: StoryModelingRequest; runId: string; result: unknown }): StoryModelingResult {
  if (!input.result || typeof input.result !== "object" || Array.isArray(input.result)) throw new Error("Story modeling result is invalid.");
  const result = input.result as StoryModelingResult;
  if (!Array.isArray(result.structureFindings) || !Array.isArray(result.temporalPlacements) || !Array.isArray(result.relationCandidates)) throw new Error("Story modeling result lists are invalid.");
  const eventIds = new Set(input.request.eventRefs.map((reference) => reference.eventId));
  const relationCandidates = result.relationCandidates.map((candidate) => normalizeSmartRelationCandidate(candidate, eventIds, input.runId));
  if (new Set(relationCandidates.map((candidate) => candidate.candidateId)).size !== relationCandidates.length) throw new Error("Story modeling Relation candidate is duplicated.");
  const temporalPlacements = result.temporalPlacements.map((placement) => {
    if (!eventIds.has(placement.eventId)) throw new Error("Story modeling temporal placement is out of scope.");
    const kind = oneOf(placement.kind, ["anchored", "inferred", "interval", "conflict", "unplaced"] as const, "Story modeling temporal kind");
    const interval = placement.interval === null ? null : { start: finite(placement.interval.start, "Story modeling interval start"), end: finite(placement.interval.end, "Story modeling interval end") };
    if (interval && interval.end < interval.start) throw new Error("Story modeling temporal interval is reversed.");
    return { eventId: stableId(placement.eventId, "Story modeling temporal Event"), kind, x: finite(placement.x, "Story modeling temporal x"), y: finite(placement.y, "Story modeling temporal y"), label: text(placement.label, 120, "Story modeling temporal label"), interval, confidence: placement.confidence === null ? null : confidence(placement.confidence), sourceRefs: uniqueIds(placement.sourceRefs, "Story modeling temporal evidence") };
  });
  const structureFindings = result.structureFindings.map((finding) => ({ id: stableId(finding.id, "Story modeling finding"), kind: oneOf(finding.kind, ["core-line", "unit-boundary", "structure-break", "branch-comparison"] as const, "Story modeling finding kind"), title: text(finding.title, 120, "Story modeling finding title"), summary: text(finding.summary, 320, "Story modeling finding summary"), confidence: confidence(finding.confidence), sourceRefs: uniqueIds(finding.sourceRefs, "Story modeling finding source") }));
  const serialized = JSON.stringify({ structureFindings, temporalPlacements, relationCandidates });
  if (/"(?:prompt|messages|providerResponse|authorization|apiKey|toolCalls?)"\s*:/iu.test(serialized)) throw new Error("Story modeling result exposes internal Agent or Provider fields.");
  return { structureFindings, temporalPlacements, relationCandidates };
}

export function createStoryModelingSourceManifest(input: { projectId: string; sources: StoryModelingSource[] }): StoryModelingSourceManifest {
  const projectId = stableId(input.projectId, "Story modeling project");
  if (!Array.isArray(input.sources) || input.sources.length === 0 || input.sources.length > 4096) throw new Error("Story modeling sources are invalid.");
  const sources = input.sources.map(normalizeSource).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  if (new Set(sources.map((source) => source.sourceId)).size !== sources.length) throw new Error("Story modeling source is duplicated.");
  const digest = sha(JSON.stringify({ projectId, sources }));
  return { version: STORY_MODELING_VERSION, projectId, manifestId: `story-manifest.${digest.slice(7, 31)}`, digest, sources };
}

export function recommendStoryModelingScope(input: { manifest: StoryModelingSourceManifest; previousManifestDigest?: string | null; changedSourceIds: string[]; structuralChange: boolean }): StoryModelingRecommendation {
  const changed = uniqueIds(input.changedSourceIds, "Changed story source");
  if (input.previousManifestDigest === input.manifest.digest && changed.length === 0) return { scopeKind: "reuse-cache", reason: "内容版本没有变化，建议复用当前缓存。", authorMayOverride: true };
  if (input.structuralChange || changed.length > Math.max(8, Math.ceil(input.manifest.sources.length * .35))) return { scopeKind: "full-book", reason: "来源发生大规模重排或结构变化，建议重新综合全书。", authorMayOverride: true };
  return { scopeKind: "incremental", reason: "只有少量章节或依赖变化，建议重算变化块与受影响索引。", authorMayOverride: true };
}

export function estimateStoryModelingRun(input: { scope: StoryModelingScope; manifest: StoryModelingSourceManifest; eventCount: number; maxOutputTokensPerRequest?: number; price?: StoryModelingPrice | null }): StoryModelingEstimate {
  const sourceIds = scopeSourceIds(input.scope);
  const scoped = input.manifest.sources.filter((source) => sourceIds.includes(source.sourceId));
  const sourceCount = scoped.length;
  const dependencyCount = new Set(scoped.flatMap((source) => source.dependencySourceIds)).size;
  const chunks = Math.max(1, scoped.reduce((sum, source) => sum + Math.max(1, Math.ceil(source.characterCount / 6_000)), 0));
  const providerMax = Math.min(64, chunks + (input.scope.kind === "full-book" ? 2 : 1));
  const providerMin = Math.max(1, Math.ceil(providerMax * .65));
  const inputMin = Math.max(128, Math.ceil(scoped.reduce((sum, source) => sum + source.characterCount, 0) / 3.2));
  const inputMax = Math.max(inputMin, Math.ceil(inputMin * 1.35 + dependencyCount * 64));
  const perRequest = boundedInteger(input.maxOutputTokensPerRequest ?? 512, 64, 4096, "Story modeling output token limit");
  const outputMin = providerMin * Math.ceil(perRequest * .35);
  const outputMax = providerMax * perRequest;
  const price = input.price ? normalizePrice(input.price) : null;
  return {
    sourceCount,
    eventCount: boundedInteger(input.eventCount, 0, 100_000, "Story modeling Event count"),
    dependencyCount,
    providerRequestRange: { min: providerMin, max: providerMax },
    inputTokenRange: { min: inputMin, max: inputMax },
    outputTokenRange: { min: outputMin, max: outputMax },
    totalTokenRange: { min: inputMin + outputMin, max: inputMax + outputMax },
    cost: price
      ? { status: "available", currency: "USD", min: roundUsd(inputMin / 1_000_000 * price.inputPerMillionTokens + outputMin / 1_000_000 * price.outputPerMillionTokens), max: roundUsd(inputMax / 1_000_000 * price.inputPerMillionTokens + outputMax / 1_000_000 * price.outputPerMillionTokens), priceSource: price.source }
      : { status: "unavailable", reason: "price-metadata-missing" }
  };
}

export function normalizeStoryModelingRequest(value: unknown): StoryModelingRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Story modeling request is invalid.");
  const input = value as StoryModelingRequest;
  const manifest = createStoryModelingSourceManifest({ projectId: input.projectId, sources: input.manifest?.sources ?? [] });
  if (manifest.digest !== input.manifest?.digest || manifest.manifestId !== input.manifest?.manifestId) throw new Error("Story modeling source manifest is stale or invalid.");
  const eventRefs = (input.eventRefs ?? []).map(normalizeStoryStudioEventReference);
  if (eventRefs.some((ref) => ref.projectId !== manifest.projectId || ref.requestedUse !== "constraint")) throw new Error("Story modeling Event reference is out of scope.");
  const scope = normalizeScope(input.scope, manifest, eventRefs);
  if (typeof input.authorConfirmedAt !== "string" || !Number.isFinite(Date.parse(input.authorConfirmedAt))) throw new Error("Story modeling author confirmation time is invalid.");
  const authorConfirmedAt = new Date(input.authorConfirmedAt).toISOString();
  if (authorConfirmedAt !== input.authorConfirmedAt) throw new Error("Story modeling author confirmation time is invalid.");
  return {
    projectId: manifest.projectId,
    operationId: stableId(input.operationId, "Story modeling operation"),
    tool: tool(input.tool),
    trigger: oneOf(input.trigger, ["author-requested", "author-retry"] as const, "Story modeling trigger"),
    scope,
    manifest,
    eventRefs,
    estimate: structuredClone(input.estimate),
    authorConfirmedAt
  };
}

export function createStoryModelingRun(input: { request: StoryModelingRequest; runId: string; now: string }): StoryModelingRun {
  const request = normalizeStoryModelingRequest(input.request);
  const runId = stableId(input.runId, "Story modeling Run");
  if (!runId.startsWith("story-modeling-run.")) throw new Error("Story modeling Run identifier is invalid.");
  const createdAt = new Date(input.now).toISOString();
  if (createdAt !== input.now) throw new Error("Story modeling Run time is invalid.");
  return {
    version: STORY_MODELING_VERSION,
    runId,
    projectId: request.projectId,
    operationId: request.operationId,
    tool: request.tool,
    trigger: request.trigger,
    scope: request.scope,
    sourceManifestId: request.manifest.manifestId,
    sourceManifestDigest: request.manifest.digest,
    sourceEventRefs: request.eventRefs,
    estimate: request.estimate,
    status: "created",
    cacheKey: `story-modeling-cache.${request.manifest.digest.slice(7, 31)}.${request.tool}.${request.scope.kind}`,
    provider: null,
    actual: null,
    affectedSourceIds: scopeSourceIds(request.scope),
    result: null,
    createdAt,
    completedAt: null,
    failureReason: null
  };
}

function normalizeSource(value: StoryModelingSource): StoryModelingSource {
  const sourceId = stableId(value.sourceId, "Story modeling source");
  const deps = uniqueIds(value.dependencySourceIds ?? [], "Story modeling dependency");
  if (deps.includes(sourceId)) throw new Error("Story modeling source cannot depend on itself.");
  if (!/^sha256:[a-f0-9]{64}$/u.test(value.contentDigest)) throw new Error("Story modeling source digest is invalid.");
  return { sourceId, sourceKind: oneOf(value.sourceKind, ["chapter", "scene", "unit", "event"] as const, "Story modeling source kind"), revision: stableId(value.revision, "Story modeling source revision"), contentDigest: value.contentDigest, characterCount: boundedInteger(value.characterCount, 0, 10_000_000, "Story modeling character count"), dependencySourceIds: deps.sort() };
}
function normalizeSmartRelationCandidate(candidate: SmartRelationCandidate, eventIds: ReadonlySet<string>, runId: string): SmartRelationCandidate {
  const sourceEventId = stableId(candidate.sourceEventId, "Story modeling Relation source");
  const targetEventId = stableId(candidate.targetEventId, "Story modeling Relation target");
  if (sourceEventId === targetEventId || !eventIds.has(sourceEventId) || !eventIds.has(targetEventId)) throw new Error("Story modeling Relation candidate endpoints are invalid.");
  if (candidate.sourceRunId !== runId) throw new Error("Story modeling Relation candidate Run provenance is invalid.");
  return { candidateId: stableId(candidate.candidateId, "Story modeling Relation candidate"), sourceEventId, targetEventId, suggestedTypeId: candidate.suggestedTypeId === null ? null : stableId(candidate.suggestedTypeId, "Story modeling Relation type"), suggestedTypeLabel: text(candidate.suggestedTypeLabel, 80, "Story modeling Relation type label"), direction: oneOf(candidate.direction, ["forward", "reverse", "undirected"] as const, "Story modeling Relation direction"), confidence: confidence(candidate.confidence), rationale: text(candidate.rationale, 320, "Story modeling Relation rationale"), evidenceRefs: uniqueIds(candidate.evidenceRefs, "Story modeling Relation evidence"), reviewState: oneOf(candidate.reviewState, ["candidate", "accepted", "rejected"] as const, "Story modeling Relation review state"), sourceRunId: runId };
}
function normalizeScope(scope: StoryModelingScope, manifest: StoryModelingSourceManifest, eventRefs: StoryStudioEventReference[]): StoryModelingScope {
  const ids = new Set(manifest.sources.map((source) => source.sourceId));
  if (scope.kind === "incremental") return { kind: scope.kind, changedSourceIds: inManifest(scope.changedSourceIds, ids), dependencySourceIds: inManifest(scope.dependencySourceIds, ids) };
  if (scope.kind === "full-book") return { kind: scope.kind, sourceIds: inManifest(scope.sourceIds, ids) };
  if (scope.kind === "selection") return { kind: scope.kind, sourceIds: inManifest(scope.sourceIds, ids), unitIds: uniqueIds(scope.unitIds, "Story modeling Unit"), eventRefs };
  throw new Error("Story modeling scope is invalid.");
}
function inManifest(values: string[], ids: Set<string>): string[] { const result = uniqueIds(values, "Story modeling scope source"); if (result.some((id) => !ids.has(id))) throw new Error("Story modeling scope contains an unknown source."); return result; }
function scopeSourceIds(scope: StoryModelingScope): string[] { return scope.kind === "incremental" ? uniqueIds([...scope.changedSourceIds, ...scope.dependencySourceIds], "Story modeling scope") : uniqueIds(scope.sourceIds, "Story modeling scope"); }
function normalizePrice(value: StoryModelingPrice): StoryModelingPrice { return { currency: "USD", inputPerMillionTokens: finiteNonNegative(value.inputPerMillionTokens, "Input token price"), outputPerMillionTokens: finiteNonNegative(value.outputPerMillionTokens, "Output token price"), source: text(value.source, 160, "Price source") }; }
function uniqueIds(value: unknown, label: string): string[] { if (!Array.isArray(value)) throw new Error(`${label} list is invalid.`); const result = value.map((item) => stableId(item, label)); if (new Set(result).size !== result.length) throw new Error(`${label} list contains duplicates.`); return result; }
function tool(value: unknown): StoryModelingTool { return oneOf(value, ["analyze-core-story", "suggest-unit-boundaries", "check-structure-breaks", "compare-branch-units", "smart-relations", "check-broken-links", "suggest-causal-relations", "infer-temporal-position", "check-temporal-conflicts", "update-changed-scope"] as const, "Story modeling tool"); }
function stableId(value: unknown, label: string): string { const result = text(value, 200, label); if (!/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(result)) throw new Error(`${label} is invalid.`); return result; }
function text(value: unknown, maximum: number, label: string): string { if (typeof value !== "string") throw new Error(`${label} is invalid.`); const result = value.normalize("NFC").trim(); if (!result || [...result].length > maximum || /[\u0000-\u001F\u007F]/u.test(result)) throw new Error(`${label} is invalid.`); return result; }
function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T { if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} is invalid.`); return value as T; }
function boundedInteger(value: unknown, min: number, max: number, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) throw new Error(`${label} is invalid.`); return value as number; }
function finiteNonNegative(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`${label} is invalid.`); return value; }
function finite(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error(`${label} is invalid.`); return value; }
function confidence(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Story modeling confidence is invalid."); return value; }
function sha(value: string): `sha256:${string}` { return `sha256:${createHash("sha256").update(value).digest("hex")}`; }
function roundUsd(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
