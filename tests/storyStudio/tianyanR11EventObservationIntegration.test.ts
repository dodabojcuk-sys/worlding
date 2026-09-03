import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workbench = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const controls = readFileSync("apps/story-studio/src/components/event-observation/EventObservationControls.tsx", "utf8");
const participation = readFileSync("apps/story-studio/src/components/event-observation/ParticipationObservation.tsx", "utf8");
const adapter = readFileSync("apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx", "utf8");
const contract = readFileSync("src/storyContracts/eventObservation.ts", "utf8");
const progression = readFileSync("apps/story-studio/src/components/event-observation/StoryProgressionWorkspace.tsx", "utf8");
const styles = readFileSync("apps/story-studio/src/styles/event-line-projection.css", "utf8");

test("R12 exposes one EventLine task workspace and renders order only from NarrativeArrangement Placement", () => {
  assert.match(workbench, /StoryProgressionWorkspace/u);
  assert.match(progression, /props\.narrative\?\.projection\.placed/u);
  assert.match(progression, /props\.narrative\?\.projection\.unplaced/u);
  assert.doesNotMatch(progression, /sort\([^\n]+(?:event\.id|event\.title|narrativeIndex)/u);
  assert.match(progression, /未排序集合；卡片位置不代表作者顺序/u);
  assert.match(progression, /角色视角 · 未开放/u);
  assert.match(progression, /关系变化 · 未开放/u);
  assert.match(progression, /MAX_FOCUS_OBJECTS = 3/u);
  assert.match(styles, /narrative-spine-grid/u);
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
