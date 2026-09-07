import assert from "node:assert/strict";
import test from "node:test";

import { buildStoryIntakeEnvelope } from "../../src/storyContracts/storyIntakeEnvelope.ts";
import {
  compactTianyiAgentContext,
  createTianyiAgentRuntimePort,
  TIANYI_AGENT_TOOL_REGISTRY,
  validateTianyiAgentToolCall,
  type TianyiAgentContextManifest,
  type TianyiAgentRuntimeDependencies,
  type TianyiAgentRuntimeEvent
} from "../../src/storyAgent/tianyiAgentRuntimePort.ts";

function manifest(sessionId: string, workVersionId = "work-version.fixture"): TianyiAgentContextManifest {
  return {
    version: "tianyi-agent-context-manifest/v1",
    projectId: "project-fixture",
    workVersionId,
    sessionId,
    currentPage: "/tianyi",
    selectedObjectIds: [],
    sourceRefs: [{ id: "source.fixture", label: "隔离来源", hash: "a".repeat(64), state: "current" }],
    authorSourceRefs: ["event.author.1"],
    excludedRefs: [],
    unresolvedQuestions: ["作者是否确认这个方向？"],
    estimatedTokens: 120,
    compaction: { state: "none", summaryVersion: 0, preservedAnchors: ["event.author.1"], receiptId: null }
  };
}

function fixtureAdapter(runProvider?: NonNullable<TianyiAgentRuntimeDependencies["runProvider"]>) {
  const events: TianyiAgentRuntimeEvent[] = [];
  return {
    events,
    adapter: createTianyiAgentRuntimePort({
      persistence: {
        async appendEvent(event) {
          const existing = events.find((item) => item.operationId === event.operationId && item.runId === event.runId);
          if (existing) return { alreadyCompleted: true, receiptId: existing.projection.receipts.at(-1)?.receiptId || "receipt.existing" };
          events.push(event);
          return { alreadyCompleted: false, receiptId: event.projection.receipts.at(-1)?.receiptId || "receipt.fixture" };
        },
        async readEvents(input) { return events.filter((event) => event.runId === input.runId && event.projection.projectId === input.projectId && event.projection.workVersionId === input.workVersionId && event.projection.sessionId === input.sessionId); }
      },
      async buildContextManifest(input) { return manifest(input.sessionId, input.workVersionId); },
      async fixtureResponse(input) {
        return {
          text: `已读取来源，完成任务：${input.task}`,
          candidates: [{ candidateId: "candidate.fixture.character", kind: "character", title: "待确认角色", summary: "仅作为现有资料审核候选。", sourceRefs: input.contextManifest.authorSourceRefs, uncertainties: ["仍需作者确认"], targetOwnerKind: "agent-recognition-proposal", state: "pending", ownerReceipt: null }]
        };
      },
      ...(runProvider ? { runProvider } : {}),
      async handoffCandidate() { return { owner: "agent-recognition-proposal", id: "proposal.fixture", revision: 1 }; }
    })
  };
}

