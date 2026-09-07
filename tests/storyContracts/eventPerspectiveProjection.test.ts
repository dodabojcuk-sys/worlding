import assert from "node:assert/strict";
import test from "node:test";

import { buildPerspectiveComparison, buildSinglePerspectiveProjection, listPerspectiveObjects, perspectiveEventsFromKnowledgeProjection, perspectiveModeForSelection } from "../../src/storyContracts/eventPerspectiveProjection.ts";
import type { EventStoryCrossingKnowledgeProjection } from "../../src/storyContracts/eventStoryCrossingKnowledge.ts";

test("perspective comparison does not turn arbitrary formal relations into knowledge", () => {
  const events = [
    { id: "event.a", title: "暗号传递", tags: ["人物：林昭", "地点：雾港"], participantSubjectIds: ["character.lin"], knowledgeBySubjectId: { "character.lin": "known" as const } },
    { id: "event.b", title: "仓库对峙", tags: ["人物：林昭", "地点：仓库"], participantSubjectIds: ["character.lin"] },
    { id: "event.c", title: "港区封锁", tags: ["地点：雾港"] }
  ];
  const character = { id: "character.lin", type: "character" as const, label: "林昭", ownerId: "long-night", version: "character.lin.r1", formal: true };
  const observer = { id: "character.observer", type: "character" as const, label: "观察者", ownerId: "long-night", version: "character.observer.r1", formal: true };
  const projection = buildPerspectiveComparison({ events, relations: [{ sourceEventId: "event.a", targetEventId: "event.c", reviewState: "confirmed" }], selected: [character, observer] });
  assert.deepEqual(projection.map((item) => item.eventId), ["event.a", "event.b", "event.c"]);
  assert.equal(projection[0]?.matches[0]?.knowledgeState, "known");
  assert.equal(projection.find((item) => item.eventId === "event.c")?.matches.every((match) => match.visibility === "blind-spot"), true);
  assert.equal(projection[0]?.mode, "compare");
});

test("a confirmed upstream relation without propagation evidence stays a blind spot", () => {
  const selected = { id: "character.lin", type: "character" as const, label: "林昭", ownerId: "long-night", version: "character.lin.r1", formal: true };
  const projection = buildSinglePerspectiveProjection({
    events: [
      { id: "event.a", title: "林昭在码头", tags: ["人物：林昭"], participantSubjectIds: ["character.lin"] },
      { id: "event.b", title: "密室决议", tags: [] }
    ],
    relations: [{ sourceEventId: "event.a", targetEventId: "event.b", reviewState: "confirmed" }],
    selected,
    includeBlindSpots: true
  });
  assert.equal(projection[1]?.matches[0]?.knowledgeState, "unknown");
  assert.equal(projection[1]?.matches[0]?.visibility, "blind-spot");
  assert.equal(projection[1]?.matches[0]?.relationKind, "none");
});

