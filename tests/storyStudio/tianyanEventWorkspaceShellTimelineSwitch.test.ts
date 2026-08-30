import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const timeline = readFileSync("apps/story-studio/src/components/event-observation/EventTimelineProjection.tsx", "utf8");
const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
const shellStyles = readFileSync("apps/story-studio/src/styles/tianyan-r0-shell.css", "utf8");
const graph = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");
const tianyiSidebar = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx", "utf8");

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

test("timeline is a read-only Event projection and keeps unknown world time visible", () => {
  assert.match(timeline, /read-only ordering of the Event owner's existing world-time projection/u);
  assert.match(timeline, /eventLineSemanticNode\(event\)/u);
  assert.match(timeline, /timeKind !== "unknown"/u);
  assert.match(timeline, /时间未定/u);
  assert.doesNotMatch(timeline, /createWorldObject|updateWorldObject|storyStudioAuthorControl|storyStudioWorkspaceOperations/u);
});

test("graph reuses the named workspace switch and does not make authors guess a clock icon", () => {
  assert.match(graph, /onOpenTimeline/u);
  assert.match(graph, /<Clock3 \/>时间轴/u);
  assert.match(graph, /<Focus \/>聚焦当前/u);
});

test("Tianyi begins closed and becomes an overlay at ordinary desktop widths", () => {
  assert.match(shell, /useDockLayoutState\(false\)/u);
  assert.match(shell, /max-width: 90rem/u);
  assert.match(shell, /setDirectoryOpen\(false\)/u);
  assert.match(shellStyles, /@media \(max-width: 90rem\)[\s\S]*--tianyi-current: 0rem/u);
});

test("closing Tianyi retains the shared session and unsent draft outside the visual drawer", () => {
  assert.match(shell, /dock\.state\.isTianyiOpen && <TianyiSidebar/u);
  assert.doesNotMatch(shell, /setSharedDraft\(""\)[\s\S]{0,240}setTianyiOpen\(false\)/u);
  assert.match(tianyiSidebar, /draft=\{props\.runtime\.sharedDraft\}/u);
  assert.match(tianyiSidebar, /data-shared-session-id=\{props\.runtime\.sharedSessionId/u);
});
