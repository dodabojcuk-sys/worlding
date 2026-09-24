import assert from "node:assert/strict";
import test from "node:test";

import { createNuwaN1PiAdapter } from "../../apps/story-studio/server/nuwaN1PiAdapter.mjs";
import { createAiProviderGateway, DEFAULT_MODEL_PROFILES } from "../../apps/story-studio/server/providerGateway/aiProviderGateway.mjs";
import { createSiliconFlowAdapter } from "../../apps/story-studio/server/providerGateway/siliconFlowAdapter.mjs";
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
        assert.equal("attention" in providerContext, false, "attention ranking and byte diagnostics stay on the author inspector");
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

test("Nuwa keeps its director and role defaults while forwarding the Pi budget", async () => {
  const limits: number[] = [];
  const forwarded: number[] = [];
  const adapter = createNuwaN1PiAdapter({
    runtime: { async run(input: any) {
      limits.push(input.maxOutputTokens);
      await input.openProviderStream({ agentRunId: input.runId, messages: [], tools: [], maxOutputTokens: input.maxOutputTokens, providerCall: 1, retry: false });
      return input.requiredToolName === "read_director_brief"
        ? { text: JSON.stringify({ understood: "维持未知", proposedAdjustment: "维持未知", scope: "本场", focus: ["preserve-uncertainty"], unsupported: [] }), usage: null }
        : { text: JSON.stringify({ intent: "观察", speech: null, heardByActorIds: [], action: { action: "observe", targetId: null }, observableResult: "继续观察灯光。" }), usage: null };
    } },
    projectId: "project.test", runId: context.runId, actorIds: ["character.lin", "character.awu"],
    provider: { providerId: "siliconflow", profileId: "siliconflow-qwen", modelId: "Qwen/Qwen3.5-35B-A3B" },
    sourceIdentity: { kind: "root", workVersionId: "work-version.test", revision: "1" },
    async openProviderStream(input: any) { forwarded.push(input.maxOutputTokens); return { events: (async function* () {})() }; }
  });
  await adapter.suggestDirector({ version: "tianyan-nuwa-n1-director-brief/v1", runId: context.runId, operationId: "director.budget", instruction: "维持未知", authorGoal: "观察", scene: context.scene, completedSteps: [], scope: { label: "主线", remainingSteps: 3 } });
  const request = await adapter.request(context);
  await adapter.continueAfterTool({ context, toolResult: await adapter.executeTool({ context, request }) });
  assert.deepEqual(limits, [2_400, 512]);
  assert.deepEqual(forwarded, [2_400, 512], "the Nuwa bridge receives each default without a model-specific override");
});

