import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDeterministicMultiNodePredictionGateway, type MultiNodePredictionGateway } from "../../src/storyAgent/multiNodePredictionGateway.ts";
import { createStoryStudioMultiNodePredictionOperations } from "../../src/storyControlSurface/storyStudioMultiNodePredictionOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("author stop aborts the active attempt without story writes", async () => {
  const fixture = await setup("prediction-stop");
  try {
    const before = fixture.workspace.getStoryStudioWorldLibraryBootstrap({ projectId: fixture.projectId }).objects;
    const operations = createStoryStudioMultiNodePredictionOperations({ ...fixture.paths, gateway: hangingGateway(), executionTimeoutMs: 1_000 });
    const run = operations.createPredictionRun({ request: fixture.request, runId: "prediction-run.stop" });
    const running = operations.executePredictionRun({ projectId: fixture.projectId, runId: run.runId });
    await waitFor(() => operations.readPredictionExecution({ projectId: fixture.projectId, runId: run.runId }) !== null);
    assert.equal(operations.stopPredictionRun({ projectId: fixture.projectId, runId: run.runId, reason: "作者停止" }).status, "stopped");
    await assert.rejects(running, /aborted/u);
    assert.equal(operations.readPredictionRun({ projectId: fixture.projectId, runId: run.runId })?.status, "stopped");
    assert.equal(operations.readPredictionExecution({ projectId: fixture.projectId, runId: run.runId })?.attempts[0]?.status, "stopped");
    assert.deepEqual(fixture.workspace.getStoryStudioWorldLibraryBootstrap({ projectId: fixture.projectId }).objects, before);
  } finally { await fixture.dispose(); }
});

test("bounded timeout is visible and retry creates a new attempt while preserving the failed attempt", async () => {
  const fixture = await setup("prediction-timeout");
  try {
    let call = 0;
    const deterministic = createDeterministicMultiNodePredictionGateway();
    const gateway: MultiNodePredictionGateway = {
      async generate(input) {
        call += 1;
        await input.runtime?.onEvent?.({ type: "TianyiAgentRunStarted", runId: input.runtime.runId, attemptId: input.runtime.attemptId, recordedAt: "2026-08-31T00:00:00.000Z" });
        if (call === 1) return waitForAbort(input.runtime?.signal);
        const bundle = await deterministic.generate(input);
        await input.runtime?.onEvent?.({ type: "TianyiAgentCandidatesReady", runId: input.runtime.runId, attemptId: input.runtime.attemptId, nodeId: "agent-result.candidates", pathCount: bundle.paths.length, warningCount: 1, recordedAt: "2026-08-31T00:00:01.000Z" });
        return bundle;
      }
    };
    const operations = createStoryStudioMultiNodePredictionOperations({ ...fixture.paths, gateway, executionTimeoutMs: 15 });
    const run = operations.createPredictionRun({ request: fixture.request, runId: "prediction-run.timeout" });
    await assert.rejects(operations.executePredictionRun({ projectId: fixture.projectId, runId: run.runId }), /aborted/u);
    const failed = operations.readPredictionExecution({ projectId: fixture.projectId, runId: run.runId });
    assert.equal(failed?.attempts[0]?.status, "failed");
    assert.equal(failed?.attempts[0]?.events.some((event) => event.type === "TianyiAgentRunFailed" && event.timedOut), true);
    const ready = await operations.retryPredictionRun({ projectId: fixture.projectId, runId: run.runId });
    assert.equal(ready.status, "ready");
    const retried = operations.readPredictionExecution({ projectId: fixture.projectId, runId: run.runId });
    assert.equal(retried?.attempts.length, 2);
    assert.equal(retried?.attempts[0]?.status, "failed");
    assert.equal(retried?.attempts[1]?.status, "candidates_ready");
    const recovered = createStoryStudioMultiNodePredictionOperations({ ...fixture.paths, gateway });
    assert.equal(recovered.readPredictionExecution({ projectId: fixture.projectId, runId: run.runId })?.attempts.length, 2, "restart restores every attempt");
  } finally { await fixture.dispose(); }
});

test("tool or candidate schema failure persists a retryable failure and never writes formal data", async () => {
  const fixture = await setup("prediction-schema-failure");
  try {
    const before = fixture.workspace.getStoryStudioWorldLibraryBootstrap({ projectId: fixture.projectId }).objects;
    const gateway: MultiNodePredictionGateway = { async generate(input) { await input.runtime?.onEvent?.({ type: "TianyiAgentRunStarted", runId: input.runtime.runId, attemptId: input.runtime.attemptId, recordedAt: "2026-08-31T00:00:00.000Z" }); throw new Error("candidate schema invalid"); } };
    const operations = createStoryStudioMultiNodePredictionOperations({ ...fixture.paths, gateway });
    const run = operations.createPredictionRun({ request: fixture.request, runId: "prediction-run.schema" });
    await assert.rejects(operations.executePredictionRun({ projectId: fixture.projectId, runId: run.runId }), /schema/u);
    assert.equal(operations.readPredictionRun({ projectId: fixture.projectId, runId: run.runId })?.status, "failed");
    const failure = operations.readPredictionExecution({ projectId: fixture.projectId, runId: run.runId })?.attempts[0]?.events.at(-1);
    assert.equal(failure?.type, "TianyiAgentRunFailed");
    assert.deepEqual(fixture.workspace.getStoryStudioWorldLibraryBootstrap({ projectId: fixture.projectId }).objects, before);
  } finally { await fixture.dispose(); }
});

function hangingGateway(): MultiNodePredictionGateway {
  return { async generate(input) { await input.runtime?.onEvent?.({ type: "TianyiAgentRunStarted", runId: input.runtime.runId, attemptId: input.runtime.attemptId, recordedAt: "2026-08-31T00:00:00.000Z" }); return waitForAbort(input.runtime?.signal); } };
}
function waitForAbort(signal?: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    const fail = () => { const error = new Error("aborted"); error.name = "AbortError"; reject(error); };
    if (signal?.aborted) fail(); else signal?.addEventListener("abort", fail, { once: true });
  });
}
async function waitFor(predicate: () => boolean): Promise<void> { const deadline = Date.now() + 1_000; while (!predicate()) { if (Date.now() > deadline) throw new Error("condition timeout"); await new Promise((resolve) => setTimeout(resolve, 5)); } }

async function setup(slug: string) {
  const rootPath = await mkdtemp(path.join(tmpdir(), `${slug}-`));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = slug;
  const workspace = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
  workspace.createProject({ title: slug, folderSlug: projectId });
  const sources = ["暗号传递", "仓库对峙", "旧仓库封锁"].map((title) => workspace.createPlanningEvent({ projectId, title }));
  return {
    paths: { rootPath, stateFilePath }, projectId, workspace,
    request: { projectId, sourceEventRefs: sources.map((event) => ({ version: "story-studio-event-reference/v1" as const, projectId, eventId: event.id, revisionToken: event.revisionToken, state: "planned" as const, requestedUse: "constraint" as const })), authorGoal: "推演后续", predictionMode: "forward-development" as const, operationId: `prediction.operation.${slug}` },
    dispose: () => rm(rootPath, { recursive: true, force: true })
  };
}