test("Tianyi runtime keeps a recoverable plan, approvals and owner handoff in one adapter", async () => {
  const fixture = fixtureAdapter();
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.fixture", task: "检查角色边界", currentPage: "/tianyi", operationId: "operation.start" });
  assert.equal(started.status, "awaiting_author");
  assert.equal(started.plan[0]?.requiredPermission, "author-approval");

  const contextReady = await fixture.adapter.approveStep({ projectId: "project-fixture", workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.approve.context" });
  assert.equal(contextReady.contextManifest?.sessionId, "session.fixture");
  const analyzed = await fixture.adapter.continueRun({ projectId: "project-fixture", workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.analysis" });
  assert.equal(analyzed.status, "awaiting_author");
  assert.equal(analyzed.candidates[0]?.state, "pending");

  const handedOff = await fixture.adapter.handoffCandidate({ projectId: "project-fixture", workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, candidateId: "candidate.fixture.character", operationId: "operation.handoff" });
  assert.equal(handedOff.candidates[0]?.state, "handed-off");
  assert.equal(handedOff.candidates[0]?.ownerReceipt?.id, "proposal.fixture");

  const paused = await fixture.adapter.pauseRun({ projectId: "project-fixture", workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.pause" });
  assert.equal(paused.status, "paused");
  const resumed = await fixture.adapter.resumeRun({ projectId: "project-fixture", workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.resume" });
  assert.equal(resumed.status, "completed");

  const recoveredAdapter = fixtureAdapter();
  recoveredAdapter.events.push(...fixture.events);
  const recovered = await recoveredAdapter.adapter.recoverRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.fixture", runId: started.runId });
  assert.equal(recovered?.runId, started.runId);
  assert.equal(recovered?.candidates[0]?.ownerReceipt?.id, "proposal.fixture");
  assert.ok((recovered?.receipts.length ?? 0) <= 4, "the recoverable projection stays bounded while the append-only event log retains every operation");
  assert.ok(fixture.events.length >= 6);
});

test("a fresh browser can recover only the current project/work-version Story Intake Envelope", async () => {
  const seed = fixtureAdapter();
  const started = await seed.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.persisted", task: "整理作者原话", currentPage: "/tianyi", operationId: "operation.persisted.start" });
  const envelope = buildStoryIntakeEnvelope({
    projectId: started.projectId,
    sessionId: started.sessionId,
    runId: started.runId,
    sourceRef: { sessionId: started.sessionId, eventId: "event.author.persisted", contentHash: "a".repeat(64) },
    sourceText: "林昭在雾港确认钟声来自旧港。",
    baseVersion: { workVersionId: started.workVersionId, revision: 1, manifestId: "manifest.persisted" },
    toolArguments: { candidates: [{ localRef: "event.bell", type: "event", proposedName: null, proposedTitle: "钟声来源确认", summary: "林昭确认钟声来自旧港。", sourceSpan: { excerpt: "林昭在雾港确认钟声来自旧港" }, confidence: 0.9, uncertainties: ["具体时间待作者确认。"], existingEntityId: null, identityDecision: "propose_new", proposedRelations: [], warnings: [], narrativePath: null }] },
    providerCalls: 1,
    requestedProviderId: "local-fake",
    requestedModelId: "deterministic",
    responseModelId: "deterministic",
    createdAt: "2026-09-05T00:00:00.000Z"
  });
  const event: TianyiAgentRuntimeEvent = { version: "tianyi-agent-runtime-event/v1", runId: started.runId, workVersionId: started.workVersionId, operationId: "operation.persisted.snapshot", kind: "snapshot", projection: { ...started, storyIntakeEnvelope: envelope }, recordedAt: "2026-09-05T00:00:01.000Z" };
  const adapter = createTianyiAgentRuntimePort({
    persistence: { async appendEvent() { return { alreadyCompleted: false, receiptId: "receipt.fixture" }; }, async readEvents() { return []; }, async findLatestStoryIntakeRun() { return event; }, async listStoryIntakeRuns() { return [event]; } },
    async buildContextManifest(input) { return manifest(input.sessionId, input.workVersionId); }
  });

  const recovered = await adapter.findLatestStoryIntakeRun({ projectId: "project-fixture", workVersionId: "work-version.fixture" });
  assert.equal(recovered?.sessionId, "session.persisted");
  assert.equal(recovered?.runId, started.runId);
  assert.equal(recovered?.storyIntakeEnvelope?.envelopeId, envelope.envelopeId);
  const listed = await adapter.listStoryIntakeRuns({ projectId: "project-fixture", workVersionId: "work-version.fixture" });
  assert.deepEqual(listed.map((run) => `${run.sessionId}:${run.runId}`), [`session.persisted:${started.runId}`], "all-batch discovery keeps the persisted run identity without copying its Envelope");
  assert.deepEqual(await adapter.listStoryIntakeRuns({ projectId: "project.other", workVersionId: "work-version.fixture" }), [], "all-batch discovery rejects cross-project records");
  assert.equal(await adapter.findLatestStoryIntakeRun({ projectId: "project.other", workVersionId: "work-version.fixture" }), null, "another project cannot discover this Envelope");
  assert.equal(await adapter.findLatestStoryIntakeRun({ projectId: "project-fixture", workVersionId: "work-version.other" }), null, "another work version cannot discover this Envelope");
});

test("runtime durably replays stream events and rejects a different work-version scope", async () => {
  const fixture = fixtureAdapter(async (input) => {
    await input.onExecutionIdentity({ providerId: "fixture", profileId: "fixture-profile", modelId: "fixture-request-model" });
    await input.onEvent({ type: "response-metadata", responseModelId: "fixture-response-model", sequence: 1, recordedAt: "2026-08-29T00:00:00.000Z" });
    await input.onEvent({ type: "text-delta", delta: "分段一", sequence: 2, recordedAt: "2026-08-29T00:00:01.000Z" });
    await input.onEvent({ type: "text-delta", delta: "分段二", sequence: 3, recordedAt: "2026-08-29T00:00:02.000Z" });
    return { providerId: "fixture", profileId: "fixture-profile", modelId: "fixture-request-model", responseModelId: "fixture-response-model", text: "分段一分段二", providerCalls: 1, traceId: "trace.fixture", latencyMs: 12, usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 } };
  });
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.a", sessionId: "session.stream", task: "流式测试", currentPage: "/tianyi", operationId: "operation.stream.start" });
  await fixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.stream.approve" });
  const delivered: string[] = [];
  const completed = await fixture.adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.stream.run", onEvent(event) { if (event.type === "text-delta") delivered.push(event.delta); } });
  assert.equal(completed.resultSummary, "分段一分段二");
  assert.equal(completed.observability.streamEventCount, 3);
  assert.equal(completed.observability.totalTokens, 7);
  assert.equal(completed.executionIdentity.requestedModelId, "fixture-request-model");
  assert.equal(completed.executionIdentity.responseModelId, "fixture-response-model");
  assert.deepEqual(delivered, ["分段一", "分段二"]);
  const replay = await fixture.adapter.readRunEvents({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId });
  assert.deepEqual(replay.filter((event) => event.kind === "stream").map((event) => event.streamEvent?.type), ["response-metadata", "text-delta", "text-delta"]);
  assert.equal(await fixture.adapter.recoverRun({ projectId: started.projectId, workVersionId: "work-version.b", sessionId: started.sessionId, runId: started.runId }), null);
});

test("Story Intake fails explicitly when a Provider returns only text instead of the required native tool", async () => {
  const events: TianyiAgentRuntimeEvent[] = [];
  const adapter = createTianyiAgentRuntimePort({
    persistence: {
      async appendEvent(event) { events.push(event); return { alreadyCompleted: false, receiptId: "receipt.fixture" }; },
      async readEvents(input) { return events.filter((event) => event.runId === input.runId); }
    },
    async buildContextManifest(input) { return { ...manifest(input.sessionId, input.workVersionId), storyIntakeSource: { version: "tianyan-story-intake-context/v1", sourceRef: { sessionId: input.sessionId, eventId: "event.author.intake", contentHash: "a".repeat(64) }, sourceLength: 80 } }; },
    async runProvider(input) {
      await input.onExecutionIdentity({ providerId: "fixture", profileId: "fixture-profile", modelId: "fixture-model" });
      await input.onEvent({ type: "text-delta", delta: "自由文本不能成为候选", sequence: 1, recordedAt: "2026-09-05T00:00:00.000Z" });
      return { providerId: "fixture", profileId: "fixture-profile", modelId: "fixture-model", responseModelId: null, text: "自由文本不能成为候选", providerCalls: 1, traceId: null, latencyMs: 10, usage: null, storyIntakeEnvelope: null };
    }
  });
  const started = await adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.intake-text", task: "整理为故事候选", currentPage: "/tianyi", contextRequest: { storyIntake: { version: "tianyan-story-intake-request/v1" } }, operationId: "operation.intake-text.start" });
  const contextReady = await adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.intake-text.context" });
  const failed = await adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.intake-text.run" });
  assert.equal(contextReady.status, "running");
  assert.equal(failed.status, "failed");
  assert.equal(failed.error?.code, "invalid-tool-call");
  assert.equal(failed.storyIntakeEnvelope, null);
  assert.equal(failed.candidates.length, 0);
});

test("event-line work records only the frozen ContextPack receipt without provider tools or semantic writes", async () => {
  const fixture = fixtureAdapter();
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.event", task: "检查明确因果、开放问题和局部节奏", currentPage: "/event-line", operationId: "operation.event.start" });
  const contextReady = await fixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.event.approve" });
  const names = contextReady.toolCalls.map((call) => call.toolName);
  assert.deepEqual(names, ["read_context_manifest"]);
  assert.equal(contextReady.budget.maxProviderCalls, 1);
  assert.equal(contextReady.budget.providerCalls, 0);
  assert.equal(contextReady.candidates.length, 0);
});

test("Tianyi runtime rejects unknown tools and preserves compaction anchors", () => {
  assert.throws(() => validateTianyiAgentToolCall({ toolName: "bash", arguments: {} }), /未声明/);
  assert.throws(() => validateTianyiAgentToolCall({ toolName: "prepare_owner_handoff", arguments: {} }), /必填/);
  const compacted = compactTianyiAgentContext({ manifest: manifest("session.fixture"), summary: "只保留作者原话和来源锚点。", receiptId: "receipt.compaction" });
  assert.equal(compacted.compaction.state, "applied");
  assert.ok(compacted.compaction.preservedAnchors.includes("event.author.1"));
  assert.equal(compacted.compaction.receiptId, "receipt.compaction");
});

test("Tianyi tool registry is explicit, bounded and owner-scoped", () => {
  const names = new Set(TIANYI_AGENT_TOOL_REGISTRY.map((tool) => tool.name));
  for (const required of [
    "read_context_manifest",
    "read_story_selection",
    "read_related_world_objects",
    "read_event_line_projection",
    "read_event_focus_context",
    "read_pending_candidates",
    "read_open_questions",
    "propose_entity_candidate",
    "propose_event_candidate",
    "submit_event_graph_candidate",
    "suggest_context_adjustment",
    "find_duplicate_candidates",
    "prepare_owner_handoff"
  ]) assert.equal(names.has(required), true, `missing ${required}`);
  for (const tool of TIANYI_AGENT_TOOL_REGISTRY) {
    assert.ok(tool.owner);
    assert.ok(tool.timeoutMs > 0 && tool.timeoutMs <= 5_000);
    assert.equal(tool.idempotency, "operation-id");
  }
  assert.throws(() => validateTianyiAgentToolCall({ toolName: "read_context_manifest", arguments: { url: "https://example.invalid" } }), /未声明字段/);
  assert.throws(() => validateTianyiAgentToolCall({ toolName: "submit_event_graph_candidate", arguments: { sourceEventId: "event.same", targetEventId: "event.same", relationTypeId: "relation-type.fixture" } }), /不同的正式事件/);
});

test("Tianyi runtime preserves author control across rejection, steering and cancellation", async () => {
  const fixture = fixtureAdapter();
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.control", task: "检查当前上下文", currentPage: "/tianyi", operationId: "operation.control.start" });
  const rejected = await fixture.adapter.rejectStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, reason: "暂不读取来源", operationId: "operation.control.reject" });
  assert.equal(rejected.status, "paused");
  assert.equal(rejected.contextManifest, null);
  const steered = await fixture.adapter.steerRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, instruction: "只看当前章节", operationId: "operation.control.steer" });
  assert.equal(steered.steering[0]?.instruction, "只看当前章节");
  const cancelled = await fixture.adapter.cancelRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, reason: "作者停止", operationId: "operation.control.cancel" });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.error?.category, "cancelled");
  const duplicateCancel = await fixture.adapter.cancelRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, reason: "重复停止", operationId: "operation.control.cancel" });
  assert.equal(duplicateCancel.status, "cancelled");
});

