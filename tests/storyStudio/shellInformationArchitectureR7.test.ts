import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Batch A keeps the compact rail for destinations while the global header owns project switching", () => {
  const navigation = source("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx");
  const header = source("apps/story-studio/src/product-shell/GlobalHeader.tsx");
  const styles = source("apps/story-studio/src/styles/product-shell-r0.css");
  const mark = navigation.indexOf("product-shell-mark");
  const destinations = navigation.indexOf("product-shell-destination-list");
  assert.ok(mark >= 0 && mark < destinations);
  assert.doesNotMatch(navigation, /global-project-switcher|product-shell-project-popover/);
  assert.match(header, /data-testid="global-workspace-title"/);
  assert.match(header, /aria-label="切换当前作品"/);
  assert.match(header, /data-testid="global-project-title-menu"/);
  assert.match(header, /props\.onSwitchProject\(project\.id\)/);
  assert.match(navigation, /data-global-account-action="personal-center"/);
  assert.match(navigation, /data-global-account-action="settings"/);
  assert.match(styles, /--r1-rail-width: 58px/);
  assert.match(styles, /grid-template-rows: 56px minmax\(0, 1fr\)/);
  assert.match(styles, /global-workspace-header/);
  assert.match(styles, /product-shell-mark::after,[\s\S]*?content: none/);
  assert.match(styles, /module-sidebar-host > \.world-library \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /world-library > \.library-drawer-scroll \{[\s\S]*?grid-column: 1/);
  assert.match(styles, /module-sidebar-host > \.writing-navigator \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /writing-navigator > \.creation-library-types,[\s\S]*?writing-navigator > \.new-writing-action/);
  assert.match(navigation, /<small aria-hidden="true">天衍<\/small>/);
});

test("R7 mounts one persistent global header and Tianyi Dock host outside page workspace ownership", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const header = source("apps/story-studio/src/product-shell/GlobalHeader.tsx");
  const host = source("apps/story-studio/src/product-shell/GlobalTianyiDockHost.tsx");
  const styles = source("apps/story-studio/src/styles/product-shell-r0.css");
  assert.equal([...app.matchAll(/<GlobalHeader\b/g)].length, 1);
  assert.equal([...app.matchAll(/<GlobalTianyiDockHost\b/g)].length, 1);
  assert.match(header, /data-global-header="true"/);
  assert.match(header, /data-testid="tianyi-quick-launcher"/);
  assert.match(host, /data-global-tianyi-dock-host="true"/);
  assert.match(styles, /Desktop never uses a floating or bottom drawer for Tianyi/);
  assert.match(styles, /global-tianyi-dock-host/);
});

test("R7 promotes the only continuous project flow into an external project center without creating another owner", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const center = source("apps/story-studio/src/product-shell/ProjectCenter.tsx");
  assert.match(app, /function openProjectCenter\(\)/);
  assert.match(app, /url\.pathname = "\/projects"/);
  assert.match(app, /projectCenterReturnLocation/);
  assert.match(app, /window\.history\.pushState\(\{ workspace: productMode \}, "", projectCenterReturnLocation\)/);
  assert.match(app, /function isProjectCenterPath\(\)/);
  assert.match(app, /<ProjectCenter/);
  assert.match(center, /onOpen\(projectId: string\)/);
  assert.match(center, /onCreate\(\)/);
  assert.doesNotMatch(center, /localStorage|fetch\(|createProject|repository|provider/i);
});

test("R7 keeps the material sidebar focused on material types while document tools live in its context toolbar", () => {
  const sidebar = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const workbench = source("apps/story-studio/src/components/CardWorkbench.tsx");
  assert.doesNotMatch(sidebar, /library-module-modes/);
  assert.match(workbench, /onOpenRules\(\): void/);
  assert.match(workbench, />规则管理</);
  assert.match(workbench, />资料画布</);
});

test("R7 owns every module sidebar through the shared Shell host and persists custom categories through the existing layout owner", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const host = source("apps/story-studio/src/product-shell/ModuleSidebarHost.tsx");
  const contextual = source("apps/story-studio/src/product-shell/ModuleContextSidebar.tsx");
  const library = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const transport = source("apps/story-studio/src/lib/localTransport.ts");
  assert.equal([...app.matchAll(/<ModuleSidebarHost\b/g)].length, 1);
  assert.match(host, /data-module-sidebar-host="true"/);
  assert.match(contextual, /event-line/);
  assert.match(contextual, /nuwa/);
  assert.match(contextual, /tianyi/);
  assert.match(library, /自定义分类/);
  assert.match(library, /onRenameCustomCategory/);
  assert.match(library, /onMoveCustomCategory/);
  assert.match(transport, /workspace\/folders\/update/);
  assert.doesNotMatch(library, /localStorage|sessionStorage|fetch\(/);
});
