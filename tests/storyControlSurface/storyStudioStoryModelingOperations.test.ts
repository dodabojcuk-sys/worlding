import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryModelingTestGateway } from "../../src/storyAgent/storyModelingGateway.ts";
import { createStoryStudioStoryModelingOperations } from "../../src/storyControlSurface/storyStudioStoryModelingOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("story modeling plans incremental and full-book scopes without Provider calls", async () => {
  const fixture = await setup();
  try {
    let calls = 0;
    const gateway = { async generate() { calls += 1; throw new Error("Planning must not dispatch the Provider."); } };
    const modeling = createStoryStudioStoryModelingOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, gateway });
    const plan = modeling.planStoryModeling({ projectId: fixture.projectId, tool: "infer-temporal-position", scope: { kind: "incremental", changedSourceIds: [], dependencySourceIds: [] }, eventRefs: fixture.refs });
    assert.equal(calls, 0);
    assert.equal(plan.scope.kind, "incremental");
    const full = modeling.planStoryModeling({ projectId: fixture.projectId, tool: "analyze-core-story", scope: { kind: "full-book", sourceIds: [] }, eventRefs: fixture.refs, structuralChange: true });
    assert.equal(full.scope.kind, "full-book");
    assert.equal(full.manifest.sources.length, fixture.refs.length + 3);
    assert.equal(full.estimate.originalSourceCount, 3);
    assert.equal(full.estimate.structuredEventCount, fixture.refs.length);
    assert.equal(full.modelingBasis, "original-sources");
    assert.equal(full.estimate.cost.status, "unavailable");
  } finally { await fixture.dispose(); }
});

test("one author confirmation creates one idempotent Run and test Provider output stays candidate-only", async () => {
  const fixture = await setup();
  try {
    let calls = 0;
    const testGateway = createStoryModelingTestGateway();
    const modeling = createStoryStudioStoryModelingOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, gateway: { async generate(input) { calls += 1; return testGateway.generate(input); } }, now: () => "2026-09-02T02:00:00.000Z" });
    const plan = modeling.planStoryModeling({ projectId: fixture.projectId, tool: "smart-relations", scope: { kind: "selection", sourceIds: [], eventRefs: fixture.refs, unitIds: ["story-unit.harbor"] }, eventRefs: fixture.refs });
    const request = { projectId: fixture.projectId, operationId: "story-modeling-operation.smart-1", tool: "smart-relations" as const, trigger: "author-requested" as const, scope: plan.scope, manifest: plan.manifest, eventRefs: fixture.refs, estimate: plan.estimate, authorConfirmedAt: "2026-09-02T01:59:59.000Z" };
    const run = modeling.createStoryModelingRun({ request, runId: "story-modeling-run.smart-1" });
    const duplicate = modeling.createStoryModelingRun({ request, runId: "story-modeling-run.smart-duplicate" });
    assert.equal(duplicate.runId, run.runId);
    assert.equal(calls, 0);
    assert.equal(JSON.stringify(run).includes("第一章正文中的秘密线索"), false);
    const ready = await modeling.executeStoryModelingRun({ projectId: fixture.projectId, runId: run.runId });
    assert.equal(calls, 1);
    assert.equal(ready.status, "ready");
    assert.equal(ready.provider?.executionKind, "test-provider");
    assert.ok((ready.result?.relationCandidates.length ?? 0) > 0);
    assert.equal(ready.actual?.providerRequests, 1);
    assert.deepEqual(fixture.workspace.getStoryStudioWorldLibraryBootstrap({ projectId: fixture.projectId }).objects, fixture.before);
  } finally { await fixture.dispose(); }
});

test("stopping a running StoryModeling Run prevents every subsequent batch", async () => {
  const fixture = await setup();
  try {
    let batchCalls = 0;
    let releaseFirstBatch!: () => void;
    const firstBatchPersisted = new Promise<void>((resolve) => { releaseFirstBatch = resolve; });
    const gateway = {
      async generate(input: Parameters<ReturnType<typeof createStoryModelingTestGateway>["generate"]>[0]) {
        batchCalls += 1;
        await input.onBatch?.({ batchIndex: 0, inputTokens: 40, outputTokens: 20, result: { tool: input.request.tool, structureFindings: [], temporalPlacements: [], relationCandidates: [], logicFindings: [], perspectiveMatches: [] } });
        releaseFirstBatch();
        await new Promise<void>((resolve, reject) => {
          if (input.signal.aborted) return reject(Object.assign(new Error("stopped"), { name: "AbortError" }));
          input.signal.addEventListener("abort", () => reject(Object.assign(new Error("stopped"), { name: "AbortError" })), { once: true });
        });
        throw new Error("unreachable");
      }
    };
    const modeling = createStoryStudioStoryModelingOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, gateway });
    const plan = modeling.planStoryModeling({ projectId: fixture.projectId, tool: "analyze-core-story", scope: { kind: "full-book", sourceIds: [] }, eventRefs: fixture.refs });
    const request = { projectId: fixture.projectId, operationId: "story-modeling-operation.stop", tool: "analyze-core-story" as const, trigger: "author-requested" as const, scope: plan.scope, manifest: plan.manifest, eventRefs: fixture.refs, selectedPerspectiveRefs: [], estimate: plan.estimate, authorConfirmedAt: "2026-09-02T01:59:59.000Z" };
    const run = modeling.createStoryModelingRun({ request, runId: "story-modeling-run.stop" });
    const execution = modeling.executeStoryModelingRun({ projectId: fixture.projectId, runId: run.runId });
    await firstBatchPersisted;
    const stopped = modeling.stopStoryModelingRun({ projectId: fixture.projectId, runId: run.runId });
    assert.equal(stopped.status, "stopped");
    await assert.rejects(execution, /stopped/u);
    assert.equal(batchCalls, 1);
    const restored = modeling.readStoryModelingRun({ projectId: fixture.projectId, runId: run.runId });
    assert.equal(restored?.status, "stopped");
    assert.equal(restored?.progress.completedBatches, 1);
  } finally { await fixture.dispose(); }
});