test("a successful cancel remains terminal when a buffered Provider completion arrives late", async () => {
  let releaseCompletion: (() => void) | null = null;
  let firstDeltaSaved: (() => void) | null = null;
  const completionGate = new Promise<void>((resolve) => { releaseCompletion = resolve; });
  const firstDeltaGate = new Promise<void>((resolve) => { firstDeltaSaved = resolve; });
  const fixture = fixtureAdapter(async (input) => {
    await input.onExecutionIdentity({ providerId: "fixture", profileId: "fixture-profile", modelId: "fixture-model" });
    await input.onEvent({ type: "text-delta", delta: "第一个可见分段", sequence: 1, recordedAt: "2026-09-07T00:00:00.000Z" });
    firstDeltaSaved?.();
    await completionGate;
    // Deliberately ignore input.signal here: this is the late buffered result
    // a transport can still deliver after the author has stopped the attempt.
    return { providerId: "fixture", profileId: "fixture-profile", modelId: "fixture-model", responseModelId: "fixture-model", text: "不应覆盖取消终态", providerCalls: 1, traceId: "trace.late", latencyMs: 8, usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 } };
  });
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.cancel-race", task: "取消竞态", currentPage: "/tianyi", operationId: "operation.cancel-race.start" });
  await fixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.cancel-race.context" });
  const controller = new AbortController();
  const inFlight = fixture.adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.cancel-race.stream", signal: controller.signal });
  await firstDeltaGate;
  const cancelled = await fixture.adapter.cancelRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, reason: "作者停止运行", operationId: "operation.cancel-race.cancel" });
  assert.equal(cancelled.status, "cancelled");
  const cancellationRevision = cancelled.revision;
  controller.abort();
  releaseCompletion?.();
  const lateResult = await inFlight;
  assert.equal(lateResult.runId, started.runId);
  assert.equal(lateResult.status, "cancelled", "a late stream completion cannot reactivate the cancelled attempt");
  assert.equal(lateResult.revision, cancellationRevision);
  const recovered = await fixture.adapter.recoverRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId });
  assert.equal(recovered?.status, "cancelled");
  assert.equal(recovered?.revision, cancellationRevision);
  assert.equal(fixture.events.at(-1)?.projection.status, "cancelled", "the owner event log retains the terminal cancellation");
  assert.equal(fixture.events.at(-1)?.projection.executionIdentity.runId, started.runId);
});