test("director and role tools reach the final SiliconFlow HTTP shape and return through Pi", async () => {
  const requests: Array<{ url: string; body: Record<string, any> }> = [];
  const response = (frames: object[]) => new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n", { status: 200, headers: { "content-type": "text/event-stream" } });
  const toolFrames = (name: string) => [
    { choices: [{ delta: { tool_calls: [{ index: 0, id: `call_${name}`, type: "function", function: { name, arguments: "{" } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "}" } }] } }] },
    { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { prompt_tokens: 30, completion_tokens: 8, total_tokens: 38 } }
  ];
  const gateway = createAiProviderGateway({ adapters: [createSiliconFlowAdapter({
    environment: { SILICONFLOW_API_KEY: "offline-test-only" },
    fetchImpl: async (url: URL | RequestInfo, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      requests.push({ url: String(url), body });
      const name = body.tools?.[0]?.function?.name;
      if (name) return response(toolFrames(name));
      const director = body.messages.some((message: { content?: string }) => typeof message.content === "string" && message.content.includes("受控导演建议适配器"));
      return response([{ choices: [{ delta: { content: JSON.stringify(director
        ? { understood: "先观察", proposedAdjustment: "暂缓揭露", scope: "本场", focus: ["defer-reveal"], unsupported: [] }
        : { intent: "观察", speech: null, heardByActorIds: [], action: { action: "observe", targetId: null }, observableResult: "角色观察了灯光。" }) }, finish_reason: "stop" }], usage: { prompt_tokens: 42, completion_tokens: 20, total_tokens: 62 } }]);
    }
  })] });
  const adapter = createNuwaN1PiAdapter({
    runtime: createPiTextAgentAdapter(), projectId: "project.test", runId: context.runId,
    roleMaxOutputTokens: 2_400,
    actorIds: ["character.lin", "character.awu"], provider: { providerId: "siliconflow", profileId: DEFAULT_MODEL_PROFILES[0].id, modelId: "Qwen/Qwen3.5-35B-A3B" },
    sourceIdentity: { kind: "root", workVersionId: "work-version.test", revision: "1" },
    openProviderStream(input: any) { return gateway.openChatStream({ profileId: DEFAULT_MODEL_PROFILES[0].id, messages: input.messages, tools: input.tools, toolChoice: input.toolChoice, maxOutputTokens: input.maxOutputTokens, timeoutMs: 90_000, retry: input.retry, onProviderLifecycle: input.onProviderLifecycle, onRequestShape: input.onRequestShape }); }
  });
  const suggestion = await adapter.suggestDirector({ version: "tianyan-nuwa-n1-director-brief/v1", runId: context.runId, operationId: "director.wire", instruction: "暂缓揭露", authorGoal: "观察", scene: context.scene, completedSteps: [], scope: { label: "主线", remainingSteps: 3 } });
  const roleRequest = await adapter.request(context);
  const role = await adapter.continueAfterTool({ context, toolResult: await adapter.executeTool({ context, request: roleRequest }) });
  assert.deepEqual(suggestion.focus, ["defer-reveal"]);
  assert.equal(role.action.action, "observe");
  const observation = adapter.diagnostics();
  assert.equal(observation.rounds.length, 2, "the last tool round trip records both actual Provider sends");
  assert.equal(observation.rounds[0]?.toolCount, 1);
  assert.equal(observation.rounds[1]?.toolCount, 0);
  assert.equal(observation.rounds[0]?.status, "completed");
  assert.equal(observation.rounds[1]?.status, "completed");
  assert.deepEqual((observation.rounds[0] as any)?.wire, { modelId: "Qwen/Qwen3.5-35B-A3B", maxTokens: 2_400, thinking: false, stream: true, toolChoice: "read_role_context", toolNames: ["read_role_context"], timeoutMs: 90_000 });
  assert.equal((observation.rounds[0] as any)?.frames?.argumentsSchemaValid, true);
  assert.equal((observation.rounds[0] as any)?.frames?.finishReason, "tool_calls");
  assert.ok(observation.rounds.every((round: any) => Number.isInteger(round.durationMs) && round.durationMs >= 0));
  assert.equal(observation.context?.sourceCount, 1);
  assert.equal(observation.context?.actorRevision, "r1");
  assert.ok((observation.localToolMs ?? -1) >= 0);
  assert.equal(requests.length, 4, "each complete read-tool round trip has one tool request and one final answer request");
  for (const [index, name, budget] of [[0, "read_director_brief", 2_400], [2, "read_role_context", 2_400]] as const) {
    const first = requests[index]!;
    const final = requests[index + 1]!;
    assert.equal(first.url, "https://api.siliconflow.cn/v1/chat/completions");
    assert.equal(first.body.model, "Qwen/Qwen3.5-35B-A3B");
    assert.equal(first.body.stream, true);
    assert.equal(first.body.enable_thinking, false);
    assert.equal(first.body.max_tokens, budget);
    assert.equal(first.body.tool_choice.function.name, name);
    assert.deepEqual(first.body.tools[0].function.parameters, { type: "object", additionalProperties: false, properties: {} });
    assert.equal(final.body.max_tokens, budget);
    assert.equal(final.body.tools, undefined, "the read tool is removed after its one permitted execution");
    assert.equal(final.body.tool_choice, undefined);
    assert.equal(final.body.messages.some((message: any) => message.role === "assistant" && message.tool_calls?.[0]?.id === `call_${name}`), true);
    assert.equal(final.body.messages.some((message: any) => message.role === "tool" && message.tool_call_id === `call_${name}`), true);
  }
  assert.equal(JSON.stringify(observation).includes("谨慎求证"), false, "diagnostics contain no raw role profile");
});

