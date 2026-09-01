import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const runtime = source("apps/story-studio/src/product-shell/runtime/TianyanShellRuntime.tsx");
const settings = source("apps/story-studio/src/settings/storage/SettingsStorageRoute.tsx");
const dialogue = source("apps/story-studio/src/components/tianyi/sidebar/TianyiDialoguePanel.tsx");
const sidebar = source("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx");
const canvas = source("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx");
const execution = source("apps/story-studio/src/components/tianyi/execution/AgentExecutionGraph.tsx");
const prediction = source("apps/story-studio/src/components/tianyi/sidebar/MultiNodePredictionPanel.tsx");
const workbench = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
const graphStyles = source("apps/story-studio/src/styles/event-line-projection.css");

test("Provider settings invalidate the Shell status snapshot without exposing credentials", () => {
  assert.match(settings, /story-studio-model-service-status-changed/u);
  assert.match(runtime, /addEventListener\("story-studio-model-service-status-changed"/u);
  assert.match(runtime, /addEventListener\("focus"/u);
  assert.doesNotMatch(runtime, /apiKey|Authorization|credentialValue/u);
});

test("Dialogue names a retained background Agent task without mounting execution controls", () => {
  assert.match(dialogue, /Agent 任务在后台保留/u);
  assert.match(dialogue, /当前对话不会操纵任务/u);
  assert.match(sidebar, /agentTaskRetained=\{agentRunning\}/u);
  assert.doesNotMatch(dialogue, /MultiNodePrediction|ContextPack|predictionMode|采纳|查看执行过程/u);
});

test("candidate and execution defaults preserve readable node widths and pan overflow", () => {
  assert.match(canvas, /minZoom=\{\["overview", "focus", "review"\]\.includes\(predictionViewState\) \? 0\.94 : 0\.25\}/u);
  assert.match(canvas, /const zoom = Math\.max\(\.95, fittedZoom\)/u);
  assert.match(canvas, /const candidateNodes = nodes\.filter\(\(node\) => node\.type === "prediction"\)/u);
  assert.match(canvas, /paddingX - minX \* zoom/u);
  assert.match(canvas, /width: 180, height: 126/u);
  assert.match(graphStyles, /\.event-graph-prediction-node \{ inline-size: 11\.25rem; min-inline-size: 11\.25rem;/u);
  assert.match(graphStyles, /@media \(max-width: 75rem\)[\s\S]*?\.event-unit-directory \{ display: none; \}/u);
  assert.match(execution, /document\.querySelector<HTMLElement>\("\.agent-execution-flow"\)/u);
  assert.match(execution, /minZoom=\{\.89\}/u);
});

test("time conflicts stay blocked with a correction route and no formal-write claim", () => {
  assert.match(prediction, /这条路径暂时不可采纳/u);
  assert.match(prediction, /返回修正推演要求/u);
  assert.match(prediction, /不会写入正式事件、正式关系或世界状态/u);
  assert.match(prediction, /focusGoalOnTask\.current = true/u);
  assert.match(prediction, /window\.requestAnimationFrame\(\(\) => adjustGoalRef\.current\?\.focus\(\)\)/u);
});

test("invalid-record warning is a dismissible workspace card", () => {
  assert.match(workbench, /invalidRecordWarningDismissed/u);
  assert.match(workbench, /aria-label="关闭核验警告"/u);
  assert.match(graphStyles, /\.event-line-state\.is-warning \{/u);
  assert.match(graphStyles, /margin: \.75rem \.75rem 0/u);
});
