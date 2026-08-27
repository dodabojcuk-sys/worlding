import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  resolveEventObservationRoute,
  resolveEventObservationRouteAvailability,
  serializeEventObservationRoute
} from "../../apps/story-studio/src/components/event-observation/eventObservationRoute.ts";

test("Event Line accepts legacy route input but serializes one canonical Event parameter", () => {
  assert.deepEqual(resolveEventObservationRoute(""), { status: "none", eventId: null });
  assert.deepEqual(resolveEventObservationRoute("?event=event.confirmed-1"), {
    status: "selected", eventId: "event.confirmed-1", source: "canonical", needsCanonicalization: false
  });
  assert.deepEqual(resolveEventObservationRoute("?eventId=event.confirmed-1"), {
    status: "selected", eventId: "event.confirmed-1", source: "legacy", needsCanonicalization: true
  });
  assert.deepEqual(resolveEventObservationRoute("?event=event.confirmed-1&eventId=event.confirmed-1"), {
    status: "selected", eventId: "event.confirmed-1", source: "both", needsCanonicalization: true
  });
  assert.deepEqual(resolveEventObservationRoute("?event=event.a&eventId=event.b"), {
    status: "invalid", eventId: null, reason: "conflict"
  });
  assert.deepEqual(resolveEventObservationRoute("?event=event.a&event=event.b"), {
    status: "invalid", eventId: null, reason: "conflict"
  });
  for (const invalid of ["?event=", "?event=event%2Fa", "?event=%20event.a", "?event=事件.a"]) {
    assert.deepEqual(resolveEventObservationRoute(invalid), { status: "invalid", eventId: null, reason: "invalid-id" });
  }

  assert.equal(serializeEventObservationRoute("?view=timeline&eventId=event.old", "event.confirmed-1"), "?view=timeline&event=event.confirmed-1");
  assert.equal(serializeEventObservationRoute("?view=spine&event=event.old&eventId=event.old", null), "?view=spine");
  assert.deepEqual(resolveEventObservationRoute(serializeEventObservationRoute("?view=canvas", "event.confirmed-1")), {
    status: "selected", eventId: "event.confirmed-1", source: "canonical", needsCanonicalization: false
  });
});

test("route availability preserves selection through loading and fails closed at the project boundary", () => {
  const selected = resolveEventObservationRoute("?event=event.confirmed-1");
  assert.deepEqual(resolveEventObservationRouteAvailability(selected, { status: "loading" }, []), {
    status: "loading", eventId: "event.confirmed-1"
  });
  assert.deepEqual(resolveEventObservationRouteAvailability(selected, { status: "ready" }, ["event.confirmed-1"]), {
    status: "ready", eventId: "event.confirmed-1"
  });
  assert.deepEqual(resolveEventObservationRouteAvailability(selected, { status: "ready" }, ["event.other-project"]), {
    status: "not-found", eventId: "event.confirmed-1"
  });
  assert.deepEqual(resolveEventObservationRouteAvailability(selected, { status: "error" }, []), {
    status: "unavailable", eventId: "event.confirmed-1"
  });
  assert.deepEqual(resolveEventObservationRouteAvailability(resolveEventObservationRoute("?event=event.a&eventId=event.b"), { status: "ready" }, []), {
    status: "invalid", reason: "conflict"
  });
});

test("the page keeps route ownership above asynchronous list and detail projections", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const host = readFileSync("apps/story-studio/src/components/EventObservationWorkspace.tsx", "utf8");
  const workbench = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");

  assert.match(app, /eventObservationRoute\.status === "none"/);
  assert.doesNotMatch(app, /!currentUrl\.searchParams\.has\("event"\)/);
  assert.match(host, /data-testid="event-line-route-error"/);
  assert.match(host, /requested\.status === "selected" && requested\.needsCanonicalization/);
  assert.match(host, /onSelectedEventId=\{chooseEvent\}/);
  assert.doesNotMatch(workbench, /props\.onSelectedEventId\?\.\(null\)/);
});
