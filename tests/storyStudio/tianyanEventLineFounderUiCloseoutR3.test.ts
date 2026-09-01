import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const canvas = source("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx");
const workbench = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
const prediction = source("apps/story-studio/src/components/tianyi/sidebar/MultiNodePredictionPanel.tsx");
const graphStyles = source("apps/story-studio/src/styles/event-line-projection.css");
const tianyiStyles = source("apps/story-studio/src/styles/tianyi-sidebar.css");
const smoke = source("apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs");

test("prediction stages temporarily yield the Unit directory and restore it outside the flow", () => {
  assert.match(canvas, /predictionDirectoryCollapsed = \["overview", "focus", "review"\]/u);
  assert.match(canvas, /data-unit-directory=\{mode === "temporal" \|\| predictionDirectoryCollapsed \? "temporarily-collapsed" : "restored"\}/u);
  assert.match(graphStyles, /\[data-unit-directory="temporarily-collapsed"\] \.event-unit-directory \{ display: none; \}/u);
  assert.match(smoke, /Leaving the Agent prediction flow must restore the Unit directory/u);
});

test("candidate comparison preserves unique shared nodes, readable width, and three path lanes", () => {
  assert.match(canvas, /const candidateIds = new Set\(paths\.flatMap/u);
  assert.match(canvas, /sharedAcrossPaths: memberships\.length/u);
  assert.match(canvas, /const displayedSelected = overview \|\| reviewSelected/u);
  assert.match(canvas, /lane \* 190/u);
  assert.match(canvas, /indexInPath \* 232/u);
  assert.match(graphStyles, /\.event-graph-prediction-node \{ inline-size: 12rem; min-inline-size: 12rem;/u);
  assert.match(smoke, /three vertically separated horizontal path lanes/u);
  assert.match(smoke, /Shared candidate Events must have one rendered identity/u);
});

test("story spine uses compact author copy without repeated missing-summary prose", () => {
  assert.match(workbench, /summary \? <p>\{summary\}<\/p> : null/u);
  assert.match(workbench, /<footer><span><UsersRound/u);
  assert.doesNotMatch(workbench, /这条事件暂未提供作者摘要。/u);
  assert.match(graphStyles, /min-block-size: 6rem;/u);
  assert.match(graphStyles, /max-block-size: 8\.25rem;/u);
  assert.match(smoke, /1440 story spine must show at least four complete Events/u);
});

test("technical receipts stay author-invoked and close on Run, path, stage, or execution changes", () => {
  assert.match(prediction, /const \[technicalOpen, setTechnicalOpen\] = useState\(false\)/u);
  assert.match(prediction, /\[pathId, run\?\.runId, viewState\]/u);
  assert.match(prediction, /open=\{technicalOpen\}/u);
  assert.match(prediction, /const openExecution = \(\) => \{\s*setTechnicalOpen\(false\)/u);
  assert.match(tianyiStyles, /font-family: var\(--font-mono/u);
});

test("Founder readability floors are exercised in the browser contract", () => {
  assert.doesNotMatch(graphStyles, /\.6(?:1|3|4)rem/u);
  assert.doesNotMatch(tianyiStyles, /\.6(?:1|3|4)rem/u);
  assert.match(smoke, /bodyFont >= 14 && spineDensity\.metaFont >= 12/u);
  assert.match(smoke, /titleFont >= 13 && overviewGeometry\.metaFont >= 12/u);
  assert.match(smoke, /Every candidate card must render at least 180px wide/u);
});
