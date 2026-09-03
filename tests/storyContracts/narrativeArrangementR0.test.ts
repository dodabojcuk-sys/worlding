import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  NARRATIVE_PLACEMENT_SCHEMA,
  applyNarrativeArrangementMutation,
  createNarrativeArrangement,
  currentPlacements,
  projectNarrativeArrangement,
  rebalancePlacementOrder,
  type NarrativeArrangement,
  type NarrativeArrangementMutation
} from "../../src/storyContracts/narrativeArrangement.ts";
import { stableJson } from "../../src/storyContinuity/continuityValidation.ts";

const time = (second: number) => `2026-09-03T00:00:${String(second).padStart(2, "0")}.000Z`;

function seed() {
  return createNarrativeArrangement({
    projectId: "project.story",
    workVersionId: "work-version.root.story",
    sourceLineageId: "work-version.root.story",
    narrativePathId: "story-unit.main",
    ownerStoryUnitId: "story-unit.main",
    operationId: "arrangement.create",
    authorActionId: "author.arrangement.create",
    createdAt: time(0)
  }).arrangement;
}

function mutate(arrangement: NarrativeArrangement, mutation: Omit<NarrativeArrangementMutation, "expectedRevision" | "sourceKind" | "sourceRef">) {
  return applyNarrativeArrangementMutation(arrangement, {
    ...mutation,
    expectedRevision: arrangement.currentRevision,
    sourceKind: "author-action",
    sourceRef: `author://${mutation.authorActionId}`
  } as NarrativeArrangementMutation, new Set(["story-unit.main", "story-unit.next"]));
}

test("author intent inserts before/after, moves within and across Story Units, and keeps stable Placement identity", () => {
  let arrangement = seed();
  const first = mutate(arrangement, { action: "insert", operationId: "insert.z", authorActionId: "author.insert.z", createdAt: time(1), eventId: "event.z", storyUnitId: "story-unit.main", role: "primary", position: { kind: "end" } });
  assert.equal(first.conflict, false);
  arrangement = first.arrangement;
  const firstPlacementId = currentPlacements(arrangement)[0]!.placementId;

  const before = mutate(arrangement, { action: "insert", operationId: "insert.a", authorActionId: "author.insert.a", createdAt: time(2), eventId: "event.a", storyUnitId: "story-unit.main", role: "flashback", position: { kind: "before", anchorPlacementId: firstPlacementId } });
  assert.equal(before.conflict, false);
  arrangement = before.arrangement;
  assert.deepEqual(currentPlacements(arrangement).sort((a, b) => a.orderKey - b.orderKey).map((placement) => placement.eventId), ["event.a", "event.z"]);

  const after = mutate(arrangement, { action: "insert", operationId: "insert.m", authorActionId: "author.insert.m", createdAt: time(3), eventId: "event.m", storyUnitId: "story-unit.main", role: "reveal", position: { kind: "after", anchorPlacementId: firstPlacementId } });
  assert.equal(after.conflict, false);
  arrangement = after.arrangement;
  assert.deepEqual(currentPlacements(arrangement).sort((a, b) => a.orderKey - b.orderKey).map((placement) => placement.eventId), ["event.a", "event.z", "event.m"]);

  const moved = mutate(arrangement, { action: "move", operationId: "move.z.cross-unit", authorActionId: "author.move.z", createdAt: time(4), placementId: firstPlacementId, storyUnitId: "story-unit.next", position: { kind: "start" } });
  assert.equal(moved.conflict, false);
  arrangement = moved.arrangement;
  assert.equal(currentPlacements(arrangement).find((placement) => placement.placementId === firstPlacementId)?.storyUnitId, "story-unit.next");
  assert.equal(currentPlacements(arrangement).find((placement) => placement.placementId === firstPlacementId)?.eventId, "event.z");
});

test("one Event can have multiple formal Placements without copying Event content", () => {
  let arrangement = seed();
  for (const [index, role] of (["flashback", "reinterpretation"] as const).entries()) {
    const result = mutate(arrangement, { action: "insert", operationId: `insert.repeat.${index}`, authorActionId: `author.repeat.${index}`, createdAt: time(index + 1), eventId: "event.repeat", storyUnitId: "story-unit.main", role, position: { kind: "end" } });
    assert.equal(result.conflict, false);
    arrangement = result.arrangement;
  }
  const placements = currentPlacements(arrangement);
  assert.equal(placements.length, 2);
  assert.equal(new Set(placements.map((placement) => placement.placementId)).size, 2);
  assert.ok(placements.every((placement) => placement.schemaVersion === NARRATIVE_PLACEMENT_SCHEMA));
  assert.ok(placements.every((placement) => !("body" in placement) && !("title" in placement) && !("worldTime" in placement)));
});

