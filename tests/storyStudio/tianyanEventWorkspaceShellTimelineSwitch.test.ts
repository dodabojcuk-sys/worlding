import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
const shellStyles = readFileSync("apps/story-studio/src/styles/tianyan-r0-shell.css", "utf8");
const graph = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");
const formalEventNode = readFileSync("apps/story-studio/src/components/graph-nodes/FormalEventNode.tsx", "utf8");
const tianyiSidebar = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx", "utf8");
const coordinator = readFileSync("apps/story-studio/src/product-shell/WorkspaceDockCoordinator.ts", "utf8");
const dockLayout = readFileSync("apps/story-studio/src/product-shell/right-dock/useDockLayoutState.ts", "utf8");

test("event workspace offers two primary views and three canvas dimensions while retaining local selection", () => {
  assert.match(workspace, /aria-label="事件线一级视图"/u);
  assert.match(workspace, /故事结构/u);
  assert.match(workspace, /事件画布/u);
  assert.match(workspace, /aria-label="事件画布观察维度"/u);
  assert.match(workspace, />关系</u);
  assert.match(workspace, />时间</u);
  assert.match(workspace, />视角</u);
  assert.match(workspace, /selectedEventId=\{selectedEventId\}/u);
  assert.match(workspace, /readProjectionMode\(props\.projectId\)/u);
  assert.match(workspace, /writeProjectionMode\(props\.projectId, projectionMode\)/u);
  assert.match(workspace, /eventView/u);
});

test("timeline keeps the same Event Graph foreground over a semantic screen background", () => {
  assert.match(workspace, /mode=\{projectionMode === "timeline" \? "temporal" : "graph"\}/u);
  assert.match(graph, /data-event-foreground=\{mode === "temporal" \? "shared" : "formal"\}/u);
  assert.match(graph, /data-temporal-background=\{mode === "temporal" \? "screens" : "none"\}/u);
  assert.match(graph, /type: "temporalScreen"/u);
  assert.match(graph, /zIndex: -10 - index/u);
  assert.match(formalEventNode, /正式时间未确认 ·/u);
  assert.match(graph, /semanticZoom/u);
  assert.match(graph, /fitTemporalProjection/u);
  assert.match(graph, /Math\.max\(\.84/u);
  assert.match(graph, /temporal-cross-screen-edge/u);
  assert.match(graph, /props\.onReturnGraph/u);
  assert.match(workspace, /next === "graph" \|\| next === "timeline" \|\| next === "perspective"/u);
  assert.doesNotMatch(graph, /createWorldObject|updateWorldObject|storyStudioAuthorControl|storyStudioWorkspaceOperations/u);
  assert.equal(workspace.includes("EventTimelineProjection"), false);
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
