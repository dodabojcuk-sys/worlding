import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("R8 keeps the accepted rail and gives every workspace one three-region global header", () => {
  const header = source("apps/story-studio/src/product-shell/GlobalHeader.tsx");
  const toolbar = source("apps/story-studio/src/product-shell/WorkspaceHeader.tsx");
  const styles = source("apps/story-studio/src/styles/product-shell-r0.css");
  assert.match(styles, /--r1-rail-width: 58px/);
  assert.match(header, /data-global-header="true"/);
  assert.match(header, /data-global-header-region="left"/);
  assert.match(header, /data-global-header-region="center"/);
  assert.match(header, /data-global-header-region="right"/);
  assert.doesNotMatch(header, /当前作品已载入/);
  assert.match(toolbar, /data-module-toolbar="true"/);
  assert.doesNotMatch(toolbar, /props\.projectTitle.*sectionLabel/);
  assert.match(styles, /grid-template-columns: minmax\(220px, 1fr\) minmax\(0, auto\) minmax\(220px, 1fr\)/);
  assert.match(styles, /data-product-mode="world"\]\[data-tianyi-quick-placement="pinned"\].*world-pulse-grid/);
  assert.match(styles, /-webkit-line-clamp: 2/);
  assert.match(styles, /\.tianyi-workspace .*workbench-header-copy > strong \{ display: none;/);
});

test("R1 reserves the Library-style context rail for real navigation collections and keeps event projections in the content host", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const host = source("apps/story-studio/src/components/EventObservationWorkspace.tsx");
  const spine = source("apps/story-studio/src/components/EventLineWorkbench.tsx");
  const canvas = source("apps/story-studio/src/components/story-observation/StoryObservationCanvas.tsx");
  const styles = source("apps/story-studio/src/styles/product-shell-r0.css");
  assert.match(app, /const hasContextSidebar = !settingsRouteActive && \(productMode === "library" \|\| productMode === "writing"\)/);
  assert.match(app, /<ModuleContextSidebar/);
  assert.doesNotMatch(host, /data-event-observation-sidebar/);
  assert.doesNotMatch(host, /EventObservationSidebar/);
  assert.match(spine, /!props\.embedded \? <><button[^]*?EventLineScope/);
  assert.match(canvas, /!props\.embedded \? <><button[^]*?ObservationScope/);
  assert.match(styles, /\.event-observation-layout[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(styles, /\.event-line-shell\.is-embedded[\s\S]*?grid-template-columns: minmax\(0, 1fr\) auto/);
});

test("R8 keeps a single global Tianyi host and preserves the existing shared session and draft handoff", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const header = source("apps/story-studio/src/product-shell/GlobalHeader.tsx");
  const host = source("apps/story-studio/src/product-shell/GlobalTianyiDockHost.tsx");
  assert.equal([...app.matchAll(/<GlobalTianyiDockHost\b/g)].length, 1);
  assert.match(header, /data-global-tianyi-trigger="true"/);
  assert.match(host, /data-global-tianyi-dock-host="true"/);
  assert.match(app, /sessionId=\{sharedTianyiSessionId\}/);
  assert.match(app, /draft=\{sharedTianyiDraft\}/);
  assert.match(app, /workspace=\{productMode\}/);
});

test("R8 preserves fixed library categories and routes custom-category deletion through the existing workspace layout facade", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const library = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const catalog = source("apps/story-studio/src/worldObjectCatalog.ts");
  assert.match(library, /全部资料/);
  assert.match(library, /data-testid="world-library-categories"/);
  assert.doesNotMatch(library, /library-empty-categories/);
  assert.match(library, /item\.value === "character" \? "角色"/);
  for (const label of ["角色", "物品", "地点", "事件", "组织", "规则", "线索"]) assert.match(catalog, new RegExp(label));
  for (const retiredLabel of ["人物", "势力", "伏笔"]) assert.doesNotMatch(catalog, new RegExp(`label: "${retiredLabel}"`));
  assert.match(library, /onDeleteCustomCategory/);
  assert.match(library, /\["character", "item", "location", "event", "faction", "rule", "thread"\]/);
  assert.match(library, /删除\$\{folder\.title\}/);
  assert.match(app, /function deleteCustomLibraryCategory/);
  assert.match(app, /updateCustomLibraryCategories\(library\.folders\.filter/);
  assert.doesNotMatch(library, /localStorage|sessionStorage|fetch\(/);
});

test("R8A keeps one current-work owner while R9A moves creation infrastructure behind author-facing surfaces", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const nuwa = source("apps/story-studio/src/components/NuwaPrimaryWorkspace.tsx");
  const card = source("apps/story-studio/src/components/CardWorkbench.tsx");
  const writing = source("apps/story-studio/src/components/WritingNavigator.tsx");
  const spine = source("apps/story-studio/src/components/EventLineWorkbench.tsx");

  assert.doesNotMatch(nuwa, /stageLabel\(/);
  assert.match(nuwa, /<NuwaStageStrip/);
  const moduleContext = source("apps/story-studio/src/product-shell/ModuleContextSidebar.tsx");
  assert.match(moduleContext, /nuwa: \{ title: "女娲", items: \["当前 Unit", "当前场景", "排演来源", "最近版本"\]/);
  assert.doesNotMatch(moduleContext, /"排演现场", "候选审查", "历史排演"/);
  assert.match(card, /library-mode-switch/);
  assert.match(card, />资料库<.*>规则管理</);
  const artifact = source("apps/story-studio/src/components/OutputArtifactWorkbench.tsx");
  const markdown = source("apps/story-studio/src/components/MarkdownEditorAdapter.tsx");
  const library = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  assert.match(writing, /creation-sidebar-type/);
  assert.match(writing, /onOpenTypeMenu/);
  assert.match(markdown, /data-creation-surface="novel"/);
  assert.match(artifact, /data-creation-surface="screenplay"/);
  assert.match(artifact, /creation-planned-surface/);
  assert.doesNotMatch(artifact, /output-artifact-structure/);
  assert.doesNotMatch(library, /格式无关的来源与意图/);
  assert.doesNotMatch(library, /onOpenStoryUnits/);
  assert.doesNotMatch(app, /StoryUnitWorkbench/);
  assert.match(spine, /id: "branches", label: "候选"/);
});
