import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  clampTianyiPanelWidth,
  normalizeControlCenterPreferences
} from "../../apps/story-studio/src/lib/controlCenterPreferences.ts";
import {
  SIDEBAR_COMPACT_WIDTH_PX,
  SIDEBAR_ICON_WIDTH_PX,
  SIDEBAR_MAX_WIDTH_PX,
  SIDEBAR_MIN_WIDTH_PX,
  SIDEBAR_STANDARD_WIDTH_PX,
  clampSidebarWidth,
  resolveSidebarWidthPx,
  sidebarPreferenceFromPixels,
  snapSidebarWidth
} from "../../apps/story-studio/src/lib/sidebarLayout.ts";

test("sidebar widths clamp and snap to the author-shell contract", () => {
  assert.deepEqual({
    icon: SIDEBAR_ICON_WIDTH_PX,
    compact: SIDEBAR_COMPACT_WIDTH_PX,
    standard: SIDEBAR_STANDARD_WIDTH_PX,
    min: SIDEBAR_MIN_WIDTH_PX,
    max: SIDEBAR_MAX_WIDTH_PX
  }, { icon: 56, compact: 196, standard: 248, min: 196, max: 320 });

  assert.equal(clampSidebarWidth(195), 196);
  assert.equal(clampSidebarWidth(321), 320);
  assert.equal(clampSidebarWidth(Number.NaN), 248);
  assert.equal(snapSidebarWidth(205), 196);
  assert.equal(snapSidebarWidth(240), 248);
  assert.equal(snapSidebarWidth(255), 248);
  assert.equal(snapSidebarWidth(210), 210);
  assert.equal(resolveSidebarWidthPx("compact", 300), 196);
  assert.equal(resolveSidebarWidthPx("standard", 300), 248);
  assert.equal(resolveSidebarWidthPx("custom", 276), 276);
  assert.deepEqual(sidebarPreferenceFromPixels(205), { sidebarWidth: "compact", sidebarCustomWidthPx: 196 });
  assert.deepEqual(sidebarPreferenceFromPixels(240), { sidebarWidth: "standard", sidebarCustomWidthPx: 248 });
  assert.deepEqual(sidebarPreferenceFromPixels(276), { sidebarWidth: "custom", sidebarCustomWidthPx: 276 });
  assert.deepEqual(sidebarPreferenceFromPixels(500), { sidebarWidth: "custom", sidebarCustomWidthPx: 320 });
});

test("v3 appearance migration preserves old sidebar intent and clamps panel widths", () => {
  const legacyWide = normalizeControlCenterPreferences({
    version: 2,
    appearance: { sidebarWidth: "wide", sidebarCollapsed: false, tianyiPanelWidthPx: 900 }
  });
  assert.equal(legacyWide.version, 3);
  assert.equal(legacyWide.appearance.sidebarWidth, "custom");
  assert.equal(legacyWide.appearance.sidebarCustomWidthPx, 320);
  assert.equal(legacyWide.appearance.tianyiPanelWidthPx, 460);

  const legacyComfortable = normalizeControlCenterPreferences({
    version: 1,
    appearance: { sidebarDensity: "comfortable", sidebarCollapsed: true, tianyiPanelWidthPx: 100 }
  });
  assert.equal(legacyComfortable.appearance.sidebarWidth, "custom");
  assert.equal(legacyComfortable.appearance.sidebarCustomWidthPx, 320);
  assert.equal(legacyComfortable.appearance.sidebarCollapsed, true);
  assert.equal(legacyComfortable.appearance.tianyiPanelWidthPx, 360);

  const custom = normalizeControlCenterPreferences({
    version: 3,
    appearance: { sidebarWidth: "custom", sidebarCustomWidthPx: 277.6, tianyiPanelWidthPx: "402" }
  });
  assert.equal(custom.appearance.sidebarCustomWidthPx, 278);
  assert.equal(custom.appearance.tianyiPanelWidthPx, 402);
  assert.equal(clampTianyiPanelWidth(undefined), 380);
});

test("both author sidebars expose one shared accessible resize control", () => {
  const handle = source("apps/story-studio/src/components/SidebarResizeHandle.tsx");
  const library = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const writing = source("apps/story-studio/src/components/WritingNavigator.tsx");

  assert.match(handle, /role="separator"/);
  assert.match(handle, /aria-orientation="vertical"/);
  assert.match(handle, /aria-valuemin=\{SIDEBAR_MIN_WIDTH_PX\}/);
  assert.match(handle, /setPointerCapture/);
  assert.match(handle, /onPointerCancel=\{handlePointerCancel\}/);
  assert.match(handle, /event\.key === "ArrowLeft"/);
  assert.match(handle, /event\.key === "ArrowRight"/);
  assert.match(handle, /event\.key === "Home"/);
  assert.match(handle, /event\.key === "End"/);
  assert.match(library, /!props\.collapsed && <SidebarResizeHandle/);
  assert.match(writing, /!props\.collapsed && <SidebarResizeHandle/);
});

