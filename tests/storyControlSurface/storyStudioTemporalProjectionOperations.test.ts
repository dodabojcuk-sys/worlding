import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioTemporalProjectionOperations } from "../../src/storyControlSurface/storyStudioTemporalProjectionOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("temporal projection creates Runs only for author requests and keeps operation idempotency without formal writes", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyan-temporal-projection-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "long-night-temporal";
  try {
    const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
    workspace.createProject({ title: "长夜将明", folderSlug: projectId });
    const sources = [
      workspace.createPlanningEvent({ projectId, title: "灯塔失火", tags: ["时间：第2夜"] }),
      workspace.createPlanningEvent({ projectId, title: "雾港启航" }),
      workspace.createPlanningEvent({ projectId, title: "异常信号增强", tags: ["时间：第4夜"] })
    ];
    const refs = sources.map((event) => ({ version: "story-studio-event-reference/v1" as const, projectId, eventId: event.id, revisionToken: event.revisionToken, state: "planned" as const, requestedUse: "constraint" as const }));
    const before = workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects;
    const operations = createStoryStudioTemporalProjectionOperations({ rootPath, stateFilePath, now: () => "2026-09-01T08:00:00.000Z" });
    const revision = operations.currentGraphRevision({ projectId, eventRefs: refs });
    const request = { projectId, graphRevisionHash: revision.graphRevisionHash, eventRefs: refs, operationId: "temporal-operation.author-a", trigger: "author-requested" as const };
    const created = operations.createTemporalProjectionRun({ request, runId: "temporal-run.auto-a" });
    assert.equal(created.status, "created");
    const duplicate = operations.createTemporalProjectionRun({ request, runId: "temporal-run.author-retry-render" });
    assert.equal(duplicate.runId, created.runId, "the same author operation remains idempotent");
    const secondAuthorRun = operations.createTemporalProjectionRun({ request: { ...request, operationId: "temporal-operation.author-b" }, runId: "temporal-run.author-b" });
    assert.notEqual(secondAuthorRun.runId, created.runId, "a separate explicit author request may create a new Run for the same revision");
    const ready = await operations.executeTemporalProjectionRun({ projectId, runId: created.runId });
    assert.equal(ready.status, "ready");
    assert.equal(ready.placements.length, sources.length);
    assert.equal(ready.placements.filter((item) => item.placementKind === "unplaced").length, 0, "story order remains weak evidence instead of a final unknown bucket");
    assert.equal(operations.readTemporalProjectionByRevision({ projectId, graphRevisionHash: revision.graphRevisionHash })?.runId, created.runId);
    assert.equal(createStoryStudioTemporalProjectionOperations({ rootPath, stateFilePath }).readTemporalProjectionRun({ projectId, runId: created.runId })?.status, "ready", "restart restores the persisted projection");
    assert.deepEqual(workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects, before);
    assert.equal(JSON.stringify(ready).includes("worldTime"), false);
    assert.equal(JSON.stringify(ready).includes("prompt"), false);

    const changed = workspace.readWorldObject({ projectId, objectId: sources[1]!.id });
    workspace.updateWorldObject({ projectId, objectId: changed.id, expectedHash: changed.revisionToken, title: changed.title, status: changed.status, tags: changed.tags, aliases: changed.aliases, body: `${changed.body}\n新的时间证据。` });
    assert.equal(operations.readTemporalProjectionRun({ projectId, runId: created.runId })?.stale, true);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});

test("author-requested failure does not retry and author retry is explicit", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyan-temporal-retry-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "long-night-temporal-retry";
  try {
    const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
    workspace.createProject({ title: "长夜将明", folderSlug: projectId });
    const event = workspace.createPlanningEvent({ projectId, title: "待推断事件" });
    const refs = [{ version: "story-studio-event-reference/v1" as const, projectId, eventId: event.id, revisionToken: event.revisionToken, state: "planned" as const, requestedUse: "constraint" as const }];
    let attempts = 0;
    const gateway = { async generate() { attempts += 1; throw new Error("temporal projection fixture failed"); } };
    const operations = createStoryStudioTemporalProjectionOperations({ rootPath, stateFilePath, gateway });
    const graphRevisionHash = operations.currentGraphRevision({ projectId, eventRefs: refs }).graphRevisionHash;
    const run = operations.createTemporalProjectionRun({ request: { projectId, graphRevisionHash, eventRefs: refs, operationId: "temporal-operation.failure", trigger: "author-requested" }, runId: "temporal-run.failure" });
    await assert.rejects(() => operations.executeTemporalProjectionRun({ projectId, runId: run.runId }), /fixture failed/u);
    assert.equal(attempts, 1);
    assert.equal(operations.readTemporalProjectionRun({ projectId, runId: run.runId })?.status, "failed");
    assert.equal(operations.listTemporalProjectionRuns({ projectId }).length, 1);
    await assert.rejects(() => operations.retryTemporalProjectionRun({ projectId, runId: run.runId }), /fixture failed/u);
    assert.equal(attempts, 2, "only an explicit author retry creates another Attempt");
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});
