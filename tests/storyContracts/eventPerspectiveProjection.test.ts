import assert from "node:assert/strict";
import test from "node:test";

import { buildPerspectiveComparison, buildSinglePerspectiveProjection, listPerspectiveObjects, perspectiveModeForSelection } from "../../src/storyContracts/eventPerspectiveProjection.ts";

test("perspective comparison uses formal metadata and relations without requiring Provider output", () => {
  const events = [
    { id: "event.a", title: "暗号传递", tags: ["人物：林昭", "地点：雾港", "知情：林昭=已知"] },
    { id: "event.b", title: "仓库对峙", tags: ["人物：林昭", "地点：仓库"] },
    { id: "event.c", title: "港区封锁", tags: ["地点：雾港"] }
  ];
  const objects = listPerspectiveObjects(events);
  const character = objects.find((object) => object.label === "林昭")!;
  const harbor = objects.find((object) => object.label === "雾港")!;
  const projection = buildPerspectiveComparison({ events, relations: [{ sourceEventId: "event.a", targetEventId: "event.c", reviewState: "confirmed" }], selected: [character, harbor] });
  assert.deepEqual(projection.map((item) => item.eventId), ["event.a", "event.b", "event.c"]);
  assert.equal(projection[0]?.matches[0]?.knowledgeState, "known");
  assert.equal(projection.find((item) => item.eventId === "event.c")?.matches.some((match) => match.relationKind === "upstream"), true);
  assert.equal(projection[0]?.mode, "compare");
});

test("single perspective defaults to evidence-backed events and reveals blind spots only when requested", () => {
  const character = { id: "character.lin", type: "character" as const, label: "林昭", ownerId: "long-night", version: "character.lin.r1", formal: true };
  const projection = buildSinglePerspectiveProjection({ events: [
    { id: "event.a", title: "暗号传递", tags: ["人物：林昭"] },
    { id: "event.b", title: "错误口令", tags: ["知情：林昭=误解"] },
    { id: "event.c", title: "密室决议", tags: ["人物：顾舟"] }
  ], relations: [], selected: character });
  assert.deepEqual(projection.map((item) => item.matches[0]?.visibility), ["experienced", "misunderstood"]);
  const withBlindSpots = buildSinglePerspectiveProjection({ events: [
    { id: "event.a", title: "暗号传递", tags: ["人物：林昭"] },
    { id: "event.b", title: "错误口令", tags: ["知情：林昭=误解"] },
    { id: "event.c", title: "密室决议", tags: ["人物：顾舟"] }
  ], relations: [], selected: character, includeBlindSpots: true });
  assert.deepEqual(withBlindSpots.map((item) => item.matches[0]?.visibility), ["experienced", "misunderstood", "blind-spot"]);
  assert.equal(withBlindSpots[2]?.matches[0]?.knowledgeState, "unknown");
  assert.equal(withBlindSpots[2]?.matches[0]?.evidenceRefs.includes("owner:long-night@character.lin.r1"), true);
});

test("single perspective returns an honest empty projection when no formal evidence exists", () => {
  const projection = buildSinglePerspectiveProjection({
    events: [{ id: "event.hidden", title: "密会", tags: ["人物：顾舟"] }],
    relations: [],
    selected: { id: "character.lin", type: "character", label: "林昭", ownerId: "character-owner", version: "r3", formal: true }
  });
  assert.deepEqual(projection, []);
});

test("selection cardinality switches deterministically between single and compare modes", () => {
  const one = [{ id: "character.lin", type: "character" as const, label: "林昭" }];
  assert.equal(perspectiveModeForSelection(one), "single");
  assert.equal(perspectiveModeForSelection([...one, { id: "location.harbor", type: "location", label: "雾港" }]), "compare");
  assert.equal(perspectiveModeForSelection([]), null);
});

test("single perspective distinguishes witnessed evidence from direct participation", () => {
  const projection = buildSinglePerspectiveProjection({
    events: [{ id: "event.witnessed", title: "隔岸目击", tags: ["目击：林昭"] }],
    relations: [],
    selected: { id: "character.lin", type: "character", label: "林昭", ownerId: "character-owner", version: "r2", formal: true }
  });
  assert.equal(projection[0]?.matches[0]?.visibility, "witnessed");
  assert.equal(projection[0]?.matches[0]?.relationKind, "formal-participation");
});