test("projection uses formal keys across Story Unit order and never derives narrative order from Event input", () => {
  let arrangement = seed();
  for (const input of [
    { operationId: "insert.a", eventId: "event.a", storyUnitId: "story-unit.next" },
    { operationId: "insert.z", eventId: "event.z", storyUnitId: "story-unit.main" }
  ]) {
    const result = mutate(arrangement, { action: "insert", authorActionId: `author.${input.operationId}`, createdAt: time(arrangement.currentRevision), role: "primary", position: { kind: "end" }, ...input });
    assert.equal(result.conflict, false);
    arrangement = result.arrangement;
  }
  const base = { projectId: arrangement.projectId, workVersionId: arrangement.workVersionId, narrativePathId: arrangement.narrativePathId, storyUnits: [{ storyUnitId: "story-unit.main", order: 0 }, { storyUnitId: "story-unit.next", order: 1 }], arrangement };
  const forward = projectNarrativeArrangement({ ...base, eventIds: ["event.a", "event.z", "event.unplaced"] });
  const reverse = projectNarrativeArrangement({ ...base, eventIds: ["event.unplaced", "event.z", "event.a"] });
  assert.deepEqual(forward.placed.map((placement) => placement.eventId), ["event.z", "event.a"]);
  assert.deepEqual(reverse.placed.map((placement) => placement.eventId), ["event.z", "event.a"]);
  assert.deepEqual(Object.keys(reverse.unplaced), ["event.unplaced"]);
  assert.equal(reverse.unplaced["event.unplaced"]?.narrativeIndex, null);
});

test("legacy projection returns every Event as unplaced and performs no fallback arrangement", () => {
  const projection = projectNarrativeArrangement({
    projectId: "project.story",
    workVersionId: "work-version.root.story",
    narrativePathId: "story-unit.main",
    eventIds: ["event.z", "event.a", "event.m"],
    storyUnits: [{ storyUnitId: "story-unit.main", order: 0 }],
    arrangement: null
  });
  assert.equal(projection.arrangementId, null);
  assert.deepEqual(projection.placed, []);
  assert.deepEqual(Object.keys(projection.unplaced), ["event.a", "event.m", "event.z"]);
  assert.ok(Object.values(projection.unplaced).every((event) => event.narrativeIndex === null));
});

test("stale revisions, bad anchors, branch mismatch and idempotency reuse are explicit conflicts", () => {
  let arrangement = seed();
  const inserted = mutate(arrangement, { action: "insert", operationId: "insert.one", authorActionId: "author.one", createdAt: time(1), eventId: "event.one", storyUnitId: "story-unit.main", role: "primary", position: { kind: "end" } });
  assert.equal(inserted.conflict, false);
  arrangement = inserted.arrangement;

  const stale = applyNarrativeArrangementMutation(arrangement, { action: "remove", operationId: "remove.stale", authorActionId: "author.stale", sourceKind: "author-action", sourceRef: "author://stale", expectedRevision: 1, createdAt: time(2), placementId: currentPlacements(arrangement)[0]!.placementId }, new Set(["story-unit.main"]));
  assert.equal(stale.conflict && stale.code, "stale-arrangement-revision");
  const anchor = mutate(arrangement, { action: "insert", operationId: "insert.bad-anchor", authorActionId: "author.anchor", createdAt: time(3), eventId: "event.two", storyUnitId: "story-unit.main", role: "primary", position: { kind: "after", anchorPlacementId: "placement.missing" } });
  assert.equal(anchor.conflict && anchor.code, "anchor-not-found");
  const branch = applyNarrativeArrangementMutation(arrangement, { action: "insert", operationId: "insert.wrong-branch", authorActionId: "author.branch", sourceKind: "author-action", sourceRef: "author://branch", expectedRevision: arrangement.currentRevision, createdAt: time(4), eventId: "event.two", storyUnitId: "story-unit.other-branch", role: "primary", position: { kind: "end" } }, new Set(["story-unit.main"]));
  assert.equal(branch.conflict && branch.code, "branch-mismatch");

  const replay = applyNarrativeArrangementMutation(arrangement, { action: "insert", operationId: "insert.one", authorActionId: "author.one", sourceKind: "author-action", sourceRef: "author://author.one", expectedRevision: 1, createdAt: time(1), eventId: "event.one", storyUnitId: "story-unit.main", role: "primary", position: { kind: "end" } }, new Set(["story-unit.main"]));
  assert.equal(replay.conflict, false);
  assert.equal(replay.replayed, true);
  const reused = applyNarrativeArrangementMutation(arrangement, { action: "insert", operationId: "insert.one", authorActionId: "author.one", sourceKind: "author-action", sourceRef: "author://author.one", expectedRevision: 1, createdAt: time(1), eventId: "event.changed", storyUnitId: "story-unit.main", role: "primary", position: { kind: "end" } }, new Set(["story-unit.main"]));
  assert.equal(reused.conflict && reused.code, "idempotency-key-reused");

});

