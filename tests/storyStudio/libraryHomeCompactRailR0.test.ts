import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Library home is a distinct URL state with one existing-owner projection", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const home = source("apps/story-studio/src/components/LibraryHomeWorkbench.tsx");
  assert.match(app, /const \[libraryHome, setLibraryHome\] = useState\(initialLibraryRoute\.home\)/);
  assert.match(app, /writeLibraryRouteState\(\{ home: true \}, "push"\)/);
  assert.match(app, /!\["libraryTab", "libraryDirectory", "libraryQuery", "libraryObject", "relationView", "relationPresentation", "relationId"\]/);
  assert.match(app, /library\.placements\.some\(\(placement\) => placement\.documentId === object\.id\)/);
  assert.match(app, /librarySearchOriginHome/);
  assert.match(app, /searchOriginHome: true/);
  assert.match(home, /title="资料库"/);
  assert.match(home, /新建资料/);
  assert.match(home, /按类型浏览/);
  assert.match(home, /最近更新/);
  assert.match(home, /继续整理/);
  assert.match(home, /资料结构/);
  assert.match(home, /自定义类型 · 文件夹与分类 · 视觉文档/);
  assert.match(home, /aria-expanded=\{structureOpen\}/);
  assert.doesNotMatch(home, /library-home-overview-grid|资料概况/);
});

test("Library compact rail keeps one search and reserves the rail for real destinations", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const rail = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const css = source("apps/story-studio/src/styles/app.css");
  assert.match(app, /const \[libraryRailWidthPx, setLibraryRailWidthPx\] = useState\(224\)/);
  assert.match(app, /"--sidebar-width": `\$\{productMode === "library"/);
  assert.match(app, /onSidebarResize=\{setLibraryRailWidthPx\}/);
  assert.doesNotMatch(rail, /资料库首页/);
  assert.match(rail, /folders\.filter\(\(folder\) => folder\.kind === "folder"\)/);
  assert.match(rail, /folder:\$\{folder\.id\}/);
  assert.match(rail, /aria-label="搜索资料"/);
  assert.doesNotMatch(rail, /library-auxiliary-nav|最近更新|未归档|导入与审核|视觉文档/);
  assert.match(css, /library-home-nav-button/);
  assert.match(css, /world-library\.unified-library-rail/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(css, /\.library-auxiliary-nav \{/);
});

test("recent updates are read-only source timestamps and never a second activity store", () => {
  const operations = source("src/storyControlSurface/storyStudioWorkspaceOperations.ts");
  const transport = source("apps/story-studio/src/lib/localTransport.ts");
  assert.match(operations, /updatedAt: statSync\(path\.join\(projectPath, entry\.relativePath\)\)\.mtime\.toISOString\(\)/);
  assert.match(transport, /updatedAt\?: string/);
  assert.doesNotMatch(operations, /recentActivity|activityStore|recent-objects\.json/);
});

test("Library mobile drawer is an inert overlay and never reserves a rail column", () => {
  const host = source("apps/story-studio/src/product-shell/ModuleSidebarHost.tsx");
  const shell = source("apps/story-studio/src/styles/product-shell-r0.css");
  assert.match(host, /mobileViewport/);
  assert.match(host, /setAttribute\("inert", ""\)/);
  assert.match(host, /setAttribute\("tabindex", "-1"\)/);
  assert.match(host, /data-mobile-closed/);
  assert.match(shell, /data-product-mode="library"[^}]+grid-template-columns: minmax\(0, 1fr\)/s);
  assert.match(shell, /workspace-sidebar-slot \{\s*position: static !important;/s);
  assert.match(shell, /module-sidebar-host:has\(\.workspace-sidebar-slot\.is-mobile-open\) \{ pointer-events: auto; \}/);
});
