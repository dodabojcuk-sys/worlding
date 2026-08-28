import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createCapabilityMenuRegistry } from "../../apps/story-studio/src/components/tianyi/capability-launcher/capabilityMenuRegistry.ts";
import { PAGE_TOOL_REGISTRY } from "../../apps/story-studio/src/components/page-tools/pageToolRegistry.ts";
import { clampDockPanelSize, createInitialDockLayout, toggleDockPanel } from "../../apps/story-studio/src/product-shell/right-dock/useDockLayoutState.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("project directory uses Classified as its main section and Pending review as a small inbox", () => {
  const panel = source("apps/story-studio/src/product-shell/project-directory/ProjectDirectoryPanel.tsx");
  const pending = source("apps/story-studio/src/product-shell/project-directory/PendingReviewEntry.tsx");
  const contract = source("src/storyContracts/projectDirectoryContract.ts");
  assert.match(panel, /directory\.classified/);
  assert.match(panel, /PendingReviewEntry/);
  assert.doesNotMatch(panel, /全部.*资料.*创作.*参考/su);
  assert.match(pending, /pending-review-entry/);
  assert.match(panel, /data-story-fact-owner="false"/);
  assert.doesNotMatch(contract, /writeCanon|createEvent|setWorldState|storyBody|absolutePath/u);
});

test("page-tool rail order is independent from the user-owned multi-panel stack", () => {
  assert.equal(PAGE_TOOL_REGISTRY[0]?.id, "engineering-log");
  const initial = createInitialDockLayout();
  assert.deepEqual(initial.openPanelIds, []);
  const expertFirst = toggleDockPanel(initial, "expert-analysis");
  const logSecond = toggleDockPanel(expertFirst, "engineering-log");
  assert.deepEqual(logSecond.openPanelIds, ["expert-analysis", "engineering-log"]);
  assert.deepEqual(toggleDockPanel(logSecond, "expert-analysis").openPanelIds, ["engineering-log"]);
  assert.equal(clampDockPanelSize(1), 160);
  assert.equal(clampDockPanelSize(900), 640);
  const stack = source("apps/story-studio/src/product-shell/right-dock/DockPanelStack.tsx");
  const resize = source("apps/story-studio/src/product-shell/right-dock/DockResizeHandle.tsx");
  const log = source("apps/story-studio/src/components/page-tools/EngineeringLogPanel.tsx");
  const expert = source("apps/story-studio/src/components/page-tools/ExpertAnalysisPanel.tsx");
  assert.match(stack, /DockResizeHandle/);
  assert.match(resize, /role="separator"/);
  assert.match(resize, /ArrowUp/);
  assert.match(resize, /ArrowDown/);
  assert.doesNotMatch(log, /今天|昨天/u);
  assert.match(log, /data-receipt-projection="local-demo"/);
  assert.match(expert, /onAdoptSuggestion/);
  assert.match(expert, /onIgnoreSuggestion/);
  assert.doesNotMatch(expert, /writeCanon|createEvent|storyStudioWorkspaceOperations/u);
});

test("Tianyi capability launcher is registry-driven and runtime controls stay outside the plus menu", () => {
  const registry = createCapabilityMenuRegistry({ workspace: "event-line" });
  assert.deepEqual(registry.map((item) => item.id), ["reason-forward", "forward-planning", "attach-library", "create-content", "add-reference", "skills", "workflows"]);
  assert.deepEqual(new Set(registry.map((item) => item.source)), new Set(["built-in", "skill", "workflow"]));
  assert.equal(registry.find((item) => item.id === "skills")?.availability, "management-only");
  assert.equal(registry.find((item) => item.id === "workflows")?.availability, "management-only");
  const launcher = source("apps/story-studio/src/components/tianyi/capability-launcher/CapabilityLauncher.tsx");
  const composer = source("apps/story-studio/src/components/tianyi/composer/TianyiSidebarComposer.tsx");
  const model = source("apps/story-studio/src/components/tianyi/composer/ModelSelector.tsx");
  const context = source("apps/story-studio/src/components/tianyi/composer/ContextControl.tsx");
  assert.match(launcher, /createCapabilityMenuRegistry/);
  assert.match(launcher, /ArrowDown/);
  assert.match(launcher, /ArrowUp/);
  assert.match(launcher, /Escape/);
  assert.match(composer, /PermissionControl/);
  assert.match(composer, /ContextControl/);
  assert.match(composer, /ModelSelector/);
  assert.doesNotMatch(launcher, /PermissionControl|ContextControl|ModelSelector/);
  assert.match(model, /options=|props\.options/);
  assert.doesNotMatch(model, /OpenAI|Claude|Gemini|GPT-/u);
  assert.match(context, /usage \?\? t\("common\.pendingConnection"\)/);
  assert.doesNotMatch(context, /\d+%/);
  assert.match(composer, /data-provider-calls="0"/);
});

test("responsive shell has no intermediate truncated space-rail state", () => {
  const base = source("apps/story-studio/src/styles/tianyan-r0-shell.css");
  const dock = source("apps/story-studio/src/styles/right-dock.css");
  const tianyi = source("apps/story-studio/src/styles/tianyi-sidebar.css");
  assert.doesNotMatch(base.match(/\.shell-space-label\s*\{([\s\S]*?)\}/)?.[1] ?? "", /text-overflow\s*:\s*ellipsis/);
  assert.match(base, /--rail-current: var\(--space-rail-width\)/);
  assert.match(base, /data-rail-collapsed="true"/);
  assert.match(dock, /@media \(max-width: 50rem\)/);
  assert.match(tianyi, /@media \(max-width: 50rem\)/);
});