test("empty world navigation keeps fixed categories while icon mode keeps an accessible create action", () => {
  const library = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const newDocument = source("apps/story-studio/src/components/NewWorldDocumentMenu.tsx");

  assert.match(library, /data-testid="world-library-categories"/);
  assert.match(library, /aria-label="世界资料分类"/);
  assert.doesNotMatch(library, /empty-world-data-group|library-empty-categories/);
  assert.match(library, /const showResults = Boolean\(query \|\| props\.typeFilter \|\| props\.objects\.length\)/);
  assert.match(library, /\{showResults && <section className="library-results"/);
  assert.match(library, /<NewWorldDocumentMenu compact=\{props\.collapsed\}/);
  assert.match(newDocument, /aria-label=\{props\.compact \? "新建资料" : undefined\}/);
  assert.match(newDocument, /props\.compact \? <Plus \/> : <FilePlus2 \/>/);
});

test("full Tianyi keeps the one global sidebar while its rail remains contextual", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const appShell = source("apps/story-studio/src/product-shell/AppShell.tsx");
  const styles = source("apps/story-studio/src/styles/app.css");
  const library = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const writing = source("apps/story-studio/src/components/WritingNavigator.tsx");
  const workspace = source("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx");

  assert.match(app, /<AppShell/);
  assert.match(appShell, /data-outer-sidebar="visible"/);
  assert.doesNotMatch(styles, /data-outer-sidebar="hidden"/);
  assert.match(app, /<ProductShellNavigation[\s\S]*?story-studio-workspace-stage/);
  assert.doesNotMatch(library, /ProductShellNavigation/);
  assert.doesNotMatch(writing, /ProductShellNavigation/);
  assert.match(workspace, /tianyi-conversation-layout/);
  assert.match(workspace, /hasConversationHistory/);
  assert.match(workspace, /<TianyiConversationRail/);
  assert.doesNotMatch(workspace, /ProductShellNavigation/);
});

test("mobile drawer has one overlay hierarchy and takes priority over the temporary Creation bottom rail", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const library = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const writing = source("apps/story-studio/src/components/WritingNavigator.tsx");
  const baseStyles = source("apps/story-studio/src/styles/app.css");
  const presentationStyles = source("apps/story-studio/src/styles/presentation-r1.css");
  const shellStyles = source("apps/story-studio/src/styles/product-shell-r0.css");
  const tianyiStyles = source("apps/story-studio/src/styles/tianyi.css");

  assert.match(app, /aria-label="点击遮罩关闭侧栏"/);
  assert.match(app, /function closeMobileDrawer/);
  assert.match(library, /role=\{props\.mobileOpen \? "dialog" : undefined\}/);
  assert.match(writing, /role=\{props\.mobileOpen \? "dialog" : undefined\}/);
  assert.match(baseStyles, /sidebar-mobile-backdrop \{ position: fixed; z-index: 130/);
  assert.match(presentationStyles, /z-index: 140/);
  assert.match(shellStyles, /\.sidebar-mobile-backdrop \{ z-index: 230; \}/);
  assert.match(shellStyles, /\.story-studio-workspace-stage > \.module-sidebar-host \{[\s\S]*?z-index: 231/);
  assert.match(shellStyles, /\.story-studio-shell\[data-product-mode="writing"\] > \.product-shell-navigation \{ z-index: 2147483647; \}/);
  assert.match(shellStyles, /\.story-studio-shell\[data-product-mode="writing"\]:has\(.sidebar-mobile-backdrop, \.creation-media-form-backdrop\) > \.product-shell-navigation \{ z-index: 120; \}/);
  assert.match(shellStyles, /width: min\(86vw, 320px\)/);
  assert.match(shellStyles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(shellStyles, /\.page-context-dock \{ position: fixed; z-index: 45;[^}]*bottom: var\(--r1-mobile-nav-height\)/);
  assert.match(shellStyles, /\.nuwa-unit-context\[data-mobile-open="true"\] \{ transform: translateX\(0\)/);
  assert.match(shellStyles, /\.story-studio-shell > \.product-shell-navigation/);
  assert.match(shellStyles, /width: var\(--r1-rail-width\)/);
  assert.match(shellStyles, /grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(shellStyles, /\.product-shell-navigation > \.product-shell-more \{ position: relative; display: block/);
  assert.match(shellStyles, /\.story-studio-shell \.tianyi-quick-launcher/);
  assert.match(shellStyles, /\.story-studio-shell:is\(\[data-product-mode="nuwa"\], \[data-product-mode="event-line"\]\) > \.story-studio-workspace-stage > \.tianyi-quick-backdrop\.is-pinned/);
  assert.doesNotMatch(baseStyles, /story-studio-shell\[data-product-mode="nuwa"\] > \.product-shell-navigation/);
  assert.doesNotMatch(presentationStyles, /story-studio-shell\[data-tianyi-quick-placement="pinned"\]\s*\{\s*grid-template-columns/);
  assert.doesNotMatch(tianyiStyles, /story-studio-shell\[data-product-mode="tianyi"\] > \.product-shell-navigation/);
});

test("mobile Context Rail closes competing transient surfaces and exposes stable state hooks", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const navigation = source("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx");
  const eventLine = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
  const observation = source("apps/story-studio/src/components/story-observation/StoryObservationCanvas.tsx");
  const context = source("apps/story-studio/src/product-shell/ModuleContextSidebar.tsx");

  assert.match(app, /function closeMobileTransientOverlays/);
  assert.match(app, /story-studio-close-mobile-context/);
  assert.match(app, /workspaceDockCoordinator\.closePageInspector\("event-line"\)/);
  assert.match(navigation, /onBeforeMoreOpen\?/);
  assert.match(navigation, /onClick=\{\(\) => props\.onBeforeMoreOpen/);
  assert.match(eventLine, /story-studio-close-mobile-overlays/);
  assert.match(eventLine, /story-studio-close-mobile-context/);
  assert.match(observation, /story-studio-close-mobile-overlays/);
  assert.match(observation, /story-studio-close-mobile-context/);
  assert.match(context, /data-mobile-open=\{props\.mobileOpen \? "true" : "false"\}/);
  assert.match(context, /data-state=\{props\.mobileOpen \? "open" : "closed"\}/);
});

function source(relativePath: string): string {
  return readFileSync(relativePath, "utf8");
}
