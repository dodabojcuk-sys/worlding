import assert from "node:assert/strict";
import test from "node:test";

import { createNuwaN1PiAdapter } from "../../apps/story-studio/server/nuwaN1PiAdapter.mjs";
import { createPiTextAgentAdapter, type PiTextProviderEvent } from "../../src/storyAgent/plugins/builtinPiAgentRuntimePlugin.ts";

const context = {
  version: "tianyan-nuwa-n1-role-context/v1",
  runId: "nuwa-run.test",
  attemptId: "attempt.test",
  step: 1,
  actor: { id: "character.lin", revision: "r1" },
  scene: { storyUnit: { id: "unit.dock", revision: "r1" }, sceneRef: { id: "unit.dock", revision: "r1" }, observedAt: "2026-09-07T00:00:00.000Z", label: "雾港" },
  localGoal: "核对钟声",
  coreSummary: "正式角色林昭",
  profileBasis: { core: "谨慎求证", boundaries: "不牺牲同伴换取线索", sourceRevision: "r1", sources: [{ field: "character_core", source: "author-profile" }, { field: "boundaries", source: "author-profile" }] },
  knownFacts: [{ factId: "event.bell", summary: "已得知：钟声响起", sourceId: "event.bell", sourceRevision: "r1", visibility: "informed" }],
  beliefs: [],
  excludedKnowledgeCount: 1,
  attention: { version: "tianyan-nuwa-n1-attention/v1", algorithm: "permission-first-lexical-utf8/v1", selected: [{ key: "knowledge:event.bell", kind: "knowledge", sourceId: "event.bell", reason: "goal-keyword-match" }], excluded: { count: 2, reasonCounts: [{ reason: "lower-relevance-within-budget", count: 2 }] }, budget: { estimator: "utf8-byte-upper-bound/v1", maxInputTokens: 4096, baseBytes: 900, sourceBudgetBytes: 2296, selectedSourceBytes: 120, outputReserveTokens: 1024, requiredOverflow: false } },
  recentDialogue: [],
  allowedActions: ["speak", "observe", "ask"],
  remaining: { committedSteps: 6, dispatches: 12, inputTokenBudget: 4096, outputTokenBudget: 1024 },
  authorCue: null
} as const;

test("Nuwa N1 Pi adapter uses only the frozen role-context tool and returns a bounded turn", async () => {
  let toolContext: unknown = null;
  const adapter = createNuwaN1PiAdapter({
    runtime: {
      async run(input: any) {
        assert.equal(input.requiredToolName, "read_role_context");
        assert.equal(input.tools.length, 1);
        assert.match(input.prompt, /"heardByActorIds":string\[\]/u);
        assert.match(input.prompt, /character\.awu/u);
        toolContext = await input.tools[0].execute({ toolCallId: "tool.pi", arguments: {}, approvalReceiptId: "receipt" });
        const providerContext = (toolContext as { context: Record<string, unknown> }).context;
        assert.equal("unknownFactIds" in providerContext, false);
        assert.deepEqual(providerContext.attention, context.attention);
        assert.deepEqual(providerContext.profileBasis, context.profileBasis);
        assert.equal(providerContext.localGoal, "核对钟声");
        assert.deepEqual(providerContext.excluded, { count: 1, reasonCodes: ["not-known-by-actor"] });
        return { text: JSON.stringify({ intent: "依据钟声继续观察", speech: "我只确认自己听到的钟声。", action: { action: "observe", targetId: null }, observableResult: "林昭记录了一次受限观察。" }), providerCalls: 2, traceId: "trace.fake", responseModelId: "fake", usage: { promptTokens: 12, completionTokens: 18, totalTokens: 30 }, latencyMs: 1 };
      },
      cancel() { return false; }
    },
    projectId: "project.test",
    runId: context.runId,
    actorIds: ["character.lin", "character.awu"],
    provider: { providerId: "fake", profileId: "fake-profile", modelId: "fake-model" },
    sourceIdentity: { kind: "unversioned-draft", workVersionId: "work-version.unversioned.project.test", revision: "unversioned" },
    async openProviderStream() { throw new Error("The in-memory Pi runtime owns this local fake test."); }
  });
  const request = await adapter.request(context);
  const tool = await adapter.executeTool({ context, request });
  const result = await adapter.continueAfterTool({ context, toolResult: tool });
  assert.equal(result.type, "actor-result");
  assert.equal(result.actor.id, "character.lin");
  assert.equal(result.action.action, "observe");
  assert.equal(result.action.targetId, null);
  assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 18 });
  assert.ok(toolContext);
});

