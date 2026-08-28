import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STORY_STUDIO_DERIVED_DESTINATION_REGISTRY,
  STORY_STUDIO_SHELL_NAVIGATION_REGISTRY,
  STORY_STUDIO_WORKSPACE_REGISTRY,
  resolveStoryStudioShellLocation
} from "../../src/storyContracts/storyStudioWorkspaceRegistry.ts";
import { TIAN_YAN_R0_2_WORKBENCH_ORDER, TIAN_YAN_R0_COMMAND_PANEL_SCOPE, TIAN_YAN_R0_DEFAULT_LAYOUT } from "../../src/storyContracts/tianyanR0ShellContract.ts";
import { createInitialDockLayout, resizeDockPanel, toggleDockPanel } from "../../apps/story-studio/src/product-shell/right-dock/useDockLayoutState.ts";
import { enUS, zhCN } from "../../apps/story-studio/src/product-shell/i18n/translations.ts";
import {
  nextShellRailPreference,
  resolveShellRailCollapsed,
  SHELL_RAIL_AUTO_COLLAPSE_QUERY
} from "../../apps/story-studio/src/product-shell/navigation/responsiveRailState.ts";

test("R0 has one ordered workspace registry and an independent Collections destination", () => {
  assert.deepEqual(STORY_STUDIO_WORKSPACE_REGISTRY.map((space) => space.displayName), ["世界", "天意", "事件线", "多元", "女娲", "资料", "创作", "数据"]);
  assert.deepEqual(STORY_STUDIO_DERIVED_DESTINATION_REGISTRY.map((destination) => destination.displayName), ["合册"]);
  assert.equal(STORY_STUDIO_SHELL_NAVIGATION_REGISTRY.filter((item) => item.kind === "workspace").length, 8);
  assert.equal(STORY_STUDIO_SHELL_NAVIGATION_REGISTRY.find((item) => item.id === "collections")?.kind, "derived");
  assert.equal(resolveStoryStudioShellLocation("/collections"), "collections");
  assert.equal(resolveStoryStudioShellLocation("/creation"), "writing");
  assert.equal(new Set(STORY_STUDIO_SHELL_NAVIGATION_REGISTRY.map((item) => item.route)).size, STORY_STUDIO_SHELL_NAVIGATION_REGISTRY.length);
});

test("zh-CN and en-US contain exactly the same shell translation keys", () => {
  assert.deepEqual(Object.keys(enUS).sort(), Object.keys(zhCN).sort());
  for (const destination of STORY_STUDIO_SHELL_NAVIGATION_REGISTRY) {
    assert.equal(typeof zhCN[destination.labelKey], "string");
    assert.equal(typeof enUS[destination.labelKey], "string");
    assert.equal(typeof zhCN[destination.summaryKey], "string");
    assert.equal(typeof enUS[destination.summaryKey], "string");
  }
});

test("R0.2 workbench keeps global panels separate from the composable page-tool Dock", () => {
  assert.deepEqual(Object.keys(TIAN_YAN_R0_DEFAULT_LAYOUT), ["project-directory", "global-tianyi"]);
  assert.equal(TIAN_YAN_R0_DEFAULT_LAYOUT["project-directory"].visible, true);
  assert.equal(TIAN_YAN_R0_DEFAULT_LAYOUT["global-tianyi"].visible, true);
  assert.deepEqual(TIAN_YAN_R0_2_WORKBENCH_ORDER, ["global-space-rail", "project-directory", "central-workspace", "page-tool-stack", "page-tool-rail", "global-tianyi"]);

  const initial = createInitialDockLayout();
  assert.deepEqual(initial.openPanelIds, []);
  assert.equal(initial.activeToolId, null);
  assert.equal(initial.isTianyiOpen, true);

  const expertFirst = toggleDockPanel(initial, "expert-analysis");
  const logSecond = toggleDockPanel(expertFirst, "engineering-log");
  assert.deepEqual(logSecond.openPanelIds, ["expert-analysis", "engineering-log"]);
  assert.deepEqual(toggleDockPanel(logSecond, "expert-analysis").openPanelIds, ["engineering-log"]);
  assert.equal(resizeDockPanel(logSecond, "expert-analysis", 20).panelSizes["expert-analysis"], 160);
  assert.equal(resizeDockPanel(logSecond, "expert-analysis", 900).panelSizes["expert-analysis"], 640);

  const dockState = readFileSync("apps/story-studio/src/product-shell/right-dock/useDockLayoutState.ts", "utf8");
  assert.doesNotMatch(dockState, /panelOrder|expert-first|pinned|priority/ui);
});

test("R0.1 command panel is a global shell entry, not a business search surface", () => {
  assert.deepEqual(TIAN_YAN_R0_COMMAND_PANEL_SCOPE, {
    destinations: "registry-only",
    rail: "visibility-only",
    panels: "visibility-only",
    locale: "presentation-only",
    theme: "presentation-only",
    businessSearch: false
  });

  const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
  const navigation = readFileSync("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx", "utf8");
  const topbar = readFileSync("apps/story-studio/src/product-shell/topbar/GlobalStatusBar.tsx", "utf8");
  const commandPalette = readFileSync("apps/story-studio/src/product-shell/commands/ShellCommandPalette.tsx", "utf8");

  assert.match(shell, /Ctrl|ctrlKey/);
  assert.match(shell, /ShellCommandPalette/);
  assert.match(navigation, /BrandMarkSlot/);
  assert.match(navigation, /shell-command-trigger/);
  assert.match(commandPalette, /STORY_STUDIO_SHELL_NAVIGATION_REGISTRY/);
  assert.doesNotMatch(commandPalette, /localTransport|providerGateway|storyStudioAuthorControl|storyStudioWorkspaceOperations/);
  assert.doesNotMatch(topbar, /shell-global-search|type="search"/);
});

