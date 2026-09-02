import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const formal = readFileSync("apps/story-studio/src/components/graph-nodes/FormalEventNode.tsx", "utf8");
const candidate = readFileSync("apps/story-studio/src/components/graph-nodes/CandidateEventNode.tsx", "utf8");
const collection = readFileSync("apps/story-studio/src/components/graph-nodes/CollectionPointNode.tsx", "utf8");
const timeline = readFileSync("apps/story-studio/src/components/event-observation/TemporalCanvas.tsx", "utf8");
const workbench = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const styles = readFileSync("apps/story-studio/src/styles/event-line-projection.css", "utf8");

test("Event families differ by structure and semantics rather than color alone", () => {
  assert.match(formal, /turning-event/u);
  assert.match(formal, /关键转折/u);
  assert.match(formal, /portMode === "narrative"/u);
  assert.match(formal, /branching \? <GraphPort/u);
  assert.match(candidate, /candidate-existing-reference/u);
  assert.match(candidate, /candidate-conflict/u);
  assert.match(candidate, /已有事件引用/u);
  assert.match(collection, /family="collection-point"/u);
  assert.match(timeline, /type: "temporalEvent"/u);
  assert.match(styles, /is-turning-event[^\n]+clip-path/u);
  assert.match(styles, /is-candidate-conflict[^\n]+clip-path/u);
  assert.match(styles, /is-collection-point[^\n]+border-style: double/u);
});

test("story spine renders author-facing branch and merge topology without machine ids", () => {
  assert.match(workbench, /branchParentTitle/u);
  assert.match(workbench, /mergeTargetTitle/u);
  assert.match(workbench, /分出/u);
  assert.match(workbench, /合流回/u);
  assert.doesNotMatch(workbench, />合流至：\{props\.unit\.mergeTargetUnitId\}</u);
});
