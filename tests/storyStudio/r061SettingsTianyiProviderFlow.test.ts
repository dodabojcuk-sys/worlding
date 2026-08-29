import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file: string) => readFileSync(file, "utf8");

test("Provider settings submit only a one-time credential to the server owner and never expose it", () => {
  const settings = source("apps/story-studio/src/settings/agent/AgentSettingsSection.tsx");
  const route = source("apps/story-studio/src/settings/storage/SettingsStorageRoute.tsx");

  assert.match(settings, /type="password"/);
  assert.match(settings, /autoComplete="new-password"/);
  assert.match(settings, /credentialInput\.current\?\.value\.trim/);
  assert.match(settings, /credentialInput\.current\.value = ""/);
  assert.match(settings, /已配置\$\{credential\.suffix/);
  assert.doesNotMatch(settings, /revealProviderCredential/);
  assert.match(route, /saveProviderProfile/);
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
  assert.match(server, /const tianyiDialogueReady = configured \|\| agentFakeProviderStreamAllowed/);
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
