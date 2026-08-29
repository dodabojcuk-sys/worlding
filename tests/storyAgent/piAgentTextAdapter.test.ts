import assert from "node:assert/strict";
import test from "node:test";

import { createPiTextAgentAdapter, PiAgentAdapterError, type PiTextAgentRequest, type PiTextProviderEvent } from "../../src/storyAgent/piAgentAdapter.ts";

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
  const adapter = createPiTextAgentAdapter();
  const result = await adapter.run(request({
    tools: [{ name: "read_context_manifest", label: "读取上下文", description: "只读", async execute() { executions += 1; return { sourceCount: 1 }; } }],
    async authorizeTool(input) { return { allowed: input.toolName === "read_context_manifest" }; },
    async openProviderStream() {
      calls += 1;
      return calls === 1
        ? { traceId: "trace.tool", events: events([{ type: "tool-call", id: "tool.fixture", name: "read_context_manifest", arguments: {} }]) }
        : { traceId: "trace.tool", events: events([{ type: "chunk", text: "已读取", finishReason: "stop", usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 } }]) };
    }
  }));
  assert.equal(result.text, "已读取");
  assert.equal(calls, 2);
  assert.equal(executions, 1);
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
