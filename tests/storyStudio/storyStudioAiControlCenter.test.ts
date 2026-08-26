import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  MAXIMUM_PROVIDER_CREDENTIAL_CHARACTERS,
  normalizeProviderCredentialInput
} from "../../apps/story-studio/src/lib/providerCredentialInput.ts";

import {
  CONTROL_CENTER_PREFERENCES_KEY,
  DEFAULT_CONTROL_CENTER_PREFERENCES,
  readControlCenterPreferences,
  saveControlCenterPreferences,
  type PreferenceStorage
} from "../../apps/story-studio/src/lib/controlCenterPreferences.ts";
import { projectStoryStudioSystemSkills } from "../../apps/story-studio/src/lib/skillRegistryProjection.ts";
import { STORY_STUDIO_SYSTEM_SKILL_MANIFESTS } from "../../src/skillControl/storyStudioSystemSkillManifests.ts";
import { TOP_LEVEL_DESTINATION_REGISTRY } from "../../apps/story-studio/src/product-shell/navigation/topLevelDestinationRegistry.ts";

test("Batch A global shell keeps profile and settings distinct while workspace sidebars remain non-operative", () => {
  const registry = source("apps/story-studio/src/product-shell/navigation/topLevelDestinationRegistry.ts");
  const navigation = source("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx");
  const accountControl = source("apps/story-studio/src/components/WorkspaceAccountControl.tsx");
  const worldLibrary = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const writingNavigator = source("apps/story-studio/src/components/WritingNavigator.tsx");
  const profilePanel = source("apps/story-studio/src/product-shell/ProductShellProfilePanel.tsx");
  const app = source("apps/story-studio/src/App.tsx");

  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.length, 8);
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.some((destination) => destination.id === "control-center"), false);
  assert.match(registry, /STORY_STUDIO_WORKSPACE_REGISTRY/);
  assert.match(navigation, /props\.onOpenControlCenter\(\)/);
  assert.match(accountControl, /data-testid="local-identity-status"/);
  assert.match(accountControl, /本地身份/);
  assert.doesNotMatch(accountControl, /<button|onClick|onKey|role=|Settings2|ChevronRight|onOpenControlCenter/);
  assert.doesNotMatch(worldLibrary, /<WorkspaceAccountControl/);
  assert.doesNotMatch(worldLibrary, /library-storage/);
  assert.doesNotMatch(worldLibrary, /onStorageSettings/);
  assert.doesNotMatch(writingNavigator, /<WorkspaceAccountControl/);
  assert.match(navigation, /aria-label="打开个人中心"/);
  assert.match(navigation, /aria-label="打开设置"/);
  assert.match(profilePanel, /个人中心/);
  assert.match(profilePanel, /独立的“设置”入口/);
  assert.match(app, /本地工作区 · \$\{activeProject\?\.title \|\| "当前项目"\}/);
  assert.doesNotMatch(accountControl, /projectPath/);
  assert.match(app, /<AIControlCenter/);
  assert.match(app, /onOpenControlCenter=\{\(\) => openSettingsRoute\("home"\)\}/);
  assert.match(app, /<SettingsPage/);
  assert.doesNotMatch(profilePanel, /localStorage|fetch\(|IdentityOwner|UserManagement/);
});

test("Provider control center exposes saved-state feedback, model discovery, reveal bounds, and the direct settings shell", () => {
  const controlCenter = source("apps/story-studio/src/components/AIControlCenter.tsx");
  const settings = source("apps/story-studio/src/components/SettingsPage.tsx");
  const settingsCss = source("apps/story-studio/src/styles/product-shell-r0.css");
  assert.match(controlCenter, /function ProviderSettingsV2/);
  assert.match(controlCenter, /已保存 · ••••••••••/);
  assert.match(controlCenter, /onDiscoverModels/);
  assert.match(controlCenter, /onRevealCredential/);
  assert.match(controlCenter, /provider-history-details/);
  assert.match(settings, /settings-section-navigation/);
  assert.match(settings, /props\.section === "home" \? "ai"/);
  assert.match(settingsCss, /grid-template-columns: minmax\(240px, 260px\) minmax\(0, 1fr\)/);
  assert.match(settingsCss, /@media \(max-width: 820px\)[\s\S]*?settings-section-navigation/);
});

