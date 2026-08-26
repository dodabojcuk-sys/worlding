import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("R1 rail removes permanent management destinations and projects real folders", () => {
  const rail = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const app = source("apps/story-studio/src/App.tsx");
  assert.match(rail, /folders\.filter\(\(folder\) => folder\.kind === "folder"\)/);
  assert.match(rail, /id=\{`folder:\$\{folder\.id\}`\}/);
  assert.doesNotMatch(rail, /library-auxiliary-nav/);
  assert.doesNotMatch(rail, /最近更新|未归档|导入与审核|文件夹与分类|视觉文档/);
  assert.match(app, /rawDirectory\.startsWith\("folder:"\)/);
  assert.match(app, /folderDirectory/);
  assert.match(app, /placement\.folderId === folderDirectory\.id/);
});

test("R1 home uses browse, continue-organizing, and a low-frequency structure menu", () => {
  const home = source("apps/story-studio/src/components/LibraryHomeWorkbench.tsx");
  const css = source("apps/story-studio/src/styles/app.css");
  assert.match(home, /title="资料库"/);
  assert.match(home, /按类型浏览/);
  assert.match(home, /最近更新/);
  assert.match(home, /继续整理/);
  assert.match(home, /资料结构/);
  assert.match(home, /自定义类型 · 文件夹与分类 · 视觉文档/);
  assert.match(home, /aria-controls="library-home-structure-actions"/);
  assert.match(home, /管理自定义类型/);
  assert.match(home, /管理文件夹与分类/);
  assert.match(home, /管理视觉文档/);
  assert.doesNotMatch(home, /资料概况|library-home-overview-grid/);
  assert.match(css, /\.library-home-structure-menu/);
  assert.match(css, /\.library-home-organize-grid \{ display: grid; grid-template-columns: repeat\(3/);
});

test("R1 keeps deep links and navigation read-only", () => {
  const app = source("apps/story-studio/src/App.tsx");
  assert.match(app, /writeLibraryRouteState\(\{ home: true \}, "push"\)/);
  assert.match(app, /libraryDirectory === "recent"/);
  assert.match(app, /libraryDirectory === "unfiled"/);
  assert.match(app, /libraryDirectory === "agent-types"/);
  assert.match(app, /setLibraryHome\(false\)/);
  assert.doesNotMatch(source("apps/story-studio/src/components/WorldLibraryPanel.tsx"), /createWorldObject|updateWorldObject|createAgentType/);
});
