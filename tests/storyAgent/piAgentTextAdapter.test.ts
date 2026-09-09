import assert from "node:assert/strict";
import test from "node:test";

import { createPiTextAgentAdapter, PiAgentAdapterError, type PiTextAgentRequest, type PiTextProviderEvent } from "../../src/storyAgent/plugins/builtinPiAgentRuntimePlugin.ts";
import { createTianyiProductTools } from "../../src/storyAgent/tianyiProductTools.ts";

function request(overrides: Partial<PiTextAgentRequest> = {}): PiTextAgentRequest {
  return {
    runId: "run.fixture",
    projectId: "project-fixture",
    workVersionId: "work-version.fixture",
    sessionId: "session.fixture",
    prompt: "检查当前引用",
    systemPrompt: "只读测试",
    providerId: "fixture-provider",
    profileId: "fixture-profile",
    modelId: "fixture-model",
    maxOutputTokens: 64,
    retry: false,
    async openProviderStream() {
      return { traceId: "trace.fixture", events: events([{ type: "chunk", text: "流式", finishReason: null, usage: null }, { type: "chunk", text: "回答", finishReason: "stop", usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 } }]) };
    },
    ...overrides
  };
}

async function* events(values: PiTextProviderEvent[]) { for (const value of values) yield value; }

test("Pi adapter streams deterministic gateway chunks and reports bounded observability", async () => {
  const streamed: string[] = [];
  const adapter = createPiTextAgentAdapter({ monotonicNow: (() => { let value = 100; return () => (value += 25); })() });
  const result = await adapter.run(request({ onEvent(event) { if (event.type === "text-delta") streamed.push(event.delta); } }));
  assert.equal(result.text, "流式回答");
  assert.deepEqual(streamed, ["流式", "回答"]);
  assert.equal(result.traceId, "trace.fixture");
  assert.deepEqual(result.usage, { promptTokens: 3, completionTokens: 2, totalTokens: 5 });
  assert.equal(result.providerCalls, 1);
  assert.equal(result.latencyMs, 25);
});

test("Pi adapter routes every tool call through the injected approval boundary", async () => {
  let calls = 0;
  let executions = 0;
  const toolChoices: unknown[] = [];
  const retryFlags: boolean[] = [];
  const adapter = createPiTextAgentAdapter();
  const result = await adapter.run(request({
    tools: [{ name: "read_context_manifest", label: "读取上下文", description: "只读", inputSchema: { type: "object", properties: {}, additionalProperties: false }, async execute() { executions += 1; return { sourceCount: 1 }; } }],
    requiredToolName: "read_context_manifest",
    async authorizeTool(input) { return { allowed: input.toolName === "read_context_manifest" }; },
    async openProviderStream(input) {
      toolChoices.push(input.toolChoice ?? null);
      retryFlags.push(input.retry);
      calls += 1;
      return calls === 1
        ? { traceId: "trace.tool", events: events([
          { type: "tool-call-start", id: "tool.fixture", name: "read_context_manifest", index: 0 },
          { type: "tool-call-delta", id: "tool.fixture", name: "read_context_manifest", index: 0, argumentsDelta: "{" },
          { type: "tool-call-delta", id: "tool.fixture", name: "read_context_manifest", index: 0, argumentsDelta: "}" },
          { type: "tool-call-end", id: "tool.fixture", name: "read_context_manifest", index: 0, argumentsJson: "{}", arguments: {} },
          { type: "done" }
        ]) }
        : { traceId: "trace.tool", events: events([{ type: "chunk", text: "已读取", finishReason: "stop", usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 } }]) };
    }
  }));
  assert.equal(result.text, "已读取");
  assert.equal(calls, 2);
  assert.equal(executions, 1);
  assert.deepEqual(toolChoices, [{ type: "function", function: { name: "read_context_manifest" } }, null]);
  assert.deepEqual(retryFlags, [false, false]);
});