test("cancel waits for an in-progress owner append instead of losing to a same-run write conflict", async () => {
  const events: TianyiAgentRuntimeEvent[] = [];
  let acceptedStreamProjection: TianyiAgentRuntimeEvent["projection"] | null = null;
  let releaseStreamAppend: (() => void) | null = null;
  let streamAppendEntered: (() => void) | null = null;
  let releaseProvider: (() => void) | null = null;
  const streamAppendGate = new Promise<void>((resolve) => { releaseStreamAppend = resolve; });
  const streamAppendStarted = new Promise<void>((resolve) => { streamAppendEntered = resolve; });
  const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
  let ownerBusy = false;
  const adapter = createTianyiAgentRuntimePort({
    persistence: {
      async appendEvent(event) {
        if (ownerBusy) throw new Error("Agent 运行回执写入冲突；请重新读取后再试。");
        ownerBusy = true;
        try {
          if (event.kind === "stream") {
            streamAppendEntered?.();
            await streamAppendGate;
            acceptedStreamProjection = structuredClone(event.projection);
          }
          events.push(event);
          return { alreadyCompleted: false, receiptId: event.projection.receipts.at(-1)?.receiptId || "receipt.fixture" };
        } finally {
          ownerBusy = false;
        }
      },
      async readEvents(input) { return events.filter((event) => event.runId === input.runId); }
    },
    async buildContextManifest(input) { return manifest(input.sessionId, input.workVersionId); },
    async runProvider(input) {
      await input.onExecutionIdentity({ providerId: "fixture", profileId: "fixture-profile", modelId: "fixture-model" });
      await input.onEvent({ type: "text-delta", delta: "正在写入可见分段", sequence: 1, recordedAt: "2026-09-07T00:00:00.000Z" });
      await providerGate;
      return { providerId: "fixture", profileId: "fixture-profile", modelId: "fixture-model", responseModelId: "fixture-model", text: "晚到结果", providerCalls: 1, traceId: "trace.owner-overlap", latencyMs: 8, usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 } };
    },
    async cancelProvider() { return true; }
  });
  const started = await adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.owner-overlap", task: "取消与写入重叠", currentPage: "/tianyi", operationId: "operation.owner-overlap.start" });
  await adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.owner-overlap.context" });
  const inFlight = adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.owner-overlap.stream" });
  await streamAppendStarted;
  const cancelling = adapter.cancelRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, reason: "作者停止运行", operationId: "operation.owner-overlap.cancel" });
  releaseStreamAppend?.();
  const cancelled = await cancelling;
  assert.equal(cancelled.status, "cancelled", "the author cancel is serialized after the accepted stream append");
  assert.equal(cancelled.revision, (acceptedStreamProjection?.revision ?? 0) + 1, "cancellation advances from the queued stream projection instead of reusing its stale revision");
  assert.equal(cancelled.observability.streamEventCount, 1, "cancellation preserves the already accepted stream count");
  assert.ok(cancelled.receipts.some((receipt) => receipt.operationId === "operation.owner-overlap.stream.stream.1"), "cancellation retains the accepted stream receipt");
  releaseProvider?.();
  const late = await inFlight;
  assert.equal(late.status, "cancelled");
  assert.equal(events.at(-1)?.projection.status, "cancelled", "the existing Session owner keeps cancellation as the final projection");
});

