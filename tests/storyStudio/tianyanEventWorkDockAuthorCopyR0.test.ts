import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createEventLineFixture } from "../../apps/story-studio/src/components/event-observation/eventLineFixture.ts";

test("Event fixture keeps the Data projection coherent and author-facing", () => {
  const fixture = createEventLineFixture("fixture-project");
  const serialized = JSON.stringify({ events: fixture.events, details: fixture.details, storyUnits: fixture.storyUnits });
  assert.equal(fixture.storyUnits.length, 1);
  assert.equal(fixture.storyUnits[0]?.items.length, fixture.events.length);
  assert.doesNotMatch(serialized, /fixture-source-|fixture-hash-/u);
  assert.match(serialized, /作者来源-1/u);
});

test("Event detail copy keeps source diagnostics behind a technical disclosure", () => {
  const source = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
  assert.match(source, /世界时间/u);
  assert.match(source, /来源与技术详情/u);
  assert.match(source, /复制来源标识/u);
  assert.doesNotMatch(source, /正式摘要未随列表投影提供/u);
});
