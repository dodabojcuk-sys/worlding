import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Tianyi prepares and approves a compact Brief while Nuwa owns the full run and Result Receipt workspace", () => {
  const workspace = readFileSync("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx", "utf8");
  const briefReview = readFileSync("apps/story-studio/src/components/tianyi/TianyiBriefReview.tsx", "utf8");
  const briefProjection = readFileSync("apps/story-studio/src/components/tianyi/tianyiConversationBrief.ts", "utf8");
  const workbench = readFileSync("apps/story-studio/src/components/IntelligenceWorkbench.tsx", "utf8");
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");

  assert.match(briefReview, /收束本次天意/);
  assert.match(briefReview, /保存修改/);
  assert.match(briefReview, /确认简报/);
  assert.match(briefReview, /交给女娲/);
  assert.match(briefReview, /不会直接改写故事事实/);
  assert.match(briefProjection, /不得自动选择候选路线/);
  assert.match(briefProjection, /不得自动建立变更单/);
  assert.match(workspace, /<TianyiBriefReview/);
  assert.match(workspace, /controller\.startNuwa/);

  assert.match(workbench, /nuwa-bridge-contract/);
  assert.match(workbench, /结果回执/);
  assert.match(workbench, /已失效或部分完成的结果不可进入影响评审/);
  assert.match(workbench, /inspectableHistoricalResult/);
  assert.match(workbench, /返回原创作位置/);

  assert.match(app, /runExecutionBrief/);
  assert.match(app, /synthesizeExecutionBrief/);
  assert.match(app, /submitExecutionBriefRouteToImpact/);
  assert.match(app, /M0 Canon 读取未能确认精确事件回执/);
  assert.match(app, /sameBriefRevision/);
  assert.match(app, /setStoryExploration\(null\)/);
  assert.match(app, /setBridgeExplorationId\(null\)/);
  assert.match(app, /!nuwaResultReceipt\.impactReviewEligible/);
  assert.match(app, /story-studio-nuwa-return-snapshot\/v1/);
  assert.match(app, /tianyiReturnSnapshotRef\.current = snapshot\.shellSnapshot/);
  assert.match(app, /resolveProductShellReturnLocation/);
  assert.match(app, /nearest-stable-parent/);
  assert.match(app, /setSelection\(EMPTY_WORKSPACE_SELECTION\)/);
  assert.match(app, /shellSnapshot: ProductShellLocationSnapshot/);
  assert.match(app, /await returnFromTianyi\(\)/);
  assert.doesNotMatch(app, /submitStoryExplorationRoute\(/);
  assert.doesNotMatch(workbench, /auto(?:matically)? select|auto-create Change Set/i);
});