test("director first-round truncation keeps only bounded frame diagnostics and never executes the incomplete tool", async () => {
  const frames = [
    { choices: [{ delta: { reasoning_content: "synthetic reasoning" } }] },
    { choices: [{ delta: { content: "synthetic preface" } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: "call_director", function: { name: "read_director_brief", arguments: "{\"x\":" } }] } }] },
    { choices: [{ delta: {}, finish_reason: "length" }] }
  ];
  const gateway = createAiProviderGateway({ adapters: [createSiliconFlowAdapter({
    environment: { SILICONFLOW_API_KEY: "offline-test-only" },
    fetchImpl: async () => new Response(frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n", { status: 200, headers: { "content-type": "text/event-stream" } })
  })] });
  const adapter = createNuwaN1PiAdapter({
    runtime: createPiTextAgentAdapter(), projectId: "project.test", runId: context.runId,
    actorIds: ["character.lin", "character.awu"], provider: { providerId: "siliconflow", profileId: DEFAULT_MODEL_PROFILES[0].id, modelId: "Qwen/Qwen3.5-35B-A3B" },
    sourceIdentity: { kind: "root", workVersionId: "work-version.test", revision: "1" },
    openProviderStream(input: any) { return gateway.openChatStream({ profileId: DEFAULT_MODEL_PROFILES[0].id, messages: input.messages, tools: input.tools, toolChoice: input.toolChoice, maxOutputTokens: input.maxOutputTokens, onRequestShape: input.onRequestShape }); }
  });
  await assert.rejects(adapter.suggestDirector({ version: "tianyan-nuwa-n1-director-brief/v1", runId: context.runId, operationId: "director.truncated", instruction: "只观察", authorGoal: "观察", scene: context.scene, completedSteps: [], scope: { label: "主线", remainingSteps: 3 } }), /truncated-finish-length/u);
  const observation = adapter.diagnostics() as any;
  assert.equal(observation.rounds.length, 1);
  assert.equal(observation.rounds[0].frames.reasoningBytes, Buffer.byteLength("synthetic reasoning"));
  assert.equal(observation.rounds[0].frames.contentBytes, Buffer.byteLength("synthetic preface"));
  assert.equal(observation.rounds[0].frames.toolArgumentBytes, Buffer.byteLength('{"x":'));
  assert.equal(observation.rounds[0].frames.argumentsJsonClosed, false);
  assert.equal(observation.rounds[0].frames.argumentsSchemaValid, false);
  assert.equal(observation.rounds[0].frames.finishReason, "length");
  assert.equal(observation.rounds[0].frames.usageReceived, false);
  assert.equal(observation.rounds[0].wire.toolChoice, "read_director_brief");
  assert.doesNotMatch(JSON.stringify(observation), /synthetic reasoning|synthetic preface/u);
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
      assert.deepEqual(input.tools, [], "after context consumption the answer request cannot call tools again");
      assert.equal(input.toolChoice, null);
      return { traceId: `trace.${input.agentRunId}.2`, events: stream([{ type: "chunk", text: JSON.stringify({ intent: "只按角色可知信息观察", speech: null, action: { action: "observe", targetId: null }, observableResult: "完成受限观察。" }), finishReason: "stop", usage: { promptTokens: 32, completionTokens: 18, totalTokens: 50 } }, { type: "done" }]) };
    }
  });
  const firstContext = { ...context, directorFocus: ["preserve-uncertainty"] };
  const firstRequest = await adapter.request(firstContext);
  const first = await adapter.continueAfterTool({ context: firstContext, toolResult: await adapter.executeTool({ context: firstContext, request: firstRequest }) });
  const secondContext = { ...context, directorFocus: ["advance-observation"], attemptId: "attempt.second", step: 2, actor: { id: "character.awu", revision: "r1" }, localGoal: "保护退路", coreSummary: "角色核心：先保护同伴；底线：不独自追击。", profileBasis: { core: "先保护同伴", boundaries: "不独自追击", sourceRevision: "r1", sources: [{ field: "character_core" as const, source: "author-profile" as const }, { field: "boundaries" as const, source: "author-profile" as const }] } };
  const secondRequest = await adapter.request(secondContext);
  const second = await adapter.continueAfterTool({ context: secondContext, toolResult: await adapter.executeTool({ context: secondContext, request: secondRequest }) });

  assert.equal(first.action.action, "observe");
  assert.equal(second.actor.id, "character.awu");
  assert.deepEqual(providerCalls.map((call) => call.providerCall), [1, 2, 1, 2]);
  assert.match(JSON.stringify(providerCalls[1]?.messages), /对缺少依据的判断保持怀疑或未知/);
  assert.match(JSON.stringify(providerCalls[3]?.messages), /先观察已有可感知内容/);
  assert.doesNotMatch(JSON.stringify(providerCalls[3]?.messages), /对缺少依据的判断保持怀疑或未知/);
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
  assert.match(JSON.stringify(providerCalls[1]?.messages), /已得知：钟声响起/u, "the first actor's own evidence summary really reaches the actual Provider input");
  assert.equal(JSON.stringify(providerCalls).includes("utf8-byte-upper-bound"), false, "byte-estimator diagnostics stay on the author inspector");
  assert.equal(JSON.stringify(providerCalls).includes("lower-relevance-within-budget"), false, "budget-exclusion wording never enters either actual Provider turn");
});

