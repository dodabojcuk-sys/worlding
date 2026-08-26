import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("non-Library spaces expose the shared hierarchy only through on-demand contextual access", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const rail = source("apps/story-studio/src/product-shell/AuthorLibraryHierarchy.tsx");
  const selector = source("apps/story-studio/src/product-shell/AuthorContextSelector.tsx");
  const moduleSidebar = source("apps/story-studio/src/product-shell/ModuleContextSidebar.tsx");
  const writingNavigator = source("apps/story-studio/src/components/WritingNavigator.tsx");
  assert.match(app, /const hasContextSidebar = !settingsRouteActive && \(productMode === "library" \|\| productMode === "writing"\)/);
  assert.match(app, /<ModuleContextSidebar mode=\{productMode\}/);
  assert.match(moduleSidebar, /<AuthorContextSelector/);
  assert.match(writingNavigator, /<AuthorContextSelector/);
  assert.doesNotMatch(moduleSidebar, /<AuthorLibraryHierarchy/);
  assert.doesNotMatch(writingNavigator, /<AuthorLibraryHierarchy/);
  assert.match(selector, /<AuthorLibraryHierarchy/);
  assert.match(selector, /aria-expanded=\{open\}/);
  assert.match(selector, /requestAnimationFrame\(\(\) => triggerRef\.current\?\.focus/);
  assert.match(source("apps/story-studio/src/components/WorldLibraryPanel.tsx"), /<AuthorLibraryHierarchy/);
  for (const label of ["资料库", "剧情库", "设定库", "其他", "情节点", "伏笔", "灵感"]) assert.match(rail, new RegExp(label));
  assert.doesNotMatch(selector, /localStorage|sessionStorage|fetch\(|createWorldObject|updateStoryUnit/);
});

test("Context Rail uses stable existing owner counts and routes selections to current workspaces", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const rail = source("apps/story-studio/src/product-shell/AuthorLibraryHierarchy.tsx");
  const selector = source("apps/story-studio/src/product-shell/AuthorContextSelector.tsx");
  assert.match(app, /character: library\?\.counts\.character/);
  assert.match(app, /unit: storyUnits\.length/);
  assert.match(app, /void chooseProductMode\(target === "event-line" \? "event-line" : "multiverse"\)/);
  assert.match(rail, /aria-hidden="true"/);
  assert.match(rail, /<details open/);
  assert.match(rail, /data-context-target=\{item\.id\}/);
  assert.match(selector, /props\.onSelect\(target\)/);
});

test("mobile Context Rail is a focus-restoring modal drawer", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const sidebar = source("apps/story-studio/src/product-shell/ModuleContextSidebar.tsx");
  assert.match(app, /aria-label="打开作者上下文"/);
  assert.match(app, /aside\.module-context-sidebar\.is-mobile-open/);
  assert.match(app, /trigger\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(sidebar, /role=\{props\.mobileOpen \? "dialog"/);
  assert.match(sidebar, /aria-label="关闭上下文"/);
  assert.match(sidebar, /containedByMobileDrawer=\{props\.mobileOpen\}/);
});
