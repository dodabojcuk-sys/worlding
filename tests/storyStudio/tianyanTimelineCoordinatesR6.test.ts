import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const canvas = readFileSync(new URL("../../apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../../apps/story-studio/src/styles/event-line-projection.css", import.meta.url), "utf8");

test("timeline exposes synchronized top and left rulers plus selected Event crosshair", () => {
  assert.match(canvas, /TemporalCoordinateOverlay/u);
  assert.match(canvas, /temporal-top-ruler/u);
  assert.match(canvas, /temporal-left-scale/u);
  assert.match(canvas, /temporal-crosshair/u);
  assert.match(canvas, /setTemporalViewport\(viewport\)/u);
  assert.match(styles, /\.temporal-top-ruler/u);
  assert.match(styles, /\.temporal-left-scale/u);
});

test("unplaced and conflict Events remain in explicit regions instead of the timeline tail", () => {
  assert.match(canvas, /temporal-unplaced-tray/u);
  assert.match(canvas, /temporal-conflict-zone/u);
  assert.match(canvas, /placement\.placementKind !== "unplaced" && placement\.placementKind !== "conflict"/u);
  assert.match(canvas, /未被塞到时间末尾/u);
});

test("view navigation, pan and zoom advertise a zero-cost read path", () => {
  assert.match(canvas, /data-view-switch-provider-calls="0"/u);
  assert.match(canvas, /data-view-switch-agent-runs="0"/u);
  assert.doesNotMatch(canvas, /createTemporalProjectionRun/u);
  assert.doesNotMatch(canvas, /executeTemporalProjectionRun/u);
});
