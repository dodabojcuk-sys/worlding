import assert from "node:assert/strict";
import test from "node:test";

import { buildPerspectiveIntersection, listPerspectiveObjects } from "../../src/storyContracts/eventPerspectiveProjection.ts";

test("perspective intersection uses formal metadata and relations without requiring Provider output", () => {
  const events = [
    { id: "event.a", title: "暗号传递", tags: ["人物：林昭", "地点：雾港", "知情：林昭=已知"] },
    { id: "event.b", title: "仓库对峙", tags: ["人物：林昭", "地点：仓库"] },
    { id: "event.c", title: "港区封锁", tags: ["地点：雾港"] }
  ];
  const objects = listPerspectiveObjects(events);
  const character = objects.find((object) => object.label === "林昭")!;
  const harbor = objects.find((object) => object.label === "雾港")!;
  const projection = buildPerspectiveIntersection({ events, relations: [{ sourceEventId: "event.a", targetEventId: "event.c", reviewState: "confirmed" }], selected: [character, harbor] });
  assert.deepEqual(projection.map((item) => item.eventId), ["event.a", "event.c"]);
  assert.equal(projection[0]?.matches[0]?.knowledgeState, "known");
  assert.equal(projection[1]?.matches.some((match) => match.relationKind === "upstream"), true);
});

test("perspective projection requires an explicit 2–5 object selection", () => {
  assert.deepEqual(buildPerspectiveIntersection({ events: [], relations: [], selected: [] }), []);
});
