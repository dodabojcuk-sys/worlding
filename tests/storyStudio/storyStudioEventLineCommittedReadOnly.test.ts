import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  confirmedEventRelationProjection,
  eventLineEventMetadata,
  isVerifiedCanonEvent,
  isVerifiedCanonEventDetail,
  verifiedCanonEventSummaries
} from "../../apps/story-studio/src/components/eventLineCommittedEvents.ts";
import type { WorldObject, WorldObjectSummary } from "../../apps/story-studio/src/lib/localTransport.ts";

const summary = (id: string, type: WorldObjectSummary["type"], status: string): WorldObjectSummary => ({
  id,
  relativeId: `world/${type}s/${id}.md`,
  title: id,
  type,
  status,
  tags: [],
  aliases: [],
  revisionToken: `${id}-revision`,
  source: "markdown"
});

test("Event Line only exposes Author Control verified Canon summaries", () => {
  const input = [
    summary("planned-first", "event", "planned"),
    { ...summary("committed-second", "event", "committed"), tags: ["作者确认"] },
    { ...summary("committed-without-tag", "event", "committed"), tags: [] },
    { ...summary("spoofed-with-tag", "event", "committed"), tags: ["作者确认"] },
    summary("unknown-third", "event", "unknown"),
    summary("character-fourth", "character", "committed"),
    { ...summary("committed-fifth", "event", "committed"), tags: ["作者确认"] }
  ];
  const verifiedIds = new Set(["committed-second", "committed-fifth"]);

  assert.deepEqual(verifiedCanonEventSummaries(input, [...verifiedIds]).map((event) => event.id), ["committed-second", "committed-fifth"]);
  assert.equal(isVerifiedCanonEvent(input[0], verifiedIds), false);
  assert.equal(isVerifiedCanonEvent(input[2], verifiedIds), false);
  assert.equal(isVerifiedCanonEvent(input[3], verifiedIds), false);
});

test("Event Line revalidates full details against the verified Canon read contract", () => {
  const committed = {
    ...summary("committed", "event", "committed"), tags: ["作者确认"], canonicalReadVerified: true,
    body: "# 已确认\n\n正文",
    properties: {}, knowledgeSubjects: [], subtype: "", typedProperties: [], propertyDiagnostics: [], linkedObjects: [], backlinks: [], card: {} as WorldObject["card"], visualReferences: [], worldProjection: null
  } satisfies WorldObject;
  const planned = { ...committed, id: "planned", status: "planned" } satisfies WorldObject;
  const unverified = { ...committed, id: "unverified", canonicalReadVerified: false } satisfies WorldObject;

  assert.equal(isVerifiedCanonEventDetail(committed), true);
  assert.equal(isVerifiedCanonEventDetail(planned), false);
  assert.equal(isVerifiedCanonEventDetail(unverified), false);
});

test("Event Line reads only selected listed IDs and rejects stale async detail responses", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const surface = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");

  assert.match(app, /getVerifiedCanonEventList/);
  assert.match(app, /verifiedCanonEventSummaries\(library\.objects, eventLineRead\.eventIds\)/);
  assert.doesNotMatch(app, /listState="ready"/);
  assert.match(app, /verifiedCanonEvents\.some\(\(event\) => event\.id === eventId\)/);
  assert.match(app, /return getVerifiedCanonEvent\(activeProject\.id, eventId\)/);
  assert.match(surface, /const requestSequence = useRef\(0\)/);
  assert.match(surface, /sequence !== requestSequence\.current/);
  assert.match(surface, /next\.event\.id !== selectedEventId \|\| !isVerifiedCanonEventDetail\(next\.event\)/);
  assert.match(surface, /props\.events\.some\(\(event\) => event\.id === selectedEventId\)/);
  assert.match(surface, /event\.id === selectedEventId/);
  assert.match(surface, /requestDockState\(\{ open: true, activeLens: "detail" \}, eventId\)/);
  assert.match(surface, /workspaceDockCoordinator\.openPageInspector\("event-line"\)/);
});

