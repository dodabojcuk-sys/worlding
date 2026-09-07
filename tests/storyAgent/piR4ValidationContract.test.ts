import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { PI_R4_PROVIDER_BUDGET, PI_R4_SUPPORT_MATRIX, remainingPiR4Requests } from "../../src/storyAgent/piR4ValidationContract.ts";

test("R4 support matrix names each requested semantic area without overstating gaps", () => {
  assert.equal(PI_R4_SUPPORT_MATRIX.length, 13);
  assert.deepEqual(PI_R4_SUPPORT_MATRIX.map((row) => row.id), [
    "character", "alias-and-same-name", "item", "location", "event", "relation", "story-unit",
    "narrative-path-membership", "world-rule", "organization", "relative-time", "misconception", "author-future-intent"
  ]);
  assert.equal(PI_R4_SUPPORT_MATRIX.find((row) => row.id === "world-rule")?.writer, "not-supported");
  assert.equal(PI_R4_SUPPORT_MATRIX.find((row) => row.id === "misconception")?.observation, "supported");
  assert.equal(PI_R4_SUPPORT_MATRIX.find((row) => row.id === "author-future-intent")?.observation, "not-supported");
});

test("R4 budget counts every Provider dispatch and never creates retry headroom implicitly", () => {
  assert.equal(PI_R4_PROVIDER_BUDGET.cap, 6);
  assert.equal(PI_R4_PROVIDER_BUDGET.countBoundary, "provider-dispatch");
  assert.equal(PI_R4_PROVIDER_BUDGET.automaticRetries, 0);
  assert.deepEqual(PI_R4_PROVIDER_BUDGET.includes, ["setup-diagnostic", "generation", "tool-loop-turn", "retry", "repair-verification"]);
  assert.equal(remainingPiR4Requests({ priorProviderDispatches: 4 }), 2);
  assert.equal(remainingPiR4Requests({ priorProviderDispatches: 9 }), 0);
});

test("R4 synthetic cases record expected facts before any live request", () => {
  const fixture = JSON.parse(readFileSync("tests/fixtures/pi-r4-perspective-cases.json", "utf8")) as { providerCalls: number; cases: Array<{ id: string; source: string; expected: string[] }> };
  assert.equal(fixture.providerCalls, 0);
  assert.deepEqual(fixture.cases.map((item) => item.id), ["same-name-alias", "relative-time-item-location", "misconception-future-intent"]);
  assert.ok(fixture.cases.every((item) => item.source.length > 20 && item.expected.length >= 3));
});
