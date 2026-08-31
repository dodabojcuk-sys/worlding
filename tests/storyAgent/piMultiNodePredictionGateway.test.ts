import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createPiMultiNodePredictionGateway, TIAN_YI_PREDICTION_TOOL_ALLOWLIST } from "../../src/storyAgent/piMultiNodePredictionGateway.ts";
import type { TianyiAgentRuntimeEvent } from "../../src/storyContracts/tianyiAgentMode.ts";

const sourceRefs = ["one", "two", "three"].map((id) => ({
  version: "story-studio-event-reference/v1" as const,
  projectId: "long-night",
  eventId: `event.${id}`,
  revisionToken: "a".repeat(64),
  state: "planned" as const,
  requestedUse: "constraint" as const
}));

test("real Pi Agent package executes the six-tool prediction loop against a networkless stub model", async () => {
  const events: TianyiAgentRuntimeEvent[] = [];
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error("network forbidden"); }) as typeof fetch;
  try {
    const bundle = await createPiMultiNodePredictionGateway({ now: () => "2026-08-31T00:00:00.000Z" }).generate({
      request: { projectId: "long-night", sourceEventRefs: sourceRefs, authorGoal: "推演后续", predictionMode: "forward-development", operationId: "prediction.operation.pi" },
      knownEvents: sourceRefs.map((reference, index) => ({ id: reference.eventId, title: ["暗号传递", "仓库对峙", "旧仓库封锁"][index]! })),
      bundleId: "prediction-bundle.pi",
      runtime: { runId: "prediction-run.pi", attemptId: "agent-attempt.pi.1", workVersionId: "work-version.pi", sessionId: "prediction-session.pi", onEvent(event) { events.push(event); } }
    });
    assert.ok(bundle.paths.length >= 2);
    assert.deepEqual(events.filter((event) => event.type === "TianyiAgentToolStarted").map((event) => event.type === "TianyiAgentToolStarted" ? event.toolName : ""), TIAN_YI_PREDICTION_TOOL_ALLOWLIST);
    assert.equal(events.some((event) => event.type === "TianyiAgentGateCompleted" && event.gate === "time"), true);
    assert.equal(events.at(-1)?.type, "TianyiAgentCandidatesReady");
    assert.equal(fetchCalls, 0, "the Pi loop used the injected local stub and made no real Provider or network call");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("prediction Pi runtime pins official MIT packages and exposes only the product allowlist", () => {
  const core = JSON.parse(readFileSync("node_modules/@earendil-works/pi-agent-core/package.json", "utf8")) as { version: string; license: string };
  const ai = JSON.parse(readFileSync("node_modules/@earendil-works/pi-ai/package.json", "utf8")) as { version: string; license: string };
  assert.deepEqual({ core: core.version, ai: ai.version }, { core: "0.84.4", ai: "0.84.4" });
  assert.equal(core.license, "MIT");
  assert.equal(ai.license, "MIT");
  assert.deepEqual(TIAN_YI_PREDICTION_TOOL_ALLOWLIST, ["load_context_pack", "resolve_versioned_event_refs", "inspect_event_relations", "inspect_time_constraints", "evaluate_story_consistency", "emit_candidate_subgraph"]);
  assert.equal(TIAN_YI_PREDICTION_TOOL_ALLOWLIST.some((name) => /bash|shell|filesystem|http|database|event_write|relation_write|canon|worldstate/iu.test(name)), false);
});
