import assert from "node:assert/strict";
import test from "node:test";

import { appendWorldStateN4Change, compensationValueForWorldStateN4, emptyWorldStateN4Store, projectWorldStateN4 } from "../../src/storyContracts/worldStateN4.ts";

const gate = { id: "location.north-gate", revision: "location-r1" };
const key = { id: "item.copper-key", revision: "key-r1" };
const awu = { id: "character.awu", revision: "awu-r1" };
const lin = { id: "character.lin", revision: "lin-r1" };
const event = { kind: "confirmed-event" as const, event: { id: "event.gate-closed", revision: "event-r1" } };

test("N4 world state distinguishes unknown, explicit passage state, holder, and temporal history", () => {
  let store = emptyWorldStateN4Store();
  const first = appendWorldStateN4Change({ store, operationId: "n4.gate.close", subject: gate, effectiveAt: "2026-09-09T01:00:00Z", value: { kind: "passage", state: "closed" }, evidence: event, expectedRevision: 0, now: "2026-09-09T01:00:01Z" });
  store = first.store;
  const second = appendWorldStateN4Change({ store, operationId: "n4.key.awu", subject: key, effectiveAt: "2026-09-09T01:00:00Z", value: { kind: "holder", state: "held", holder: awu }, evidence: event, expectedRevision: 1, now: "2026-09-09T01:00:02Z" });
  store = second.store;
  const third = appendWorldStateN4Change({ store, operationId: "n4.key.lin", subject: key, effectiveAt: "2026-09-09T02:00:00Z", value: { kind: "holder", state: "held", holder: lin }, evidence: event, expectedRevision: 2, now: "2026-09-09T02:00:01Z" });
  store = third.store;
  assert.equal(projectWorldStateN4({ store, subjectId: key.id, observedAt: "2026-09-09T00:30:00Z" }).status, "unknown");
  const before = projectWorldStateN4({ store, subjectId: key.id, observedAt: "2026-09-09T01:30:00Z" });
  assert.deepEqual(before.value, { kind: "holder", state: "held", holder: awu });
  assert.equal(before.effectiveTo, "2026-09-09T02:00:00Z");
  assert.deepEqual(projectWorldStateN4({ store, subjectId: key.id, observedAt: "2026-09-09T02:30:00Z" }).value, { kind: "holder", state: "held", holder: lin });
  assert.deepEqual(projectWorldStateN4({ store, subjectId: gate.id, observedAt: "2026-09-09T02:30:00Z" }).value, { kind: "passage", state: "closed" });
});

test("N4 world state has idempotent bounded changes and compensation retains history", () => {
  const first = appendWorldStateN4Change({ store: emptyWorldStateN4Store(), operationId: "n4.key.awu", subject: key, effectiveAt: "2026-09-09T01:00:00Z", value: { kind: "holder", state: "held", holder: awu }, evidence: event, expectedRevision: 0, now: "2026-09-09T01:00:01Z" });
  const replay = appendWorldStateN4Change({ store: first.store, operationId: "n4.key.awu", subject: key, effectiveAt: "2026-09-09T01:00:00Z", value: { kind: "holder", state: "held", holder: awu }, evidence: event, expectedRevision: 1, now: "2026-09-09T01:00:01Z" });
  assert.equal(replay.idempotent, true);
  const compensation = compensationValueForWorldStateN4({ store: first.store, changeId: first.change.changeId });
  assert.deepEqual(compensation.value, { kind: "holder", state: "unknown", holder: null });
  const rolledBack = appendWorldStateN4Change({ store: first.store, operationId: "n4.key.awu.rollback", expectedRevision: 1, now: "2026-09-09T01:00:02Z", ...compensation });
  const projection = projectWorldStateN4({ store: rolledBack.store, subjectId: key.id, observedAt: "2026-09-09T01:30:00Z" });
  assert.deepEqual(projection.value, { kind: "holder", state: "unknown", holder: null });
  assert.equal(projection.history.length, 2);
  assert.equal(projection.change?.compensatesChangeId, first.change.changeId);
});

test("N4 world state rejects invented holders and stale writes", () => {
  assert.throws(() => appendWorldStateN4Change({ store: emptyWorldStateN4Store(), operationId: "n4.invalid", subject: key, effectiveAt: "2026-09-09T01:00:00Z", value: { kind: "holder", state: "held", holder: null }, evidence: event, expectedRevision: 1, now: "2026-09-09T01:00:01Z" }), /stale|Held/i);
});
