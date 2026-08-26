import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { deriveTianyiShellContext } from "../../apps/story-studio/src/components/tianyiShellContext.ts";
import { TOP_LEVEL_DESTINATION_REGISTRY } from "../../apps/story-studio/src/product-shell/navigation/topLevelDestinationRegistry.ts";
import { EMPTY_WORKSPACE_SELECTION } from "../../src/productWorkspace/storyStudioWorkspaceSelection.ts";

type ContextInput = Parameters<typeof deriveTianyiShellContext>[0];

test("author workflow navigation exposes one Tianyi identity through quick and full surfaces", () => {
  const registry = readFileSync("apps/story-studio/src/product-shell/navigation/topLevelDestinationRegistry.ts", "utf8");
  const shellNav = readFileSync("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx", "utf8");
  const page = readFileSync("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx", "utf8");
  const quickAssistant = readFileSync("apps/story-studio/src/components/TianyiQuickAssistant.tsx", "utf8");
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const appShell = readFileSync("apps/story-studio/src/product-shell/AppShell.tsx", "utf8");
  const globalHeader = readFileSync("apps/story-studio/src/product-shell/GlobalHeader.tsx", "utf8");
  const dockHost = readFileSync("apps/story-studio/src/product-shell/GlobalTianyiDockHost.tsx", "utf8");

  assert.deepEqual(TOP_LEVEL_DESTINATION_REGISTRY.map((destination) => destination.id), ["world", "tianyi", "event-line", "multiverse", "nuwa", "library", "writing", "data"]);
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.find((destination) => destination.id === "tianyi")?.displayName, "天意");
  assert.match(registry, /STORY_STUDIO_WORKSPACE_REGISTRY/);
  assert.match(shellNav, /authorGlobalDestinations\.map/);
  assert.match(shellNav, /authorNavigation === "global"/);
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.find((destination) => destination.id === "nuwa")?.authorNavigation, "global");
  assert.equal(TOP_LEVEL_DESTINATION_REGISTRY.find((destination) => destination.id === "event-line")?.displayName, "事件线");
  assert.match(page, /data-testid="tianyi-workspace"/);
  assert.match(page, /<TianyiConversationThread/);
  assert.match(page, /<TianyiComposer/);
  assert.doesNotMatch(page, /role="tablist" aria-label="天意显示方式"/);
  assert.doesNotMatch(page, /开始记录|开始对话|切换显示方式/);
  assert.doesNotMatch(page, /tianyi-dock-agent-panel|>Agent</);
  assert.match(quickAssistant, /data-testid="tianyi-quick-assistant"/);
  assert.match(quickAssistant, /data-tianyi-session-owner="story-continuity\/session"/);
  assert.match(globalHeader, /data-testid="tianyi-quick-launcher"/);
  assert.match(globalHeader, /aria-label=\{props\.tianyiOpen \? "关闭天意助手" : "打开天意助手"\}/);
  assert.match(dockHost, /data-global-tianyi-dock-host="true"/);
  assert.match(app, /openNuwaWorkspace[\s\S]*?setTianyiQuickPlacement\("pinned"\)/);
  assert.match(quickAssistant, /type TianyiQuickPlacement/);
  assert.match(quickAssistant, /aria-modal=\{isWorkVersionCreationFixture && window\.matchMedia\("\(max-width: 1120px\)"\)\.matches\}/);
  assert.match(app, /<GlobalHeader[\s\S]*?onToggleTianyi=\{activateGlobalTianyi\}/);
  assert.match(appShell, /data-outer-sidebar="visible"/);
  assert.match(app, /sharedSessionId=\{sharedTianyiSessionId\}/);
  assert.match(app, /onSharedSessionId=\{updateSharedTianyiSessionId\}/);
  assert.match(app, /draft=\{sharedTianyiDraft\}/);
  assert.match(app, /onDraft=\{updateSharedTianyiDraft\}/);
  assert.match(app, /runGroundedQuestion=\{tianyiV2Operations\.runGroundedQuestion\}/);
  assert.match(app, /<TianyiWorkspace/);
  assert.match(app, /productMode === "tianyi" \? <TianyiWorkspace/);
  assert.match(app, /<ProductShellNavigation[\s\S]*?<GlobalHeader[\s\S]*?story-studio-workspace-stage/);
  assert.doesNotMatch(app, /get\("founderPreview"\) === "tianyi-v2"/);
  assert.doesNotMatch(app, /from "\.\/components\/(?:IntelligenceCluster|TianyiShell)"|<TianyiShell/);
  assert.match(app, /function openIntelligence[\s\S]*?restoreProductWorkspace\("nuwa"\);[\s\S]*?setTianyiSurface\("intelligence"\);/);
});

