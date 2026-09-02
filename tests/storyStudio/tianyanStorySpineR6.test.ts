import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workbench = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const projection = readFileSync("apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx", "utf8");
const styles = readFileSync("apps/story-studio/src/styles/event-line-projection.css", "utf8");

test("R6 story spine exposes trunk, branch, semantic zoom and optional collection points", () => {
  assert.match(workbench, /story-spine-unit is-branch-unit|is-branch-unit/u);
  assert.match(workbench, /远景 · 单元/u);
  assert.match(workbench, /中景 · 关键事件/u);
  assert.match(workbench, /近景 · 全部事件/u);
  assert.match(workbench, /可选集点/u);
  assert.match(styles, /story-spine-map::before/u);
  assert.match(styles, /story-spine-unit\.is-branch-unit/u);
});

test("unit and event controls route to existing owners and preserve cross-view identity", () => {
  assert.match(projection, /createStoryUnit/u);
  assert.match(projection, /updateStoryUnit/u);
  assert.match(projection, /archiveStoryUnit/u);
  assert.match(workbench, /openEventInView\(eventId, "graph"\)/u);
  assert.match(workbench, /openEventInView\(eventId, "timeline"\)/u);
  assert.doesNotMatch(workbench, /当前 Unit owner 尚无批量拆分事务合同/u);
  assert.doesNotMatch(workbench, /Nuwa 范围移交 owner 合同尚未建立/u);
});

test("bottom AI tools occupy their own layout row instead of covering the story canvas", () => {
  assert.match(styles, /grid-template-rows: minmax\(0, 1fr\) auto/u);
  assert.match(styles, /story-modeling-toolbar[\s\S]*grid-row: 2/u);
  assert.match(workbench, /story-modeling-toolbar/u);
});
