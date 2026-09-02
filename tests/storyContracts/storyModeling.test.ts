import assert from "node:assert/strict";
import test from "node:test";

import {
  createStoryModelingRun,
  createStoryModelingSourceManifest,
  estimateStoryModelingRun,
  normalizeStoryModelingRequest,
  recommendStoryModelingScope,
  validateStoryModelingResult,
  type SmartRelationCandidate
} from "../../src/storyContracts/storyModeling.ts";
import { dedupeSmartRelationCandidates, reviewSmartRelationCandidates } from "../../src/storyContracts/storyModelingReview.ts";

const manifest = createStoryModelingSourceManifest({
  projectId: "long-night",
  sources: [
    source("chapter.1", 12_000, []),
    source("chapter.2", 18_000, ["chapter.1"]),
    source("chapter.3", 9_000, ["chapter.2"])
  ]
});

test("story modeling source manifest is versioned, canonical and duplicate safe", () => {
  assert.match(manifest.digest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(manifest.sources[0]?.sourceId, "chapter.1");
  assert.throws(() => createStoryModelingSourceManifest({ projectId: "long-night", sources: [source("chapter.1", 1, []), source("chapter.1", 2, [])] }), /duplicated/u);
});

test("scope recommendation keeps cache, incremental and full-book as author-overridable advice", () => {
  assert.equal(recommendStoryModelingScope({ manifest, previousManifestDigest: manifest.digest, changedSourceIds: [], structuralChange: false }).scopeKind, "reuse-cache");
  assert.equal(recommendStoryModelingScope({ manifest, changedSourceIds: ["chapter.2"], structuralChange: false }).scopeKind, "incremental");
  const full = recommendStoryModelingScope({ manifest, changedSourceIds: ["chapter.1"], structuralChange: true });
  assert.equal(full.scopeKind, "full-book");
  assert.equal(full.authorMayOverride, true);
});

test("Event-only evidence never recommends or accepts full-book modeling", () => {
  const eventManifest = createStoryModelingSourceManifest({ projectId: "long-night", sources: [{ ...source("event-source.event.a", 480, []), sourceKind: "event", sourceOrigin: "structured-event" }] });
  const recommendation = recommendStoryModelingScope({ manifest: eventManifest, changedSourceIds: ["event-source.event.a"], structuralChange: true });
  assert.equal(recommendation.scopeKind, "incremental");
  assert.match(recommendation.reason, /Event 证据分析/u);
  const scope = { kind: "full-book" as const, sourceIds: ["event-source.event.a"] };
  assert.throws(() => normalizeStoryModelingRequest({ projectId: "long-night", operationId: "story-modeling-operation.event-only", tool: "analyze-core-story", trigger: "author-requested", scope, manifest: eventManifest, eventRefs: [], selectedPerspectiveRefs: [], estimate: estimateStoryModelingRun({ manifest: eventManifest, scope, eventCount: 0 }), authorConfirmedAt: "2026-09-02T01:00:00.000Z" }), /requires original prose/u);
});

test("perspective request preserves the author's exact 1–5 versioned Owner references", () => {
  const eventRef = { version: "story-studio-event-reference/v1" as const, projectId: "long-night", eventId: "event.a", revisionToken: "b".repeat(64), state: "planned" as const, requestedUse: "constraint" as const };
  const eventManifest = createStoryModelingSourceManifest({ projectId: "long-night", sources: [{ ...source("event-source.event.a", 480, []), sourceKind: "event", sourceOrigin: "structured-event" }] });
  const scope = { kind: "selection" as const, sourceIds: ["event-source.event.a"], eventRefs: [eventRef], unitIds: [] };
  const refs = [
    { objectId: "character.lin", objectType: "character" as const, ownerId: "long-night", version: "character.lin.r1", scope: "project" as const, label: "林昭" },
    { objectId: "location.harbor", objectType: "location" as const, ownerId: "long-night", version: "location.harbor.r2", scope: "project" as const, label: "雾港" },
    { objectId: "item.signal", objectType: "item" as const, ownerId: "long-night", version: "item.signal.r3", scope: "selection" as const, label: "暗号" }
  ];
  const normalized = normalizeStoryModelingRequest({ projectId: "long-night", operationId: "story-modeling-operation.perspective", tool: "analyze-perspective", trigger: "author-requested", scope, manifest: eventManifest, eventRefs: [eventRef], selectedPerspectiveRefs: refs, estimate: estimateStoryModelingRun({ manifest: eventManifest, scope, eventCount: 1 }), authorConfirmedAt: "2026-09-02T01:00:00.000Z" });
  assert.deepEqual(normalized.selectedPerspectiveRefs, refs);
  assert.deepEqual(normalizeStoryModelingRequest({ ...normalized, selectedPerspectiveRefs: refs.slice(0, 1) }).selectedPerspectiveRefs, refs.slice(0, 1));
  assert.throws(() => normalizeStoryModelingRequest({ ...normalized, selectedPerspectiveRefs: [] }), /requires 1–5/u);
});

test("token and request estimates are bounded and missing price never becomes zero cost", () => {
  const scope = { kind: "full-book" as const, sourceIds: manifest.sources.map((item) => item.sourceId) };
  const unknown = estimateStoryModelingRun({ manifest, scope, eventCount: 12 });
  assert.equal(unknown.cost.status, "unavailable");
  assert.ok(unknown.providerRequestRange.max >= unknown.providerRequestRange.min);
  const priced = estimateStoryModelingRun({ manifest, scope, eventCount: 12, price: { currency: "USD", inputPerMillionTokens: .8, outputPerMillionTokens: 2.4, source: "provider-model-catalog" } });
  assert.equal(priced.cost.status, "available");
  if (priced.cost.status === "available") assert.ok(priced.cost.max > 0);
});

test("author confirmation is mandatory and creates a candidate-only modeling Run", () => {
  const scope = { kind: "incremental" as const, changedSourceIds: ["chapter.2"], dependencySourceIds: ["chapter.1", "chapter.3"] };
  const estimate = estimateStoryModelingRun({ manifest, scope, eventCount: 6 });
  const request = normalizeStoryModelingRequest({ projectId: "long-night", operationId: "story-modeling-operation.1", tool: "smart-relations", trigger: "author-requested", scope, manifest, eventRefs: [], estimate, authorConfirmedAt: "2026-09-02T01:00:00.000Z" });
  const run = createStoryModelingRun({ request, runId: "story-modeling-run.1", now: "2026-09-02T01:00:01.000Z" });
  assert.equal(run.status, "created");
  assert.equal(run.provider, null);
  assert.equal(run.actual, null);
  assert.deepEqual(run.affectedSourceIds.sort(), ["chapter.1", "chapter.2", "chapter.3"]);
  assert.throws(() => normalizeStoryModelingRequest({ ...request, authorConfirmedAt: "" }), /confirmation/u);
});

test("smart Relation output is source-bound, deduplicated and reviewed without formal writes", () => {
  const eventRefs = ["event.a", "event.b", "event.c"].map((eventId) => ({ version: "story-studio-event-reference/v1" as const, projectId: "long-night", eventId, revisionToken: "b".repeat(64), state: "draft" as const, requestedUse: "constraint" as const }));
  const scope = { kind: "selection" as const, sourceIds: ["chapter.1"], eventRefs, unitIds: [] };
  const request = normalizeStoryModelingRequest({ projectId: "long-night", operationId: "story-modeling-operation.relations", tool: "smart-relations", trigger: "author-requested", scope, manifest, eventRefs, estimate: estimateStoryModelingRun({ manifest, scope, eventCount: 3 }), authorConfirmedAt: "2026-09-02T01:00:00.000Z" });
  const candidate = relation("relation-candidate.1", "event.a", "event.b");
  const result = validateStoryModelingResult({ request, runId: "story-modeling-run.relations", result: modelingResult("smart-relations", { relationCandidates: [candidate] }) });
  assert.equal(result.relationCandidates.length, 1);
  assert.throws(() => validateStoryModelingResult({ request, runId: "story-modeling-run.relations", result: modelingResult("smart-relations", { relationCandidates: [{ ...candidate, targetEventId: "event.outside" }] }) }), /endpoints/u);
  assert.deepEqual(dedupeSmartRelationCandidates({ candidates: [candidate, { ...candidate, candidateId: "relation-candidate.2" }], existing: [] }).map((item) => item.candidateId), ["relation-candidate.1"]);
  assert.equal(dedupeSmartRelationCandidates({ candidates: [candidate], existing: [{ sourceEventId: "event.a", targetEventId: "event.b", direction: "forward" }] }).length, 0);
  const reviewed = reviewSmartRelationCandidates({ candidates: [candidate], candidateIds: [candidate.candidateId], decision: "accepted", suggestedTypeId: null, suggestedTypeLabel: "类型待确认" });
  assert.equal(reviewed[0]?.reviewState, "accepted");
  assert.equal(reviewed[0]?.suggestedTypeId, null);
});

test("story modeling rejects result families outside the exact confirmed tool", () => {
  const scope = { kind: "full-book" as const, sourceIds: manifest.sources.map((source) => source.sourceId) };
  const request = normalizeStoryModelingRequest({ projectId: "long-night", operationId: "story-modeling-operation.family-gate", tool: "smart-relations", trigger: "author-requested", scope, manifest, eventRefs: [], estimate: estimateStoryModelingRun({ manifest, scope, eventCount: 0, maxOutputTokensPerRequest: 512 }), authorConfirmedAt: "2026-09-02T09:00:00.000Z" });
  assert.throws(() => validateStoryModelingResult({ request, runId: "story-modeling-run.family-gate", result: { tool: "smart-relations", structureFindings: [{ id: "finding.outside-family", kind: "core-line", title: "越界结果", summary: "不应出现在智能连线工具的返回中。", confidence: .8, sourceRefs: [manifest.sources[0]!.sourceId] }], temporalPlacements: [], relationCandidates: [], logicFindings: [], perspectiveMatches: [] } }), /outside the confirmed tool family/u);
});

function source(sourceId: string, characterCount: number, dependencySourceIds: string[]) {
  return { sourceId, sourceKind: "chapter" as "chapter" | "event", sourceOrigin: "original-prose" as "original-prose" | "structured-event", label: sourceId, revision: `${sourceId}.revision.1`, contentDigest: `sha256:${"a".repeat(64)}` as const, characterCount, dependencySourceIds };
}

function modelingResult(tool: "smart-relations", overrides: Record<string, unknown> = {}) { return { tool, structureFindings: [], temporalPlacements: [], relationCandidates: [], logicFindings: [], perspectiveMatches: [], ...overrides }; }

function relation(candidateId: string, sourceEventId: string, targetEventId: string): SmartRelationCandidate {
  return { candidateId, sourceEventId, targetEventId, suggestedTypeId: "causes", suggestedTypeLabel: "促使", direction: "forward", confidence: .82, rationale: "后续行动直接回应前一事件。", evidenceRefs: [`event:${sourceEventId}`, `event:${targetEventId}`], reviewState: "candidate", sourceRunId: "story-modeling-run.relations" };
}
