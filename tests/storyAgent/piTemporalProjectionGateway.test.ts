import assert from "node:assert/strict";
import test from "node:test";

import {
  createPiTemporalProjectionGateway,
  TIAN_YI_TEMPORAL_PROJECTION_TOOL_ALLOWLIST
} from "../../src/storyAgent/piTemporalProjectionGateway.ts";
import type { TianyiAgentRuntimeEvent } from "../../src/storyContracts/tianyiAgentMode.ts";

const hash = "c".repeat(64);
const refs = ["fire", "departure", "signal"].map((id) => ({ version: "story-studio-event-reference/v1" as const, projectId: "long-night", eventId: `event.${id}`, revisionToken: hash, state: "committed" as const, requestedUse: "constraint" as const }));

test("real Pi Agent runtime executes the bounded temporal tool loop against the networkless stub", async () => {
  const runtimeEvents: TianyiAgentRuntimeEvent[] = [];
  let fetchCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => { fetchCalls += 1; throw new Error("network forbidden"); }) as typeof fetch;
  try {
    const projection = await createPiTemporalProjectionGateway({ now: () => "2026-09-01T00:00:00.000Z" }).generate({
      request: { projectId: "long-night", graphRevisionHash: hash, eventRefs: refs, operationId: "temporal-operation.pi", trigger: "automatic" },
      events: [
        { id: "event.fire", title: "灯塔失火", summary: "", tags: [], storyOrder: 0, authoredTimeLabel: "第2夜", authoredTimeKind: "exact" },
        { id: "event.departure", title: "雾港启航", summary: "", tags: [], storyOrder: 1, authoredTimeLabel: null, authoredTimeKind: "unknown" },
        { id: "event.signal", title: "异常信号增强", summary: "", tags: [], storyOrder: 2, authoredTimeLabel: "第4夜", authoredTimeKind: "exact" }
      ],
      relations: [
        { id: "relation.fire-departure", sourceEventId: "event.fire", targetEventId: "event.departure", label: "促使", strictBefore: true, confirmed: true },
        { id: "relation.departure-signal", sourceEventId: "event.departure", targetEventId: "event.signal", label: "导致", strictBefore: true, confirmed: true }
      ],
      runtime: { runId: "temporal-run.pi", attemptId: "temporal-attempt.pi.1", onEvent(event) { runtimeEvents.push(event); } }
    });
    assert.equal(projection.placements.length, 3);
    assert.equal(projection.placements.find((item) => item.versionedEventRef.eventId === "event.departure")?.placementKind, "inferred");
    assert.deepEqual(runtimeEvents.filter((event) => event.type === "TianyiAgentToolStarted").map((event) => event.type === "TianyiAgentToolStarted" ? event.toolName : ""), TIAN_YI_TEMPORAL_PROJECTION_TOOL_ALLOWLIST);
    assert.equal(fetchCalls, 0);
    assert.equal(JSON.stringify(projection).includes("modelId"), false);
    assert.equal(JSON.stringify(projection).includes("prompt"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("temporal projection tool allowlist contains no write or transport capability", () => {
  assert.deepEqual(TIAN_YI_TEMPORAL_PROJECTION_TOOL_ALLOWLIST, ["load_context_pack", "resolve_versioned_event_refs", "inspect_event_relations", "inspect_time_constraints", "evaluate_story_consistency", "emit_temporal_projection"]);
  assert.equal(TIAN_YI_TEMPORAL_PROJECTION_TOOL_ALLOWLIST.some((name) => /bash|shell|filesystem|http|database|event_write|relation_write|canon|worldstate/iu.test(name)), false);
});