test("same-Session runs serialize their owner writes without sharing or losing their projections", async () => {
  const events: TianyiAgentRuntimeEvent[] = [];
  let ownerBusy = false;
  let releaseOwnerWrite: (() => void) | null = null;
  let firstOwnerWriteEntered: (() => void) | null = null;
  const ownerWriteGate = new Promise<void>((resolve) => { releaseOwnerWrite = resolve; });
  const firstOwnerWrite = new Promise<void>((resolve) => { firstOwnerWriteEntered = resolve; });
  let holdConcurrentWrites = false;
  let ownerCollisionCount = 0;
  const adapter = createTianyiAgentRuntimePort({
    persistence: {
      async appendEvent(event) {
        if (ownerBusy) {
          ownerCollisionCount += 1;
          throw new Error("Agent 运行回执写入冲突；请重新读取后再试。");
        }
        ownerBusy = true;
        try {
          if (holdConcurrentWrites) {
            firstOwnerWriteEntered?.();
            await ownerWriteGate;
          }
          events.push(event);
          return { alreadyCompleted: false, receiptId: event.projection.receipts.at(-1)?.receiptId || "receipt.fixture" };
        } finally {
          ownerBusy = false;
        }
      },
      async readEvents(input) { return events.filter((event) => event.runId === input.runId); }
    },
    async buildContextManifest(input) { return manifest(input.sessionId, input.workVersionId); }
  });
  const first = await adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.shared-owner", task: "第一条并行 Run", currentPage: "/tianyi", operationId: "operation.shared.first.start" });
  const second = await adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.shared-owner", task: "第二条并行 Run", currentPage: "/tianyi", operationId: "operation.shared.second.start" });
  holdConcurrentWrites = true;
  const firstSteering = adapter.steerRun({ projectId: first.projectId, workVersionId: first.workVersionId, sessionId: first.sessionId, runId: first.runId, instruction: "第一条纠正", operationId: "operation.shared.first.steer" });
  await firstOwnerWrite;
  const secondSteering = adapter.steerRun({ projectId: second.projectId, workVersionId: second.workVersionId, sessionId: second.sessionId, runId: second.runId, instruction: "第二条纠正", operationId: "operation.shared.second.steer" });
  void secondSteering.catch(() => undefined);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(ownerCollisionCount, 0, "same-Session Run writes wait for the shared owner lane instead of racing its CAS");
  releaseOwnerWrite?.();
  const [firstUpdated, secondUpdated] = await Promise.all([firstSteering, secondSteering]);
  assert.equal(firstUpdated.steering[0]?.instruction, "第一条纠正");
  assert.equal(secondUpdated.steering[0]?.instruction, "第二条纠正");
  assert.ok(firstUpdated.revision > first.revision);
  assert.ok(secondUpdated.revision > second.revision);
  assert.equal(events.filter((event) => event.operationId.endsWith(".steer")).length, 2, "both Run projections persist through the one Session owner");
});

