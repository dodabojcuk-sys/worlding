import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dock = readFileSync("apps/story-studio/src/components/entity-dock/EntityInspectorDock.tsx", "utf8");

test("Agent 运行 consumes the shared character context gateway instead of the title-bound ContextPack", () => {
  assert.match(dock, /prepareCharacterContextGateway/);
  assert.match(dock, /tab === "Agent 运行" \? <AgentRunTab runtime=\{props\.runtime\}[^>]+preparation=\{contextPreparation\}/);
  assert.doesNotMatch(dock, /tab === "Agent 运行" \? <AgentRunTab pack=\{contextPack\}/);
});

test("Agent 运行 renders the bounded transient generation flow and honest write limits", () => {
  const agentTab = dock.slice(dock.indexOf("function AgentRunTab"), dock.indexOf("function DockHeader"));
  for (const text of [
    "生成单角色行动候选",
    "未保存候选",
    "故事单元 / 场景",
    "本场局部目标",
    "权限裁定",
    "角色稳定 ID",
    "projectionRevision",
    "可供模型的安全上下文摘要",
    "缺失条件",
    "1 次 Provider 请求",
    "0 次自动重试",
    "生成行动候选",
    "丢弃候选",
    "技术详情"
  ]) assert.match(agentTab, new RegExp(text));
  assert.doesNotMatch(agentTab, /采纳|应用到故事|加入待处理|localStorage|sessionStorage/);
  assert.doesNotMatch(agentTab, /\.excluded\.map\(\(item\).*item\.title/s);
});

test("the gateway input binds the role by objectId and revision, never by characterTitle", () => {
  const preparation = dock.slice(dock.indexOf("const contextPreparation"), dock.indexOf("const stateView"));
  assert.match(preparation, /id: props\.objectId/);
  assert.match(preparation, /revision: read\.revisionToken/);
  assert.match(preparation, /providerConfigured: isActiveProviderConfigured\(props\.runtime\.modelStatus\)/);
  assert.doesNotMatch(preparation, /characterTitle/);
  assert.match(preparation, /projectCharacterContextExclusionCounts\(knowledge\)/);
  assert.match(preparation, /allowedActions: \["speak", "observe", "ask"\]/);
  assert.match(preparation, /storyUnit: \{ id: selectedScene\.id, revision: selectedScene\.version \}/);
  assert.doesNotMatch(preparation, /for \(const reference of references\)/);
});

test("the browser submits only stable references, revisions, goal and context guards", () => {
  const agentTab = dock.slice(dock.indexOf("function AgentRunTab"), dock.indexOf("function DockHeader"));
  assert.match(agentTab, /generateSingleCharacterActionCandidate/);
  for (const field of ["actorId", "actorRevision", "sceneId", "sceneRevision", "localGoal", "contextDigest", "projectionRevision", "operationId"]) assert.match(agentTab, new RegExp(field));
  assert.doesNotMatch(agentTab, /knownFacts\s*:/);
  assert.doesNotMatch(agentTab, /beliefs\s*:/);
  assert.doesNotMatch(agentTab, /profileBasis\s*:/);
});
