import assert from "node:assert/strict";
import test from "node:test";

import { createBuiltinPiAgentRuntimePlugin } from "../../src/storyAgent/plugins/builtinPiAgentRuntimePlugin.ts";

test("built-in Pi plugin runs a host-scoped read-only tool loop without network or coding tools", async () => {
  const runtime = createBuiltinPiAgentRuntimePlugin().createRuntime({ version: "1.0.0" });
  let providerCalls = 0;
  let toolCalls = 0;
  const result = await runtime.run({
    runId: "run.fixture",
    projectId: "project.fixture",
    workVersionId: "work-version.fixture",
    sessionId: "session.fixture",
    prompt: "检查当前引用范围",
    systemPrompt: "只读天意夹具。",
    providerId: "fixture-provider",
    profileId: "fixture-profile",
    modelId: "fixture-model",
    maxOutputTokens: 128,
    retry: false,
    tools: [{
      name: "read_context_manifest",
      label: "查看当前引用范围",
      description: "只读工具",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      async execute() { toolCalls += 1; return { sourceCount: 1 }; }
    }],
    async authorizeTool() { return { allowed: true }; },
    async openProviderStream() {
      providerCalls += 1;
      const firstTurn = providerCalls === 1;
      const frames = firstTurn
        ? [
            { type: "tool-call-start" as const, id: "tool.fixture", name: "read_context_manifest", index: 0 },
            { type: "tool-call-delta" as const, id: "tool.fixture", name: "read_context_manifest", index: 0, argumentsDelta: "{}" },
            { type: "tool-call-end" as const, id: "tool.fixture", name: "read_context_manifest", index: 0, argumentsJson: "{}", arguments: {} },
            { type: "done" as const }
          ]
        : [{ type: "chunk" as const, text: "已读取当前引用范围，建议保持候选待作者确认。", finishReason: "stop", usage: { promptTokens: 1, completionTokens: 8, totalTokens: 9 } }];
      return { traceId: "trace.fixture", events: (async function* () { for (const frame of frames) yield frame; })() };
    }
  });
  assert.equal(providerCalls, 2);
  assert.equal(toolCalls, 1);
  assert.equal(result.text, "已读取当前引用范围，建议保持候选待作者确认。");
});