test("only the named hearer receives a sourced statement in the actual Pi continuation", async () => {
  const dialogue = "仅告诉阿芜：航标灯刚闪了两次。";
  const shared = { factId: "event.rain", summary: "三人都在雨棚看见航标灯闪烁", sourceId: "event.rain", sourceRevision: "r2", visibility: "witnessed" };
  const heard = { factId: "heard.step.a.awu", summary: `听闻：林昭说“${dialogue}”`, sourceId: "step.a", sourceRevision: "r2", visibility: "heard" };
  const runFor = async (actorId: string, seesSpeech: boolean) => {
    const messages: unknown[][] = [];
    const actorContext = { ...context, attemptId: `attempt.${actorId}`, actor: { id: actorId, revision: "r2" }, localGoal: actorId === "character.awu" ? "守住雨棚" : "核对渡船", knownFacts: seesSpeech ? [shared, heard] : [shared], recentDialogue: seesSpeech ? [{ speakerId: "character.lin", text: dialogue, observedStep: 1 }] : [], directorFocus: [] };
    const adapter = createNuwaN1PiAdapter({
      runtime: createPiTextAgentAdapter(), projectId: "project.hearing", runId: context.runId,
      actorIds: ["character.lin", "character.awu", "character.gu"],
      provider: { providerId: "local", profileId: "local", modelId: "local" },
      sourceIdentity: { kind: "root", workVersionId: "work-version.hearing", revision: "r2" },
      async openProviderStream(input: any) {
        messages.push(structuredClone(input.messages));
        if (input.providerCall === 1) return { traceId: "first", events: stream([
          { type: "tool-call-start", id: "call.role", name: "read_role_context", index: 0 },
          { type: "tool-call-delta", id: "call.role", name: "read_role_context", index: 0, argumentsDelta: "{}" },
          { type: "tool-call-end", id: "call.role", name: "read_role_context", index: 0, argumentsJson: "{}", arguments: {} },
          { type: "done" }
        ]) };
        return { traceId: "second", events: stream([{ type: "chunk", text: JSON.stringify({ intent: "继续观察", speech: null, heardByActorIds: [], action: { action: "observe", targetId: null }, observableResult: "角色留意灯光。" }), finishReason: "stop" }, { type: "done" }]) };
      }
    });
    const request = await adapter.request(actorContext as any);
    await adapter.continueAfterTool({ context: actorContext as any, toolResult: await adapter.executeTool({ context: actorContext as any, request }) });
    assert.equal(messages.length, 2);
    assert.equal(JSON.stringify(messages[0]).includes(dialogue), false, "first request contains the tool contract, not a private role payload");
    return { final: JSON.stringify(messages[1]), observation: adapter.diagnostics() };
  };
  const recipient = await runFor("character.awu", true);
  const nonrecipient = await runFor("character.gu", false);
  assert.match(recipient.final, /仅告诉阿芜/u);
  assert.match(recipient.final, /step\.a/u, "the received statement retains its source identity");
  assert.doesNotMatch(nonrecipient.final, /仅告诉阿芜|step\.a/u);
  assert.match(recipient.final, /event\.rain/u);
  assert.match(nonrecipient.final, /event\.rain/u, "the shared witnessed fact remains available");
  assert.doesNotMatch(recipient.final + nonrecipient.final, /AUTHOR_PRIVATE_CANARY|OTHER_ROLE_PRIVATE_GOAL/u);
  assert.notEqual(recipient.observation.context?.sourceSetId, nonrecipient.observation.context?.sourceSetId);
});

