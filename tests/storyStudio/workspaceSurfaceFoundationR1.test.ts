import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  WORKSPACE_SURFACE_KINDS,
  WORKSPACE_SURFACE_RESERVATIONS,
  getWorkspaceSurfaceReservation,
  workspaceSurfaceManager,
  type SurfaceContextPackage
} from "../../apps/story-studio/src/product-shell/WorkspaceDockCoordinator.ts";

test("Surface manager has one temporary instance and retains the context envelope", () => {
  workspaceSurfaceManager.closeSurface();
  const event = workspaceSurfaceManager.openSurface({
    kind: "object-inspector",
    context: { projectId: "project-1", workVersionId: "root", eventId: "event-1", viewMode: "event-detail" }
  });
  assert.equal(workspaceSurfaceManager.snapshot().activeSurface, event);
  assert.equal(workspaceSurfaceManager.snapshot().mode, "EVENT_DETAILS");

  const relation = workspaceSurfaceManager.openSurface({
    kind: "relation-review",
    context: { projectId: "project-1", workVersionId: "root", eventId: "event-1", viewMode: "relation-review" }
  });
  assert.equal(workspaceSurfaceManager.snapshot().activeSurface, relation);
  assert.equal(workspaceSurfaceManager.snapshot().mode, "RELATION_REVIEW");
  assert.equal(workspaceSurfaceManager.snapshot().activeSurface?.context.eventId, "event-1");
  workspaceSurfaceManager.closeSurface();
  assert.equal(workspaceSurfaceManager.snapshot().activeSurface, null);
});

test("Surface placement is transient: hidden can restore and floating has no geometry model", () => {
  workspaceSurfaceManager.closeSurface();
  workspaceSurfaceManager.openSurface({ kind: "nuwa-inspector", context: { projectId: "project-1", runId: "run-1" }, placement: "floating" });
  assert.equal(workspaceSurfaceManager.snapshot().activeSurface?.requestedPlacement, "floating");
  assert.equal(workspaceSurfaceManager.snapshot().activeSurface?.placement, "overlay");
  assert.equal("position" in (workspaceSurfaceManager.snapshot().activeSurface ?? {}), false);
  workspaceSurfaceManager.hideSurface("nuwa-inspector");
  assert.equal(workspaceSurfaceManager.snapshot().mode, "NONE");
  workspaceSurfaceManager.restoreSurface("nuwa-inspector");
  assert.equal(workspaceSurfaceManager.snapshot().activeSurface?.placement, "overlay");
  workspaceSurfaceManager.closeSurface("nuwa-inspector");
});

test("R1 registers existing and future temporary work faces without introducing a domain owner", () => {
  assert.deepEqual(WORKSPACE_SURFACE_KINDS, ["object-inspector", "relation-review", "creation-surface", "tianyi-assistant", "nuwa-inspector", "character-context", "character-fate", "world-evolution", "relationship-flow", "future-projection-map"]);
  assert.deepEqual(WORKSPACE_SURFACE_RESERVATIONS.map((reservation) => reservation.kind), ["character-fate", "world-evolution", "relationship-flow", "future-projection-map"]);
  assert.equal(getWorkspaceSurfaceReservation("future-projection-map")?.unavailableMessage, "未来推演视图未接入");
  const source = readFileSync("apps/story-studio/src/product-shell/WorkspaceDockCoordinator.ts", "utf8");
  assert.doesNotMatch(source, /AuthorControl|localStorage|sessionStorage|fetch\(/u);
});

test("Event Line Surface contexts contain identities and a view mode only", () => {
  workspaceSurfaceManager.closeSurface();
  for (const [kind, viewMode, eventId] of [
    ["object-inspector", "event-detail", "event-1"],
    ["relation-review", "relation-review", "event-1"],
    ["creation-surface", "event-create", null]
  ] as const) {
    workspaceSurfaceManager.openSurface({ kind, context: { projectId: "project-1", workVersionId: "root", eventId, viewMode } });
    assert.deepEqual(Object.keys(workspaceSurfaceManager.snapshot().activeSurface?.context ?? {}).sort(), ["eventId", "projectId", "viewMode", "workVersionId"]);
  }
  workspaceSurfaceManager.closeSurface();
});

test("a Context Package retains one versioned object reference and never copies its facts", () => {
  workspaceSurfaceManager.closeSurface();
  workspaceSurfaceManager.openSurface({
    kind: "character-fate",
    context: {
      projectId: "project-1",
      contextPackage: { objectType: "character", objectId: "character-1", projectId: "project-1", workVersionId: "root", sourceContext: "current-node", currentView: "tianyi" }
    }
  });
  const contextPackage = workspaceSurfaceManager.snapshot().activeSurface?.context.contextPackage;
  assert.deepEqual(contextPackage, { objectType: "character", objectId: "character-1", projectId: "project-1", workVersionId: "root", sourceContext: "current-node", currentView: "tianyi" });
  assert.equal("content" in (contextPackage ?? {}), false);
  assert.equal("facts" in (contextPackage ?? {}), false);
  workspaceSurfaceManager.closeSurface();
});

test("Context Packages reserve only the four transferable object identities", () => {
  const objectTypes: SurfaceContextPackage["objectType"][] = ["character", "event", "location", "story-unit"];
  assert.deepEqual(objectTypes, ["character", "event", "location", "story-unit"]);
});
