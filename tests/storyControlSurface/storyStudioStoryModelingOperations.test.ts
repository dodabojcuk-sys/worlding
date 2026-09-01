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
    assert.equal(full.manifest.sources.length, fixture.refs.length);
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
    const ready = await modeling.executeStoryModelingRun({ projectId: fixture.projectId, runId: run.runId });
    assert.equal(calls, 1);
    assert.equal(ready.status, "ready");
    assert.equal(ready.provider?.executionKind, "test-provider");
    assert.ok((ready.result?.relationCandidates.length ?? 0) > 0);
    assert.equal(ready.actual?.providerRequests, 1);
    assert.deepEqual(fixture.workspace.getStoryStudioWorldLibraryBootstrap({ projectId: fixture.projectId }).objects, fixture.before);
  } finally { await fixture.dispose(); }
});

async function setup() {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyan-story-modeling-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "long-night-modeling";
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: "长夜将明", folderSlug: projectId });
  const events = ["暗号传递", "仓库对峙", "旧仓库封锁", "雾港启航"].map((title) => workspace.createPlanningEvent({ projectId, title, tags: ["Story Unit: 雾港"] }));
  const refs = events.map((event) => ({ version: "story-studio-event-reference/v1" as const, projectId, eventId: event.id, revisionToken: event.revisionToken, state: "planned" as const, requestedUse: "constraint" as const }));
  const before = workspace.getStoryStudioWorldLibraryBootstrap({ projectId }).objects;
  return { rootPath, stateFilePath, projectId, workspace, refs, before, dispose: () => rm(rootPath, { recursive: true, force: true }) };
}
