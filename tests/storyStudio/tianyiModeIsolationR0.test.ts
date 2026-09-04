import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx", "utf8");
const work = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiWorkPanel.tsx", "utf8");
const agent = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiAgentPanel.tsx", "utf8");
const runtime = readFileSync("apps/story-studio/src/product-shell/runtime/TianyanShellRuntime.tsx", "utf8");
const workspace = readFileSync("apps/story-studio/src/components/tianyi/workspace/TianyiConversationWorkspace.tsx", "utf8");

test("sidebar Work is one surface of the shared Work lane and cannot dispatch Page Agent work", () => {
  assert.match(work, /同一 Work lane 的可见历史/u);
  assert.match(work, /data-page-agent-dispatch="forbidden"/u);
  assert.match(work, /event\.key !== "Enter" \|\| event\.shiftKey/u);
  assert.match(work, /转到 Agent/u);
  assert.doesNotMatch(work, /MultiNodePrediction|predictionMode|Run ID|采纳|Provider 卡片|查看执行过程/u);
  assert.match(sidebar, /streamTianyiGroundedAnswer/u);
  assert.match(sidebar, /taskKind: "grounded-answer"/u);
  assert.match(sidebar, /profiles\.find\(\(item\) => item\.modelId === selectedModelId\)\?\.id/u);
  assert.doesNotMatch(sidebar, /const profileId = props\.runtime\.modelStatus\?\.profile\.activeProfileId/u);
  assert.doesNotMatch(sidebar, /runTianyiQuestion/u);
});

test("Page Agent owns page-scoped prediction controls without owning a second Session", () => {
  assert.match(agent, /MultiNodePredictionPanel/u);
  assert.match(agent, /data-agent-run-preserved="true"/u);
  assert.match(sidebar, /mode === "work" \? <TianyiWorkPanel[\s\S]*<TianyiAgentPanel/u);
  assert.match(sidebar, /submitWork/u);
  assert.match(sidebar, /submitAgent/u);
  assert.match(sidebar, /data-page-agent-session-owner="none"/u);
  assert.doesNotMatch(sidebar, /agentSessionId|ensureAgentSession|open-agent-session/u);
});

test("runtime owns one conversation while Creative, Work and Page Agent transient state stay isolated", () => {
  for (const field of ["tianyiConversationId", "creativeComposerDraft", "workComposerDraft", "workScope", "pageAgentTaskDraft", "activePageAgentRunId"]) assert.match(runtime, new RegExp(field, "u"));
  assert.match(runtime, /tianyiConversationStorageKey/u);
  assert.doesNotMatch(runtime, /dialogueSessionId|agentSessionId|tianyiDialogueSessionStorageKey|tianyiAgentSessionStorageKey/u);
});

test("Tianyi big page exposes Creative and Work lanes with a shared registry and deterministic provider-free candidates", () => {
  assert.match(workspace, /创意模式/u);
  assert.match(workspace, /工作模式/u);
  assert.match(workspace, /同一会话/u);
  assert.match(workspace, /共享候选注册表/u);
  assert.match(workspace, /collaborate: false/u);
  assert.match(workspace, /deterministicThreeCandidates/u);
  assert.match(workspace, /Provider 调用为 0/u);
});
