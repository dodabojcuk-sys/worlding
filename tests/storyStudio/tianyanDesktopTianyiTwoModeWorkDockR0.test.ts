import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY, getTianyiContextualCapability } from "../../src/storyAgent/contextualCapabilityRegistry.ts";
import { TOP_LEVEL_DESTINATION_REGISTRY } from "../../apps/story-studio/src/product-shell/navigation/topLevelDestinationRegistry.ts";

const source = (path: string) => readFileSync(path, "utf8");

test("Tianyi keeps the primary two author modes while the R0.2 sidebar exposes dialogue and Agent", () => {
  const workspace = source("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx");
  const sidebar = source("apps/story-studio/src/components/tianyi/sidebar/TianyiSidebar.tsx");
  const modes = source("apps/story-studio/src/components/tianyi/sidebar/TianyiModeSwitch.tsx");
  assert.match(workspace, /TianyiCollaborationMode = "creative" \| "conversation"/);
  assert.doesNotMatch(workspace, /mode === "agent"|label: "Agent"|TianyiAgentManagementSurface/);
  assert.match(workspace, /onOpenWorkDock/);
  assert.match(modes, /TianyiSidebarMode = "dialogue" \| "agent"/);
  assert.match(modes, /t\("tianyi\.dialogue"\)/);
  assert.match(modes, /t\("tianyi\.agent"\)/);
  assert.match(sidebar, /data-shared-session-id=\{props\.runtime\.sharedSessionId/);
  assert.match(sidebar, /setMode\("agent"\)/);
  assert.match(sidebar, /runTianyiQuestion/);
  assert.match(sidebar, /startTianyiAgentRun/);
  assert.doesNotMatch(sidebar, /providerGateway|TianyiAgentManagementSurface/);
});

test("the contextual registry covers eight spaces without becoming a semantic owner", () => {
  assert.deepEqual(TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY.map((item) => item.space), ["world", "tianyi", "event-line", "multiverse", "nuwa", "library", "writing", "data"]);
  assert.equal(TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY.every((item) => item.capabilities.length > 0), true);
  assert.equal(getTianyiContextualCapability("unknown").space, "tianyi");
  assert.equal(TIANYI_CONTEXTUAL_CAPABILITY_REGISTRY.some((item) => item.capabilities.some((capability) => /createWorldObject|CanonWriter|RelationRepository|MemoryWriter/u.test(JSON.stringify(capability)))), false);
});

test("Data is a desktop read-only projection and remains separate from Settings data operations", () => {
  const data = source("apps/story-studio/src/components/DataWorkspace.tsx");
  const registry = source("src/storyContracts/storyStudioWorkspaceRegistry.ts");
  assert.match(registry, /id: "data", route: "\/data"/);
  assert.match(registry, /mobile: "hidden"/);
  assert.match(data, /data-testid="data-workspace"/);
  assert.match(data, /尚未分析/);
  assert.match(data, /缺少数据/);
  assert.match(data, /onOpenWorkDock/);
  assert.doesNotMatch(data, /createWorldObject|createRelation|writeCanon|Provider\(/u);
});
