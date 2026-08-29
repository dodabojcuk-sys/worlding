import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");

test("R0.3 runtime adapter reads established bootstrap and work-version projections without becoming an owner", () => {
  const app = source("apps/story-studio/src/App.tsx");
  const runtime = source("apps/story-studio/src/product-shell/runtime/TianyanShellRuntime.tsx");
  const shell = source("apps/story-studio/src/product-shell/TianyanR0Shell.tsx");
  const topbar = source("apps/story-studio/src/product-shell/topbar/GlobalStatusBar.tsx");

  assert.match(app, /TianyanShellRuntime/);
  assert.doesNotMatch(app, /localTransport|storyStudioWorkspaceOperations|providerGateway/);
  assert.match(runtime, /getBootstrap/);
  assert.match(runtime, /getCreationSourcePortState/);
  assert.match(runtime, /LocalFolderProvider/);
  assert.match(runtime, /getModelServiceStatus/);
  assert.match(runtime, /getAgentPermissionState/);
  assert.doesNotMatch(runtime, /createStoryStudioWorkspaceOperations|writeCanon|createEvent|setWorldState/);
  assert.match(shell, /runtime=\{props\.runtime\}/);
  assert.match(topbar, /props\.projectName/);
  assert.match(topbar, /props\.workVersionLabel/);
});

test("the compact Tianyi projection shares one real session and delegates to existing Question and Agent contracts", () => {
  const sidebar = source("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx");
  const composer = source("apps/story-studio/src/components/tianyi/composer/TianyiSidebarComposer.tsx");
  const viewModel = source("apps/story-studio/src/components/tianyi/tianyiAgentRunViewModel.ts");

  assert.doesNotMatch(sidebar, /shared-current-session/);
  assert.match(sidebar, /openTianyiSession/);
  assert.match(sidebar, /runTianyiQuestion/);
  assert.match(sidebar, /startTianyiAgentRun/);
  assert.match(sidebar, /recoverTianyiAgentRun/);
  assert.match(sidebar, /handoffTianyiAgentCandidate/);
  assert.match(sidebar, /agentPermissionProfile/);
  assert.match(sidebar, /permissionState\?\.profile/);
  assert.match(sidebar, /data-session-owner="story-continuity\/session"/);
  assert.match(sidebar, /props\.runtime\.sharedDraft/);
  assert.match(sidebar, /setMode\("agent"\)/);
  assert.doesNotMatch(sidebar, /TianyiAgentManagementSurface/);
  assert.match(sidebar, /agent-recognition-proposal/);
  assert.match(composer, /data-automatic-provider-calls="0"/);
  assert.match(composer, /props\.modelOptions/);
  assert.match(viewModel, /tianyiAgentRunStorageKey/);
  assert.match(viewModel, /currentTianyiAgentStep/);
});
