import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("only the on-demand contextual selector mounts the complete author hierarchy outside Library", () => {
  const selector = source("apps/story-studio/src/product-shell/AuthorContextSelector.tsx");
  const moduleSidebar = source("apps/story-studio/src/product-shell/ModuleContextSidebar.tsx");
  const writingNavigator = source("apps/story-studio/src/components/WritingNavigator.tsx");

  assert.match(selector, /short-lived read-only access point/);
  assert.match(selector, /<AuthorLibraryHierarchy/);
  assert.match(selector, /role=\{props\.containedByMobileDrawer \? undefined : "dialog"\}/);
  assert.match(selector, /event\.key !== "Escape"/);
  assert.match(selector, /event\.stopImmediatePropagation\(\)/);
  assert.match(selector, /window\.addEventListener\("keydown", onKeyDown, true\)/);
  assert.match(moduleSidebar, /<AuthorContextSelector/);
  assert.match(writingNavigator, /<AuthorContextSelector/);
  assert.doesNotMatch(moduleSidebar, /<AuthorLibraryHierarchy/);
  assert.doesNotMatch(writingNavigator, /<AuthorLibraryHierarchy/);
});

test("Nuwa presents the current Run first and puts stage navigation in disclosed run detail", () => {
  const nuwa = source("apps/story-studio/src/components/NuwaPrimaryWorkspace.tsx");
  const styles = source("apps/story-studio/src/styles/product-shell-r0.css");

  assert.match(nuwa, /className="nuwa-run-progress"/);
  assert.match(nuwa, /当前 Run/);
  assert.match(nuwa, /<summary>运行详情<\/summary>/);
  assert.match(nuwa, /aria-label="女娲运行详情" role="tablist"/);
  assert.doesNotMatch(nuwa, /className="nuwa-stage-strip"/);
  assert.match(styles, /\.nuwa-run-progress \{/);
  assert.match(styles, /\.nuwa-run-details > nav \{/);
  assert.doesNotMatch(styles, /\.nuwa-stage-strip \{/);
});

test("Event controls compact at 1024px without hiding the view or create controls", () => {
  const styles = source("apps/story-studio/src/styles/product-shell-r0.css");

  assert.match(styles, /@media \(min-width: 821px\) and \(max-width: 1120px\) \{[\s\S]*?\.event-observation-header-actions \{ flex-wrap: wrap/);
  assert.match(styles, /\.event-observation-header-actions > \.primary-action \{ order: -1/);
  assert.match(styles, /\.event-observation-view-tabs button \{ min-width: 48px/);
});
