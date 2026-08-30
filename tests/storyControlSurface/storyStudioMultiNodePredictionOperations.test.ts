import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createStoryStudioAuthorControl } from "../../src/storyControlSurface/storyStudioAuthorControl.ts";
import { createStoryStudioMultiNodePredictionOperations } from "../../src/storyControlSurface/storyStudioMultiNodePredictionOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("deterministic Tianyi prediction runs persist independently without Event, Relation, Canon, or WorldState writes", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyan-multi-node-prediction-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "long-night";
  try {
    const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
    workspace.createProject({ title: "长夜将明", folderSlug: projectId });
    const sources = ["暗号传递", "仓库对峙", "旧仓库封锁"].map((title) => workspace.createPlanningEvent({ projectId, title }));
    const before = workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects;
    const operations = createStoryStudioMultiNodePredictionOperations({ rootPath, stateFilePath, now: () => "2026-08-30T12:00:00.000Z" });
    const request = { projectId, sourceEventRefs: sources.map((event) => ({ version: "story-studio-event-reference/v1" as const, projectId, eventId: event.id, revisionToken: event.revisionToken, state: "planned" as const, requestedUse: "constraint" as const })), authorGoal: "推演后续", predictionMode: "forward-development", operationId: "prediction.operation.1" };
    const created = operations.createPredictionRun({ request, runId: "prediction-run.first" });
    assert.equal(created.status, "created");
    const ready = await operations.executePredictionRun({ projectId, runId: created.runId });
    assert.equal(ready.status, "ready");
    assert.equal(ready.bundle?.paths.length, 2);
    assert.equal(ready.bundle?.nodes.some((node) => node.timeConsistency.kind === "unknown"), true);
    assert.equal(operations.readPredictionRun({ projectId, runId: created.runId })?.bundle?.bundleId, ready.bundle?.bundleId);
    assert.deepEqual(workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects, before);
    const authorControl = createStoryStudioAuthorControl({ rootPath, stateFilePath });
    const review = authorControl.createPredictionReview({ projectId, runId: created.runId, pathId: "prediction-path.rain", selectedCandidateNodeIds: ["prediction-node.rain-trace"], decidedAt: "2026-08-30T12:01:00.000Z" });
    assert.equal(review.status, "reviewing");
    const drafted = authorControl.acceptPredictionReview({ projectId, reviewId: review.id, operationId: "prediction.accept.1", decidedAt: "2026-08-30T12:02:00.000Z" });
    assert.equal(drafted.status, "drafted");
    assert.equal((drafted.receipt as { items: Array<{ action: string }> }).items[0]?.action, "draft-created");
    assert.equal(authorControl.acceptPredictionReview({ projectId, reviewId: review.id, operationId: "prediction.accept.1", decidedAt: "2026-08-30T12:03:00.000Z" }).status, "drafted");
    const second = operations.createPredictionRun({ request: { ...request, operationId: "prediction.operation.2" }, runId: "prediction-run.second" });
    assert.equal(operations.listPredictionRuns({ projectId }).length, 2);
    assert.equal(second.runId, "prediction-run.second");
    assert.equal(workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects.filter((event) => event.status === "draft").length, 1);
  } finally { await rm(rootPath, { recursive: true, force: true }); }
});
