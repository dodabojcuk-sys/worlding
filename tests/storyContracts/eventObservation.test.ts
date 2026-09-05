import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEventParticipationProjection,
  buildFocusTrajectoryOverlay,
  eventObservationCombinationSupport,
  eventObservationLegacyView,
  eventTaskSearchParams,
  eventObservationStateFromLegacyView,
  normalizeEventObservationState,
  parseEventObservationState,
  resolveEventTaskPreset,
  serializeEventObservationState
} from "../../src/storyContracts/eventObservation.ts";

const objects = [
  { id: "character.jiang", type: "character" as const, label: "江月", ownerId: "project.long-night", version: "r3", formal: true },
  { id: "location.harbor", type: "location" as const, label: "雾港", ownerId: "project.long-night", version: "r2", formal: true },
  { id: "item.cube", type: "item" as const, label: "雾灯匣", ownerId: "project.long-night", version: "r4", formal: true },
  { id: "character.tag-only", type: "character" as const, label: "标签对象", formal: false }
];

test("event-line deep links converge on one task preset without inventing another route", () => {
  assert.deepEqual(resolveEventTaskPreset(""), { task: "story", migratedLegacyState: false, unrecognizedLegacyState: false });
  assert.deepEqual(resolveEventTaskPreset("?eventView=timeline"), { task: "time", migratedLegacyState: true, unrecognizedLegacyState: false });
  assert.deepEqual(resolveEventTaskPreset("?eventLens=participation"), { task: "story", migratedLegacyState: true, unrecognizedLegacyState: false });
  assert.deepEqual(resolveEventTaskPreset("?eventTask=relationship"), { task: "relationship", migratedLegacyState: false, unrecognizedLegacyState: false });
  assert.deepEqual(resolveEventTaskPreset("?eventView=lost-mode"), { task: "story", migratedLegacyState: true, unrecognizedLegacyState: true });
  assert.equal(eventTaskSearchParams("?eventView=timeline&eventLens=participation&keep=yes", "audit").toString(), "keep=yes&eventTask=audit");
});

test("observation state migrates legacy peer views into coordinate and lens axes", () => {
  const perspective = eventObservationStateFromLegacyView("perspective", objects);
  assert.equal(perspective.layout, "narrative");
  assert.equal(perspective.lens, "character-perspective");
  assert.equal(eventObservationLegacyView(perspective), "perspective");
  assert.deepEqual(eventObservationStateFromLegacyView("timeline", objects), {
    version: "tianyan-event-observation/v2",
    layout: "world-time",
    lens: "none",
    layers: ["source-evidence"],
    focusObjectIds: [],
    scale: "unit",
    renderMode: "trajectory"
  });
});

test("saved observation state keeps only validated view fields and drops missing or informal focus", () => {
  const state = normalizeEventObservationState({
    version: "unexpected",
    layout: "world-time",
    lens: "participation",
    layers: ["source-evidence", "source-evidence", "not-a-layer"],
    focusObjectIds: ["character.jiang", "missing", "character.tag-only", "location.harbor"],
    scale: "event",
    eventBody: "must not persist",
    canon: { rewritten: true }
  }, objects);
  assert.deepEqual(state.focusObjectIds, ["character.jiang", "location.harbor"]);
  assert.deepEqual(JSON.parse(serializeEventObservationState(state)), {
    version: "tianyan-event-observation/v2",
    layout: "world-time",
    lens: "participation",
    layers: ["source-evidence"],
    focusObjectIds: ["character.jiang", "location.harbor"],
    scale: "event",
    renderMode: "matrix"
  });
});

test("invalid saved state safely falls back and unsupported combinations are coerced only during recovery", () => {
  assert.equal(parseEventObservationState("{broken", "graph", objects).layout, "relation-network");
  const recovered = normalizeEventObservationState({ layout: "structure", lens: "participation", focusObjectIds: [], layers: [], scale: "unit" }, objects);
  assert.equal(recovered.layout, "narrative");
  assert.deepEqual(eventObservationCombinationSupport("structure", "participation"), { supported: false, reason: "参与镜头本轮只支持叙事顺序与世界时间坐标。" });
  assert.equal(eventObservationCombinationSupport("world-time", "participation").supported, true);
  assert.equal(eventObservationCombinationSupport("narrative", "relationship-evolution").supported, false);
});

test("participation keeps direct, witnessed, explicit absence and unknown distinct", () => {
  const projection = buildEventParticipationProjection({
    objects,
    focusObjectIds: ["character.jiang", "location.harbor", "item.cube", "character.tag-only"],
    layout: "narrative",
    events: [
      { id: "event.direct", title: "雾港交接", tags: ["人物：江月", "地点：雾港", "物品：雾灯匣", "时间：2026-09-03"] },
      { id: "event.witness", title: "远处目击", tags: ["目击：江月", "时间：2026-09-02"] },
      { id: "event.absent", title: "密室议事", tags: ["缺席：江月", "时间：未知"] },
      { id: "event.unknown", title: "未署名来客", tags: [] }
    ]
  });
  assert.deepEqual(projection.objects.map((object) => object.id), ["character.jiang", "location.harbor", "item.cube"]);
  assert.deepEqual(projection.columns.map((column) => column.cells[0]?.state), ["direct", "witnessed", "explicit-absence", "unknown"]);
  assert.equal(projection.columns[3]?.cells[0]?.state, "unknown", "missing evidence must not mean absence");
  assert.deepEqual(projection.columns[3]?.cells[0]?.evidenceRefs, [], "unknown participation must not claim a participation source");
  assert.equal(projection.columns[0]?.cells[0]?.evidenceRefs.includes("owner:project.long-night@r3"), true);
});

