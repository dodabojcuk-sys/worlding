import assert from "node:assert/strict";
import test from "node:test";

import { buildCharacterCardWorldProjection } from "../../src/storyCardPresentation/characterCardWorldProjection.ts";

test("character world projection keeps confirmed Graph truth separate and resolves every source live", () => {
  const projection = buildCharacterCardWorldProjection({
    characterId: "character.lin",
    notes: [
      note("character.lin", "Lin", "character", "active", "# Lin"),
      note("faction.tide", "Tide", "faction", "active", "# Tide"),
      note("location.tower", "Tower", "location", "active", "# Tower"),
      note("scene.one", "Scene", "scene", "drafting", "# Scene"),
      note("thread.one", "Thread", "thread", "open", "# Thread"),
      note("event.canon", "Canon Event", "event", "committed", "# Canon Event\n\nCurrent canon prose."),
      note("event.plan", "Plan Event", "event", "planned", "# Plan Event\n\nCurrent plan prose.")
    ],
    linkedNoteIds: ["location.tower", "thread.one"],
    backlinkNoteIds: ["scene.one", "faction.tide"],
    documents: [
      {
        id: "graph.core", title: "Core", type: "graph", relativePath: "documents/graphs/core.graph.json", objectRefs: ["character.lin", "faction.tide", "character.missing"],
        content: {
          nodes: [{ id: "node.lin", objectId: "character.lin" }, { id: "node.tide", objectId: "faction.tide" }, { id: "node.missing", objectId: "character.missing" }],
          edges: [{ id: "edge.member", source: "node.lin", target: "node.tide", relation: "member-of", direction: "forward" }, { id: "edge.unknown", source: "node.missing", target: "node.lin", relation: "knows", direction: "reverse" }],
          proposals: [{ id: "proposal.one", source: "node.lin", target: "node.tide", relation: "leads", direction: "forward" }]
        }
      },
      {
        id: "timeline.story", title: "Story", type: "timeline", relativePath: "documents/timelines/story.timeline.json", objectRefs: ["character.lin", "event.canon", "event.plan"],
        content: { entries: [{ id: "entry.canon", eventId: "event.canon" }, { id: "entry.plan", eventId: "event.plan" }], trackViews: [{ id: "track.canon", kind: "canon", refId: null }, { id: "track.lin", kind: "character", refId: "character.lin" }, { id: "track.plan", kind: "planning", refId: null }], lanes: [] },
        diagnostics: { timeline: { entryStates: [{ entryId: "entry.canon", eventId: "event.canon", status: "canonical" }, { entryId: "entry.plan", eventId: "event.plan", status: "planned" }], projectedEntries: [{ entryId: "entry.canon", eventId: "event.canon", trackIds: ["track.canon", "track.lin"], characterIds: ["character.lin"], locationIds: [], plannedFromEventId: null }, { entryId: "entry.plan", eventId: "event.plan", trackIds: ["track.plan", "track.lin"], characterIds: ["character.lin"], locationIds: [], plannedFromEventId: null }] } }
      },
      { id: "map.world", title: "World", type: "map", relativePath: "documents/maps/world.map.json", objectRefs: ["character.lin"], content: { markers: [{ id: "marker.one", objectId: "character.lin" }, { id: "marker.two", objectId: "character.lin" }] } },
      { id: "tree.core", title: "Tree", type: "tree", relativePath: "documents/trees/core.tree.json", objectRefs: ["character.lin"], content: { sourceGraphPath: "documents/graphs/core.graph.json", rootObjectIds: ["character.lin"], includedEdgeIds: ["edge.member"] } },
      { id: "canvas.clues", title: "Clues", type: "canvas", relativePath: "documents/canvases/clues.canvas.json", objectRefs: ["character.lin"], content: { nodes: [{ id: "canvas.lin", kind: "object", objectId: "character.lin", text: "MUST_NOT_PROJECT" }] } }
    ],
    relationGroups: [
      { blockId: "card-block.relation.01", label: "Core", config: { sourceDocumentIds: ["graph.core"], directions: ["outgoing"], relationTypes: ["member-of"], edgeIds: [] } },
      { blockId: "card-block.relation.02", label: "Missing", config: { sourceDocumentIds: ["graph.missing"], directions: [], relationTypes: [], edgeIds: ["edge.deleted"] } }
    ]
  });

  assert.equal(projection.confirmedOnly, true);
  assert.equal(projection.confirmedRelations.length, 2);
  assert.equal(projection.confirmedRelations.some((relation) => relation.id === "proposal.one"), false);
  assert.equal(projection.pendingGraphProposals[0]?.count, 1);
  assert.deepEqual(projection.relationGroups[0].relations.map((relation) => relation.id), ["edge.member"]);
  assert.deepEqual(projection.relationGroups[1].missingSourceDocumentIds, ["graph.missing"]);
  assert.deepEqual(projection.relationGroups[1].missingEdgeIds, ["edge.deleted"]);
  assert.equal(projection.confirmedRelations.find((relation) => relation.id === "edge.unknown")?.otherObject.missing, true);
  assert.equal(projection.timelineParticipations.length, 2);
  assert.deepEqual(projection.timelineParticipations.find((entry) => entry.eventId === "event.canon")?.trackBadges, ["正史", "Lin"]);
  assert.equal(projection.timelineParticipations.find((entry) => entry.eventId === "event.plan")?.state, "planned");
  assert.equal(projection.mapAppearances[0]?.appearanceCount, 2);
  assert.equal(projection.treeAppearances[0]?.role, "root");
  assert.deepEqual(projection.canvasAppearances[0]?.referenceIds, ["canvas.lin"]);
  assert.equal(JSON.stringify(projection).includes("MUST_NOT_PROJECT"), false);
  assert.equal(projection.currentLocation?.id, "location.tower");
  assert.deepEqual(projection.linkedScenes.map((reference) => reference.id), ["scene.one"]);
  assert.equal(projection.factions.some((reference) => reference.provenance === "confirmed-graph"), true);
  assert.deepEqual(projection.openThreads.map((reference) => reference.id), ["thread.one"]);
});

