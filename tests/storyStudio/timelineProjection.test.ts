import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineDocument, WorldObjectSummary } from "../../apps/story-studio/src/lib/localTransport.ts";
import {
  buildTimelineProjection,
  createTimelineDependency,
  dependencyOrderWarning,
  incidentTimelineDependencies,
  moveTimelineEntry,
  removeTimelineDependency,
  removeTimelineEntryWithDependencies,
  reorderTimelineEntry
} from "../../apps/story-studio/src/lib/timelineProjection.ts";

const objects: WorldObjectSummary[] = [
  object("event.canon", "已确认事件", "event", "committed", ["作者确认", "灯塔"]),
  object("event.plan", "规划事件", "event", "planned", ["作者规划"]),
  object("character.lin", "林远", "character"),
  object("character.alan", "阿岚", "character"),
  object("location.lighthouse", "旧灯塔", "location")
];

test("Timeline projects one stored entry into status, character, location, and custom tracks", () => {
  const document = fixtureDocument();
  const projection = buildTimelineProjection(document, objects);
  assert.equal(projection.storedEntryCount, 2);
  assert.equal(projection.projectedCardCount, 7);
  assert.deepEqual(track(projection, "track.canon").entries.map((item) => item.entry.eventId), ["event.canon"]);
  assert.deepEqual(track(projection, "track.planning").entries.map((item) => item.entry.eventId), ["event.plan"]);
  assert.deepEqual(track(projection, "track.lin").entries.map((item) => item.entry.eventId), ["event.canon", "event.plan"]);
  assert.deepEqual(track(projection, "track.alan").entries.map((item) => item.entry.eventId), ["event.canon"]);
  assert.deepEqual(track(projection, "track.location").entries.map((item) => item.entry.eventId), ["event.canon"]);
  assert.deepEqual(track(projection, "track.custom").entries.map((item) => item.entry.eventId), ["event.canon"]);
  assert.equal(document.content.entries.length, 2);
});

test("Timeline dependency authoring stores stable IDs without prose or order mutation", () => {
  const document = { ...fixtureDocument(), content: { ...fixtureDocument().content, dependencies: [] } };
  const orderBefore = document.content.entries.map((entry) => [entry.id, entry.order]);
  const next = createTimelineDependency(document, "event.canon", "event.plan");
  assert.deepEqual(next.content.entries.map((entry) => [entry.id, entry.order]), orderBefore);
  assert.deepEqual(next.content.dependencies, [{ id: "dependency.1", fromEventId: "event.canon", toEventId: "event.plan", kind: "requires" }]);
  assert.equal(JSON.stringify(next.content.dependencies).includes("explanation"), false);
  assert.equal(dependencyOrderWarning(next, next.content.dependencies[0]), false);
  assert.deepEqual(removeTimelineDependency(next, "dependency.1").content.dependencies, []);
});

test("Timeline incident-edge deletion is explicit and removes edges with the chosen entry", () => {
  const document = fixtureDocument();
  assert.deepEqual(incidentTimelineDependencies(document, "event.canon").map((item) => item.id), ["dependency.1"]);
  const removed = removeTimelineEntryWithDependencies(document, "event.canon");
  assert.deepEqual(removed.content.entries.map((entry) => entry.eventId), ["event.plan"]);
  assert.deepEqual(removed.content.dependencies, []);
});

test("Timeline search is temporary while status and object filters are persisted inputs", () => {
  const document = fixtureDocument();
  const before = JSON.stringify(document);
  assert.deepEqual(buildTimelineProjection(document, objects, "阿岚").entries.map((item) => item.entry.eventId), ["event.canon"]);
  assert.deepEqual(buildTimelineProjection(document, objects, "灯塔").entries.map((item) => item.entry.eventId), ["event.canon"]);
  assert.equal(JSON.stringify(document), before);

  const canonOnly = { ...document, content: { ...document.content, filters: { mode: "canon" as const, objectIds: [] } } };
  assert.deepEqual(buildTimelineProjection(canonOnly, objects).entries.map((item) => item.entry.eventId), ["event.canon"]);
  const alanOnly = { ...document, content: { ...document.content, filters: { mode: "all" as const, objectIds: ["character.alan"] } } };
  assert.deepEqual(buildTimelineProjection(alanOnly, objects).entries.map((item) => item.entry.eventId), ["event.canon"]);
});

test("Timeline global reorder updates every projection and never changes dependencies", () => {
  const document = fixtureDocument();
  const dependenciesBefore = JSON.stringify(document.content.dependencies);
  const reordered = reorderTimelineEntry(document, "event.plan", "event.canon", "before");
  assert.deepEqual(reordered.content.entries.map((entry) => [entry.eventId, entry.order]), [["event.plan", 0], ["event.canon", 1]]);
  assert.deepEqual(track(buildTimelineProjection(reordered, objects), "track.lin").entries.map((item) => item.entry.eventId), ["event.plan", "event.canon"]);
  assert.equal(JSON.stringify(reordered.content.dependencies), dependenciesBefore);
  assert.deepEqual(moveTimelineEntry(reordered, "event.plan", 1).content.entries.map((entry) => entry.eventId), ["event.canon", "event.plan"]);
});

