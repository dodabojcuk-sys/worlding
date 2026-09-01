import assert from "node:assert/strict";
import test from "node:test";

import {
  createTemporalProjectionRun,
  normalizeTemporalProjectionRequest,
  validateTemporalProjectionResult
} from "../../src/storyContracts/temporalProjection.ts";
import { createDeterministicTemporalProjectionGateway } from "../../src/storyAgent/temporalProjectionGateway.ts";

const HASH = "a".repeat(64);
const PROJECT = "long-night-semantic-time";
const ref = (eventId: string, revisionToken = HASH) => ({ version: "story-studio-event-reference/v1" as const, projectId: PROJECT, eventId, revisionToken, state: "committed" as const, requestedUse: "constraint" as const });
const request = normalizeTemporalProjectionRequest({ projectId: PROJECT, graphRevisionHash: HASH, eventRefs: [ref("event.fire"), ref("event.departure"), ref("event.signal"), ref("event.orphan")], operationId: "temporal-operation.revision-a", trigger: "author-requested" });

test("temporal projection request is version-bound, project scoped and duplicate free", () => {
  assert.equal(request.eventRefs.length, 4);
  assert.throws(() => normalizeTemporalProjectionRequest({ ...request, eventRefs: [ref("event.fire"), ref("event.fire")] }), /duplicated/u);
  assert.throws(() => normalizeTemporalProjectionRequest({ ...request, eventRefs: [{ ...ref("event.fire"), projectId: "another-project" }] }), /another project/u);
  assert.throws(() => normalizeTemporalProjectionRequest({ ...request, eventRefs: [{ ...ref("event.fire"), revisionToken: "stale" }] }), /revision/u);
});

test("a semantic projection anchors known time, distributes unknown Events and reserves unplaced for no evidence", async () => {
  const result = await createDeterministicTemporalProjectionGateway().generate({
    request,
    events: [
      { id: "event.fire", title: "灯塔失火", summary: "", tags: [], storyOrder: 0, authoredTimeLabel: "第2夜", authoredTimeKind: "exact" },
      { id: "event.departure", title: "雾港启航", summary: "", tags: [], storyOrder: 1, authoredTimeLabel: null, authoredTimeKind: "unknown" },
      { id: "event.signal", title: "异常信号增强", summary: "", tags: [], storyOrder: 2, authoredTimeLabel: "第4夜", authoredTimeKind: "exact" },
      { id: "event.orphan", title: "无证据片段", summary: "", tags: [], storyOrder: null, authoredTimeLabel: null, authoredTimeKind: "unknown" }
    ],
    relations: [
      { id: "relation.fire-departure", sourceEventId: "event.fire", targetEventId: "event.departure", label: "促使", strictBefore: true, confirmed: true },
      { id: "relation.departure-signal", sourceEventId: "event.departure", targetEventId: "event.signal", label: "导致", strictBefore: true, confirmed: true }
    ]
  });
  const validated = validateTemporalProjectionResult({ request, result });
  const anchor = validated.placements.find((item) => item.versionedEventRef.eventId === "event.fire")!;
  const inferred = validated.placements.find((item) => item.versionedEventRef.eventId === "event.departure")!;
  const orphan = validated.placements.find((item) => item.versionedEventRef.eventId === "event.orphan")!;
  assert.equal(anchor.placementKind, "anchored");
  assert.equal(inferred.placementKind, "inferred");
  assert.ok(inferred.relativePosition > anchor.relativePosition);
  assert.equal(inferred.authoredTimeLabel, null);
  assert.match(inferred.authorFacingSummary, /AI/u);
  assert.equal(orphan.placementKind, "unplaced");
  assert.equal(Object.hasOwn(inferred, "worldTime"), false);
  assert.equal(JSON.stringify(validated).match(/"placementKind":"unplaced"/gu)?.length, 1);
});

test("weak story order produces an ambiguous window rather than a fake date", async () => {
  const weakRequest = normalizeTemporalProjectionRequest({ ...request, eventRefs: [ref("event.weak")] });
  const result = await createDeterministicTemporalProjectionGateway().generate({ request: weakRequest, events: [{ id: "event.weak", title: "雨幕中的脚步", summary: "", tags: [], storyOrder: 3, authoredTimeLabel: null, authoredTimeKind: "unknown" }], relations: [] });
  assert.equal(result.placements[0]?.placementKind, "ambiguous");
  assert.ok(result.placements[0]?.inferredWindow);
  assert.equal(result.placements[0]?.authoredTimeLabel, null);
});

