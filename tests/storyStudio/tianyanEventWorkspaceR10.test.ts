import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const graph = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");
const timeline = readFileSync("apps/story-studio/src/components/event-observation/TemporalCanvas.tsx", "utf8");

test("R10 single Owner keeps blind spots behind a default-off control and preserves prose boundary", () => {
  assert.match(workspace, /const \[showBlindSpots, setShowBlindSpots\] = useState\(false\)/u);
  assert.match(workspace, />显示作者可见盲区</u);
  assert.match(workspace, /当前没有可显示的正式证据/u);
  assert.match(workspace, /第一人称正文改写是“多元”的独立派生合同/u);
});

test("R10 temporal canvas reads composition branchTrack and separates conflict notice from nodes", () => {
  assert.match(timeline, /resolveTemporalTrackProjection/u);
  assert.match(timeline, /data-temporal-track/u);
  assert.match(timeline, /data-track-origin/u);
  assert.match(timeline, /temporal-conflict-summary/u);
  assert.match(timeline, /temporal-conflict-zone/u);
  assert.match(timeline, /保留冲突，不自动选择一个日期/u);
});

test("R10 narrative canvas exposes branch navigation and uses an in-product Collection Point dialog", () => {
  for (const label of ["上一分叉", "跳到分叉", "下一合流", "聚焦当前轨道", "折叠其他分支"]) assert.match(graph, new RegExp(label, "u"));
  assert.match(graph, /node\.data\?\.trackId === activeNarrativeTrackId/u);
  assert.match(graph, /CollectionPointRenameDialog/u);
  assert.doesNotMatch(graph, /window\.prompt/u);
});
