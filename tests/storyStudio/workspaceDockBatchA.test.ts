import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Batch A routes page inspectors and quick Tianyi through one exclusive dock coordinator", () => {
  const coordinator = source("apps/story-studio/src/product-shell/WorkspaceDockCoordinator.ts");
  const app = source("apps/story-studio/src/App.tsx");
  const pageDock = source("apps/story-studio/src/components/PageContextDock.tsx");

  for (const state of ["closed", "page-inspector", "quick-tianyi"]) assert.match(coordinator, new RegExp(`kind: "${state}"`));
  assert.match(coordinator, /openPageInspector/);
  assert.match(coordinator, /openQuickTianyi/);
  assert.match(coordinator, /useSyncExternalStore/);
  assert.match(app, /workspaceDockCoordinator\.openQuickTianyi\(\)/);
  assert.match(app, /workspaceDockCoordinator\.closeQuickTianyi\(\)/);
  assert.match(pageDock, /workspaceDockCoordinator\.openPageInspector\(props\.pageId\)/);
  assert.doesNotMatch(app, /story-studio:global-tianyi-open/);
  assert.doesNotMatch(app, /story-studio:page-context-dock-open/);
});

test("Batch A keeps the event workspace inside one measured content rectangle and preserves anchors", () => {
  const canvas = source("apps/story-studio/src/components/story-observation/StoryObservationCanvas.tsx");
  const spine = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
  const css = source("apps/story-studio/src/styles/product-shell-r0.css");
  const observationCss = source("apps/story-studio/src/styles/story-observation-r0.css");

  assert.match(canvas, /ResizeObserver\(measure\)/);
  assert.match(canvas, /captureViewportAnchor/);
  assert.match(canvas, /pendingViewportAnchorRef/);
  assert.match(canvas, /instance\.setViewport/);
  assert.match(spine, /pendingSpineAnchorRef/);
  assert.match(spine, /requestDockState/);
  assert.match(spine, /spine\.scrollTop = anchor/);
  assert.match(css, /\.event-observation-workspace \{[^}]*height: 100%;/s);
  assert.match(css, /\.event-observation-renderer \.event-line-spine-main \{ width: 100%; height: 100%;/);
  assert.match(css, /Batch A-R1:[\s\S]*?\.event-observation-layout,[\s\S]*?height: 100%;/);
  assert.match(css, /--tianyi-panel-width: clamp\(280px, 28vw, 320px\)/);
  assert.match(css, /event-observation-renderer > \.story-observation-workbench \{\s*grid-template-rows: minmax\(0, 1fr\);/);
  assert.match(observationCss, /\.story-observation-workbench \{[^}]*height: 100%;/s);
  assert.doesNotMatch(observationCss.slice(0, observationCss.indexOf("@media (max-width: 800px)")), /height: 100dvh/);
});

test("Batch A puts project switching in the header and keeps the top-level order stable", () => {
  const header = source("apps/story-studio/src/product-shell/GlobalHeader.tsx");
  const navigation = source("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx");
  const registry = source("src/storyContracts/storyStudioWorkspaceRegistry.ts");

  assert.match(header, /data-testid="global-workspace-title"/);
  assert.match(header, /data-testid="global-project-title-menu"/);
  assert.match(header, /onOpenSettings/);
  assert.doesNotMatch(navigation, /global-project-switcher/);
  assert.match(navigation, /TOP_LEVEL_DESTINATION_REGISTRY/);
  for (const id of ["world", "tianyi", "event-line", "multiverse", "nuwa", "library", "writing", "data"]) assert.match(registry, new RegExp(`id: "${id}"`));
  assert.match(registry, /id: "multiverse",[\s\S]{0,120}order: 4/);
  assert.match(registry, /id: "nuwa",[\s\S]{0,120}order: 5/);
});
