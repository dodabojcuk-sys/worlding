import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dock = readFileSync("apps/story-studio/src/components/entity-dock/EntityInspectorDock.tsx", "utf8");

test("Agent 运行 consumes the shared character context gateway instead of the title-bound ContextPack", () => {
  assert.match(dock, /prepareCharacterContextGateway/);
  assert.match(dock, /tab === "Agent 运行" \? <AgentRunTab preparation=\{contextPreparation\}/);
  assert.doesNotMatch(dock, /tab === "Agent 运行" \? <AgentRunTab pack=\{contextPack\}/);
});

test("Agent 运行 honestly renders permission, zero-call boundaries, summary, safe groups and missing conditions", () => {
  const agentTab = dock.slice(dock.indexOf("function AgentRunTab"), dock.indexOf("function DockHeader"));
  for (const text of [
    "角色上下文准备",
    "只读预览",
    "Provider 未调用",
    "不会写入故事",
    "权限裁定",
    "角色稳定 ID",
    "projectionRevision",
    "模型将收到什么",
    "缺失条件",
    "技术详情"
  ]) assert.match(agentTab, new RegExp(text));
  assert.doesNotMatch(agentTab, /执行|发送|保存/);
  assert.doesNotMatch(agentTab, /\.excluded\.map\(\(item\).*item\.title/s);
});

test("the gateway input binds the role by objectId and revision, never by characterTitle", () => {
  const preparation = dock.slice(dock.indexOf("const contextPreparation"), dock.indexOf("const stateView"));
  assert.match(preparation, /id: props\.objectId/);
  assert.match(preparation, /revision: read\.revisionToken/);
  assert.match(preparation, /providerConfigured: isActiveProviderConfigured\(props\.runtime\.modelStatus\)/);
  assert.doesNotMatch(preparation, /characterTitle/);
});
