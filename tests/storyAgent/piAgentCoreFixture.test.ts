import assert from "node:assert/strict";
import test from "node:test";

test("pinned Pi agent-core runs a Tianyi read-only tool loop without network or coding tools", async () => {
  const [{ Agent }, { AssistantMessageEventStream, Type, contentText }] = await Promise.all([
    import("@earendil-works/pi-agent-core"),
    import("@earendil-works/pi-ai")
  ]);
  const model = {
    id: "fixture-model",
    name: "Fixture Model",
    api: "openai-completions",
    provider: "tianyi-fixture",
    baseUrl: "http://127.0.0.1:9/v1",
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 4_096,
    maxTokens: 128
  };
  let streamCalls = 0;
  const events: string[] = [];
  const streamFn = () => {
    streamCalls += 1;
    const stream = new AssistantMessageEventStream();
    queueMicrotask(() => {
      const hasToolResult = agent.state.messages.some((message) => message.role === "toolResult");
      const partial = hasToolResult
        ? { role: "assistant", content: [{ type: "text", text: "已读取当前引用范围，建议保持候选待作者确认。" }], api: "openai-completions", provider: "tianyi-fixture", model: "fixture-model", usage: { input: 1, output: 8, cacheRead: 0, cacheWrite: 0, totalTokens: 9, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() }
        : { role: "assistant", content: [{ type: "toolCall", id: "toolcall.fixture", name: "read_context_manifest", arguments: {} }], api: "openai-completions", provider: "tianyi-fixture", model: "fixture-model", usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, totalTokens: 3, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "toolUse", timestamp: Date.now() };
      stream.push({ type: "start", partial });
      stream.push({ type: "done", reason: partial.stopReason, message: partial });
      stream.end(partial);
    });
    return stream;
  };
  const agent = new Agent({
    initialState: {
      systemPrompt: "只读天意夹具。",
      model,
      thinkingLevel: "off",
      tools: [{ name: "read_context_manifest", label: "查看当前引用范围", description: "只读工具", parameters: Type.Object({}), execute: async () => ({ content: [{ type: "text", text: "source.fixture" }], details: { sourceCount: 1 } }) }]
    },
    streamFn,
    toolExecution: "sequential"
  });
  agent.subscribe((event) => { events.push(event.type); });
  await agent.prompt("检查当前引用范围");
  assert.equal(streamCalls, 2);
  assert.ok(events.includes("tool_execution_start"));
  const finalAssistant = agent.state.messages.slice().reverse().find((message) => message.role === "assistant");
  assert.equal(finalAssistant ? contentText(finalAssistant.content) : "", "已读取当前引用范围，建议保持候选待作者确认。");
  assert.equal(agent.state.tools.some((tool) => tool.name === "bash"), false);
});