test("map markers never infer current location and Timeline entries deduplicate across tracks", () => {
  const projection = buildCharacterCardWorldProjection({
    characterId: "character.lin",
    notes: [note("character.lin", "Lin", "character", "active", "# Lin"), note("event.one", "One", "event", "committed", "# One")],
    linkedNoteIds: [], backlinkNoteIds: [], relationGroups: [],
    documents: [
      { id: "map.one", title: "Map", type: "map", relativePath: "documents/maps/one.map.json", objectRefs: ["character.lin"], content: { markers: [{ id: "marker.lin", objectId: "character.lin" }] } },
      { id: "timeline.one", title: "Timeline", type: "timeline", relativePath: "documents/timelines/one.timeline.json", objectRefs: ["character.lin", "event.one"], content: { entries: [{ id: "entry.one", eventId: "event.one" }], trackViews: [{ id: "track.a", kind: "character", refId: "character.lin" }, { id: "track.b", kind: "canon", refId: null }], lanes: [] }, diagnostics: { timeline: { entryStates: [{ entryId: "entry.one", eventId: "event.one", status: "canonical" }], projectedEntries: [{ entryId: "entry.one", eventId: "event.one", trackIds: ["track.a", "track.b"], characterIds: ["character.lin"], locationIds: [], plannedFromEventId: null }] } } }
    ]
  });
  assert.equal(projection.currentLocation, null);
  assert.equal(projection.timelineParticipations.length, 1);
  assert.equal(projection.timelineParticipations[0].trackBadges.length, 2);
});

function note(id: string, title: string, type: string, status: string, body: string) {
  return { id, title, type, status, body };
}