test("provider metadata persistence never retains key, token, secret, or unknown fields", () => {
  const storage = memoryStorage();
  storage.setItem(CONTROL_CENTER_PREFERENCES_KEY, JSON.stringify({
    version: 1,
    providers: [{
      id: "provider-local-api-1",
      type: "local-api",
      name: "Local Draft",
      baseUrl: "http://127.0.0.1:8000/v1",
      apiKey: "must-not-survive",
      token: "must-not-survive",
      clientSecret: "must-not-survive",
      headers: { Authorization: "must-not-survive" }
    }]
  }));

  const loaded = readControlCenterPreferences(storage);
  assert.deepEqual(loaded.providers, [{
    id: "provider-local-api-1",
    type: "local-api",
    name: "Local Draft",
    baseUrl: "http://127.0.0.1:8000/v1",
    connectionStatus: "not-checked",
    credentialStatus: "not-configured",
    modelCatalogStatus: "placeholder"
  }]);

  saveControlCenterPreferences(storage, loaded);
  const serialized = storage.getItem(CONTROL_CENTER_PREFERENCES_KEY) || "";
  assert.equal(serialized.includes("must-not-survive"), false);
  assert.equal(serialized.includes("apiKey"), false);
  assert.equal(serialized.includes("clientSecret"), false);
  assert.equal(serialized.includes("Authorization"), false);
});

test("system skills come from canonical Skill Control and remain descriptor-only", () => {
  const projected = projectStoryStudioSystemSkills();
  assert.deepEqual(projected.map((skill) => skill.name), [
    "人物一致性检查",
    "世界设定检查",
    "时间线检查",
    "文风分析",
    "剧情分析"
  ]);
  assert.equal(projected.every((skill) => skill.availability === "descriptor-only" && skill.enabled === false), true);
  assert.equal(STORY_STUDIO_SYSTEM_SKILL_MANIFESTS.every((manifest) => manifest.adapterStatus === "descriptor_only"), true);
  assert.equal(STORY_STUDIO_SYSTEM_SKILL_MANIFESTS.every((manifest) => manifest.entrypoints.length === 0), true);
  assert.equal(STORY_STUDIO_SYSTEM_SKILL_MANIFESTS.every((manifest) => !manifest.permissions.writeProject && !manifest.permissions.useNetwork && !manifest.permissions.useApiKey), true);
});

test("appearance preferences restore from the versioned browser record", () => {
  const storage = memoryStorage();
  const initial = readControlCenterPreferences(storage);
  saveControlCenterPreferences(storage, {
    ...initial,
    appearance: {
      uiFontSize: "xlarge",
      editorFontSize: "large",
      sidebarWidth: "custom",
      sidebarCustomWidthPx: 276,
      tianyiPanelWidthPx: 444,
      editorWidth: "focus",
      sidebarCollapsed: true
    }
  });

  const restored = readControlCenterPreferences(storage);
  assert.deepEqual(restored.appearance, {
    uiFontSize: "xlarge",
    editorFontSize: "large",
    sidebarWidth: "custom",
    sidebarCustomWidthPx: 276,
    tianyiPanelWidthPx: 444,
    editorWidth: "focus",
    sidebarCollapsed: true
  });
});

test("legacy appearance records migrate without making small the new default", () => {
  const storage = memoryStorage();
  storage.setItem(CONTROL_CENTER_PREFERENCES_KEY, JSON.stringify({
    version: 1,
    appearance: {
      fontSize: "xlarge",
      sidebarDensity: "comfortable",
      editorWidth: "narrow",
      sidebarCollapsed: false
    }
  }));

  assert.deepEqual(readControlCenterPreferences(storage).appearance, {
    uiFontSize: "xlarge",
    editorFontSize: "standard",
    sidebarWidth: "custom",
    sidebarCustomWidthPx: 320,
    tianyiPanelWidthPx: 380,
    editorWidth: "focus",
    sidebarCollapsed: false
  });
  assert.equal(DEFAULT_CONTROL_CENTER_PREFERENCES.appearance.uiFontSize, "standard");
  assert.equal(DEFAULT_CONTROL_CENTER_PREFERENCES.appearance.editorFontSize, "standard");
});

test("sidebar collapsed state persists and restores with appearance settings", () => {
  const storage = memoryStorage();
  const initial = readControlCenterPreferences(storage);
  saveControlCenterPreferences(storage, {
    ...initial,
    appearance: { ...initial.appearance, sidebarCollapsed: true }
  });

  assert.equal(readControlCenterPreferences(storage).appearance.sidebarCollapsed, true);
  const app = source("apps/story-studio/src/App.tsx");
  const appShell = source("apps/story-studio/src/product-shell/AppShell.tsx");
  const worldLibrary = source("apps/story-studio/src/components/WorldLibraryPanel.tsx");
  const writingNavigator = source("apps/story-studio/src/components/WritingNavigator.tsx");
  assert.match(app, /collapsed=\{controlCenterPreferences\.appearance\.sidebarCollapsed\}/);
  assert.match(app, /sidebarCollapsed=\{controlCenterPreferences\.appearance\.sidebarCollapsed\}/);
  assert.match(appShell, /data-sidebar-collapsed=\{props\.sidebarCollapsed \? "true" : "false"\}/);
  assert.match(worldLibrary, /!props\.collapsed && <SidebarResizeHandle/);
  assert.match(writingNavigator, /!props\.collapsed && <SidebarResizeHandle/);
});

