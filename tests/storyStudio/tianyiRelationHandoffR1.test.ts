import test from "node:test";
import assert from "node:assert/strict";

import { readTianyiRelationHandoff } from "../../apps/story-studio/src/components/tianyi/workspace/tianyiRelationHandoff.ts";

test("relation handoff preserves distinct endpoint materials and exact event revisions", () => {
  const params = new URLSearchParams("tianyiSource=relations&relationRef=relation.7&relationLabel=%E9%A9%BB%E6%B8%AF%E8%B0%83%E6%9F%A5&relationSource=place.fog&relationTarget=char.lin&relationDirection=forward&materialRef=place.fog&materialRef=char.lin&materialRef=char.lin&eventRef=event.port&eventRevision=event-r3");
  assert.deepEqual(readTianyiRelationHandoff(params), {
    active: true,
    relationId: "relation.7",
    relationLabel: "驻港调查",
    sourceObjectId: "place.fog",
    targetObjectId: "char.lin",
    direction: "forward",
    materialIds: ["place.fog", "char.lin"],
    eventRefs: [{ eventId: "event.port", revision: "event-r3" }]
  });
});

test("incomplete event identity is rejected instead of borrowing a current revision", () => {
  const params = new URLSearchParams("tianyiSource=relations&eventRef=event.port&materialRef=place.fog");
  assert.deepEqual(readTianyiRelationHandoff(params).eventRefs, []);
});

test("unknown relation direction is not reinterpreted", () => {
  const value = readTianyiRelationHandoff(new URLSearchParams("tianyiSource=relations&relationDirection=sideways"));
  assert.equal(value.direction, null);
});
