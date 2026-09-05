import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

test("settings always uses the Shell workspace, including direct settings URLs", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const route = source("apps/story-studio/src/settings/storage/SettingsStorageRoute.tsx");
  const agent = source("apps/story-studio/src/settings/agent/AgentSettingsSection.tsx");
  const settingsStyles = source("apps/story-studio/src/styles/settings.css");
  const shell = source("apps/story-studio/src/product-shell/TianyanR0Shell.tsx");
  assert.doesNotMatch(app, /SettingsStorageRoute|utilityRoute|pathname\.startsWith\("\/settings\/"\)/);
  assert.match(route, /data-settings-route=\{presentation\}/);
  assert.doesNotMatch(route, /settings-utility-nav/);
  assert.match(route, /settings-workspace-nav/);
  assert.match(route, /activeSection === "storage"/);
  assert.match(route, /activeSection === "transfer"/);
  assert.match(route, /activeSection === "agent"/);
  assert.match(route, /Provider 与模型/);
  assert.match(route, /Pi Agent 运行时/);
  assert.match(route, /settings-agent-permissions/);
  assert.match(route, /scrollIntoView\(\{ block: "start" \}\)/);
  assert.match(shell, /const isSettingsRoute = \(\) => window\.location\.pathname === "\/settings"/);
  assert.match(shell, /const \[settingsOpen, setSettingsOpen\] = useState\(isSettingsRoute\)/);
  assert.match(shell, /window\.history\.pushState\(\{\}, "", "\/settings"\)/);
  assert.match(route, /SettingsStorageSection/);
  assert.match(route, /SettingsTransferSection/);
  assert.match(route, /AgentSettingsSection/);
  assert.match(route, /getModelServiceStatus/);
  assert.match(route, /getAgentPermissionState/);
  assert.match(route, /setAgentPermissionProfile/);
  assert.match(agent, /data-agent-runtime="pi"/);
  assert.match(agent, /Provider Gateway/);
  assert.match(agent, /agent-default-permission/);
  assert.match(agent, /id="settings-agent-runtime"/);
  assert.match(agent, /id="settings-agent-provider"/);
  assert.match(agent, /id="settings-agent-permissions"/);
  assert.match(settingsStyles, /\.settings-workspace-nav \{[\s\S]*position: sticky;[\s\S]*max-height: calc\(100dvh/);
  assert.match(settingsStyles, /overscroll-behavior: contain/);
  assert.match(shell, /onSettings=\{openSettings\}/);
  assert.match(shell, /settingsOpen=\{settingsOpen\}/);
  assert.match(shell, /!settingsOpen && !accountOpen && directoryOpen/);
  assert.doesNotMatch(shell, /SettingsStorageSection|SettingsTransferSection|AgentSettingsSection|getModelServiceStatus|getAgentPermissionState|setAgentPermissionProfile/);
  assert.match(shell, /requested === "collapsed" \|\| requested === "expanded" \? requested : "expanded"/);
});

test("personal center uses the same Shell workspace pattern without faking account mutations", () => {
  const shell = source("apps/story-studio/src/product-shell/TianyanR0Shell.tsx");
  const outlet = source("apps/story-studio/src/product-shell/workspace/ShellWorkspaceOutlet.tsx");
  const account = source("apps/story-studio/src/product-shell/workspace/AccountCenterWorkspace.tsx");
  assert.match(shell, /const openAccount = \(\) => \{/);
  assert.match(shell, /data-account-open=\{accountOpen\}/);
  assert.match(outlet, /if \(props\.accountOpen\) return <AccountCenterWorkspace \/>;/);
  assert.match(account, /settings-workspace-layout/);
  assert.match(account, /settings-workspace-nav/);
  assert.match(account, /settings-card account-center-card/);
  assert.match(account, /个人信息/);
  assert.match(account, /待接入账户服务/);
  assert.match(account, /当前不会伪造这些操作/);
  assert.doesNotMatch(account, /onClick=|fetch\(|localStorage/);
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
  assert.equal((topbar.match(/data-panel-toggle="tianyi-agent"/gu) ?? []).length, 1);
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
