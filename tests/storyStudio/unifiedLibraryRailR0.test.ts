import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("Library rail exposes one classified/uncertain navigation surface", () => {
  const rail = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const workbench = source("apps/story-studio/src/components/LibraryDirectoryWorkbench.tsx");
  assert.match(rail, /role="tablist"/);
  assert.match(rail, /role="tab"/);
  assert.match(rail, /aria-label="搜索资料"/);
  assert.match(rail, /全部资料/);
  assert.match(rail, /角色/);
  assert.match(rail, /物品/);
  assert.match(rail, /地点/);
  assert.match(rail, /组织/);
  assert.match(rail, /type\.status === "active"/);
  assert.match(workbench, /titleTestId="library-directory-heading"/);
  assert.match(workbench, /data-testid="library-directory-list"/);
  assert.match(workbench, /onOpenObject\(item\.object\)/);
});

test("Library route state is URL-addressable and keeps the existing owner boundary", () => {
  const app = source("apps/story-studio/src/App.tsx");
  assert.match(app, /libraryTab/);
  assert.match(app, /libraryDirectory/);
  assert.match(app, /libraryQuery/);
  assert.match(app, /libraryObject/);
  assert.match(app, /listAgentTypes/);
  assert.match(app, /listClassifiedLibraryProjection/);
  assert.match(app, /listUncertainLibraryProjection/);
  assert.match(app, /<LibraryDirectoryWorkbench/);
  assert.match(app, /setLibraryFocusRequest/);
  assert.doesNotMatch(source("apps/story-studio/src/components/WorldLibraryPanel.tsx"), /createWorldObject|updateWorldObject|createAgentType/);
});

test("mobile Library selection requests main-heading focus and preserves the drawer contract", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const workbench = source("apps/story-studio/src/components/LibraryDirectoryWorkbench.tsx");
  const css = source("apps/story-studio/src/styles/app.css");
  assert.match(app, /setLibraryFocusRequest\(\(value\) => value \+ 1\)/);
  assert.match(app, /focusRequest=\{libraryFocusRequest\}/);
  assert.match(workbench, /headingRef\.current\?\.focus/);
  assert.match(workbench, /titleAsHeading/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /library-directory-empty-icon/);
});

test("Library keeps low-frequency management actions on the home structure menu", () => {
  const rail = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const home = source("apps/story-studio/src/components/LibraryHomeWorkbench.tsx");
  assert.doesNotMatch(rail, /library-auxiliary-nav|导入与审核|文件夹与分类|视觉文档|最近更新|未归档/);
  assert.match(home, /资料结构/);
  assert.match(home, /自定义类型 · 文件夹与分类 · 视觉文档/);
  assert.match(home, /管理自定义类型/);
  assert.match(home, /管理文件夹与分类/);
  assert.match(home, /管理视觉文档/);
  assert.doesNotMatch(rail, /关系库/);
});

test("Founder polish keeps directory titles, icons, and state-specific empty copy", () => {
  const workbench = source("apps/story-studio/src/components/LibraryDirectoryWorkbench.tsx");
  assert.match(workbench, /title=\{title\}/);
  assert.match(workbench, /icon=\{directoryIcon\(props\.directory, props\.tab, hasSearch\)\}/);
  assert.match(workbench, /这个作品还没有资料/);
  assert.match(workbench, /还没有\$\{label\}/);
  assert.match(workbench, /没有找到匹配资料/);
  assert.match(workbench, /试试缩短关键词，或换一种写法/);
  assert.match(workbench, /目前没有待确定内容/);
  assert.match(workbench, /<UncertainList items=\{props\.uncertainItems\} emptyState=\{emptyState\}/);
  assert.match(workbench, /function UncertainList\(props: \{ items: LibraryUncertainItem\[\]; emptyState: LibraryEmptyState;/);
  assert.doesNotMatch(workbench, /换一个搜索词/);
});
