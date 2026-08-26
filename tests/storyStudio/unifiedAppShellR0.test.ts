import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Batch A keeps one App-owned destination rail while the shared header owns project switching", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const navigation = source("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx");
  const header = source("apps/story-studio/src/product-shell/GlobalHeader.tsx");
  const profile = source("apps/story-studio/src/product-shell/ProductShellProfilePanel.tsx");

  assert.equal([...app.matchAll(/<ProductShellNavigation\b/g)].length, 1);
  assert.match(navigation, /data-global-product-rail="true"/);
  const productMark = navigation.indexOf("product-shell-mark");
  const destinationList = navigation.indexOf("product-shell-destination-list");
  assert.ok(productMark >= 0 && productMark < destinationList);
  assert.match(navigation, /aria-label="打开天衍 Story Studio 首页"/);
  assert.doesNotMatch(navigation, /global-project-switcher|product-shell-project-popover/);
  assert.match(header, /data-testid="global-workspace-title"/);
  assert.match(header, /aria-label="切换当前作品"/);
  assert.match(header, /role="dialog" aria-label="作品切换器"/);
  assert.match(header, /props\.onSwitchProject\(project\.id\)/);
  assert.match(navigation, /aria-label="打开个人中心"/);
  assert.match(navigation, /aria-label="打开设置"/);
  assert.match(navigation, /data-global-account-action="personal-center"/);
  assert.match(navigation, /data-global-account-action="settings"/);
  assert.doesNotMatch(navigation, /product-shell-author-status/);
  assert.match(profile, /个人中心/);
  assert.match(profile, /独立的“设置”入口/);
  assert.doesNotMatch(profile, /localStorage|fetch\(|repository|provider/i);
});

test("Batch A removes the old rail project popover without constraining global destinations", () => {
  const styles = source("apps/story-studio/src/styles/product-shell-r0.css");

  assert.match(styles, /\.story-studio-shell > \.product-shell-navigation \{[\s\S]*?overflow: visible;[\s\S]*?z-index: 220;/);
  assert.match(styles, /\.product-shell-destination-list \{[\s\S]*?overflow-x: hidden;/);
  assert.match(styles, /global-workspace-title/);
});

test("module sidebars use the shared stage slot instead of repeating global account or project controls", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const library = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const writing = source("apps/story-studio/src/components/WritingNavigator.tsx");
  const contextualToolbar = source("apps/story-studio/src/components/CardWorkbench.tsx");
  const sidebarHost = source("apps/story-studio/src/product-shell/ModuleSidebarHost.tsx");

  assert.match(app, /<ModuleSidebarHost mode=\{productMode\}(?:\s+[^>]*)?>/);
  assert.match(sidebarHost, /data-module-sidebar-host="true"/);
  assert.match(library, /data-workspace-sidebar-slot=\{props\.workspaceLabel\}/);
  assert.match(writing, /data-workspace-sidebar-slot="创作"/);
  assert.doesNotMatch(library, /ProductShellIdentity|WorkspaceAccountControl|onSwitchProject/);
  assert.doesNotMatch(writing, /ProductShellIdentity|WorkspaceAccountControl|onSwitchProject/);
  assert.match(library, /角色/);
  assert.doesNotMatch(library, /资料画布|规则管理/);
  assert.match(contextualToolbar, />资料画布</);
  assert.match(contextualToolbar, />规则管理</);
  assert.match(writing, /小说/);
  assert.match(writing, /剧本/);
  assert.match(writing, /label: "漫画"/);
  assert.match(writing, /label: "漫剧"/);
  assert.match(writing, /label: "互动剧"/);
  assert.match(writing, /onCreateArtifact/);
});

test("right-dock host keeps page context and Tianyi in separately owned slots", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const pageDock = source("apps/story-studio/src/components/PageContextDock.tsx");
  const tianyi = source("apps/story-studio/src/components/TianyiQuickAssistant.tsx");
  const presentation = source("apps/story-studio/src/components/tianyiShellPresentation.ts");

  assert.match(app, /data-right-dock-host="shared"/);
  assert.match(pageDock, /data-right-dock-slot="page-context"/);
  assert.match(tianyi, /data-right-dock-slot="tianyi"/);
  assert.match(presentation, /pinned Tianyi surface always owns the shell's right dock/);
  assert.match(presentation, /return "right-dock"/);
  assert.doesNotMatch(presentation, /"bottom-drawer"/);
  assert.match(tianyi, /isCanvasWorkspace/);
  assert.match(tianyi, /props\.onPlacement\("pinned"\)/);
  assert.match(tianyi, /data-right-dock-slot="tianyi"/);
});

test("Tianyi page is conversation-first while the global Dock keeps bounded contextual modes", () => {
  const workspace = source("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx");
  const composer = source("apps/story-studio/src/components/tianyi/TianyiComposer.tsx");
  const app = source("apps/story-studio/src/App.tsx");
  const dock = source("apps/story-studio/src/components/TianyiQuickAssistant.tsx");

  assert.match(workspace, /<TianyiConversationThread/);
  assert.match(workspace, /<TianyiComposer/);
  assert.doesNotMatch(workspace, />Agent</);
  assert.doesNotMatch(workspace, /role="tablist" aria-label="天意显示方式"/);
  assert.match(workspace, /告诉天意，你希望故事接下来如何生长/);
  assert.match(composer, /仅记录到当前会话/);
  assert.match(composer, /onCompositionStart/);
  assert.match(composer, /nativeEvent\.isComposing/);
  assert.doesNotMatch(composer, /applyAuthorChangeSet|CanonWriter|fetch\(/);
  assert.doesNotMatch(composer, /mode === "agent"/);
  assert.match(dock, /type TianyiDockMode = "dialogue" \| "work"/);
  assert.doesNotMatch(dock, />创意</);
  assert.match(dock, />对话</);
  assert.match(dock, />工作</);
  assert.match(dock, /presentation="dock"/);
  assert.match(app, /data-tianyi-agent-context=\{tianyiAgentCapability\}/);
  assert.doesNotMatch(workspace, /applyAuthorChangeSet|CanonWriter|fetch\(/);
  assert.match(app, /<GlobalHeader[\s\S]*?onToggleTianyi=\{activateGlobalTianyi\}/);
});

test("the Event Observation host keeps the legacy canvas query as a compatibility alias", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const observation = source("apps/story-studio/src/components/story-observation/StoryObservationCanvas.tsx");
  const host = source("apps/story-studio/src/components/EventObservationWorkspace.tsx");
  const route = source("apps/story-studio/src/components/event-observation/eventObservationRoute.ts");

  assert.match(app, /<EventObservationWorkspace/);
  assert.match(route, /params\.get\("storyCanvas"\) === "successor-r0"/);
  assert.match(host, /url\.searchParams\.set\("view", view\)/);
  assert.match(observation, /data-testid="story-observation-canvas"/);
  assert.doesNotMatch(observation, /applyAuthorChangeSet|CanonWriter|writeWorldState/i);
});