test("Timeline shows missing references without inventing a ghost title and computes order warnings", () => {
  const document = fixtureDocument();
  const withoutSource = objects.filter((item) => item.id !== "event.plan" && item.id !== "location.lighthouse");
  const projection = buildTimelineProjection(document, withoutSource);
  assert.equal(projection.entries.find((item) => item.entry.eventId === "event.plan")?.event, null);
  assert.equal(track(projection, "track.location").title, "对象已缺失");
  assert.equal(track(projection, "track.location").missingReference, true);
  const sourceOnlyDocument = {
    ...document,
    content: { ...document.content, trackViews: document.content.trackViews.filter((track) => track.kind === "canon" || track.kind === "planning") },
    diagnostics: { timeline: { ...document.diagnostics.timeline, entryStates: document.diagnostics.timeline.entryStates.map((entry) => entry.eventId === "event.plan" ? { ...entry, status: "missing" } : entry) } }
  };
  assert.deepEqual(buildTimelineProjection(sourceOnlyDocument, withoutSource).unprojectedEntries.map((item) => item.entry.eventId), ["event.plan"]);
  assert.equal(dependencyOrderWarning(document, document.content.dependencies[0]), true);
});

test("Timeline keeps ineligible linked events out of authoring tracks", () => {
  const document = fixtureDocument();
  document.diagnostics.timeline.entryStates = document.diagnostics.timeline.entryStates.map((entry) =>
    entry.eventId === "event.plan" ? { ...entry, status: "ineligible" } : entry
  );

  const projection = buildTimelineProjection(document, [
    ...objects.filter((item) => item.id !== "event.plan"),
    object("event.plan", "已放弃规划", "event", "abandoned", ["作者规划"])
  ]);
  const abandoned = projection.entries.find((item) => item.entry.eventId === "event.plan");

  assert.deepEqual(abandoned?.trackIds, []);
  assert.deepEqual(projection.unprojectedEntries.map((item) => item.entry.eventId), ["event.plan"]);
  assert.equal(track(projection, "track.lin").entries.some((item) => item.entry.eventId === "event.plan"), false);
});

test("Timeline derives a planning-to-canon link from current diagnostics without copying titles", () => {
  const document = fixtureDocument();
  document.diagnostics.timeline.canonicalLinks = [{ planningEventId: "event.plan", canonicalEventId: "event.canon" }];
  const projection = buildTimelineProjection(document, objects);
  const planning = projection.entries.find((item) => item.entry.eventId === "event.plan");
  assert.equal(planning?.enteredCanonEventId, "event.canon");
  assert.equal(JSON.stringify(document.content).includes("已确认事件"), false);
});

function fixtureDocument(): TimelineDocument {
  return {
    version: "story-visual-document/v1",
    id: "timeline.test",
    type: "timeline",
    title: "测试时间线",
    objectRefs: objects.map((item) => item.id),
    viewport: { x: 0, y: 0, zoom: 1 },
    overlays: { evidence: [], risks: [], candidateChanges: [] },
    relativePath: "documents/timelines/test.timeline.json",
    contentHash: "hash",
    source: "visual-json",
    content: {
      lanes: [
        { id: "lane.canon", title: "正史", color: "#63c3b5", order: 0 },
        { id: "lane.custom", title: "悬念线", color: "#d5c27a", order: 1 }
      ],
      entries: [
        { id: "entry.canon", eventId: "event.canon", laneId: "lane.custom", order: 0 },
        { id: "entry.plan", eventId: "event.plan", laneId: "lane.canon", order: 1 }
      ],
      trackViews: [
        { id: "track.canon", kind: "canon", refId: null, order: 0, visible: true, collapsed: false },
        { id: "track.planning", kind: "planning", refId: null, order: 1, visible: true, collapsed: false },
        { id: "track.lin", kind: "character", refId: "character.lin", order: 2, visible: true, collapsed: false },
        { id: "track.alan", kind: "character", refId: "character.alan", order: 3, visible: true, collapsed: false },
        { id: "track.location", kind: "location", refId: "location.lighthouse", order: 4, visible: true, collapsed: false },
        { id: "track.custom", kind: "custom", refId: "lane.custom", order: 5, visible: true, collapsed: false }
      ],
      dependencies: [{ id: "dependency.1", fromEventId: "event.plan", toEventId: "event.canon", kind: "requires" }],
      filters: { mode: "all", objectIds: [] },
      viewport: { focusedTrackId: null, density: "comfortable" }
    },
    diagnostics: {
      timeline: {
        entryStates: [
          { entryId: "entry.canon", eventId: "event.canon", status: "canonical" },
          { entryId: "entry.plan", eventId: "event.plan", status: "planned" }
        ],
        projectedEntries: [
          { entryId: "entry.canon", eventId: "event.canon", trackIds: ["track.canon", "track.lin", "track.alan", "track.location", "track.custom"], characterIds: ["character.lin", "character.alan"], locationIds: ["location.lighthouse"], plannedFromEventId: null },
          { entryId: "entry.plan", eventId: "event.plan", trackIds: ["track.planning", "track.lin"], characterIds: ["character.lin"], locationIds: [], plannedFromEventId: null }
        ],
        canonicalLinks: [],
        issues: []
      }
    }
  };
}

function object(id: string, title: string, type: WorldObjectSummary["type"], status = "active", tags: string[] = []): WorldObjectSummary {
  return { id, relativeId: `world/${type}s/${id}.md`, title, type, status, tags, aliases: [], source: "markdown" };
}

function track(projection: ReturnType<typeof buildTimelineProjection>, id: string) {
  const result = projection.tracks.find((item) => item.track.id === id);
  assert.ok(result);
  return result;
}
