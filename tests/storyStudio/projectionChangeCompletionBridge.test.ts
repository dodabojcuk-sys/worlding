import assert from "node:assert/strict";
import test from "node:test";

import { completeProjectProjectionTransport } from "../../apps/story-studio/src/lib/projectProjectionCompletionBridge.ts";
import {
  STORY_STUDIO_PENDING_REVIEW_CHANGED,
  emitStoryStudioProjectionChangeCompleted,
  readStoryStudioProjectionChangeDetail,
} from "../../apps/story-studio/src/lib/storyStudioProjectionChangeEvent.ts";

async function withBrowserHarness(run: (events: CustomEvent[]) => Promise<void>) {
  const originalWindow = globalThis.window;
  const target = new EventTarget() as EventTarget & { location: { origin: string } };
  target.location = { origin: "http://story-studio.test" };
  Object.defineProperty(globalThis, "window", { configurable: true, value: target });
  const events: CustomEvent[] = [];
  target.addEventListener(STORY_STUDIO_PENDING_REVIEW_CHANGED, (event) => {
    if (readStoryStudioProjectionChangeDetail(event)) events.push(event as CustomEvent);
  });
  try { await run(events); }
  finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
  }
}

const appliedChangeSet = {
  version: "story-studio-author-change-set-product/v1",
  id: "change.1",
  reviewId: "review.1",
  status: "applied",
  source: { sceneId: "scene.1", sceneTitle: "Scene" },
  affectedNoteIds: [], changes: [], before: [], change: [], after: [],
  authorDecision: { label: "accepted", status: "accepted" },
  application: { canApply: false, reason: "applied", eventRecorded: true, appliedEventId: "event.1", markdownWrites: 0, sceneProseChanged: false, objectNotesChanged: false, projectedEffects: [] },
};

const tianyiReview = (status: "active" | "undone") => ({
  adoptionReceipt: {
    status,
    receiptId: "receipt.1",
    resultVersion: { workVersionId: "wv.root", revision: 2, label: "V2" },
    compensation: status === "undone" ? { eventId: "event.compensation", resultVersion: { workVersionId: "wv.root", revision: 3, label: "V3" } } : null,
  },
  changeSet: { status: "applied", application: { appliedEventId: "event.1" } },
});

const nuwaResult = (status: "applied" | "rolled-back") => ({
  automaticApplication: {
    status,
    eventId: "event.1",
    receiptId: "receipt.nuwa",
    resultVersion: { workVersionId: "wv.root", revision: 2 },
    rollback: status === "rolled-back" ? { operationId: "op.rollback", status: "active", resultVersion: { workVersionId: "wv.root", revision: 3 }, failure: null } : null,
  },
});

test("the shared event helper requires project scope, detaches detail, and strips unrelated prose or secrets", async () => {
  await withBrowserHarness(async (events) => {
    assert.throws(() => emitStoryStudioProjectionChangeCompleted({ projectId: " ", operationPath: "/author-control/change-set/apply" }), /projectId/u);
    const unsafe = { projectId: " project.a ", workVersionId: " wv.1 ", operationPath: "/author-control/change-set/apply", operationId: "op.1", changeId: "change.1", title: "secret title", body: "secret body", apiKey: "secret" };
    const detail = emitStoryStudioProjectionChangeCompleted(unsafe as never);
    unsafe.projectId = "project.changed";
    assert.deepEqual(detail, {
      kind: "projection-change-completed",
      projectId: "project.a",
      workVersionId: "wv.1",
      operationPath: "/author-control/change-set/apply",
      operationId: "op.1",
      changeId: "change.1",
    });
    assert.equal(JSON.stringify(events[0].detail).includes("secret"), false);
    assert.notEqual(events[0].detail, unsafe);
    assert.equal(readStoryStudioProjectionChangeDetail(new Event(STORY_STUDIO_PENDING_REVIEW_CHANGED)), null, "A legacy bare event is not a formal completion.");
  });
});

