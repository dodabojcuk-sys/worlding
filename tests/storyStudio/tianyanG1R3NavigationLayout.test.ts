import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("R3 only dismisses the directory when its own EventLine drawer would mask the canvas", () => {
  const shell = source("apps/story-studio/src/product-shell/TianyanR0Shell.tsx");
  const workbench = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
  assert.match(shell, /rightWorkSurface\.mode === "TIANYI" && focusLayout !== "wide"/u);
  assert.match(shell, /rightWorkSurface\.mode === "TIANYI"\);/u);
  assert.doesNotMatch(shell, /rightWorkSurface\.mode !== "NONE" && focusLayout !== "wide"/u);
  assert.match(workbench, /shouldCloseDirectoryForPageInspector/u);
  assert.match(workbench, /window\.matchMedia\("\(max-width: 76rem\)"\)/u);
  assert.doesNotMatch(workbench, /const openEvent = \(eventId: string\) => \{\s*if \(window\.matchMedia\("\(max-width: 80rem\)"\)/u);
});

test("R3 stabilizes Tianyi's shared task frame at medium desktop widths", () => {
  const styles = source("apps/story-studio/src/styles/tianyi-workspace.css");
  assert.match(styles, /\.tianyi-task-header \{ min-height: 84px/u);
  assert.match(styles, /\.tianyi-workspace-header \{ grid-template-columns: 92px minmax\(0, 1fr\) auto/u);
  assert.doesNotMatch(styles, /data-active-lane="review"\] \.tianyi-workspace-header/u);
});

test("R3 keeps the narrative minimap out of the reading focus surface", () => {
  const canvas = source("apps/story-studio/src/components/event-observation/EventGraphCanvas.tsx");
  const styles = source("apps/story-studio/src/styles/event-line-projection.css");
  assert.match(canvas, /miniMapOpen && semanticLevel === "overview"/u);
  assert.match(canvas, /打开缩略导航并返回全书概览/u);
  assert.match(styles, /formal-narrative-minimap/u);
});