test("read projection exposes duplicate formal keys and dangling references without inventing an order", () => {
  let arrangement = seed();
  for (const [index, eventId] of ["event.one", "event.two"].entries()) {
    const result = mutate(arrangement, { action: "insert", operationId: `insert.conflict.${index}`, authorActionId: `author.conflict.${index}`, createdAt: time(index + 1), eventId, storyUnitId: "story-unit.main", role: "primary", position: { kind: "end" } });
    assert.equal(result.conflict, false);
    arrangement = result.arrangement;
  }
  const head = arrangement.revisions.at(-1)!;
  const conflictedPlacements = head.placements.map((placement, index) => index === 1 ? { ...placement, orderKey: head.placements[0]!.orderKey } : placement);
  const { revisionDigest: _digest, ...headBody } = { ...head, placements: conflictedPlacements };
  const conflictedHead = { ...headBody, revisionDigest: createHash("sha256").update(stableJson(headBody), "utf8").digest("hex") };
  const conflicted: NarrativeArrangement = { ...arrangement, currentVersion: conflictedHead.revisionDigest, revisions: arrangement.revisions.map((revision) => revision.revision === head.revision ? conflictedHead : revision) };
  const orderProjection = projectNarrativeArrangement({ projectId: conflicted.projectId, workVersionId: conflicted.workVersionId, narrativePathId: conflicted.narrativePathId, eventIds: ["event.one", "event.two"], storyUnits: [{ storyUnitId: "story-unit.main", order: 0 }], arrangement: conflicted });
  assert.deepEqual(orderProjection.placed, []);
  assert.equal(orderProjection.conflicts.length, 2);
  assert.ok(orderProjection.conflicts.every((entry) => entry.state === "order-conflict"));
  const danglingProjection = projectNarrativeArrangement({ projectId: arrangement.projectId, workVersionId: arrangement.workVersionId, narrativePathId: arrangement.narrativePathId, eventIds: ["event.one"], storyUnits: [{ storyUnitId: "story-unit.main", order: 0 }], arrangement });
  assert.equal(danglingProjection.conflicts[0]?.state, "dangling-reference");
  assert.equal(danglingProjection.conflicts[0]?.eventId, "event.two");
});

test("rollback appends history and restores a prior formal arrangement revision", () => {
  let arrangement = seed();
  const inserted = mutate(arrangement, { action: "insert", operationId: "insert.rollback", authorActionId: "author.insert", createdAt: time(1), eventId: "event.rollback", storyUnitId: "story-unit.main", role: "primary", position: { kind: "end" } });
  assert.equal(inserted.conflict, false);
  arrangement = inserted.arrangement;
  const removed = mutate(arrangement, { action: "remove", operationId: "remove.rollback", authorActionId: "author.remove", createdAt: time(2), placementId: currentPlacements(arrangement)[0]!.placementId });
  assert.equal(removed.conflict, false);
  arrangement = removed.arrangement;
  assert.equal(currentPlacements(arrangement).length, 0);
  const rolledBack = mutate(arrangement, { action: "rollback", operationId: "rollback.to.two", authorActionId: "author.rollback", createdAt: time(3), targetRevision: 2 });
  assert.equal(rolledBack.conflict, false);
  assert.equal(currentPlacements(rolledBack.arrangement).length, 1);
  assert.equal(rolledBack.receipt.rollbackOfRevision, 2);
  assert.equal(rolledBack.arrangement.revisions.length, 4);
});

test("rebalancing changes only internal keys and leaves visible order intact", () => {
  const arrangement = seed();
  const scope = { arrangementId: arrangement.arrangementId, workVersionId: arrangement.workVersionId, sourceLineageId: arrangement.sourceLineageId, narrativePathId: arrangement.narrativePathId };
  const placements = [
    { schemaVersion: NARRATIVE_PLACEMENT_SCHEMA, placementId: "placement.z", eventId: "event.z", storyUnitId: "story-unit.main", orderKey: 9_000, role: "primary" as const, source: { sourceKind: "author-action" as const, authorActionId: "author.z", sourceRef: "author://z", capturedAt: time(1) }, createdRevision: 2, updatedRevision: 2, ...scope },
    { schemaVersion: NARRATIVE_PLACEMENT_SCHEMA, placementId: "placement.a", eventId: "event.a", storyUnitId: "story-unit.main", orderKey: 20_000, role: "primary" as const, source: { sourceKind: "author-action" as const, authorActionId: "author.a", sourceRef: "author://a", capturedAt: time(2) }, createdRevision: 2, updatedRevision: 2, ...scope }
  ];
  const rebalanced = rebalancePlacementOrder(placements);
  assert.deepEqual(rebalanced.map((placement) => placement.eventId), ["event.z", "event.a"]);
  assert.deepEqual(rebalanced.map((placement) => placement.orderKey), [1_024, 2_048]);
});
