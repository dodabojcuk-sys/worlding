import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
const shellStyles = readFileSync("apps/story-studio/src/styles/tianyan-r0-shell.css", "utf8");
const graph = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");
const timeline = readFileSync("apps/story-studio/src/components/event-observation/TemporalCanvas.tsx", "utf8");
const formalEventNode = readFileSync("apps/story-studio/src/components/graph-nodes/FormalEventNode.tsx", "utf8");
const tianyiSidebar = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx", "utf8");
const coordinator = readFileSync("apps/story-studio/src/product-shell/WorkspaceDockCoordinator.ts", "utf8");
const dockLayout = readFileSync("apps/story-studio/src/product-shell/right-dock/useDockLayoutState.ts", "utf8");

test("event workspace groups structure, arrangement and observation while retaining local selection", () => {
  assert.match(workspace, /aria-label="事件工作区视图"/u);
  assert.match(workspace, />结构</u);
  assert.match(workspace, />编排</u);
  assert.match(workspace, />观察</u);
  assert.match(workspace, /故事脊柱/u);
  assert.match(workspace, /事件线/u);
  assert.match(workspace, />关系</u);
  assert.match(workspace, />时间线</u);
  assert.match(workspace, />视角</u);
  assert.match(workspace, /selectedEventId=\{selectedEventId\}/u);
  assert.match(workspace, /readProjectionMode\(props\.projectId\)/u);
  assert.match(workspace, /writeProjectionMode\(props\.projectId, projectionMode\)/u);
  assert.match(workspace, /eventView/u);
});

test("timeline owns an independent projection while preserving formal Event ids", () => {
  assert.match(workspace, /<TemporalCanvas/u);
  assert.doesNotMatch(workspace, /<EventGraphCanvas[^>]+mode=\{projectionMode === "timeline"/u);
  assert.match(timeline, /data-temporal-projection="independent"/u);
  assert.match(timeline, /id: event\.id, type: "temporalEvent"/u);
  assert.match(timeline, /TemporalEventNode/u);
  assert.match(timeline, /temporal-unplaced-tray/u);
  assert.match(timeline, /temporal-conflict-zone/u);
  assert.match(timeline, /props\.onReturnGraph/u);
  assert.match(workspace, /next === "line" \|\| next === "graph" \|\| next === "timeline"/u);
  assert.doesNotMatch(timeline, /createWorldObject|updateWorldObject|storyStudioAuthorControl|storyStudioWorkspaceOperations/u);
  assert.match(formalEventNode, /正式时间未确认 ·/u);
});

test("graph leaves dimension switching to the named workspace navigation", () => {
  assert.match(graph, /onOpenTimeline/u);
  assert.match(graph, /event-graph-command-title/u);
  assert.doesNotMatch(graph, /aria-label="事件视图"/u);
  assert.match(graph, /<Focus \/><span>聚焦当前<\/span>/u);
});

test("one five-state right work surface arbitrates page inspectors, creation, review, and Tianyi", () => {
  assert.match(coordinator, /"NONE",\s*"EVENT_DETAILS",\s*"EVENT_CREATE",\s*"RELATION_REVIEW",\s*"TIANYI"/u);
  assert.match(shell, /rightWorkSurface\.mode === "TIANYI"/u);
  assert.match(workspace, /activeLens === "create" \? "EVENT_CREATE"/u);
  assert.match(workspace, /activeLens === "review" \? "RELATION_REVIEW"/u);
  assert.match(graph, /useWorkspaceDockSlot/u);
  assert.doesNotMatch(graph, /setInspectorOpen|useState\(Boolean\(props\.selectedEventId\)\)/u);
  assert.doesNotMatch(dockLayout, /isTianyiOpen|setTianyiOpen/u);
  assert.doesNotMatch(workspace, /event-line-simulation-entry/u);
  assert.match(shell, /max-width: 90rem/u);
  assert.match(shellStyles, /@media \(max-width: 90rem\)[\s\S]*--tianyi-current: 0rem/u);
});

test("closing Tianyi retains isolated dialogue and Agent sessions plus unsent drafts outside the visual drawer", () => {
  assert.match(shell, /tianyiOpen && <TianyiSidebar/u);
  assert.doesNotMatch(shell, /setDialogueComposerDraft\(""\)[\s\S]{0,240}closeQuickTianyi\(\)/u);
  assert.match(tianyiSidebar, /dialogueSessionId/u);
  assert.match(tianyiSidebar, /agentSessionId/u);
  assert.match(tianyiSidebar, /dialogueComposerDraft/u);
  assert.match(tianyiSidebar, /agentTaskDraft/u);
});
