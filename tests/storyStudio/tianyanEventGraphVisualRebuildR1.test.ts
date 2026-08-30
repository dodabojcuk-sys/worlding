import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const graph = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");
const projection = readFileSync("apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx", "utf8");
const workspace = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");

test("event graph R1 keeps global and focus in one projection component", () => {
  assert.match(graph, /data-event-graph-owner="projection"/u);
  assert.match(graph, /view, focusId, depth/u);
  assert.match(graph, /function deriveGraph/u);
  assert.match(graph, /returnGlobal/u);
  assert.match(graph, /展开一层/u);
  assert.match(graph, /tianyan-event-graph-layout\/v2/u);
  assert.match(graph, /localStorage/u);
});

test("event graph R1 distinguishes formal, pending, and remote relationship projections", () => {
  assert.match(graph, /待确认 · /u);
  assert.match(graph, /strokeDasharray: "7 5"/u);
  assert.match(graph, /远端投影/u);
  assert.match(graph, /strokeDasharray: "3 5"/u);
  assert.match(graph, /正式关系/u);
  assert.match(graph, /关系图图例/u);
});

test("event graph R1 only calls existing Relation owner operations", () => {
  assert.match(projection, /createRelationCandidate/u);
  assert.match(projection, /confirmRelationCandidate/u);
  assert.match(projection, /updateRelationCandidate/u);
  assert.match(projection, /rejectRelationCandidate/u);
  assert.match(graph, /尚未成为正式关系/u);
  assert.match(graph, /通过并保存/u);
  assert.match(graph, /修改后通过/u);
  assert.match(graph, /暂不处理/u);
  assert.doesNotMatch(graph, /createStoryStudioRelationOperations/u);
});

test("event graph R1 uses one contextual inspector rather than the spine page dock", () => {
  assert.match(graph, /事件检查器/u);
  assert.match(graph, /待确认关系检查器/u);
  assert.match(graph, /正式关系检查器/u);
  assert.match(workspace, /projectionMode === "spine" \? <PageContextDock/u);
  assert.match(workspace, /onClearSelection/u);
});

test("event graph R2 keeps the canvas primary and translates implementation terms", () => {
  const styles = readFileSync("apps/story-studio/src/styles/event-line-projection.css", "utf8");
  assert.match(graph, /useState\(Boolean\(props\.selectedEventId\)\)/u);
  assert.match(styles, /--directory-current: 0rem/u);
  assert.match(styles, /--panel-controls-width: 0rem/u);
  assert.match(styles, /event-line-spine-toolbar \{\n  display: none/u);
  assert.match(styles, /event-graph-workspace\.has-inspector .event-graph-main/u);
  assert.doesNotMatch(graph, /尚未写入正式 Relation/u);
  assert.doesNotMatch(graph, /Relation owner/u);
});
