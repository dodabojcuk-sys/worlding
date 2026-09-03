import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildEventNarrativeLayout, buildNarrativeNavigation } from "../../src/storyContracts/eventNarrativeLayout.ts";

test("event narrative layout advances left to right across stable main and branch tracks", () => {
  const events = [
    { id: "event.a", sourceVersion: "a1", order: 0, trackKind: "main" as const },
    { id: "event.b", sourceVersion: "b1", order: 1, trackKind: "main" as const },
    { id: "event.branch", sourceVersion: "c1", order: 2, trackKind: "branch" as const, trackId: "branch.harbor" },
    { id: "event.merge", sourceVersion: "d1", order: 3, trackKind: "main" as const }
  ];
  const projection = buildEventNarrativeLayout({ events, relations: [
    { sourceEventId: "event.a", targetEventId: "event.b", confirmed: true },
    { sourceEventId: "event.a", targetEventId: "event.branch", confirmed: true },
    { sourceEventId: "event.b", targetEventId: "event.merge", confirmed: true },
    { sourceEventId: "event.branch", targetEventId: "event.merge", confirmed: true }
  ] });
  assert.ok(projection.positions["event.a"]!.x < projection.positions["event.b"]!.x);
  assert.ok(projection.positions["event.branch"]!.y > projection.positions["event.a"]!.y);
  assert.ok(projection.positions["event.merge"]!.x > projection.positions["event.branch"]!.x);
  assert.equal(projection.tracks.length, 2);
  assert.ok(projection.tracks[1]!.y - projection.tracks[0]!.y >= 190, "parallel narrative tracks remain visually distinct");
});

test("pinned Event positions survive source-compatible recomposition and revisions follow source versions", () => {
  const first = buildEventNarrativeLayout({ events: [{ id: "event.a", sourceVersion: "a1", order: 0, pinnedPosition: { x: 777, y: 333 } }], relations: [] });
  const second = buildEventNarrativeLayout({ events: [{ id: "event.a", sourceVersion: "a2", order: 0, pinnedPosition: { x: 777, y: 333 } }], relations: [] });
  assert.deepEqual(first.positions["event.a"], { x: 777, y: 333 });
  assert.notEqual(first.sourceVersion, second.sourceVersion);
  assert.notEqual(first.revision, second.revision);
});

test("branch navigation exposes stable fork, merge and track identities", () => {
  const navigation = buildNarrativeNavigation({ events: [
    { id: "event.start", sourceVersion: "r1", order: 0, trackKind: "main" },
    { id: "event.main-next", sourceVersion: "r1", order: 1, trackKind: "main" },
    { id: "event.branch-next", sourceVersion: "r1", order: 2, trackKind: "branch", trackId: "branch.harbor" },
    { id: "event.merge", sourceVersion: "r1", order: 3, trackKind: "main" }
  ], relations: [
    { sourceEventId: "event.start", targetEventId: "event.main-next", confirmed: true },
    { sourceEventId: "event.start", targetEventId: "event.branch-next", confirmed: true },
    { sourceEventId: "event.main-next", targetEventId: "event.merge", confirmed: true },
    { sourceEventId: "event.branch-next", targetEventId: "event.merge", confirmed: true }
  ] });
  assert.deepEqual(navigation.trackIds, ["main", "branch.harbor"]);
  assert.deepEqual(navigation.branchPoints, [{ eventId: "event.start", targetEventIds: ["event.main-next", "event.branch-next"], branchTrackIds: ["branch.harbor"] }]);
  assert.deepEqual(navigation.mergePoints, [{ eventId: "event.merge", sourceEventIds: ["event.main-next", "event.branch-next"], sourceTrackIds: ["branch.harbor"] }]);
});

test("formal workspace exposes grouped navigation and keeps narrative layout out of temporal projection", async () => {
  const workbench = await readFile(new URL("../../apps/story-studio/src/components/EventLineWorkbench.tsx", import.meta.url), "utf8");
  const controls = await readFile(new URL("../../apps/story-studio/src/components/event-observation/EventObservationControls.tsx", import.meta.url), "utf8");
  const graph = await readFile(new URL("../../apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", import.meta.url), "utf8");
  assert.match(controls, /排列/u);
  assert.match(controls, /观察/u);
  assert.match(controls, /叙事顺序/u);
  assert.match(controls, /世界时间/u);
  assert.match(controls, /关系网络/u);
  assert.match(workbench, /EventObservationControls/u);
  assert.match(graph, /canvasKind === "narrative"/u);
  assert.doesNotMatch(graph, /gridPosition\(total > 24/u);
});

test("density fixture represents branches, merges, groups and blocked candidates instead of a card wall", async () => {
  const graph = await readFile(new URL("../../apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", import.meta.url), "utf8");
  assert.match(graph, /Array\.from\(\{ length: 50 \}/u);
  assert.match(graph, /\[\[3, 21, 30, 8\], \[7, 31, 40, 14\], \[12, 41, 50, 19\]\]/u);
  assert.match(graph, /\[\[4, 5\], \[12, 13, 14\], \[24, 25\], \[35, 36, 37\]\]/u);
  assert.match(graph, /makeRelation\(18, 28, true\)/u);
  assert.match(graph, /时间冲突：需要作者处理/u);
  assert.match(graph, /canvasKind === "narrative" \? 0\.86/u);
});