test("workflow and context surfaces are placeholders without execution controls", () => {
  const controlCenter = source("apps/story-studio/src/components/AIControlCenter.tsx");
  const app = source("apps/story-studio/src/App.tsx");
  assert.match(controlCenter, /章节完成后/);
  assert.match(controlCenter, /data-capability-status="not-enabled"/);
  assert.match(controlCenter, /尚未启用/);
  assert.match(controlCenter, /不会调用模型、不会执行 Skill、不会写入故事/);
  assert.match(app, /待 Context Layer 提供/);
  assert.doesNotMatch(controlCenter, /fetch\s*\(/);
  assert.doesNotMatch(controlCenter, /executeSkill|runWorkflow|compressContext/);
});

test("provider credential input rejects malformed or oversized clipboard content before transport", () => {
  assert.equal(normalizeProviderCredentialInput("  test-only-provider-key  "), "test-only-provider-key");
  assert.throws(() => normalizeProviderCredentialInput("short"), /API Key 输入异常/);
  assert.throws(() => normalizeProviderCredentialInput("a".repeat(MAXIMUM_PROVIDER_CREDENTIAL_CHARACTERS + 1)), /API Key 输入异常/);
  assert.throws(() => normalizeProviderCredentialInput("test-provider-key\nsecond-line"), /API Key 输入异常/);

  const controlCenter = source("apps/story-studio/src/components/AIControlCenter.tsx");
  assert.match(controlCenter, /maxLength=\{MAXIMUM_PROVIDER_CREDENTIAL_CHARACTERS\}/);
  assert.match(controlCenter, /normalizeProviderCredentialInput\(apiKey\)/);
});

test("display preferences use independent UI and editor tokens instead of body zoom", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const appShell = source("apps/story-studio/src/product-shell/AppShell.tsx");
  const styles = source("apps/story-studio/src/styles/app.css");

  assert.match(app, /uiFontSize=\{controlCenterPreferences\.appearance\.uiFontSize\}/);
  assert.match(app, /editorFontSize=\{controlCenterPreferences\.appearance\.editorFontSize\}/);
  assert.match(app, /sidebarWidth=\{controlCenterPreferences\.appearance\.sidebarWidth\}/);
  assert.match(app, /editorWidth=\{controlCenterPreferences\.appearance\.editorWidth\}/);
  assert.match(appShell, /data-ui-font-size=\{props\.uiFontSize\}/);
  assert.match(appShell, /data-editor-font-size=\{props\.editorFontSize\}/);
  assert.match(appShell, /data-sidebar-width=\{props\.sidebarWidth\}/);
  assert.match(appShell, /data-editor-width=\{props\.editorWidth\}/);
  assert.match(styles, /--ui-font-size:\s*15px/);
  assert.match(styles, /--editor-font-size:\s*18px/);
  assert.match(styles, /data-ui-font-size="large"[^}]+--ui-font-size:\s*17px/s);
  assert.match(styles, /data-ui-font-size="xlarge"[^}]+--ui-font-size:\s*20px/s);
  assert.match(styles, /data-editor-font-size="large"[^}]+--editor-font-size:\s*21px/s);
  assert.match(styles, /data-editor-font-size="xlarge"[^}]+--editor-font-size:\s*24px/s);
  assert.match(styles, /\.tianyi-quick-assistant\s*\{[^}]+--ui-font-size:\s*15px/s);
  assert.match(styles, /\.tianyi-quick-assistant\[data-ui-font-size="xlarge"\]\s*\{\s*--ui-font-size:\s*20px/s);
  assert.match(styles, /\.tianyi-quick-assistant\[data-editor-font-size="xlarge"\]\s*\{\s*--editor-font-size:\s*24px/s);
  assert.match(styles, /\[data-ui-font-size="xlarge"\]/);
  assert.match(styles, /\[data-editor-font-size="xlarge"\]/);
  assert.match(styles, /\.control-settings-surface p,[\s\S]+font-size:\s*var\(--ui-small-size\)/);
  assert.match(styles, /\.control-settings-surface label > span,[\s\S]+font-size:\s*var\(--ui-meta-size\)/);
  assert.match(styles, /\.object-card-block > header strong,[\s\S]+\.object-text-editor textarea,[\s\S]+font-size:\s*var\(--ui-font-size\)/);
  assert.match(styles, /\.property-row,[\s\S]+font-size:\s*var\(--ui-small-size\)/);
  assert.match(styles, /\.object-text-editor > span,[\s\S]+font-size:\s*var\(--ui-meta-size\)/);
  assert.doesNotMatch(styles, /\bzoom\s*:/);
});

function memoryStorage(): PreferenceStorage & { getItem(key: string): string | null } {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }
  };
}

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}