test("late weak-order evidence stays inside a valid ambiguous window", async () => {
  const weakRequest = normalizeTemporalProjectionRequest({ ...request, eventRefs: [ref("event.late-weak")] });
  const result = await createDeterministicTemporalProjectionGateway().generate({ request: weakRequest, events: [{ id: "event.late-weak", title: "后段雨声", summary: "", tags: [], storyOrder: 40, authoredTimeLabel: null, authoredTimeKind: "unknown" }], relations: [] });
  const validated = validateTemporalProjectionResult({ request: weakRequest, result });
  assert.ok(validated.placements[0]!.inferredWindow!.start <= validated.placements[0]!.inferredWindow!.end);
});

test("a long relation-only chain keeps every inferred window valid", async () => {
  const refs = Array.from({ length: 12 }, (_, index) => ref(`event.chain-${index}`));
  const chainRequest = normalizeTemporalProjectionRequest({ ...request, eventRefs: refs });
  const result = await createDeterministicTemporalProjectionGateway().generate({
    request: chainRequest,
    events: refs.map((item, index) => ({ id: item.eventId, title: `链节 ${index + 1}`, summary: "", tags: [], storyOrder: index, authoredTimeLabel: null, authoredTimeKind: "unknown" as const })),
    relations: refs.slice(0, -1).map((item, index) => ({ id: `relation.chain-${index}`, sourceEventId: item.eventId, targetEventId: refs[index + 1]!.eventId, label: "促使", strictBefore: true, confirmed: true }))
  });
  const validated = validateTemporalProjectionResult({ request: chainRequest, result });
  assert.equal(validated.placements.every((item) => item.inferredWindow === null || item.inferredWindow.start <= item.inferredWindow.end), true);
});

test("a strict before/after cycle remains a conflict instead of being hard sorted", async () => {
  const cycleRequest = normalizeTemporalProjectionRequest({ ...request, eventRefs: [ref("event.a"), ref("event.b")] });
  const result = await createDeterministicTemporalProjectionGateway().generate({
    request: cycleRequest,
    events: [
      { id: "event.a", title: "A", summary: "", tags: [], storyOrder: 0, authoredTimeLabel: null, authoredTimeKind: "unknown" },
      { id: "event.b", title: "B", summary: "", tags: [], storyOrder: 1, authoredTimeLabel: null, authoredTimeKind: "unknown" }
    ],
    relations: [
      { id: "relation.a-b", sourceEventId: "event.a", targetEventId: "event.b", label: "before", strictBefore: true, confirmed: true },
      { id: "relation.b-a", sourceEventId: "event.b", targetEventId: "event.a", label: "before", strictBefore: true, confirmed: true }
    ]
  });
  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(new Set(result.placements.map((item) => item.placementKind)), new Set(["conflict"]));
});

test("schema rejects duplicated, stale, out-of-scope and internal Agent output", () => {
  const basePlacement = {
    versionedEventRef: ref("event.fire"), placementKind: "anchored", relativePosition: 100, segmentId: "temporal-segment.anchor", authoredTimeLabel: "第2夜", inferredWindow: null,
    anchorBeforeEventIds: [], anchorAfterEventIds: [], confidence: 1, evidenceRefs: ["event-time.event.fire"], authorFacingSummary: "正式时间已确认。", alternatives: []
  };
  const scoped = normalizeTemporalProjectionRequest({ ...request, eventRefs: [ref("event.fire")] });
  const result = { placements: [basePlacement], segments: [{ id: "temporal-segment.anchor", order: 0, label: "时间锚点", kind: "authored_anchor", startAnchorEventIds: ["event.fire"], endAnchorEventIds: ["event.fire"], confidence: 1 }], conflicts: [] };
  assert.doesNotThrow(() => validateTemporalProjectionResult({ request: scoped, result }));
  assert.throws(() => validateTemporalProjectionResult({ request: scoped, result: { ...result, placements: [basePlacement, basePlacement] } }), /more than once|exactly once/u);
  assert.throws(() => validateTemporalProjectionResult({ request: scoped, result: { ...result, placements: [{ ...basePlacement, versionedEventRef: { ...ref("event.fire"), revisionToken: "b".repeat(64) } }] } }), /stale|out of scope/u);
  assert.throws(() => validateTemporalProjectionResult({ request: scoped, result: { ...result, prompt: "hidden" } }), /fields/u);
  assert.throws(() => validateTemporalProjectionResult({ request: scoped, result: { ...result, placements: [{ ...basePlacement, model: "hidden" }] } }), /fields/u);
});

test("a created Run carries the graph revision without creating a formal time fact", () => {
  const run = createTemporalProjectionRun({ ...request, runId: "temporal-run.revision-a", createdAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(run.status, "created");
  assert.equal(run.graphRevisionHash, HASH);
  assert.deepEqual(run.placements, []);
  assert.equal(JSON.stringify(run).includes("worldTime"), false);
});