test("Pi adapter carries native event-graph candidate frames through author approval to the Relation owner port", async () => {
  const submitted: Array<Record<string, unknown>> = [];
  const tools = createTianyiProductTools({
    scope: { projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.fixture", runId: "run.fixture" },
    createArtifact() { throw new Error("not used"); },
    async createEntityProposal() { throw new Error("not used"); },
    async createEventGraphCandidate(input) { submitted.push(input); return { relationId: "relation.fixture", reviewState: "candidate" }; }
  });
  const adapter = createPiTextAgentAdapter();
  let attempts = 0;
  const args = { sourceEventId: "event.fixture.one", targetEventId: "event.fixture.two", relationTypeId: "relation-type.fixture", direction: "forward" };
  const serialized = JSON.stringify(args);
  const result = await adapter.run(request({
    tools,
    async authorizeTool(input) { return input.toolName === "submit_event_graph_candidate" ? { allowed: true, approvalReceiptId: `receipt.tianyi-agent-approval.${"a".repeat(24)}` } : { allowed: false }; },
    async openProviderStream() {
      attempts += 1;
      return attempts === 1
        ? { traceId: "trace.event-graph", events: events([
            { type: "tool-call-start", id: "event-graph.tool", name: "submit_event_graph_candidate", index: 0 },
            { type: "tool-call-delta", id: "event-graph.tool", name: "submit_event_graph_candidate", index: 0, argumentsDelta: serialized.slice(0, 38) },
            { type: "tool-call-delta", id: "event-graph.tool", name: "submit_event_graph_candidate", index: 0, argumentsDelta: serialized.slice(38) },
            { type: "tool-call-end", id: "event-graph.tool", name: "submit_event_graph_candidate", index: 0, argumentsJson: serialized, arguments: args },
            { type: "done" }
          ]) }
        : { traceId: "trace.event-graph", events: events([{ type: "chunk", text: "关系候选已等待作者确认。", finishReason: "stop", usage: { promptTokens: 4, completionTokens: 6, totalTokens: 10 } }]) };
    }
  }));
  assert.equal(result.text, "关系候选已等待作者确认。");
  assert.equal(attempts, 2);
  assert.equal(submitted.length, 1);
  assert.equal(submitted[0]?.sourceEventId, args.sourceEventId);
  assert.equal(submitted[0]?.sourceReceiptId, `receipt.tianyi-agent-approval.${"a".repeat(24)}`);
});

test("Pi adapter preserves mixed text and multiple ordered native tool calls with fragmented arguments", async () => {
  const executed: string[] = [];
  const observedGatewayTurns: Array<{ messages: unknown[]; tools: unknown[] }> = [];
  let calls = 0;
  const adapter = createPiTextAgentAdapter();
  const result = await adapter.run(request({
    tools: ["first_tool", "second_tool"].map((name) => ({
      name,
      label: name,
      description: "受控测试工具",
      inputSchema: { type: "object" as const, required: ["value"], properties: { value: { type: "string", maxLength: 20 } }, additionalProperties: false },
      async execute(input: { arguments: Record<string, unknown> }) { executed.push(`${name}:${String(input.arguments.value)}`); return { ok: true }; }
    })),
    async authorizeTool() { return { allowed: true }; },
    async openProviderStream(input) {
      observedGatewayTurns.push({ messages: input.messages, tools: input.tools });
      calls += 1;
      if (calls > 1) return { traceId: "trace.multi", events: events([{ type: "chunk", text: "完成", finishReason: "stop", usage: null }, { type: "done" }]) };
      return { traceId: "trace.multi", events: events([
        { type: "chunk", text: "先检查。", finishReason: null, usage: null },
        { type: "tool-call-start", id: "call.1", name: "first_tool", index: 0 },
        { type: "tool-call-delta", id: "call.1", name: "first_tool", index: 0, argumentsDelta: "{\"va" },
        { type: "tool-call-delta", id: "call.1", name: "first_tool", index: 0, argumentsDelta: "lue\":\"" },
        { type: "tool-call-delta", id: "call.1", name: "first_tool", index: 0, argumentsDelta: "一\"}" },
        { type: "tool-call-end", id: "call.1", name: "first_tool", index: 0, argumentsJson: "{\"value\":\"一\"}", arguments: { value: "一" } },
        { type: "tool-call-start", id: "call.2", name: "second_tool", index: 1 },
        { type: "tool-call-delta", id: "call.2", name: "second_tool", index: 1, argumentsDelta: "{\"value\":\"二\"}" },
        { type: "tool-call-end", id: "call.2", name: "second_tool", index: 1, argumentsJson: "{\"value\":\"二\"}", arguments: { value: "二" } },
        { type: "done" }
      ]) };
    }
  }));
  assert.equal(result.text, "完成");
  assert.deepEqual(executed, ["first_tool:一", "second_tool:二"]);
  assert.equal(observedGatewayTurns[0]?.tools.length, 2);
  assert.equal(JSON.stringify(observedGatewayTurns[1]?.messages).includes("tool_call_id"), false);
  assert.equal(JSON.stringify(observedGatewayTurns[1]?.messages).includes("toolCallId"), true);
});

test("Pi adapter fails closed on malformed and unknown native tool frames", async () => {
  const adapter = createPiTextAgentAdapter();
  await assert.rejects(adapter.run(request({
    async openProviderStream() { return { traceId: null, events: events([{ type: "tool-call-malformed", id: "bad", name: "read_context_manifest", index: 0, argumentsJson: "{", reason: "malformed-arguments" }]) }; }
  })), (error: unknown) => error instanceof PiAgentAdapterError && error.code === "invalid-tool-call");
  await assert.rejects(adapter.run(request({
    async openProviderStream() { return { traceId: null, events: events([{ type: "tool-call-start", id: "unknown", name: "shell", index: 0 }]) }; }
  })), (error: unknown) => error instanceof PiAgentAdapterError && error.code === "invalid-tool-call");
});

test("Pi adapter propagates AbortSignal and isolates cancellation by project and work version", async () => {
  const controller = new AbortController();
  const adapter = createPiTextAgentAdapter();
  const running = adapter.run(request({
    signal: controller.signal,
    async openProviderStream(input) {
      return { traceId: "trace.cancel", events: (async function* () {
        await new Promise<void>((resolve) => input.signal?.addEventListener("abort", () => resolve(), { once: true }));
        if (input.signal?.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
      })() };
    }
  }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(adapter.cancel({ projectId: "project-fixture", workVersionId: "work-version.other", sessionId: "session.fixture", runId: "run.fixture" }), false);
  assert.equal(adapter.cancel({ projectId: "project-fixture", workVersionId: "work-version.fixture", sessionId: "session.fixture", runId: "run.fixture" }), true);
  controller.abort();
  await assert.rejects(running, (error: unknown) => error instanceof PiAgentAdapterError && error.code === "cancelled" && error.retryable === false);
});