test("results from multiple StoryModeling tools survive an operations restart", async () => {
  const fixture = await setup();
  try {
    const first = createStoryStudioStoryModelingOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, gateway: createStoryModelingTestGateway(), now: () => "2026-09-02T02:00:00.000Z" });
    for (const [index, tool] of (["analyze-core-story", "infer-temporal-position"] as const).entries()) {
      const plan = first.planStoryModeling({ projectId: fixture.projectId, tool, scope: { kind: "selection", sourceIds: [], eventRefs: fixture.refs, unitIds: [] }, eventRefs: fixture.refs });
      const run = first.createStoryModelingRun({ request: { projectId: fixture.projectId, operationId: `story-modeling-operation.restore.${index}`, tool, trigger: "author-requested", scope: plan.scope, manifest: plan.manifest, eventRefs: fixture.refs, selectedPerspectiveRefs: [], estimate: plan.estimate, authorConfirmedAt: "2026-09-02T01:59:59.000Z" }, runId: `story-modeling-run.restore.${index}` });
      await first.executeStoryModelingRun({ projectId: fixture.projectId, runId: run.runId });
    }
    const restarted = createStoryStudioStoryModelingOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, gateway: createStoryModelingTestGateway() });
    const restored = restarted.listStoryModelingRuns({ projectId: fixture.projectId });
    assert.equal(restored.length, 2);
    assert.deepEqual(new Set(restored.map((run) => run.tool)), new Set(["analyze-core-story", "infer-temporal-position"]));
    assert.equal(restored.every((run) => run.status === "ready" && run.result !== null), true);
  } finally { await fixture.dispose(); }
});

test("logic finding author review is persisted by StoryModeling storage across restart", async () => {
  const fixture = await setup();
  try {
    const first = createStoryStudioStoryModelingOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, gateway: createStoryModelingTestGateway(), now: () => "2026-09-02T03:00:00.000Z" });
    const record = first.reviewStoryLogicFinding({ projectId: fixture.projectId, findingId: "logic-finding.temporal-1", source: "local", evidenceRefs: [`event:${fixture.refs[0]!.eventId}`, `event:${fixture.refs[1]!.eventId}`], authorStatus: "ignored" });
    assert.equal(record.authorStatus, "ignored");
    assert.match(record.evidenceDigest, /^sha256:[a-f0-9]{64}$/u);
    const restarted = createStoryStudioStoryModelingOperations({ rootPath: fixture.rootPath, stateFilePath: fixture.stateFilePath, gateway: createStoryModelingTestGateway() });
    assert.deepEqual(restarted.listStoryLogicReviews({ projectId: fixture.projectId }), [record]);
    const updated = restarted.reviewStoryLogicFinding({ projectId: fixture.projectId, findingId: record.findingId, source: "local", evidenceRefs: [`event:${fixture.refs[0]!.eventId}`, `event:${fixture.refs[1]!.eventId}`], authorStatus: "resolved" });
    assert.equal(updated.authorStatus, "resolved");
    assert.equal(restarted.listStoryLogicReviews({ projectId: fixture.projectId }).length, 1);
  } finally { await fixture.dispose(); }
});

async function setup() {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyan-story-modeling-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "long-night-modeling";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "长夜将明", folderSlug: projectId });
  const chapter = workspace.createWritingDocument({ projectId, type: "chapter", title: "第一章" });
  workspace.updateWritingDocument({ projectId, documentId: chapter.id, expectedHash: chapter.revisionToken, status: "drafting", body: "# 第一章\n\n第一章正文中的秘密线索。" });
  const scene = workspace.createWritingDocument({ projectId, type: "scene", title: "仓库场景", chapterId: chapter.id });
  workspace.updateWritingDocument({ projectId, documentId: scene.id, expectedHash: scene.revisionToken, status: "drafting", body: "# 仓库场景\n\n暗号在仓库中被传递。" });
  workspace.importSourceDocument({ projectId, filename: "旧稿.txt", title: "旧稿", content: "导入文档中的原始故事正文。", mode: "reference-only" });
  const events = ["暗号传递", "仓库对峙", "旧仓库封锁", "雾港启航"].map((title) => workspace.createPlanningEvent({ projectId, title, tags: ["Story Unit: 雾港"] }));
  const refs = events.map((event) => ({ version: "story-studio-event-reference/v1" as const, projectId, eventId: event.id, revisionToken: event.revisionToken, state: "planned" as const, requestedUse: "constraint" as const }));
  const before = workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects;
  return { rootPath, stateFilePath, projectId, workspace, refs, before, dispose: () => rm(rootPath, { recursive: true, force: true }) };
}
