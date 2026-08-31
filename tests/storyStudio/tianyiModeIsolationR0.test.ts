import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sidebar = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx", "utf8");
const dialogue = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiDialoguePanel.tsx", "utf8");
const agent = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiAgentPanel.tsx", "utf8");
const runtime = readFileSync("apps/story-studio/src/product-shell/runtime/TianyanShellRuntime.tsx", "utf8");

test("dialogue is a simple message stream and cannot dispatch Agent work", () => {
  assert.match(dialogue, /普通消息流/u);
  assert.match(dialogue, /data-agent-dispatch="forbidden"/u);
  assert.match(dialogue, /event\.key !== "Enter" \|\| event\.shiftKey/u);
  assert.match(dialogue, /转到 Agent 模式/u);
  assert.doesNotMatch(dialogue, /MultiNodePrediction|ContextPack|predictionMode|Run ID|采纳|Provider 卡片|查看执行过程/u);
});

test("Agent owns prediction controls while mode state is retained independently", () => {
  assert.match(agent, /MultiNodePredictionPanel/u);
  assert.match(agent, /data-agent-run-preserved="true"/u);
  assert.match(sidebar, /mode === "dialogue" \? <TianyiDialoguePanel[\s\S]*<TianyiAgentPanel/u);
  assert.match(sidebar, /submitDialogue/u);
  assert.match(sidebar, /submitAgent/u);
  assert.doesNotMatch(sidebar, /sharedSessionId|sharedDraft|setSharedSessionId|setSharedDraft/u);
});

test("runtime separates dialogue and Agent sessions, drafts and active run", () => {
  for (const field of ["dialogueSessionId", "dialogueComposerDraft", "agentSessionId", "agentTaskDraft", "activeAgentRunId"]) assert.match(runtime, new RegExp(field, "u"));
  assert.doesNotMatch(runtime, /sharedSessionId|sharedDraft/u);
  assert.match(runtime, /tianyiDialogueSessionStorageKey/u);
  assert.match(runtime, /tianyiAgentSessionStorageKey/u);
});
