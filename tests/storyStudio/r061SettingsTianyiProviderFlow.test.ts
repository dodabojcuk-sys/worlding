import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

test("Provider settings submit only a one-time credential to the server owner and never expose it", () => {
  const settings = source("apps/story-studio/src/settings/agent/AgentSettingsSection.tsx");
  const route = source("apps/story-studio/src/settings/storage/SettingsStorageRoute.tsx");

  assert.match(settings, /type=\{showCredentialDraft \? "text" : "password"\}/);
  assert.match(settings, /autoComplete="new-password"/);
  assert.match(settings, /credentialInput\.current\?\.value\.trim/);
  assert.match(settings, /credentialInput\.current\.value = ""/);
  assert.match(settings, /credential\?\.configured \? "已锁定保存" : "未配置"/);
  assert.match(settings, /小眼睛只查看本次输入/);
  assert.match(settings, /显示本次输入的 API Key/);
  assert.doesNotMatch(settings, /credential\.suffix/);
  assert.doesNotMatch(settings, /revealProviderCredential/);
  assert.match(settings, /本机权威配置/);
  assert.doesNotMatch(settings, /name="modelId" required/);
  assert.match(settings, /<select id="provider-model-id"/);
  assert.match(settings, /请选择可用模型/);
  assert.match(settings, /手动填写模型 ID/);
  assert.match(settings, /首次保存不需要模型 ID/);
  assert.match(settings, /onDiscoverProviderModels/);
  assert.match(settings, /保存凭据并获取模型/);
  assert.match(route, /saveProviderProfile/);
  assert.match(route, /discoverProviderModels/);
  assert.ok(route.indexOf("saveProviderProfile({ ...input, token })") < route.indexOf("discoverProviderModels(token)"), "Credentials must be saved before model discovery");
  assert.match(route, /disableProviderProfile/);
});

test("Tianyi blocks unconfigured Providers before a request and opens Shell settings", () => {
  const sidebar = source("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx");
  const server = source("apps/story-studio/server/server.mjs");

  assert.match(sidebar, /const providerReady = props\.runtime\.modelStatus\?\.tianyiDialogue\.ready === true/);
  assert.ok(sidebar.indexOf("if (!providerReady)") < sidebar.indexOf("runTianyiQuestion({"), "Provider gate must precede dialogue execution");
  assert.match(sidebar, /data-provider-state="unconfigured"/);
  assert.match(sidebar, /onOpenSettings\(\): void/);
  assert.match(sidebar, /onClick=\{props\.onOpenSettings\}/);
  assert.match(sidebar, /disabled=\{busy \|\| !project \|\| !contextRequest \|\| !providerReady\}/);
  assert.match(server, /const selectedModelReady = configured && activeProfile\?\.enabled === true && Boolean\(activeProfile\.modelId\)/);
  assert.match(server, /const tianyiDialogueReady = selectedModelReady \|\| agentFakeProviderStreamAllowed/);
  assert.match(server, /"model-unselected"/);
  assert.match(server, /process\.env\.NODE_ENV !== "production" && process\.env\.TIANYAN_AGENT_FAKE_PROVIDER_STREAM === "1"/);
});

test("Settings expose the selected built-in Agent Runtime ABI without enabling external loading", () => {
  const settings = source("apps/story-studio/src/settings/agent/AgentSettingsSection.tsx");

  assert.match(settings, /data-agent-runtime-plugin=/);
  assert.match(settings, /agentRuntime\?\.manifest\?\.pluginVersion/);
  assert.match(settings, /agentRuntime\?\.manifest\?\.upstreamVersion/);
  assert.match(settings, /agentRuntime\?\.manifest\?\.hostApiRange/);
  assert.match(settings, /data-agent-runtime-update="check"/);
  assert.match(settings, /不会自动下载或执行第三方代码/);
});

test("Tool approval names its scope and supports an explicit author rejection", () => {
  const sidebar = source("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx");

  assert.match(sidebar, /rejectTianyiAgentStep/);
  assert.match(sidebar, /tianyi-agent-approval/);
  assert.match(sidebar, /tianyi\.toolImpactProposal/);
  assert.match(sidebar, /tianyi\.toolParameters/);
  assert.match(sidebar, /onClick=\{rejectStep\}/);
});

test("Visual acceptance targets the directory toggle by its stable owner, not a positional topbar selector", () => {
  const smoke = source("apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs");

  assert.match(smoke, /locator\('\[data-panel-toggle="project-directory"\]'\)/);
  assert.doesNotMatch(smoke, /const toggle = page\.locator\("\.shell-topbar-panel-toggle"\)/);
});

test("Standard browser verification waits for the product-owned Shell readiness signal", () => {
  const shell = source("apps/story-studio/src/product-shell/TianyanR0Shell.tsx");
  const smoke = source("apps/story-studio/scripts/tianyan-r0-shell-smoke.mjs");

  assert.match(shell, /data-connection-state=\{props\.runtime\.connectionState\}/);
  assert.match(smoke, /async function waitForProductReady/);
  assert.match(smoke, /getAttribute\("data-connection-state"\) === "ready"/);
  assert.doesNotMatch(smoke, /networkidle/);
});