test("single perspective defaults to evidence-backed events and reveals blind spots only when requested", () => {
  const character = { id: "character.lin", type: "character" as const, label: "林昭", ownerId: "long-night", version: "character.lin.r1", formal: true };
  const projection = buildSinglePerspectiveProjection({ events: [
    { id: "event.a", title: "暗号传递", tags: ["人物：林昭"], participantSubjectIds: ["character.lin"] },
    { id: "event.b", title: "错误口令", tags: [], knowledgeBySubjectId: { "character.lin": "misunderstood" as const } },
    { id: "event.c", title: "密室决议", tags: ["人物：顾舟"] }
  ], relations: [], selected: character });
  assert.deepEqual(projection.map((item) => item.matches[0]?.visibility), ["experienced", "misunderstood"]);
  const withBlindSpots = buildSinglePerspectiveProjection({ events: [
    { id: "event.a", title: "暗号传递", tags: ["人物：林昭"], participantSubjectIds: ["character.lin"] },
    { id: "event.b", title: "错误口令", tags: [], knowledgeBySubjectId: { "character.lin": "misunderstood" as const } },
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
  const one = [{ id: "character.lin", type: "character" as const, label: "林昭", formal: true }];
  assert.equal(perspectiveModeForSelection(one), "single");
  assert.equal(perspectiveModeForSelection([...one, { id: "character.wu", type: "character", label: "阿芜", formal: true }]), "compare");
  assert.equal(perspectiveModeForSelection([...one, { id: "location.harbor", type: "location", label: "雾港", formal: true }]), null);
  assert.equal(perspectiveModeForSelection([]), null);
});

test("places, items and tag-only evidence cannot become psychological perspective owners", () => {
  const event = { id: "event.harbor", title: "港口封锁", tags: ["地点：雾港", "物品：雾灯匣"] };
  assert.deepEqual(buildSinglePerspectiveProjection({ events: [event], relations: [], selected: { id: "location.harbor", type: "location", label: "雾港", formal: true } }), []);
  assert.deepEqual(buildSinglePerspectiveProjection({ events: [event], relations: [], selected: { id: "item.cube", type: "item", label: "雾灯匣", formal: true } }), []);
  assert.equal(listPerspectiveObjects([event]).every((object) => object.formal === false), true);
});

test("single perspective distinguishes witnessed evidence from direct participation", () => {
  const projection = buildSinglePerspectiveProjection({
    events: [{ id: "event.witnessed", title: "隔岸目击", tags: ["目击：林昭"], witnessSubjectIds: ["character.lin"] }],
    relations: [],
    selected: { id: "character.lin", type: "character", label: "林昭", ownerId: "character-owner", version: "r2", formal: true }
  });
  assert.equal(projection[0]?.matches[0]?.visibility, "witnessed");
  assert.equal(projection[0]?.matches[0]?.relationKind, "formal-participation");
});

test("same-name formal characters are isolated by stable subject id in the reachable perspective projection", () => {
  const guard = { id: "character.guard", type: "character" as const, label: "林昭", ownerId: "characters", version: "guard.r1", formal: true };
  const cartographer = { id: "character.cartographer", type: "character" as const, label: "林昭", ownerId: "characters", version: "cartographer.r1", formal: true };
  const projection = buildPerspectiveComparison({
    events: [{ id: "event.same-name", title: "守卫目击钟楼", tags: ["人物：林昭", "目击：林昭", "知情：林昭=已知"], participantSubjectIds: [guard.id], knowledgeBySubjectId: { [guard.id]: "known" } }],
    relations: [],
    selected: [guard, cartographer]
  });
  assert.equal(projection[0]?.matches.find((match) => match.object.id === guard.id)?.visibility, "experienced");
  assert.equal(projection[0]?.matches.find((match) => match.object.id === cartographer.id)?.visibility, "blind-spot");
});

test("advanced perspective consumes stable Owner projection ids instead of filtered display tags", () => {
  const guard = { id: "character.guard", type: "character" as const, label: "林昭", ownerId: "characters", version: "guard.r1", formal: true };
  const cartographer = { id: "character.cartographer", type: "character" as const, label: "林昭", ownerId: "characters", version: "cartographer.r1", formal: true };
  const ownerProjection = {
    version: "tianyan-event-story-crossing-knowledge/v2",
    owner: "Event+NarrativeArrangement+CharacterStateProjectionPort",
    writes: 0,
    providerCalls: 0,
    projectId: "project.same-name",
    observer: { id: "author", label: "作者全知", kind: "author" },
    observers: [{ id: "author", label: "作者全知", kind: "author" }],
    mode: "single",
    audience: "author",
    storylines: [],
    visibleEvents: [{ eventId: "event.owner", title: "守卫目击钟楼", status: "committed", revisionToken: "event.r1", relativeId: "event.owner", storylineIds: [], storylineLabels: [], knowledgeState: "experienced", knowledgeLabel: "亲历", sourceEventIds: [], body: null, perspectives: [
      { observerId: guard.id, observerLabel: guard.label, state: "experienced", stateLabel: "亲历" },
      { observerId: cartographer.id, observerLabel: cartographer.label, state: "unknown", stateLabel: "未知" }
    ] }],
    hiddenEventIds: [],
    hiddenCount: 0,
    characterStateProjectionRevision: "projection.r1"
  } satisfies EventStoryCrossingKnowledgeProjection;
  const events = perspectiveEventsFromKnowledgeProjection([{ id: "event.owner", title: "显示标题", tags: [] }], ownerProjection);
  const projection = buildPerspectiveComparison({ events, relations: [], selected: [guard, cartographer] });
  assert.equal(projection[0]?.matches.find((match) => match.object.id === guard.id)?.visibility, "experienced");
  assert.equal(projection[0]?.matches.find((match) => match.object.id === cartographer.id)?.visibility, "unknown");
  assert.equal(projection[0]?.matches.find((match) => match.object.id === cartographer.id)?.relationKind, "none");
  assert.equal(projection[0]?.shared, false);
});
