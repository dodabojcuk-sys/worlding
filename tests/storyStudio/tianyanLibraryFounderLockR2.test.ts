import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { projectDisplayTitle } from "../../apps/story-studio/src/product-shell/projectTitleProjection.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("R2 project labels are a UI projection with explicit empty and untitled states", () => {
  assert.equal(projectDisplayTitle("真实作品"), "真实作品");
  assert.equal(projectDisplayTitle("0"), "未命名作品");
  assert.equal(projectDisplayTitle("  "), "未命名作品");
  assert.equal(projectDisplayTitle(null), "未命名作品");
  assert.equal(projectDisplayTitle({ title: "作品" }), "未命名作品");
  assert.equal(projectDisplayTitle('{"title":"作品"}'), "未命名作品");
  assert.equal(projectDisplayTitle(null, false), "选择作品");

  const app = source("apps/story-studio/src/App.tsx");
  const header = source("apps/story-studio/src/product-shell/GlobalHeader.tsx");
  assert.match(app, /projectDisplayTitle\(activeProject\?\.title, Boolean\(activeProject\)\)/);
  assert.match(app, /data-testid="project-selection-label"/);
  assert.doesNotMatch(app, /projectTitle=\{activeProject\.title\}/);
  assert.match(header, /data-testid="global-project-label"/);
  assert.match(header, /projectDisplayTitle\(project\.title\)/);
});

test("R2 structure disclosure keeps the frozen rail and existing management deep links", () => {
  const home = source("apps/story-studio/src/components/LibraryHomeWorkbench.tsx");
  const rail = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  assert.match(home, /资料结构/);
  assert.match(home, /自定义类型 · 文件夹与分类 · 视觉文档/);
  assert.match(home, /aria-expanded=\{structureOpen\}/);
  assert.match(home, /aria-controls="library-home-structure-actions"/);
  assert.match(home, /requestAnimationFrame\(\(\) => structureTriggerRef\.current\?\.focus/);
  assert.match(home, /onOpenDirectory\("agent-types"\)/);
  assert.match(home, /onOpenAuxiliary\("folders"\)/);
  assert.match(home, /onOpenAuxiliary\("visual"\)/);
  assert.doesNotMatch(rail, /最近更新|未归档|导入与审核|视觉文档|自定义类型管理|文件夹管理/);
});

test("R2 editor keeps lifecycle actions in the scrollable tail and footer to cancel/save", () => {
  const editor = source("apps/story-studio/src/components/AgentTypeManagementWorkbench.tsx");
  const css = source("apps/story-studio/src/styles/app.css");
  const footer = editor.match(/<footer>[\s\S]*?<\/footer>/)?.[0] || "";
  assert.match(editor, /agent-type-danger-zone/);
  assert.match(editor, /当前有 \{props\.customTypeCounts\[editedType\.typeId\] \|\| 0\} 个对象绑定/);
  assert.match(editor, /setConfirmAction\(\{ action: "retire"/);
  assert.match(editor, /closeEditor\(\)/);
  assert.doesNotMatch(footer, /停用类型|启用类型|删除草稿/);
  assert.match(footer, /取消/);
  assert.match(footer, /保存修改|保存草稿/);
  assert.match(editor, /type="checkbox" checked=\{props\.field\.defaultValue === true\}/);
  assert.match(editor, /kind === "longText".*<textarea/s);
  assert.match(editor, /className="agent-type-default-control" type=\{props\.field\.kind === "number"/);
  assert.match(css, /scroll-padding-bottom: calc\(42px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /agent-type-danger-zone/);
  assert.match(css, /agent-type-field-row textarea\.agent-type-default-control/);
});

test("R2 object detail compacts only the existing custom type property region", () => {
  const card = source("apps/story-studio/src/components/CardWorkbench.tsx");
  const css = source("apps/story-studio/src/styles/app.css");
  assert.match(card, /object-type-property-block/);
  assert.match(card, /data-testid="object-type-property-block"/);
  assert.match(card, /<AgentTypeObjectBinding/);
  assert.match(css, /\.object-type-property-block/);
  assert.match(css, /\.object-type-property-block > \.agent-type-object-binding/);
});

test("R2 mobile shell reserves top header space and keeps bottom navigation", () => {
  const css = source("apps/story-studio/src/styles/product-shell-r0.css");
  assert.match(css, /R2 mobile header closure/);
  assert.match(css, /grid-template-areas: "breadcrumb title tianyi"/);
  assert.match(css, /padding: max\(6px, env\(safe-area-inset-top\)\)/);
  assert.match(css, /overflow-x: clip/);
  assert.match(css, /r1-mobile-nav-height/);
});