test("account and settings remain independent rail utilities", () => {
  const navigation = readFileSync("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx", "utf8");
  const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
  const styles = readFileSync("apps/story-studio/src/styles/tianyan-r0-shell.css", "utf8");

  assert.equal(STORY_STUDIO_SHELL_NAVIGATION_REGISTRY.some((item) => item.id === "account" || item.id === "settings"), false);
  assert.equal(zhCN["nav.account"], "个人中心");
  assert.equal(zhCN["nav.settings"], "设置");
  assert.equal(enUS["nav.account"], "Personal center");
  assert.equal(enUS["nav.settings"], "Settings");
  assert.match(navigation, /shell-rail-utility/);
  assert.match(navigation, /data-shell-utility="account"/);
  assert.match(navigation, /data-shell-utility="settings"/);
  assert.match(navigation, /onAccount\(\): void/);
  assert.match(navigation, /onSettings\(\): void/);
  assert.match(shell, /onAccount=\{\(\) => undefined\}/);
  assert.match(shell, /onSettings=\{\(\) => undefined\}/);
  assert.match(styles, /\.shell-rail-navigation[\s\S]*overflow-y: auto/);
  assert.match(styles, /\.shell-rail-utility[\s\S]*border-block-start/);
  assert.doesNotMatch(navigation, /shell-collapse-control/);
});

test("responsive rail resolves to complete expanded labels or a 56px icon rail", () => {
  const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
  const styles = readFileSync("apps/story-studio/src/styles/tianyan-r0-shell.css", "utf8");
  const labelRule = styles.match(/\.shell-space-label\s*\{([\s\S]*?)\}/)?.[1] ?? "";

  assert.equal(SHELL_RAIL_AUTO_COLLAPSE_QUERY, "(max-width: 75rem)");
  assert.equal(resolveShellRailCollapsed("auto", true), true);
  assert.equal(resolveShellRailCollapsed("auto", false), false);
  assert.equal(resolveShellRailCollapsed("expanded", true), false);
  assert.equal(resolveShellRailCollapsed("collapsed", false), true);
  assert.equal(nextShellRailPreference(true), "expanded");
  assert.equal(nextShellRailPreference(false), "collapsed");
  assert.match(shell, /data-rail-collapsed=\{railCollapsed\}/);
  assert.match(shell, /onToggleCollapsed=\{toggleRail\}/);
  assert.doesNotMatch(labelRule, /text-overflow\s*:\s*ellipsis/);
  assert.doesNotMatch(styles, /@media \(max-width: 75rem\)[\s\S]*?--space-rail-width\s*:\s*7\.75rem/);
  assert.doesNotMatch(styles, /--space-rail-collapsed-width\s*:\s*3\.75rem/);
});

test("active R0 shell is split by responsibility and imports no business transport or Provider", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
  const navigation = readFileSync("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx", "utf8");
  const topbar = readFileSync("apps/story-studio/src/product-shell/topbar/GlobalStatusBar.tsx", "utf8");
  const workspace = readFileSync("apps/story-studio/src/product-shell/workspace/ShellWorkspaceOutlet.tsx", "utf8");
  const eventLine = readFileSync("apps/story-studio/src/components/event-observation/R0EventLineProjection.tsx", "utf8");
  const directory = readFileSync("apps/story-studio/src/product-shell/project-directory/ProjectDirectoryPanel.tsx", "utf8");
  const dock = readFileSync("apps/story-studio/src/product-shell/right-dock/RightDock.tsx", "utf8");
  const tianyi = readFileSync("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx", "utf8");
  const activeSources = [app, shell, navigation, topbar, workspace, eventLine, directory, dock, tianyi].join("\n");

  assert.match(app, /I18nProvider/);
  assert.match(shell, /ProductShellNavigation/);
  assert.match(shell, /GlobalStatusBar/);
  assert.match(shell, /ShellWorkspaceOutlet/);
  assert.match(shell, /ProjectDirectoryPanel/);
  assert.match(shell, /RightDock/);
  assert.match(shell, /TianyiSidebar/);
  assert.match(workspace, /R0EventLineProjection/);
  assert.match(eventLine, /EventLineWorkbench/);
  assert.match(eventLine, /createEventLineFixture/);
  assert.doesNotMatch(activeSources, /localTransport|providerGateway|piAgentAdapter|storyStudioAuthorControl|storyStudioWorkspaceOperations/);
  assert.doesNotMatch([shell, navigation, topbar, workspace, eventLine, directory, dock, tianyi].join("\n"), /[\u3400-\u9fff]/u);
});

test("component stylesheets consume semantic tokens and define no component-local colors", () => {
  const styles = ["tianyan-r0-shell.css", "project-directory.css", "right-dock.css", "tianyi-sidebar.css", "event-line-projection.css"].map((name) => readFileSync(`apps/story-studio/src/styles/${name}`, "utf8")).join("\n");
  const tokens = readFileSync("apps/story-studio/src/product-shell/theme/tokens.css", "utf8");
  assert.doesNotMatch(styles, /#[\da-f]{3,8}\b|rgba?\(/iu);
  assert.match(styles, /var\(--color-workspace-background\)/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(styles, /shell-command-palette/);
  assert.match(tokens, /--space-rail-collapsed-width: 3.5rem/);
  assert.match(tokens, /--topbar-height: 3.125rem/);
});
