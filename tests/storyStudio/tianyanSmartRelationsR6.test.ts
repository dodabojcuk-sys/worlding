import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canvas = readFileSync(new URL("../../apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", import.meta.url), "utf8");
const projection = readFileSync(new URL("../../apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx", import.meta.url), "utf8");

test("smart relation candidates are visible, source-bound and separate from formal Relations", () => {
  assert.match(canvas, /story-studio-story-modeling-run/u);
  assert.match(canvas, /smart-relation-candidate-edge/u);
  assert.match(canvas, /suggestedTypeLabel/u);
  assert.match(canvas, /candidate\.confidence/u);
  assert.match(canvas, /candidate\.rationale/u);
  assert.match(canvas, /candidate\.evidenceRefs/u);
  assert.match(canvas, /data-formal-relation-writes="0"/u);
});

test("batch accept materializes only existing-owner Relation candidates", () => {
  assert.match(canvas, /接受为待确认/u);
  assert.match(canvas, /批量拒绝/u);
  assert.match(canvas, /修改候选关系类型/u);
  assert.match(canvas, /await props\.onCreateRelation/u);
  assert.match(projection, /createRelationCandidate/u);
  assert.doesNotMatch(canvas, /confirmRelationCandidate/u);
});
