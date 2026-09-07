import assert from "node:assert/strict";
import test from "node:test";

import { createNuwaN1PiAdapter } from "../../apps/story-studio/server/nuwaN1PiAdapter.mjs";

const context = {
  version: "tianyan-nuwa-n1-role-context/v1",
  runId: "nuwa-run.test",
  attemptId: "attempt.test",
  step: 1,
  actor: { id: "character.lin", revision: "r1" },
  scene: { storyUnit: { id: "unit.dock", revision: "r1" }, sceneRef: { id: "unit.dock", revision: "r1" }, observedAt: "2026-09-07T00:00:00.000Z", label: "雾港" },
  localGoal: "核对钟声",
  coreSummary: "正式角色林昭",
  knownFacts: [{ factId: "event.bell", summary: "已得知：钟声响起", sourceId: "event.bell", sourceRevision: "r1", visibility: "informed" }],
  beliefs: [],
  unknownFactIds: ["event.secret"],
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
        toolContext = await input.tools[0].execute({ toolCallId: "tool.pi", arguments: {}, approvalReceiptId: "receipt" });
        assert.deepEqual((toolContext as { context: { unknownFactIds: string[] } }).context.unknownFactIds, ["event.secret"]);
        return { text: JSON.stringify({ intent: "依据钟声继续观察", speech: "我只确认自己听到的钟声。", action: { action: "observe", targetId: null }, observableResult: "林昭记录了一次受限观察。" }), providerCalls: 2, traceId: "trace.fake", responseModelId: "fake", usage: { promptTokens: 12, completionTokens: 18, totalTokens: 30 }, latencyMs: 1 };
      },
      cancel() { return false; }
    },
    projectId: "project.test",
    runId: context.runId,
    provider: { providerId: "fake", profileId: "fake-profile", modelId: "fake-model" },
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
    provider: { providerId: "fake", profileId: "fake-profile", modelId: "fake-model" },
    async openProviderStream() { throw new Error("not reached"); }
  });
  const request = await adapter.request(context);
  const tool = await adapter.executeTool({ context, request });
  await assert.rejects(adapter.continueAfterTool({ context, toolResult: tool }), /outside this role's allowed read-only turn/u);
});
