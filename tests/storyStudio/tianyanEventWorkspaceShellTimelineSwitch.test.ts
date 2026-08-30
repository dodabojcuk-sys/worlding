import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const timeline = readFileSync("apps/story-studio/src/components/event-observation/EventTimelineProjection.tsx", "utf8");
const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
const shellStyles = readFileSync("apps/story-studio/src/styles/tianyan-r0-shell.css", "utf8");
const graph = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");
const tianyiSidebar = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx", "utf8");
const coordinator = readFileSync("apps/story-studio/src/product-shell/WorkspaceDockCoordinator.ts", "utf8");
const dockLayout = readFileSync("apps/story-studio/src/product-shell/right-dock/useDockLayoutState.ts", "utf8");

test("event workspace offers one named three-view switch and retains the local selection", () => {
  assert.match(workspace, /aria-label="事件视图"/u);
  assert.match(workspace, /故事脊柱/u);
  assert.match(workspace, /关系图/u);
  assert.match(workspace, /时间轴/u);
  assert.match(workspace, /selectedEventId=\{selectedEventId\}/u);
  assert.match(workspace, /readProjectionMode\(props\.projectId\)/u);
  assert.match(workspace, /writeProjectionMode\(props\.projectId, projectionMode\)/u);
  assert.match(workspace, /eventView/u);
});

test("timeline is a read-only, pannable time-relationship graph with an honest axis and unknown lane", () => {
  assert.match(timeline, /read-only canvas projection of the Event owner's existing world-time/u);
  assert.match(timeline, /eventLineSemanticNode\(event\)/u);
  assert.match(timeline, /timeKind !== "unknown"/u);
  assert.match(timeline, /data-timeline-canvas="world-time"/u);
  assert.match(timeline, /data-timeline-graph-engine="react-flow"/u);
  assert.match(timeline, /<ReactFlow/u);
  assert.match(timeline, /relations: readonly RelationReadProjectionR0\[\]/u);
  assert.match(timeline, /timeline-cross-band-edge/u);
  assert.match(timeline, /聚焦当前时间节点/u);
  assert.match(timeline, /适应时间图视图/u);
  assert.match(timeline, /event-timeline-axis/u);
  assert.match(timeline, /aria-label="时间隔栏"/u);
  assert.match(timeline, /aria-label="时间未定泳道"/u);
  assert.match(timeline, /时间未定/u);
  assert.doesNotMatch(timeline, /createWorldObject|updateWorldObject|storyStudioAuthorControl|storyStudioWorkspaceOperations/u);
});

test("graph reuses the named workspace switch and does not make authors guess a clock icon", () => {
  assert.match(graph, /onOpenTimeline/u);
  assert.match(graph, /<Clock3 \/>时间轴/u);
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

test("closing Tianyi retains the shared session and unsent draft outside the visual drawer", () => {
  assert.match(shell, /tianyiOpen && <TianyiSidebar/u);
  assert.doesNotMatch(shell, /setSharedDraft\(""\)[\s\S]{0,240}closeQuickTianyi\(\)/u);
  assert.match(tianyiSidebar, /draft=\{props\.runtime\.sharedDraft\}/u);
  assert.match(tianyiSidebar, /data-shared-session-id=\{props\.runtime\.sharedSessionId/u);
});
