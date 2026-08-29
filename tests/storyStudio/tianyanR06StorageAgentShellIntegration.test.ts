import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

test("settings changes the Shell workspace while keeping a direct utility-route fallback", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const route = source("apps/story-studio/src/settings/storage/SettingsStorageRoute.tsx");
  const agent = source("apps/story-studio/src/settings/agent/AgentSettingsSection.tsx");
  const shell = source("apps/story-studio/src/product-shell/TianyanR0Shell.tsx");
  assert.match(app, /pathname\.startsWith\("\/settings\/"\)/);
  assert.match(route, /data-settings-route=\{presentation\}/);
  assert.doesNotMatch(route, /settings-utility-nav/);
  assert.match(route, /settings-workspace-nav/);
  assert.match(route, /activeSection === "storage"/);
  assert.match(route, /activeSection === "transfer"/);
  assert.match(route, /activeSection === "agent"/);
  assert.match(route, /当前作品：/);
  assert.match(route, /SettingsStorageSection/);
  assert.match(route, /SettingsTransferSection/);
  assert.match(route, /AgentSettingsSection/);
  assert.match(route, /getModelServiceStatus/);
  assert.match(route, /getAgentPermissionState/);
  assert.match(route, /setAgentPermissionProfile/);
  assert.match(agent, /data-agent-runtime="pi"/);
  assert.match(agent, /Provider Gateway/);
  assert.match(agent, /agent-default-permission/);
  assert.match(shell, /onSettings=\{openSettings\}/);
  assert.match(shell, /settingsOpen=\{settingsOpen\}/);
  assert.match(shell, /!settingsOpen && directoryOpen/);
  assert.doesNotMatch(shell, /SettingsStorageSection|SettingsTransferSection|AgentSettingsSection|getModelServiceStatus|getAgentPermissionState|setAgentPermissionProfile/);
  assert.match(shell, /requested === "collapsed" \|\| requested === "expanded" \? requested : "expanded"/);
});

test("Pi artifact wiring uses the Workspace-owned policy and checks WorkVersion before the formal owner", () => {
  const server = source("apps/story-studio/server/server.mjs");
  const policy = source("src/storyWorkspace/workspacePathPolicy.ts");
  const tools = source("src/storyAgent/tianyiProductTools.ts");
  assert.match(server, /const workspacePathPolicy = createWorkspacePathPolicy\(\)/);
  assert.match(server, /workspacePathPolicy,[\s\S]*active !== command\.workVersionId[\s\S]*operations\.createOutputArtifact\(command\)/);
  assert.match(tools, /workVersionId: scope\.workVersionId/);
  assert.match(tools, /workspacePathPolicy\?\.assertArtifactRelativePath/);
  assert.match(policy, /isWorkspaceExportPath/);
  assert.match(policy, /startsWith\("artifacts\/"\)/);
  assert.doesNotMatch(tools, /node:fs|node:path|absolutePath|projectRoot/);
});

test("one pending projection edits Agent proposals and formal owner completes before final candidate decision", () => {
  const pending = source("apps/story-studio/src/product-shell/project-directory/PendingReviewPanel.tsx");
  const operations = source("src/storyControlSurface/storyStudioAgentProposalOperations.ts");
  assert.match(pending, /listAgentRecognitionProposals/);
  assert.match(pending, /editAgentRecognitionProposal/);
  assert.match(pending, /confirmAgentRecognitionObject/);
  assert.match(pending, /AgentProposalEditor/);
  const formalWrite = operations.indexOf("workspaceOperations.createWorldObjectFromAgentProposalOnce");
  const finalDecision = operations.indexOf("completeAgentRecognitionApplication", formalWrite);
  assert.ok(formalWrite > 0 && finalDecision > formalWrite, "formal World Object owner must write before the proposal reaches its final decision");
  assert.match(operations, /beginAgentRecognitionApplication[\s\S]*try \{[\s\S]*completeAgentRecognitionApplication[\s\S]*failIfStillActive/);
});

test("topbar has one search and one directory switch without deleting the other global controls", () => {
  const topbar = source("apps/story-studio/src/product-shell/topbar/GlobalStatusBar.tsx");
  const navigation = source("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx");
  assert.equal((topbar.match(/<GlobalSearchControl\b/gu) ?? []).length, 1);
  assert.equal((topbar.match(/data-panel-toggle="project-directory"/gu) ?? []).length, 1);
  assert.equal((topbar.match(/data-panel-toggle="global-tianyi"/gu) ?? []).length, 1);
  assert.match(topbar, /toggleLocale/);
  assert.match(topbar, /onToggleTheme/);
  assert.match(topbar, /onToggleTianyi/);
  assert.match(topbar, /shell-runtime-status/);
  assert.match(topbar, /shell-project-selector-menu/);
  assert.match(navigation, /data-shell-utility="settings"/);
});

test("portable layout includes durable continuity but excludes cache, locks, runs and secrets", () => {
  const layout = source("src/storyWorkspace/workspaceLayoutV1.ts");
  assert.match(layout, /internalDurable: \["continuity\/"/);
  assert.match(layout, /"\.world-os\/runs\/"/);
  assert.match(layout, /"\.world-os\/continuity-locks\/"/);
  assert.match(layout, /credentials\?\|secrets\?/);
});
