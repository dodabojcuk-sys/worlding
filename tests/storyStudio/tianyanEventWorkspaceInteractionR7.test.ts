import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workbench = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const graph = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");
const styles = readFileSync("apps/story-studio/src/styles/event-line-projection.css", "utf8");

test("R7 keeps canvas selection separate from the Tianyi prediction scope", () => {
  assert.match(graph, /workspaceSelectionIds/u);
  assert.match(graph, /predictionSelectionIds/u);
  assert.match(graph, /围绕所选预测/u);
  assert.match(graph, /event-graph-selection-bar/u);
  assert.doesNotMatch(graph, /if \(event\.shiftKey\) setPredictionSelectionIds/u);
});

test("R7 provides mouse, keyboard and context menu canvas grammar", () => {
  assert.match(graph, /selectionOnDrag=\{!spacePanning\}/u);
  assert.match(graph, /panOnDrag=\{spacePanning \? \[0, 1, 2\] : \[1, 2\]\}/u);
  assert.match(graph, /event\.ctrlKey \|\| event\.metaKey/u);
  assert.match(graph, /event\.shiftKey && event\.key === "F10"/u);
  assert.match(graph, /onNodeContextMenu/u);
  assert.match(graph, /onPaneContextMenu/u);
  assert.match(graph, /target\.closest\("\.react-flow__pane"\)/u);
  assert.match(graph, /正式事件不可删除/u);
  assert.match(styles, /event-graph-context-menu/u);
});

test("R7 exposes local logic checks and a first perspective intersection", () => {
  assert.match(workbench, /本地逻辑检测/u);
  assert.match(workbench, /确定性检查 · 0 tokens/u);
  assert.match(workbench, /AI 语义逻辑/u);
  assert.match(workbench, /选择 2–5 个人物、地点或物品/u);
  assert.match(workbench, /data-provider-calls-on-open="0"/u);
  assert.match(workbench, /正式参与/u);
  assert.match(workbench, /深度分析视角交集/u);
});

test("R7 uses one collapsed AI tools entry by default", () => {
  assert.match(workbench, /useState\(false\).*aiToolbarExpanded|aiToolbarExpanded.*useState\(false\)/su);
  assert.match(workbench, /<span>AI 工具<\/span>/u);
  assert.match(workbench, /StoryModelingConfirmation/u);
});
