import assert from "node:assert/strict";
import test from "node:test";

import {
  createStoryModelingRun,
  createStoryModelingSourceManifest,
  estimateStoryModelingRun,
  normalizeStoryModelingRequest,
  recommendStoryModelingScope
} from "../../src/storyContracts/storyModeling.ts";

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

function source(sourceId: string, characterCount: number, dependencySourceIds: string[]) {
  return { sourceId, sourceKind: "chapter" as const, revision: `${sourceId}.revision.1`, contentDigest: `sha256:${"a".repeat(64)}` as const, characterCount, dependencySourceIds };
}
