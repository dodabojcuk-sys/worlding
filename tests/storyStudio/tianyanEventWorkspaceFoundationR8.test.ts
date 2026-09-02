import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workbench = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
const canvas = readFileSync("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", "utf8");

test("R8 propagates canvas selection and formal perspective refs into distinct StoryModeling requests", () => {
  assert.match(workbench, /modelingRefsForIds\(logicSelectionIds\)/u);
  assert.match(workbench, /selectedPerspectiveRefs:\s*activePerspectiveRefs/u);
  assert.match(workbench, /ownerId:\s*object\.ownerId/u);
  assert.match(canvas, /onExplainWithTianyi/u);
  assert.match(workbench, /intent === "explain"/u);
});

test("R8 smart Relation review starts unselected and blocks unknown types", () => {
  assert.match(canvas, /setSmartRelationSelection\(\[\]\)/u);
  assert.match(canvas, /!candidate\.suggestedTypeId/u);
  assert.match(canvas, /批次结果/u);
});

test("R8 exposes draft trash through the existing catalog path while formal Event hard delete stays absent", () => {
  assert.match(canvas, /contextEvent\.status === "draft"/u);
  assert.match(canvas, /onTrashDraftEvent/u);
  assert.match(canvas, /正式事件不可删除/u);
  assert.doesNotMatch(canvas, /deleteWorldObject/u);
});
