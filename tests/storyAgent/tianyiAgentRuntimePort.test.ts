import assert from "node:assert/strict";
import test from "node:test";

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
  assert.ok(fixture.events.length >= 6);
});

test("runtime durably replays stream events and rejects a different work-version scope", async () => {
  const fixture = fixtureAdapter(async (input) => {
    await input.onEvent({ type: "text-delta", delta: "分段一", sequence: 1, recordedAt: "2026-08-29T00:00:00.000Z" });
    await input.onEvent({ type: "text-delta", delta: "分段二", sequence: 2, recordedAt: "2026-08-29T00:00:01.000Z" });
    return { providerId: "fixture", profileId: "fixture-profile", modelId: "fixture-model", text: "分段一分段二", providerCalls: 1, traceId: "trace.fixture", latencyMs: 12, usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 } };
  });
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.a", sessionId: "session.stream", task: "流式测试", currentPage: "/tianyi", operationId: "operation.stream.start" });
  await fixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.stream.approve" });
  const delivered: string[] = [];
  const completed = await fixture.adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.stream.run", onEvent(event) { if (event.type === "text-delta") delivered.push(event.delta); } });
  assert.equal(completed.resultSummary, "分段一分段二");
  assert.equal(completed.observability.streamEventCount, 2);
  assert.equal(completed.observability.totalTokens, 7);
  assert.deepEqual(delivered, ["分段一", "分段二"]);
  const replay = await fixture.adapter.readRunEvents({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId });
  assert.deepEqual(replay.filter((event) => event.kind === "stream").map((event) => event.streamEvent?.type), ["text-delta", "text-delta"]);
  assert.equal(await fixture.adapter.recoverRun({ projectId: started.projectId, workVersionId: "work-version.b", sessionId: started.sessionId, runId: started.runId }), null);
});

test("event-line work runs the bounded read loop without provider or semantic writes", async () => {
  const fixture = fixtureAdapter();
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.event", task: "检查明确因果、开放问题和局部节奏", currentPage: "/event-line", operationId: "operation.event.start" });
  const contextReady = await fixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.event.approve" });
  const names = contextReady.toolCalls.map((call) => call.toolName);
  assert.deepEqual(names, ["read_context_manifest", "read_story_selection", "read_event_line_projection", "read_open_questions"]);
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
    "read_pending_candidates",
    "read_open_questions",
    "propose_entity_candidate",
    "propose_event_candidate",
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
  const fixture = fixtureAdapter(async () => {
    throw Object.assign(new Error("Provider 未配置"), { name: "ProviderUnavailable", code: "provider-unavailable", retryable: false });
  });
  const started = await fixture.adapter.startRun({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.unconfigured", task: "真实 Provider 测试", currentPage: "/tianyi", operationId: "operation.unconfigured.start" });
  await fixture.adapter.approveStep({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, stepId: started.plan[0]!.stepId, operationId: "operation.unconfigured.context" });
  const failed = await fixture.adapter.continueRun({ projectId: started.projectId, workVersionId: started.workVersionId, sessionId: started.sessionId, runId: started.runId, operationId: "operation.unconfigured.run" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.error?.category, "provider-unavailable");
  assert.equal(failed.resultSummary, null);
  assert.equal(failed.model.runtime, "pi");
});
