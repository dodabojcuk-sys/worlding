import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("R4 supersedes R3 dismissal with temporary suppression while preserving author intent", () => {
  const shell = source("apps/story-studio/src/product-shell/TianyanR0Shell.tsx");
  const workbench = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
  assert.match(shell, /focusLayout !== "wide" && rightWorkSurface\.mode === "TIANYI"/u);
  assert.match(shell, /directoryPreferredOpen/u);
  assert.match(shell, /directoryPresented/u);
  assert.doesNotMatch(shell, /rightWorkSurface\.mode !== "NONE" && focusLayout !== "wide"/u);
  assert.doesNotMatch(workbench, /shouldCloseDirectoryForPageInspector/u);
  const eventInspectorActions = workbench.match(/const openEvent[\s\S]*?const returnToPreviousCausalEvent/u)?.[0] ?? "";
  assert.doesNotMatch(eventInspectorActions, /story-studio-close-project-directory/u, "1195px 打开事件检查器不能靠关闭目录腾出画布");
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