test("a cancel that arrives after durable completion reports completion, while a failed cancel is never optimistic", async () => {
  const completedFixture = fixtureAdapter();
  const started = await completedFixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.completed-before-cancel", task: "完成优先", currentPage: "/tianyi", operationId: "operation.completed-before-cancel.start" });
  await completedFixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.completed-before-cancel.context" });
  const completed = await completedFixture.adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.completed-before-cancel.complete" });
  assert.equal(completed.status, "awaiting_author");
  const finalized = await completedFixture.adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.completed-before-cancel.finalize" });
  assert.equal(finalized.status, "completed");
  const lateCancel = await completedFixture.adapter.cancelRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, reason: "太晚了", operationId: "operation.completed-before-cancel.cancel" });
  assert.equal(lateCancel.status, "completed");

  const failingFixture = fixtureAdapter();
  const cancelledAdapter = createTianyiAgentRuntimePort({
    persistence: {
      async appendEvent(event) { failingFixture.events.push(event); return { alreadyCompleted: false, receiptId: "receipt.fixture" }; },
      async readEvents(input) { return failingFixture.events.filter((event) => event.runId === input.runId); }
    },
    async buildContextManifest(input) { return manifest(input.sessionId, input.workVersionId); },
    async cancelProvider() { throw new Error("取消请求未被服务端确认"); }
  });
  const failingStart = await cancelledAdapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.cancel-failure", task: "取消失败", currentPage: "/tianyi", operationId: "operation.cancel-failure.start" });
  await assert.rejects(cancelledAdapter.cancelRun({ projectId: failingStart.projectId, workVersionId: failingStart.workVersionId, sessionId: failingStart.sessionId, runId: failingStart.runId, reason: "作者停止", operationId: "operation.cancel-failure.cancel" }), /未被服务端确认/u);
  const stillActive = await cancelledAdapter.recoverRun({ projectId: failingStart.projectId, workVersionId: failingStart.workVersionId, sessionId: failingStart.sessionId, runId: failingStart.runId });
  assert.equal(stillActive?.status, "awaiting_author", "a failed cancel request cannot be reported as cancelled");
});