test("all seven browser apply call sites emit exactly one typed completion after transport success", async () => {
  const normal = { result: { applied: appliedChangeSet }, state: { version: "tianyan-normal-event-creation-port/r0" } };
  await withBrowserHarness(async (events) => {
    const complete = (pathname: string, body: Record<string, unknown>, data: unknown) => completeProjectProjectionTransport({ pathname: `/__local/story-studio${pathname}`, body, data, invalidationMode: "boundary" });
    complete("/event-line/normal-creation/confirm", { projectId: "project.a", planningEventId: "planning.1" }, normal);
    complete("/author-control/change-set/apply", { projectId: "project.a", changeSetId: "change.golden" }, appliedChangeSet);
    complete("/author-control/change-set/apply", { projectId: "project.a", changeSetId: "change.direct" }, appliedChangeSet);
    complete("/tianyi/creative/candidate/event-review/confirm", { projectId: "project.a", sessionId: "session.1", candidateId: "candidate.1" }, tianyiReview("active"));
    complete("/tianyi/creative/candidate/event-review/undo", { projectId: "project.a", sessionId: "session.1", candidateId: "candidate.1" }, tianyiReview("undone"));
    complete("/nuwa-n1/auto-apply", { projectId: "project.a", operationId: "op.apply" }, nuwaResult("applied"));
    complete("/nuwa-n1/auto-rollback", { projectId: "project.a", operationId: "op.rollback" }, nuwaResult("rolled-back"));
    assert.equal(events.length, 7);
    assert.deepEqual(events.map((event) => event.detail.operationPath), [
      "/event-line/normal-creation/confirm",
      "/author-control/change-set/apply",
      "/author-control/change-set/apply",
      "/tianyi/creative/candidate/event-review/confirm",
      "/tianyi/creative/candidate/event-review/undo",
      "/nuwa-n1/auto-apply",
      "/nuwa-n1/auto-rollback",
    ]);
    assert.equal(events.every((event) => event.detail.projectId === "project.a"), true);
    assert.equal(events[0].detail.workVersionId, undefined, "Normal confirm has no authoritative work version and must not guess one.");
    assert.equal(events[1].detail.workVersionId, undefined, "AuthorControl apply has no authoritative work version and must not guess one.");
    assert.equal(events[3].detail.workVersionId, "wv.root");
    assert.equal(events[4].detail.workVersionId, "wv.root");
    assert.equal(events[5].detail.workVersionId, "wv.root");
    assert.equal(events[6].detail.workVersionId, "wv.root");
  });
});

test("failed, stale, conflicted, and idempotent no-op applies emit no completion", async () => {
  await withBrowserHarness(async (events) => {
    completeProjectProjectionTransport({ pathname: "/__local/story-studio/author-control/change-set/apply", body: { projectId: "project.a" }, data: { ...appliedChangeSet, status: "stale", application: { ...appliedChangeSet.application, eventRecorded: false, appliedEventId: null } }, invalidationMode: "boundary" });
    completeProjectProjectionTransport({ pathname: "/__local/story-studio/event-line/normal-creation/confirm", body: { projectId: "project.a" }, data: { result: { applied: null } }, invalidationMode: "boundary" });
    completeProjectProjectionTransport({ pathname: "/__local/story-studio/world-objects/update", body: { projectId: "project.a" }, data: { conflict: true }, invalidationMode: "boundary" });
    completeProjectProjectionTransport({ pathname: "/__local/story-studio/nuwa-n1/auto-rollback", body: { projectId: "project.a" }, data: { automaticApplication: { status: "recovery-required", rollback: { status: "recovery-required", failure: "conflict" } } }, invalidationMode: "boundary" });
    completeProjectProjectionTransport({ pathname: "/__local/story-studio/planning-events/create", body: { projectId: "project.a" }, data: { planningEventId: "planning.1" }, invalidationMode: "boundary" });
    assert.equal(events.length, 0);
  });
});
