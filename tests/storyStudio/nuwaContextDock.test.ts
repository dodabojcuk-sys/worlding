import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { TOP_LEVEL_DESTINATION_REGISTRY } from "../../apps/story-studio/src/product-shell/navigation/topLevelDestinationRegistry.ts";

test("Nuwa is a direct global workspace over the existing Brief, Exploration, RunPack, and review owners", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const workspace = readFileSync("apps/story-studio/src/components/NuwaPrimaryWorkspace.tsx", "utf8");
  const eventLine = readFileSync("apps/story-studio/src/components/EventLineWorkbench.tsx", "utf8");
  const bridge = readFileSync("src/storyControlSurface/storyStudioIntelligenceBridgeOperations.ts", "utf8");
  const shellCss = readFileSync("apps/story-studio/src/styles/product-shell-r0.css", "utf8");
  const pageDock = readFileSync("apps/story-studio/src/components/PageContextDock.tsx", "utf8");

  assert.match(app, /<NuwaPrimaryWorkspace/);
  assert.match(app, /readLatestExecutionBridge\(library\.project\.id, connectedToken\)/);
  assert.match(app, /void hydrateNuwaWorkspace\(\)/);
  assert.match(app, /onRunBound=\{\(\) => void runExplorationAction\("run"\)\}/);
  assert.match(app, /onSynthesizeBound=\{\(\) => void runExplorationAction\("synthesize"\)\}/);
  assert.match(app, /onSubmitBoundRoute=\{\(routeId\) => void submitExplorationRoute\(routeId\)\}/);
  assert.match(app, /const \[nuwaPageDockState, setNuwaPageDockState\]/);
  assert.match(app, /dockState=\{nuwaPageDockState\}/);
  assert.match(app, /onDockState=\{setNuwaPageDockState\}/);
  assert.doesNotMatch(app, /activeLens === "tianyi"/);
  assert.doesNotMatch(app, /<NuwaContextDock|data-testid="nuwa-global-launcher"/);
  assert.doesNotMatch(eventLine, /StoryWorkspaceNavigation|onOpenNuwa/);
  assert.match(eventLine, /sectionLabel="事件线"/);

  assert.match(workspace, /女娲 · 单元排演/);
  assert.match(workspace, /latestRehearsalRevision/);
  assert.match(workspace, /orderedEvents/);
  assert.match(workspace, /影响评审/);
  assert.match(workspace, /NuwaPageDock/);
  for (const lens of ["context", "observation", "branch", "review", "control"]) assert.match(workspace, new RegExp(`id: "${lens}"`));
  assert.doesNotMatch(workspace, /id: "tianyi"/);
  assert.doesNotMatch(workspace, /WorkflowRail|nuwa-workflow-rail|nuwa-comparison-workspace|setSurface\("director"\)|setSurface\("comparison"\)/);
  assert.match(workspace, /NuwaDirectorPermissionWorkspace/);
  assert.match(workspace, /这是一次排演 Run，不是故事事实/);
  assert.match(workspace, /Provider 调用 0/);
  // R5 adds a compact, presentation-only stage strip. It is not the retired
  // goal/plan/run/compare/review workflow owner.
  assert.doesNotMatch(workspace, /data-stage-id|GoalStage|PlanStage|RunStage|CompareStage/);
  assert.doesNotMatch(workspace, /fetch\(|applyAuthorChangeSet|createNuwaPlan/);
  assert.match(bridge, /rehearsal: loaded\.rehearsal/);
  assert.match(shellCss, /nuwa-rehearsal-stream/);
  assert.match(shellCss, /@container story-studio-shell \(max-width: 1120px\)/);
  assert.match(shellCss, /@media \(max-width: 500px\)[\s\S]*\.page-context-dock \{ position: fixed/);
  assert.match(pageDock, /PageContextDockState/);
  assert.match(pageDock, /event\.key !== "Escape"/);
  assert.match(pageDock, /requestAnimationFrame.*focus/);

  const nuwa = TOP_LEVEL_DESTINATION_REGISTRY.find((destination) => destination.id === "nuwa");
  assert.equal(nuwa?.displayName, "女娲");
  assert.equal(nuwa?.authorNavigation, "global");
});

test("legacy Nuwa form and story-subworkspace presentation sources are no longer present", () => {
  assert.equal(existsSync("apps/story-studio/src/components/NuwaContextDock.tsx"), false);
  assert.equal(existsSync("apps/story-studio/src/components/StoryWorkspaceNavigation.tsx"), false);
  const workspace = readFileSync("apps/story-studio/src/components/NuwaPrimaryWorkspace.tsx", "utf8");
  assert.doesNotMatch(workspace, /新建排演|故事排演工作区|女娲五阶段|当前阶段 \{currentStageIndex/);
});

test("Impact Review remains a separate author-control boundary", () => {
  const source = readFileSync("apps/story-studio/src/components/IntelligenceWorkbench.tsx", "utf8");
  assert.match(source, /impact-review-summary/);
  assert.match(source, /ReviewLifecycleRail/);
  assert.match(source, /只有确认应用受保护变化才会写入/);
  assert.match(source, /sectionLabel="女娲"/);
  assert.match(source, /返回女娲/);
});

test("Nuwa page tools and Tianyi assistant keep independent owners and hierarchy", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const workspace = readFileSync("apps/story-studio/src/components/NuwaPrimaryWorkspace.tsx", "utf8");
  const tianyiPage = readFileSync("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx", "utf8");
  const tianyiDock = readFileSync("apps/story-studio/src/components/TianyiQuickAssistant.tsx", "utf8");
  const globalHeader = readFileSync("apps/story-studio/src/product-shell/GlobalHeader.tsx", "utf8");
  const css = readFileSync("apps/story-studio/src/styles/product-shell-r0.css", "utf8");

  assert.match(app, /const \[nuwaPageDockState, setNuwaPageDockState\]/);
  assert.match(app, /const \[tianyiQuickPlacement, setTianyiQuickPlacement\]/);
  assert.match(app, /setTianyiQuickPlacement\("pinned"\)/);
  assert.match(globalHeader, /data-testid="tianyi-quick-launcher"/, "one global Dock trigger is exposed to the author");
  assert.match(globalHeader, /aria-label=\{props\.tianyiOpen \? "关闭天意助手" : "打开天意助手"\}/);
  assert.match(app, /<NuwaPrimaryWorkspace[\s\S]*?dockState=\{nuwaPageDockState\}[\s\S]*?onDockState=\{setNuwaPageDockState\}/);
  assert.match(workspace, /aria-label="返回天意工作台"/);
  assert.match(workspace, /PageContextDock/);
  assert.doesNotMatch(workspace, /id: "tianyi"|tianyiDockOpen|onCloseTianyi/);
  assert.match(tianyiPage, /<TianyiConversationThread/);
  assert.match(tianyiPage, /<TianyiComposer/);
  assert.doesNotMatch(tianyiPage, /role="tablist" aria-label="天意显示方式"/);
  assert.doesNotMatch(tianyiPage, /tianyi-dock-agent-panel|>Agent</);
  assert.match(tianyiDock, /data-right-dock-slot="tianyi"/);
  assert.match(tianyiDock, /role="tablist" aria-label="天意工作方式"/);
  assert.doesNotMatch(tianyiDock, />创意</, "Creative is the full Tianyi workspace, not a second Dock workspace");
  for (const mode of ["对话", "工作"]) assert.match(tianyiDock, new RegExp(`>${mode}</`));
  assert.match(tianyiDock, /presentation="dock"/);
  assert.match(css, /\.story-studio-workspace-stage \{\n  display: grid;[\s\S]*?overflow: visible;/);
  assert.match(css, /\.story-studio-workspace-stage\[data-tianyi-quick-placement="pinned"\][\s\S]*grid-template-columns: minmax\(0, 1fr\) var\(--tianyi-panel-width\)/);
});