test("native product tool requests pause for durable author approval before provider retry", async () => {
  let attempts = 0;
  let authorizedReceipt = "";
  const fixture = fixtureAdapter(async (input) => {
    attempts += 1;
    const call = { toolName: "create_artifact", arguments: { type: "screenplay", title: "批准后草稿", content: "正文" } };
    const decision = await input.authorizeTool(call);
    if (!decision.allowed) {
      const error = Object.assign(new Error("approval required"), { code: "tool-approval-required", retryable: false, toolCall: call });
      throw error;
    }
    authorizedReceipt = decision.approvalReceiptId || "";
    await input.onEvent({ type: "tool-call-start", toolCallId: "provider.call", toolName: call.toolName, sequence: 1, recordedAt: "2026-08-29T00:00:00.000Z" });
    await input.onEvent({ type: "tool-call-end", toolCallId: "provider.call", toolName: call.toolName, isError: false, sequence: 2, recordedAt: "2026-08-29T00:00:01.000Z" });
    return { providerId: "fixture", profileId: "fixture-profile", modelId: "fixture-model", text: "产物已按审批创建。", providerCalls: 1, traceId: "trace.tool", latencyMs: 3, usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 } };
  });
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.tool", task: "生成普通草稿", currentPage: "/creation", operationId: "operation.tool.start" });
  const contextReady = await fixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.tool.context" });
  const requested = await fixture.adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.tool.request" });
  assert.equal(requested.status, "awaiting_author");
  assert.equal(requested.toolCalls.at(-1)?.status, "requested");
  const toolStep = requested.plan.find((step) => step.kind === "product-tool")!;
  const completed = await fixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: toolStep.stepId, operationId: "operation.tool.approve" });
  assert.equal(attempts, 2);
  assert.match(authorizedReceipt, /^receipt\.tianyi-agent-approval\./u);
  assert.equal(completed.toolCalls.at(-1)?.status, "completed");
});

test("rejected native product tool request remains non-executable after recovery", async () => {
  const fixture = fixtureAdapter(async () => {
    const call = { toolName: "propose_entity_candidate", arguments: { kind: "character", title: "未批准角色" } };
    throw Object.assign(new Error("approval required"), { code: "tool-approval-required", retryable: false, toolCall: call });
  });
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.reject-tool", task: "提议角色", currentPage: "/library", operationId: "operation.reject-tool.start" });
  await fixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.reject-tool.context" });
  const requested = await fixture.adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.reject-tool.request" });
  const toolStep = requested.plan.find((step) => step.kind === "product-tool")!;
  const rejected = await fixture.adapter.rejectStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: toolStep.stepId, operationId: "operation.reject-tool.reject", reason: "作者拒绝" });
  assert.equal(rejected.toolCalls.at(-1)?.status, "rejected");
  const recovered = await fixture.adapter.recoverRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId });
  assert.equal(recovered?.toolCalls.at(-1)?.status, "rejected");
});

test("configured production run path never disguises Provider unavailable with fixture output", async () => {
  const fixture = fixtureAdapter(async (input) => {
    await input.onExecutionIdentity({ providerId: "configured-provider", profileId: "configured-profile", modelId: "requested-model" });
    throw Object.assign(new Error("Provider 未配置"), { name: "ProviderUnavailable", code: "provider-unavailable", retryable: false });
  });
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.unconfigured", task: "真实 Provider 测试", currentPage: "/tianyi", operationId: "operation.unconfigured.start" });
  await fixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.unconfigured.context" });
  const failed = await fixture.adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.unconfigured.run" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error?.category, "provider-unavailable");
  assert.equal(failed.resultSummary, null);
  assert.equal(failed.model.runtime, "pi");
  assert.equal(failed.executionIdentity.requestedProviderId, "configured-provider");
  assert.equal(failed.executionIdentity.requestedModelId, "requested-model");
  assert.equal(failed.executionIdentity.responseModelId, null);
});
