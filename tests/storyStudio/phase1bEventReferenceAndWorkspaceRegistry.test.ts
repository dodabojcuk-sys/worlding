import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assertStoryStudioEventReferenceEligibility,
  createStoryStudioEventReference
} from "../../src/storyContracts/storyStudioEventReference.ts";
import {
  PRODUCT_WORKSPACE_MODES,
  resolveStoryStudioWorkspaceLocation,
  storyStudioWorkspaceRoute
} from "../../apps/story-studio/src/product-shell/navigation/topLevelDestinationRegistry.ts";
import {
  deriveTianyiContextRequest,
  deriveTianyiShellContext
} from "../../apps/story-studio/src/components/tianyiShellContext.ts";
import { createTianyiGroundedContextRequest } from "../../apps/story-studio/src/lib/tianyiGroundedContextRequest.ts";
import type { TianyiShellContextInput } from "../../apps/story-studio/src/components/tianyiShellContext.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

const PROJECT_ID = "phase1b-world";

test("event references are identity and version only; server eligibility governs consumer use", () => {
  const planned = { id: "event.planned", type: "event", status: "planned", revisionToken: "a".repeat(64) };
  const plannedReference = createStoryStudioEventReference({ projectId: PROJECT_ID, event: planned, requestedUse: "simulate-from" });
  assert.deepEqual(Object.keys(plannedReference).sort(), ["eventId", "projectId", "requestedUse", "revisionToken", "state", "version"]);
  assert.doesNotThrow(() => assertStoryStudioEventReferenceEligibility({ reference: plannedReference, event: planned, consumer: "nuwa-simulation", canonVerified: false }));
  assert.throws(() => assertStoryStudioEventReferenceEligibility({ reference: plannedReference, event: planned, consumer: "tianyi-grounded", canonVerified: false }), /eligible/u);
  assert.throws(() => assertStoryStudioEventReferenceEligibility({ reference: plannedReference, event: planned, consumer: "canon-material", canonVerified: false }), /eligible/u);
  assert.throws(() => assertStoryStudioEventReferenceEligibility({ reference: { ...plannedReference, state: "committed" }, event: planned, consumer: "nuwa-simulation", canonVerified: false }), /stale/u);
  assert.throws(() => assertStoryStudioEventReferenceEligibility({ reference: { ...plannedReference, revisionToken: "b".repeat(64) }, event: planned, consumer: "nuwa-simulation", canonVerified: false }), /stale/u);

  const committed = { ...planned, id: "event.committed", status: "committed", revisionToken: "c".repeat(64) };
  const committedReference = createStoryStudioEventReference({ projectId: PROJECT_ID, event: committed, requestedUse: "constraint" });
  assert.throws(() => assertStoryStudioEventReferenceEligibility({ reference: committedReference, event: committed, consumer: "tianyi-grounded", canonVerified: false }), /Canon verified/u);
  assert.doesNotThrow(() => assertStoryStudioEventReferenceEligibility({ reference: committedReference, event: committed, consumer: "tianyi-grounded", canonVerified: true }));
  assert.doesNotThrow(() => assertStoryStudioEventReferenceEligibility({ reference: committedReference, event: committed, consumer: "canon-material", canonVerified: true }));
});

test("workspace registry has a single canonical deep-link order with a read-only legacy creation alias", () => {
  assert.deepEqual(PRODUCT_WORKSPACE_MODES, ["world", "tianyi", "event-line", "multiverse", "nuwa", "library", "writing", "data"]);
  for (const id of PRODUCT_WORKSPACE_MODES) {
    const route = storyStudioWorkspaceRoute(id);
    assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname: route, search: "" }), { id, migrated: false });
  }
  assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname: "/creation", search: "" }), { id: "writing", migrated: false });
  assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname: "/writing", search: "" }), { id: "writing", migrated: true });
});

test("grounded Tianyi transport preserves event identity only", () => {
  const event = { id: "event.transport", type: "event", status: "planned", revisionToken: "d".repeat(64) };
  const reference = createStoryStudioEventReference({ projectId: PROJECT_ID, event, requestedUse: "constraint" });
  const request = createTianyiGroundedContextRequest({
    projectId: PROJECT_ID,
    sessionId: "session.000001",
    access: { accessMode: "author", subjectRef: null },
    activeContextRef: null,
    objectContextRefs: [],
    eventRefs: [reference, reference]
  });
  assert.deepEqual(request.eventRefs, [reference]);
  assert.equal(JSON.stringify(request).includes("event.transport"), true);
  assert.equal(JSON.stringify(request).includes("SERVER_EVENT_BODY"), false);
});

test("Event Line handoff becomes a usable, constraint-scoped Tianyi context without an active Library object", () => {
  const reference = createStoryStudioEventReference({
    projectId: PROJECT_ID,
    event: { id: "event.line-handoff", type: "event", status: "committed", revisionToken: "e".repeat(64) },
    requestedUse: "constraint"
  });
  const input: TianyiShellContextInput = {
    mode: "world",
    project: { id: PROJECT_ID, title: "Event Line handoff", status: "active", genre: null, ambience: null, counts: { chapters: 0, scenes: 0, objects: 1 }, source: "markdown" },
    showWorldHome: false,
    workspaceMode: "library",
    activeObject: null,
    visualWorkbench: null,
    visualObject: null,
    objects: [],
    selection: { objectId: null, source: "library", documentId: null, blockId: null, relationId: null },
    writingDocument: null,
    intelligenceDocument: "supervisor",
    impactReview: null,
    eventReference: reference,
    eventLabel: "已确认事件 · 事件线"
  };

  assert.deepEqual(deriveTianyiShellContext(input), {
    mode: "world",
    contextKind: "object",
    contextLabel: "已确认事件 · 事件线",
    sourceLabels: ["事件线", "已授权事件"],
    canOpenSource: true
  });
  assert.deepEqual(deriveTianyiContextRequest(input), {
    productMode: "world",
    activeOwner: { kind: "world-object", id: reference.eventId },
    selection: { documentId: null, objectId: reference.eventId, timelinePointId: null },
    sourceRefs: [],
    memorySelections: [],
    enabledSkillRefs: [],
    eventRefs: [reference]
  });
});

test("planned events have zero pre-apply Canon or Timeline effects", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyan-phase1b-planned-"));
  const stateFilePath = path.join(rootPath, ".story-studio", "state.json");
  try {
    const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
    workspace.createProject({ title: "Phase 1B", folderSlug: PROJECT_ID });
    const planned = workspace.createPlanningEvent({ projectId: PROJECT_ID, title: "待审事件" });
    const library = workspace.getStoryStudioWorldLibraryBootstrap({ projectId: PROJECT_ID });
    assert.equal(planned.status, "planned");
    assert.equal(library.objects.filter((object) => object.type === "event" && object.status === "committed").length, 0);
    assert.equal(workspace.getVisualWorkbenchBootstrap({ projectId: PROJECT_ID }).documents.filter((document) => document.type === "timeline").length, 0);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
    await rm(stateFilePath, { force: true });
  }
});
