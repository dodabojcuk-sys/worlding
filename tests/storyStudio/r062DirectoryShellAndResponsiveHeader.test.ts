import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createEmptyProjectDirectoryProjection } from "../../apps/story-studio/src/product-shell/project-directory/projectDirectoryViewModel.ts";
import { zhCN } from "../../apps/story-studio/src/product-shell/i18n/translations.ts";

const source = (file: string) => readFileSync(file, "utf8");

const expectedShell = [
  ["故事结构", "节点", "单元", "故事线"],
  ["信息资料", "角色", "物品", "地点", "组织"],
  ["设定", "规则与设定"],
  ["来源", "来源文档"],
  ["创意", "剧情想法"]
];

function assertZeroDirectoryShell(projection: ReturnType<typeof createEmptyProjectDirectoryProjection>) {
  assert.equal(projection.classifiedCount, 0);
  assert.equal(projection.pendingCount, 0);
  assert.deepEqual(projection.groups.map((group) => [group.label, ...(group.children ?? []).map((child) => child.label)]), expectedShell);
  for (const group of projection.groups) {
    assert.equal(group.count, 0);
    for (const category of group.children ?? []) assert.equal(category.count, 0);
  }
}

test("CLASSIFIED_SHELL_PRESENT_WITH_NO_OPEN_WORK", () => {
  const projection = createEmptyProjectDirectoryProjection((key) => zhCN[key]);
  assertZeroDirectoryShell(projection);
  const panel = source("apps/story-studio/src/product-shell/project-directory/ProjectDirectoryPanel.tsx");
  assert.match(panel, /<ProjectDirectoryTree groups=\{state\.projection\.groups\}/);
  assert.match(panel, /data-directory-empty-shell-actions="true"/);
  assert.match(panel, /directory\.newProject/);
  assert.match(panel, /directory\.openImport/);
});

test("CLASSIFIED_SHELL_PRESENT_WITH_ZERO_ITEMS", () => {
  assertZeroDirectoryShell(createEmptyProjectDirectoryProjection((key) => zhCN[key]));
  const model = source("apps/story-studio/src/product-shell/project-directory/projectDirectoryViewModel.ts");
  assert.match(model, /createDirectoryShellDescriptor/);
  assert.match(model, /A project projection only fills this shell with counts and stable references/);
});

test("PENDING_ZERO_STATE_STABLE", () => {
  const panel = source("apps/story-studio/src/product-shell/project-directory/ProjectDirectoryPanel.tsx");
  const pending = source("apps/story-studio/src/product-shell/project-directory/PendingReviewPanel.tsx");
  assert.match(panel, /role="tab"[\s\S]*directory\.pending/);
  assert.match(pending, /pending\.empty/);
  assert.equal(zhCN["pending.empty"], "暂无待确认项。");
});

test("RESPONSIVE_HEADER_922 keeps context, named panels, and overflow access", () => {
  const topbar = source("apps/story-studio/src/product-shell/topbar/GlobalStatusBar.tsx");
  const styles = source("apps/story-studio/src/styles/tianyan-r0-shell.css");
  assert.match(topbar, /shell-project-selector/);
  assert.match(topbar, /data-panel-toggle="project-directory"/);
  assert.match(topbar, /data-panel-toggle="global-tianyi"/);
  assert.match(topbar, /topbar\.more/);
  assert.match(topbar, /aria-expanded=\{moreOpen\}/);
  assert.match(topbar, /window\.requestAnimationFrame\(\(\) => moreToggleRef\.current\?\.focus\(\)\)/);
  assert.match(styles, /shell-topbar-context \{\s*flex: 1 1 auto/);
  assert.match(styles, /shell-topbar-secondary \{ display: none; \}/);
  assert.match(styles, /shell-topbar-more \{ display: block; \}/);
  assert.match(styles, /shell-topbar-panel-toggle\[aria-pressed="true"\][\s\S]*color: var\(--color-accent\)/);
  assert.doesNotMatch(styles, /shell-topbar-panel-toggle span\s*\{\s*display:\s*none/);
});
