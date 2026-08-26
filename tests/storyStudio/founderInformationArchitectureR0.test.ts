import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isSettingsRoute, readSettingsRouteSection, readSettingsRouteState, settingsRouteForLeaf, settingsRouteForSection } from "../../apps/story-studio/src/product-shell/settingsRouteState.ts";

test("Founder settings stay on explicit low-frequency routes without joining the eight-workspace registry", () => {
  assert.deepEqual(["/settings", "/settings/ai", "/settings/plugins", "/settings/workspace", "/settings/data", "/settings/system"], [
    settingsRouteForSection("home"),
    settingsRouteForSection("ai"),
    settingsRouteForSection("plugins"),
    settingsRouteForSection("workspace"),
    settingsRouteForSection("data"),
    settingsRouteForSection("system")
  ]);
  assert.equal(isSettingsRoute("/settings/plugins"), true);
  assert.equal(readSettingsRouteSection("/settings/data"), "data");
  assert.equal(readSettingsRouteSection("/settings/ai/models"), "ai");
  assert.deepEqual(readSettingsRouteState("/settings/ai/models"), { section: "ai", leaf: "models" });
  assert.deepEqual(readSettingsRouteState("/settings/ai", "section=context"), { section: "ai", leaf: "context" });
  assert.equal(settingsRouteForLeaf("ai", "models"), "/settings/ai/models");
  assert.equal(settingsRouteForLeaf("system", "recovery"), "/settings/system/recovery");
  assert.equal(readSettingsRouteSection("/settings/unknown"), "home");
  assert.equal(isSettingsRoute("/multiverse"), false);
});

test("Founder route correction reuses existing owners and keeps external tools fail-closed", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const settings = readFileSync("apps/story-studio/src/components/SettingsPage.tsx", "utf8");
  const plugin = readFileSync("apps/story-studio/src/components/CreationPluginCenter.tsx", "utf8");
  const library = readFileSync("apps/story-studio/src/components/WorldLibraryPanel.tsx", "utf8");
  const creation = readFileSync("apps/story-studio/src/components/CreationHome.tsx", "utf8");
  const shellStyles = readFileSync("apps/story-studio/src/styles/product-shell-r0.css", "utf8");

  assert.match(app, /normalizeCreationPluginCompatibilityRoute/);
  assert.match(app, /<SettingsPage/);
  assert.match(app, /onOpenSettings=\{\(\) => openSettingsRoute\("home"\)\}/);
  assert.match(settings, /ControlCenterSurface/);
  assert.match(settings, /CreationPluginCenter surface="settings"/);
  assert.match(settings, /settings-leaf-navigation/);
  assert.doesNotMatch(settings, /settings-detail-tabs/);
  assert.doesNotMatch(settings, /localStorage|sessionStorage|fetch\(/);
  assert.match(plugin, /data-plugin-surface=/);
  assert.match(plugin, /已安装但不可执行/);
  assert.doesNotMatch(library, /资料库首页/);
  assert.match(creation, /data-testid="creation-empty-state"/);
  assert.match(creation, /去事件线整理/);
  assert.match(creation, /不会自动写入 Canon/);
  assert.match(shellStyles, /@media \(min-width: 821px\) and \(max-width: 1120px\)[\s\S]*?grid-template-rows: 56px minmax\(0, 1fr\)/);
});

test("complete settings center keeps every visible leaf on a real owner-backed surface", () => {
  const settings = readFileSync("apps/story-studio/src/components/SettingsPage.tsx", "utf8");
  const controlCenter = readFileSync("apps/story-studio/src/components/AIControlCenter.tsx", "utf8");
  const plugins = readFileSync("apps/story-studio/src/components/CreationPluginCenter.tsx", "utf8");
  const shellStyles = readFileSync("apps/story-studio/src/styles/product-shell-r0.css", "utf8");
  assert.match(settings, /settingsLeafDefinitions/);
  for (const leaf of ["provider", "models", "tianyi", "context", "skills", "workflows", "catalog", "installed", "permissions", "updates", "appearance", "fonts", "editor", "sidebar", "shortcuts", "location", "backup", "import-export", "storage", "diagnostics", "logs", "version", "recovery"]) {
    assert.match(settings, new RegExp(`id: "${leaf}"`));
  }
  assert.match(controlCenter, /function ModelCatalogSettings/);
  assert.match(controlCenter, /onSaveProviderProfile|onSave/);
  assert.match(controlCenter, /onReloadProviderProfile/);
  assert.match(controlCenter, /onTest\(selectedModel \|\| undefined\)/);
  assert.match(controlCenter, /完整模型 ID/);
  assert.match(controlCenter, /function TianyiModelSettings/);
  assert.match(controlCenter, /function DiagnosticSettings/);
  assert.match(controlCenter, /function ExportSettings/);
  assert.match(controlCenter, /不写入 Canon、Event、WorldState、Relation 或 Memory/);
  assert.match(plugins, /settingsView/);
  assert.match(plugins, /已安装插件/);
  assert.match(plugins, /已安装但不可执行/);
  assert.match(shellStyles, /\.settings-leaf-navigation button > span \{ display: grid; grid-column: 1 \/ -1; width: 100%;/);
});