test("Nuwa N1 Pi adapter keeps a director brief out of the role tool and returns only finite execution focus", async () => {
  let directorBrief: unknown = null;
  const adapter = createNuwaN1PiAdapter({
    runtime: {
      async run(input: any) {
        assert.equal(input.requiredToolName, "read_director_brief");
        assert.match(input.prompt, /"unsupported":string\[\]/u);
        assert.equal(input.tools[0].name, "read_director_brief");
        directorBrief = await input.tools[0].execute({ toolCallId: "tool.director", arguments: {}, approvalReceiptId: "receipt" });
        return { text: JSON.stringify({ understood: "先保留揭露。", proposedAdjustment: "先推进试探。", scope: "仅下一步。", focus: ["defer-reveal", "prioritize-character-interaction"], unsupported: [] }), usage: { promptTokens: 11, completionTokens: 13 } };
      }, cancel() { return false; }
    }, projectId: "project.test", runId: context.runId, actorIds: ["character.lin", "character.awu"], provider: { providerId: "fake", profileId: "fake-profile", modelId: "fake-model" }, sourceIdentity: { kind: "unversioned-draft", workVersionId: "work-version.unversioned.project.test", revision: "unversioned" }, async openProviderStream() { throw new Error("not reached"); }
  });
  const suggestion = await adapter.suggestDirector({ version: "tianyan-nuwa-n1-director-brief/v1", runId: context.runId, operationId: "director.test", instruction: "暂缓揭露 SECRET_DIRECTOR_CANARY。", authorGoal: "推进试探。", scene: context.scene, completedSteps: [], scope: { label: "主线", remainingSteps: 4 } });
  assert.deepEqual(suggestion.focus, ["defer-reveal", "prioritize-character-interaction"]);
  assert.match(JSON.stringify(directorBrief), /SECRET_DIRECTOR_CANARY/u, "the author-side director adapter receives the request");
  const roleRequest = await adapter.request(context);
  const roleTool = await adapter.executeTool({ context, request: roleRequest });
  assert.equal(JSON.stringify(roleTool).includes("SECRET_DIRECTOR_CANARY"), false, "the role tool remains isolated from the director request");
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

test("Nuwa stops a denied cross-role tool request before another provider call", async () => {
  let sends = 0;
  const adapter = createNuwaN1PiAdapter({
    runtime: { async run(input: any) {
      await input.openProviderStream({ providerCall: 1 });
      const decision = await input.authorizeTool({ toolName: "read_role_context", arguments: { roleId: "character.awu" } });
      assert.equal(decision.allowed, false);
      await input.openProviderStream({ providerCall: 2 });
      throw new Error("unreachable");
    }, cancel() {} },
    projectId: "project.test", runId: context.runId, actorIds: ["character.lin", "character.awu"],
    provider: { providerId: "local", profileId: "local", modelId: "local" },
    sourceIdentity: { kind: "unversioned-draft", workVersionId: "work-version.test", revision: "unversioned" },
    async openProviderStream() { sends += 1; return {}; }
  });
  const request = await adapter.request(context);
  const toolResult = await adapter.executeTool({ context, request });
  await assert.rejects(adapter.continueAfterTool({ context, toolResult }), /上下文工具未被正确读取/u);
  assert.equal(sends, 1);
});

test("Nuwa accepts a speech target only when it is an explicit eligible hearer", async () => {
  for (const targetId of ["character.awu", "character.outside"]) {
    const adapter = createNuwaN1PiAdapter({
      runtime: { async run() { return { text: JSON.stringify({ intent: "商量离开", speech: "我们现在走吗？", heardByActorIds: ["character.awu"], action: { action: "speak", targetId }, observableResult: "林昭向阿芜提出问题。" }), usage: null }; }, cancel() {} },
      projectId: "project.test", runId: context.runId, actorIds: ["character.lin", "character.awu"],
      provider: { providerId: "local", profileId: "local", modelId: "local" },
      sourceIdentity: { kind: "unversioned-draft", workVersionId: "work-version.test", revision: "unversioned" },
      async openProviderStream() { throw new Error("local parser test only"); }
    });
    const request = await adapter.request(context);
    const toolResult = await adapter.executeTool({ context, request });
    if (targetId === "character.awu") assert.equal((await adapter.continueAfterTool({ context, toolResult })).action.targetId, targetId);
    else await assert.rejects(adapter.continueAfterTool({ context, toolResult }), /outside this role/u);
  }
});


test("director accepts one complete fenced JSON response but rejects extra prose and invalid focus", async () => {
  const payload = { understood: "优先互动并暂缓揭露", proposedAdjustment: "模型描述", scope: "当前场景", focus: ["prioritize-character-interaction", "defer-reveal"], unsupported: ["出口出现金龙"] };
  let response = "```json\n" + JSON.stringify(payload) + "\n```";
  const adapter = createNuwaN1PiAdapter({ runtime: { async run() { return { text: response, usage: null }; }, cancel() { return false; } }, projectId: "project.test", runId: context.runId, actorIds: ["character.lin", "character.awu"], provider: { providerId: "fake", profileId: "fake", modelId: "fake" }, sourceIdentity: { kind: "unversioned-draft", workVersionId: "work-version.unversioned.project.test", revision: "unversioned" }, async openProviderStream() { throw new Error("fake only"); } });
  const brief = { version: "tianyan-nuwa-n1-director-brief/v1", runId: context.runId, operationId: "fenced", instruction: "优先互动，暂缓揭露，出口出现金龙", authorGoal: "推进", scene: context.scene, completedSteps: [], scope: { label: "主线", remainingSteps: 4 } };
  const result = await adapter.suggestDirector(brief);
  assert.deepEqual(result.focus, payload.focus);
  assert.deepEqual(result.unsupported, ["出口出现金龙"]);
  assert.doesNotMatch(result.proposedAdjustment, /金龙|模型描述/u);
  response = "说明\n```json\n" + JSON.stringify(payload) + "\n```";
  await assert.rejects(adapter.suggestDirector(brief), /strict JSON/u);
  response = "```json\n" + JSON.stringify({ ...payload, focus: ["create-dragon"] }) + "\n```";
  await assert.rejects(adapter.suggestDirector(brief), /outside N1/u);
});