test("Tianyi shell context is derived from current product-safe projections", () => {
  const base = baseInput();
  assert.deepEqual(deriveTianyiShellContext(base), {
    mode: "world",
    contextKind: "project",
    contextLabel: "雾中灯塔",
    sourceLabels: ["世界", "当前项目"],
    canOpenSource: true
  });

  const scene = deriveTianyiShellContext({
    ...base,
    mode: "writing",
    writingDocument: { id: "scene.one", type: "scene", title: "铁门前的迟疑", body: "SECRET PROSE MUST NOT PROJECT" } as ContextInput["writingDocument"]
  });
  assert.equal(scene.contextKind, "scene");
  assert.equal(scene.contextLabel, "铁门前的迟疑");
  assert.equal(JSON.stringify(scene).includes("SECRET PROSE"), false);

  const chapter = deriveTianyiShellContext({
    ...base,
    mode: "writing",
    writingDocument: { id: "chapter.one", type: "chapter", title: "第一章", body: "PRIVATE CHAPTER PROSE" } as ContextInput["writingDocument"]
  });
  assert.equal(chapter.contextKind, "scene");
  assert.equal(chapter.contextLabel, "第一章");
  assert.deepEqual(chapter.sourceLabels, ["写作", "当前章节"]);
  assert.equal(JSON.stringify(chapter).includes("PRIVATE CHAPTER PROSE"), false);

  const object = { id: "character.lin", title: "林远", type: "character", body: "COPIED CHARACTER PROSE" } as ContextInput["activeObject"];
  const card = deriveTianyiShellContext({ ...base, showWorldHome: false, activeObject: object });
  assert.equal(card.contextKind, "object");
  assert.equal(card.contextLabel, "林远");
  assert.equal(JSON.stringify(card).includes("COPIED CHARACTER PROSE"), false);

  const map = { id: "visual.map", type: "map", title: "灯塔海域" } as ContextInput["visualWorkbench"] extends infer _Workbench ? NonNullable<ContextInput["visualWorkbench"]>["primaryDocument"] : never;
  const mapSelection = deriveTianyiShellContext({
    ...base,
    showWorldHome: false,
    workspaceMode: "map",
    activeObject: null,
    visualWorkbench: { primaryDocument: map, secondaryDocument: null, splitView: false } as ContextInput["visualWorkbench"],
    visualObject: object,
    objects: [object],
    selection: { objectId: "character.lin", source: "map-marker", documentId: "visual.map", blockId: null, relationId: null }
  });
  assert.equal(mapSelection.contextKind, "visual-selection");
  assert.equal(mapSelection.contextLabel, "林远");
  assert.deepEqual(mapSelection.sourceLabels, ["地图", "人物"]);

  const missing = deriveTianyiShellContext({
    ...base,
    showWorldHome: false,
    workspaceMode: "map",
    activeObject: null,
    visualWorkbench: { primaryDocument: map, secondaryDocument: null, splitView: false } as ContextInput["visualWorkbench"],
    selection: { objectId: "character.missing", source: "map-marker", documentId: "visual.map", blockId: null, relationId: null }
  });
  assert.equal(missing.contextKind, "unavailable");
  assert.equal(missing.contextLabel, "");

  assert.equal(deriveTianyiShellContext({ ...base, mode: "publish" }).contextKind, "unavailable");
  assert.equal(deriveTianyiShellContext({ ...base, mode: "localization" }).contextKind, "unavailable");

  const intelligence = deriveTianyiShellContext({
    ...base,
    mode: "intelligence",
    intelligenceDocument: "supervisor",
    writingDocument: { id: "scene.one", type: "scene", title: "铁门前的迟疑", body: "SECRET PROSE MUST NOT PROJECT" } as ContextInput["writingDocument"]
  });
  assert.deepEqual(intelligence, {
    mode: "intelligence",
    contextKind: "review",
    contextLabel: "女娲",
    sourceLabels: ["推演", "铁门前的迟疑"],
    canOpenSource: true
  });
  assert.equal(JSON.stringify(intelligence).includes("SECRET PROSE"), false);
});

function baseInput(): ContextInput {
  return {
    mode: "world",
    project: { id: "mist-lighthouse", title: "雾中灯塔" } as ContextInput["project"],
    showWorldHome: true,
    workspaceMode: "library",
    activeObject: null,
    visualWorkbench: null,
    visualObject: null,
    objects: [],
    selection: EMPTY_WORKSPACE_SELECTION,
    writingDocument: null,
    intelligenceDocument: "impact-review",
    impactReview: null
  };
}