test("Nuwa N1 Pi adapter rejects a model result that tries to exceed the role action allowlist", async () => {
  const adapter = createNuwaN1PiAdapter({
    runtime: {
      async run() { return { text: JSON.stringify({ intent: "越权", speech: null, action: { action: "write-canon", targetId: null }, observableResult: "不应提交" }), providerCalls: 1, traceId: null, responseModelId: null, usage: null, latencyMs: 1 }; },
      cancel() { return false; }
    },
    projectId: "project.test",
    runId: context.runId,
    actorIds: ["character.lin", "character.awu"],
    provider: { providerId: "fake", profileId: "fake-profile", modelId: "fake-model" },
    sourceIdentity: { kind: "unversioned-draft", workVersionId: "work-version.unversioned.project.test", revision: "unversioned" },
    async openProviderStream() { throw new Error("not reached"); }
  });
  const request = await adapter.request(context);
  const tool = await adapter.executeTool({ context, request });
  await assert.rejects(adapter.continueAfterTool({ context, toolResult: tool }), /outside this role's allowed read-only turn/u);
});

test("Nuwa N1 uses the real Pi tool loop for consecutive actor attempts without reusing Provider keys", async () => {
  const providerCalls: Array<{ agentRunId: string; providerCall: number; messages: unknown[] }> = [];
  const runtime = createPiTextAgentAdapter();
  const adapter = createNuwaN1PiAdapter({
    runtime,
    projectId: "project.test",
    runId: context.runId,
    actorIds: ["character.lin", "character.awu"],
    provider: { providerId: "local-provider", profileId: "local-profile", modelId: "local-model" },
    sourceIdentity: { kind: "unversioned-draft", workVersionId: "work-version.unversioned.project.test", revision: "unversioned" },
    async openProviderStream(input) {
      providerCalls.push({ agentRunId: input.agentRunId, providerCall: input.providerCall, messages: structuredClone(input.messages) });
      if (input.providerCall === 1) {
        const args = "{}";
        return { traceId: `trace.${input.agentRunId}.1`, events: stream([
          { type: "tool-call-start", id: `tool.${input.agentRunId}`, name: "read_role_context", index: 0 },
          { type: "tool-call-delta", id: `tool.${input.agentRunId}`, name: "read_role_context", index: 0, argumentsDelta: args },
          { type: "tool-call-end", id: `tool.${input.agentRunId}`, name: "read_role_context", index: 0, argumentsJson: args, arguments: {} },
          { type: "done" }
        ]) };
      }
      return { traceId: `trace.${input.agentRunId}.2`, events: stream([{ type: "chunk", text: JSON.stringify({ intent: "只按角色可知信息观察", speech: null, action: { action: "observe", targetId: null }, observableResult: "完成受限观察。" }), finishReason: "stop", usage: { promptTokens: 32, completionTokens: 18, totalTokens: 50 } }, { type: "done" }]) };
    }
  });
  const firstRequest = await adapter.request(context);
  const first = await adapter.continueAfterTool({ context, toolResult: await adapter.executeTool({ context, request: firstRequest }) });
  const secondContext = { ...context, attemptId: "attempt.second", step: 2, actor: { id: "character.awu", revision: "r1" }, localGoal: "保护退路", coreSummary: "角色核心：先保护同伴；底线：不独自追击。", profileBasis: { core: "先保护同伴", boundaries: "不独自追击", sourceRevision: "r1", sources: [{ field: "character_core" as const, source: "author-profile" as const }, { field: "boundaries" as const, source: "author-profile" as const }] } };
  const secondRequest = await adapter.request(secondContext);
  const second = await adapter.continueAfterTool({ context: secondContext, toolResult: await adapter.executeTool({ context: secondContext, request: secondRequest }) });

  assert.equal(first.action.action, "observe");
  assert.equal(second.actor.id, "character.awu");
  assert.deepEqual(providerCalls.map((call) => call.providerCall), [1, 2, 1, 2]);
  assert.notEqual(providerCalls[0]?.agentRunId, providerCalls[2]?.agentRunId, "each durable N1 attempt supplies a distinct Agent Run identity to the Provider bridge");
  const firstContinuation = providerCalls[1]?.messages as Array<Record<string, unknown>>;
  const toolResult = firstContinuation.find((message) => message.role === "tool");
  const toolCall = firstContinuation.find((message) => message.role === "assistant");
  assert.equal(toolCall?.content, null, "the Pi adapter retains native null assistant content and leaves wire normalization to the gateway");
  assert.equal(Array.isArray(toolCall?.toolCalls), true, "the Pi adapter preserves the native assistant tool-call envelope");
  assert.equal(typeof toolResult?.toolCallId, "string", "the Pi continuation supplies the local tool-call identity expected by the gateway");
  assert.equal(toolResult?.name, "read_role_context", "the Pi continuation retains tool provenance before gateway normalization");
  assert.equal("tool_call_id" in (toolResult ?? {}), false, "wire naming belongs only to the gateway boundary");
  assert.match(JSON.stringify(providerCalls[1]?.messages), /谨慎求证/u, "the first actor's actual Provider input contains its frozen profile basis");
  assert.match(JSON.stringify(providerCalls[3]?.messages), /先保护同伴/u, "the second actor receives a different actual Provider input");
  assert.equal(JSON.stringify(providerCalls[1]?.messages).includes("先保护同伴"), false, "another actor's profile basis is not included in the first actor input");
  assert.equal(JSON.stringify(providerCalls).includes("event.secret"), false, "the actual second Provider turn never receives excluded IDs");
});

test("Nuwa N1 Pi adapter rejects statement recipients outside the current Run", async () => {
  const adapter = createNuwaN1PiAdapter({
    runtime: {
      async run() { return { text: JSON.stringify({ intent: "越界传递", speech: "不应送出", heardByActorIds: ["character.outside"], action: { action: "speak", targetId: null }, observableResult: "不应提交" }), providerCalls: 1, traceId: null, responseModelId: null, usage: null, latencyMs: 1 }; },
      cancel() { return false; }
    },
    projectId: "project.test",
    runId: context.runId,
    actorIds: ["character.lin", "character.awu"],
    provider: { providerId: "fake", profileId: "fake-profile", modelId: "fake-model" },
    sourceIdentity: { kind: "unversioned-draft", workVersionId: "work-version.unversioned.project.test", revision: "unversioned" },
    async openProviderStream() { throw new Error("not reached"); }
  });
  const request = await adapter.request(context);
  const tool = await adapter.executeTool({ context, request });
  await assert.rejects(adapter.continueAfterTool({ context, toolResult: tool }), /outside the current Run scope/u);
});

async function* stream(values: PiTextProviderEvent[]): AsyncGenerator<PiTextProviderEvent> { for (const value of values) yield value; }
