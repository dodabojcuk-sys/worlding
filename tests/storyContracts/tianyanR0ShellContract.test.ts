import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STORY_STUDIO_DERIVED_DESTINATION_REGISTRY,
  STORY_STUDIO_SHELL_NAVIGATION_REGISTRY,
  STORY_STUDIO_WORKSPACE_REGISTRY,
  resolveStoryStudioShellLocation
} from "../../src/storyContracts/storyStudioWorkspaceRegistry.ts";
import { TIAN_YAN_R0_DEFAULT_LAYOUT } from "../../src/storyContracts/tianyanR0ShellContract.ts";
import { createInitialShellLayout, reduceShellLayout } from "../../apps/story-studio/src/product-shell/layoutProtocol.ts";
import { enUS, zhCN } from "../../apps/story-studio/src/product-shell/i18n/translations.ts";

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

test("panel protocol keeps directory, Global Tianyi, and page inspector independent", () => {
  assert.deepEqual(Object.keys(TIAN_YAN_R0_DEFAULT_LAYOUT), ["project-directory", "global-tianyi", "page-inspector"]);
  assert.equal(TIAN_YAN_R0_DEFAULT_LAYOUT["project-directory"].visible, true);
  assert.equal(TIAN_YAN_R0_DEFAULT_LAYOUT["global-tianyi"].visible, false);
  assert.equal(TIAN_YAN_R0_DEFAULT_LAYOUT["page-inspector"].visible, false);

  const lab = createInitialShellLayout(true);
  assert.equal(lab["global-tianyi"].visible, true);
  assert.equal(lab["page-inspector"].visible, true);
  const next = reduceShellLayout(lab, { type: "hide", panel: "global-tianyi" });
  assert.equal(next["global-tianyi"].visible, false);
  assert.equal(next["page-inspector"].visible, true);
});

test("active R0 shell is split by responsibility and imports no business transport or Provider", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const shell = readFileSync("apps/story-studio/src/product-shell/TianyanR0Shell.tsx", "utf8");
  const navigation = readFileSync("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx", "utf8");
  const topbar = readFileSync("apps/story-studio/src/product-shell/topbar/GlobalStatusBar.tsx", "utf8");
  const workspace = readFileSync("apps/story-studio/src/product-shell/workspace/ShellWorkspaceOutlet.tsx", "utf8");
  const panels = readFileSync("apps/story-studio/src/product-shell/panels/ShellPanelSlots.tsx", "utf8");
  const activeSources = [app, shell, navigation, topbar, workspace, panels].join("\n");

  assert.match(app, /I18nProvider/);
  assert.match(shell, /ProductShellNavigation/);
  assert.match(shell, /GlobalStatusBar/);
  assert.match(shell, /ShellWorkspaceOutlet/);
  assert.match(shell, /RightPanelDock/);
  assert.doesNotMatch(activeSources, /localTransport|providerGateway|piAgentAdapter|storyStudioAuthorControl|storyStudioWorkspaceOperations/);
  assert.doesNotMatch([shell, navigation, topbar, workspace, panels].join("\n"), /[\u3400-\u9fff]/u);
});

test("component stylesheet consumes semantic tokens and defines no component-local colors", () => {
  const styles = readFileSync("apps/story-studio/src/styles/tianyan-r0-shell.css", "utf8");
  assert.doesNotMatch(styles, /#[\da-f]{3,8}\b|rgba?\(/iu);
  assert.match(styles, /var\(--color-workspace-background\)/);
  assert.match(styles, /focus-visible/);
  assert.match(styles, /prefers-reduced-motion/);
});
