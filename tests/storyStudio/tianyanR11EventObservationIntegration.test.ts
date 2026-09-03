import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workbench = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const controls = readFileSync("apps/story-studio/src/components/event-observation/EventObservationControls.tsx", "utf8");
const participation = readFileSync("apps/story-studio/src/components/event-observation/ParticipationObservation.tsx", "utf8");
const adapter = readFileSync("apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx", "utf8");
const contract = readFileSync("src/storyContracts/eventObservation.ts", "utf8");
const progression = readFileSync("apps/story-studio/src/components/event-observation/StoryProgressionWorkspace.tsx", "utf8");
const graph = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");
const timeline = readFileSync("apps/story-studio/src/components/event-observation/TemporalCanvas.tsx", "utf8");
const styles = readFileSync("apps/story-studio/src/styles/event-line-projection.css", "utf8");

test("R12 exposes one EventLine task workspace and renders order only from NarrativeArrangement Placement", () => {
  assert.match(workbench, /StoryProgressionWorkspace/u);
  assert.match(progression, /props\.narratives\.flatMap\(\(read\) => read\.projection\.placed/u);
  assert.match(progression, /new Set\(placed\.map\(\(placement\) => placement\.event\.id\)\)/u);
  assert.match(progression, /未编排 Event 保持在画布之外/u);
  assert.doesNotMatch(progression, /sort\([^\n]+(?:event\.id|event\.title|narrativeIndex)/u);
  assert.match(progression, /未排序集合；条目位置不代表作者顺序/u);
  assert.match(progression, /label="事件线"/u);
  assert.match(progression, /label="时间线"/u);
  assert.match(progression, /label="证据审计"/u);
  assert.doesNotMatch(progression, /label="角色视角"|label="关系变化"/u);
  assert.match(progression, /MAX_FOCUS_OBJECTS = 3/u);
  assert.doesNotMatch(progression, /NarrativeSpineBoard/u);
  assert.match(graph, /data-narrative-order-owner="NarrativeArrangementProjection"/u);
  assert.match(graph, /id: placement\.placementId/u);
  assert.match(graph, /instance\.fitView\(\{ padding: \.12, maxZoom: \.75/u);
  assert.match(graph, /minZoom=\{\.24\}/u);
  assert.match(graph, /formal-narrative-edge is-branch/u);
  assert.match(graph, /formal-narrative-edge is-merge/u);
  assert.match(graph, /unit\.mergeTargetUnitId && mergeTarget/u);
  assert.match(graph, /index > anchor && placement\.storyUnitId === unit\.mergeTargetUnitId/u);
  assert.match(timeline, /data-temporal-projection="independent"/u);
  assert.match(styles, /formal-narrative-flow/u);
});

test("R12 placement controls reuse the Story Unit writer transport with explicit concurrency receipts", () => {
  assert.match(adapter, /getNarrativeArrangement/u);
  assert.match(adapter, /createNarrativeArrangement/u);
  assert.match(adapter, /insertNarrativePlacement/u);
  assert.match(adapter, /moveNarrativePlacement/u);
  assert.match(adapter, /removeNarrativePlacement/u);
  assert.match(adapter, /expectedOwnerVersion/u);
  assert.match(adapter, /expectedRevision/u);
  assert.match(progression, /receipt/u);
  assert.doesNotMatch(progression, /localStorage|sessionStorage/u);
});

test("R11.1 composes layout, lens, focus, render mode, scale and source layer without adding an Event owner", () => {
  assert.match(workbench, /EventObservationControls/u);
  assert.match(workbench, /ParticipationObservation/u);
  assert.match(workbench, /eventObservationLegacyView/u);
  assert.match(controls, /排列/u);
  assert.match(controls, /观察/u);
  assert.match(controls, /范围/u);
  assert.match(controls, /轨迹/u);
  assert.match(controls, /矩阵/u);
  assert.match(controls, /来源证据/u);
  assert.match(participation, /focusObjectIds/u);
  assert.match(participation, /EVENT_OBSERVATION_MAX_VISIBLE_EVENTS/u);
  assert.match(contract, /Pure read projection/u);
  assert.doesNotMatch(contract, /createWorldObject|updateWorldObject|fetch\(|Provider/u);
  assert.doesNotMatch(participation, /createWorldObject|updateWorldObject|fetch\(|onOpenAi/u);
  assert.match(adapter, /perspectiveObjects/u);
});

test("R11.1 participation renderers reuse selected Event identity and existing details", () => {
  assert.match(workbench, /onSelectEvent=\{openEvent\}/u);
  assert.match(participation, /eventId=\{column\.event\.id\}/u);
  assert.match(participation, /data-event-id=\{props\.eventId\}/u);
  assert.match(participation, /props\.onSelectEvent\(eventId\)/u);
  assert.match(participation, /data-render-mode=\{props\.renderMode\}/u);
  assert.match(participation, /event-participation-spine/u);
  assert.match(workbench, /PageContextDock/u);
  assert.doesNotMatch(participation, /EventDetail|Canon|RelationRecord/u);
});

test("R11 reserves psychology for formal characters and makes unsupported relation evolution explicit", () => {
  assert.match(workbench, /object\.formal === true && object\.type === "character"/u);
  assert.match(workbench, /地点与物品可用于“参与”镜头/u);
  assert.match(controls, /需要版本化关系状态序列/u);
  assert.match(controls, /id === "relationship-evolution"/u);
});

test("R11.1 view persistence is project scoped, validated and backward compatible", () => {
  assert.match(workbench, /tianyan\.event-observation\/v2:\$\{projectId\}/u);
  assert.match(workbench, /tianyan\.event-observation\/v1:\$\{projectId\}/u);
  assert.match(workbench, /serializeEventObservationState/u);
  assert.match(workbench, /normalizeEventObservationState/u);
  assert.match(workbench, /tianyan\.event-line-view\/v1/u);
  assert.match(workbench, /window\.history\.replaceState/u);
  assert.match(workbench, /eventRender/u);
});