test("Event Line distinguishes every list and detail failure state without a write action", () => {
  const surface = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");

  for (const state of [
    "event-line-list-loading",
    "event-line-list-error",
    "event-line-invalid-records",
    "event-line-empty",
    "event-line-detail-loading",
    "event-line-detail-error"
  ]) assert.match(surface, new RegExp(state));
  for (const kind of ["authority-failure", "parse-failure", "invalid-record", "repository-io", "project-boundary"]) {
    assert.match(surface, new RegExp(kind));
  }
  assert.doesNotMatch(surface, /createPlanningEvent|updateVisualDocument|applyAuthorChangeSet|fetch\s*\(/);
});

test("persisted accepted candidates cannot create a duplicate planning event", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const surface = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
  assert.match(app, /setAcceptedGoldenLoopCandidateIds\(candidateReview\?\.candidates\.filter/);
  assert.match(surface, /acceptedIds\.includes\(id\)/);
  assert.match(surface, /"submitted-to-impact"/);
  assert.doesNotMatch(surface, /createPlanningEvent|applyAuthorChangeSet/);
});

test("Event Line metadata and relation projections preserve unknowns and existing endpoints", () => {
  assert.deepEqual(eventLineEventMetadata({ tags: ["作者确认", "Unit: 第一单元", "场景：码头", "角色: 阿岚", "Actor: 守夜人", "地点: 北门"] }), {
    unitLabel: "第一单元",
    sceneLabel: "码头",
    characterLabels: ["阿岚", "守夜人"],
    locationLabels: ["北门"]
  });
  assert.deepEqual(eventLineEventMetadata({ tags: ["作者确认"] }), {
    unitLabel: null,
    sceneLabel: null,
    characterLabels: [],
    locationLabels: []
  });

  const detail = {
    ...summary("event-a", "event", "committed"), tags: ["作者确认"], canonicalReadVerified: true,
    body: "# Event", properties: {}, knowledgeSubjects: [], subtype: "", typedProperties: [], propertyDiagnostics: [],
    linkedObjects: [{ ...summary("event-b", "event", "committed"), tags: ["作者确认"] }, summary("character-a", "character", "committed")],
    backlinks: [{ ...summary("event-c", "event", "committed"), tags: ["作者确认"] }, summary("event-planned", "event", "planned")],
    card: {} as WorldObject["card"], visualReferences: [], worldProjection: null
  } satisfies WorldObject;
  assert.deepEqual(confirmedEventRelationProjection(detail).outgoing.map((event) => event.id), ["event-b"]);
  assert.deepEqual(confirmedEventRelationProjection(detail).incoming.map((event) => event.id), ["event-c"]);
});

test("Event Line is a confirmed vertical spine with separate candidate review and no planning controls", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const surface = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
  const host = readFileSync("apps/story-studio/src/components/EventObservationWorkspace.tsx", "utf8");
  const route = readFileSync("apps/story-studio/src/components/event-observation/eventObservationRoute.ts", "utf8");
  const styles = readFileSync("apps/story-studio/src/styles/product-shell-r0.css", "utf8");

  assert.match(surface, /data-testid="confirmed-story-spine"/);
  assert.match(surface, /event-line-candidate-region/);
  assert.match(surface, /Candidate 不是故事事实/);
  assert.match(surface, /进入 Impact Review 仍不等于 Canon/);
  assert.match(surface, /PageContextDock pageId="event-line"/);
  for (const lens of ["detail", "relations", "branches", "review"]) assert.match(surface, new RegExp(`id: "${lens}"`));
  assert.doesNotMatch(surface, /id: "nuwa"|draggable|onDrag|applyAuthorChangeSet|createPlanningEvent|updateVisualDocument/);
  assert.doesNotMatch(surface, /timeline|gantt|infinite-canvas|spider-graph/iu);
  assert.match(app, /const hasContextSidebar = !settingsRouteActive && \(productMode === "library" \|\| productMode === "writing"\);/);
  assert.match(app, /\{hasContextSidebar \? <ModuleSidebarHost mode=\{productMode\}(?:\s+[^>]*)?>/);
  assert.match(host, /data-testid="event-observation-workspace"/);
  assert.match(host, /className="event-observation-layout"/);
  assert.match(host, /role="tabpanel" aria-labelledby=\{`event-observation-\$\{view\}-tab`\}/);
  assert.match(app, /productMode === "event-line" \? <EventObservationWorkspace/);
  assert.match(host, /view === "spine" \? <EventLineWorkbench/);
  assert.match(host, /view === "canvas" \? "event-line" : "timeline"/);
  assert.match(route, /storyCanvas"\) === "successor-r0"/);
  assert.match(host, /url\.searchParams\.delete\("storyCanvas"\)/);
  assert.match(app, /currentUnitLabel=\{activeWritingChapter\?\.title \|\| null\}/);
  assert.match(host, /onOpenTianyi=\{props\.onOpenTianyi\}/);
  assert.match(styles, /\.event-observation-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?overflow: hidden;/);
  assert.match(styles, /\/\* Batch A: one stable content rectangle feeds every Event Observation projection\. \*\//);
  assert.match(styles, /\.event-line-candidate-region/);
});

test("Full Card receives a domain-scoped authority mode instead of globally disabling metadata", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const card = readFileSync("apps/story-studio/src/components/CardWorkbench.tsx", "utf8");

  assert.match(app, /authorityMode=/);
  assert.match(card, /verified-canon/);
  assert.match(card, /planning-event/);
  assert.match(card, /canon-verification-unavailable/);
  assert.match(card, /invalid-canon-claim/);
  assert.match(card, /普通标签/);
  assert.match(card, /readOnly/);
});