test("focus trajectories keep weak evidence visible while unknown and explicit absence break the path", () => {
  const anchors = [
    { anchorId: "placement.direct-a", event: { id: "event.direct-a", title: "首次出现", tags: ["人物：江月"] } },
    { anchorId: "placement.weak", event: { id: "event.weak", title: "旁人传闻", tags: ["听闻：江月"] } },
    { anchorId: "placement.unknown", event: { id: "event.unknown", title: "证据空白", tags: [] } },
    { anchorId: "placement.direct-b", event: { id: "event.direct-b", title: "再次出现", tags: ["人物：江月"] } },
    { anchorId: "placement.absent", event: { id: "event.absent", title: "明确离场", tags: ["缺席：江月"] } },
    { anchorId: "placement.direct-c", event: { id: "event.direct-c", title: "最终出现", tags: ["人物：江月"] } }
  ];
  const overlay = buildFocusTrajectoryOverlay({
    anchors,
    objects,
    focusObjectIds: ["character.jiang", "location.harbor", "item.cube", "character.tag-only"]
  });

  assert.deepEqual(overlay.objects.map((object) => object.id), ["character.jiang", "location.harbor", "item.cube"]);
  assert.deepEqual(overlay.points.filter((point) => point.objectId === "character.jiang").map((point) => point.state), ["direct", "weak", "direct", "explicit-absence", "direct"]);
  assert.equal(overlay.points.some((point) => point.anchorId === "placement.unknown"), false);
  assert.deepEqual(overlay.segments.map((segment) => [segment.sourcePointId, segment.targetPointId, segment.weak]), [["focus:character.jiang:placement.direct-a", "focus:character.jiang:placement.weak", true]]);
});

test("world-time coordinate differs from narrative order and preserves unknown as unknown", () => {
  const events = [
    { id: "event.revealed-first", title: "先揭示的后果", tags: ["时间：2026-09-03"] },
    { id: "event.revealed-second", title: "后揭示的起因", tags: ["时间：2026-09-01"] },
    { id: "event.relative", title: "约在风暴后", tags: ["时间：之后三天"] },
    { id: "event.invalid-date", title: "无效日期不能排序", tags: ["时间：2026-99-99"] },
    { id: "event.unknown", title: "时间未定", tags: [] }
  ];
  const narrative = buildEventParticipationProjection({ events, objects, focusObjectIds: ["character.jiang"], layout: "narrative" });
  const worldTime = buildEventParticipationProjection({ events, objects, focusObjectIds: ["character.jiang"], layout: "world-time" });
  assert.deepEqual(narrative.columns.map((column) => column.event.id), ["event.revealed-first", "event.revealed-second", "event.relative", "event.invalid-date", "event.unknown"]);
  assert.deepEqual(worldTime.columns.map((column) => column.event.id), ["event.revealed-second", "event.revealed-first", "event.relative", "event.invalid-date", "event.unknown"]);
  assert.equal(worldTime.columns.find((column) => column.event.id === "event.invalid-date")?.temporalGroup, "described");
  assert.equal(worldTime.columns.at(-1)?.time.kind, "unknown");
  assert.equal(worldTime.columns.at(-1)?.temporalGroup, "unknown");
});

test("conflicting direct and absence evidence never silently becomes absence", () => {
  const projection = buildEventParticipationProjection({
    objects,
    focusObjectIds: ["character.jiang"],
    layout: "narrative",
    events: [{ id: "event.conflict", title: "冲突记录", tags: ["人物：江月", "缺席：江月"] }]
  });
  assert.equal(projection.columns[0]?.cells[0]?.state, "direct");
  assert.equal(projection.columns[0]?.cells[0]?.conflict, true);
});

test("character perspective removes locations and items from restored focus", () => {
  const state = normalizeEventObservationState({ layout: "world-time", lens: "character-perspective", layers: ["source-evidence"], focusObjectIds: objects.map((object) => object.id), scale: "unit" }, objects);
  assert.equal(state.layout, "narrative");
  assert.deepEqual(state.focusObjectIds, ["character.jiang"]);
});

test("R11.1 keeps the old matrix reading mode but defaults new participation to trajectory", () => {
  const restored = parseEventObservationState(JSON.stringify({ version: "tianyan-event-observation/v1", layout: "narrative", lens: "participation", layers: [], focusObjectIds: [], scale: "unit" }), null, objects);
  assert.equal(restored.renderMode, "matrix");
  assert.equal(eventObservationStateFromLegacyView("line", objects).renderMode, "trajectory");
  const projection = buildEventParticipationProjection({ events: [{ id: "event.unknown", title: "未知", tags: [] }], objects, focusObjectIds: ["character.jiang"], layout: "narrative" });
  assert.equal(projection.columns[0]?.cells[0]?.state, "unknown", "render mode cannot turn unknown into absence");
});
