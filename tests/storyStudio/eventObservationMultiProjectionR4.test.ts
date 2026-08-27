import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveEventObservationView } from "../../apps/story-studio/src/components/event-observation/eventObservationRoute.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("the formal route resolves explicit views and the former Story Observation URL without a second owner", () => {
  assert.deepEqual(resolveEventObservationView("?view=spine"), { view: "spine", legacyCanvas: false, explicit: true });
  assert.deepEqual(resolveEventObservationView("?view=canvas&storyCanvas=successor-r0"), { view: "canvas", legacyCanvas: false, explicit: true });
  assert.deepEqual(resolveEventObservationView("?storyCanvas=successor-r0"), { view: "canvas", legacyCanvas: true, explicit: false });
  assert.deepEqual(resolveEventObservationView("", "timeline"), { view: "timeline", legacyCanvas: false, explicit: false });
});

test("one Event Observation host renders the retained spine plus canvas and timeline projections with one selected Event ID", () => {
  const host = source("apps/story-studio/src/components/EventObservationWorkspace.tsx");
  const spine = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
  const canvas = source("apps/story-studio/src/components/story-observation/StoryObservationCanvas.tsx");

  assert.match(host, /data-testid="event-observation-workspace"/);
  for (const view of ["spine", "canvas", "timeline"]) assert.match(host, new RegExp(`view === "${view}"|\"${view}\"`));
  assert.match(host, /selectedEventId=\{selectedEventId\}/);
  assert.match(host, /onSelectedEventId=\{chooseEvent\}/);
  assert.match(spine, /open: Boolean\(props\.selectedEventId\), activeLens: "detail"/);
  assert.match(canvas, /open: Boolean\(props\.selectedEventId\), activeLens: "detail"/);
  assert.match(spine, /data-testid="confirmed-story-spine"/);
  assert.match(canvas, /data-event-observation-renderer=\{mode === "timeline" \? "timeline" : "canvas"\}/);
  assert.match(canvas, /eventLineEventMetadata\(event\)\.characterLabels\.includes\(props\.roleLens!/);
  assert.doesNotMatch(host, /applyAuthorChangeSet|CanonWriter|writeWorldState|createWorldState/i);
});

test("the view switcher has an accessible tab contract and does not introduce another Tianyi trigger", () => {
  const host = source("apps/story-studio/src/components/EventObservationWorkspace.tsx");
  const header = source("apps/story-studio/src/product-shell/GlobalHeader.tsx");

  assert.match(host, /role="tablist" aria-label="事件观测视图"/);
  assert.match(host, /role="tab" aria-selected=/);
  assert.match(host, /ArrowLeft|ArrowRight/);
  assert.match(header, /data-testid="tianyi-quick-launcher"/);
  assert.doesNotMatch(host, /data-tianyi-drawer-trigger/);
});
