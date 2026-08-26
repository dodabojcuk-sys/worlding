import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { deriveTianyiV2CloseProjection, hasDurableTianyiV2CloseDecision, mapTianyiV2BriefChanges } from "../../apps/story-studio/src/components/tianyi/tianyiConversationBrief.ts";
import { selectResumableTianyiSession, selectSharedTianyiSession } from "../../apps/story-studio/src/components/tianyiSessionResume.ts";
import { normalizeRetiredUiLocation } from "../../apps/story-studio/src/lib/retiredUiReachability.ts";
import type { TianyiContextRequest, TianyiSessionMetadata } from "../../apps/story-studio/src/lib/localTransport.ts";
import { PRODUCT_WORKSPACE_MODES, resolveStoryStudioWorkspaceLocation } from "../../apps/story-studio/src/product-shell/navigation/topLevelDestinationRegistry.ts";

function fixtureSession(): TianyiSessionMetadata {
  return {
    id: "session.founder",
    contentHash: "hash.session.founder",
    eventCount: 4,
    openedAt: "2026-08-14T00:00:00.000Z",
    closed: false,
    retentionMode: "normal",
    recoverable: true,
    packEligible: true,
    candidateCount: 0,
    memoryCandidates: [],
    stoppingPointCandidates: [],
    decidedCandidateIds: [],
    groundedAttempts: [],
    visibleMessages: [
      { eventId: "event.a", sequence: 1, actor: "author", recordedAt: "2026-08-14T00:00:01.000Z", visibleContent: "雾中灯塔的主人不应该立刻离开。", receiptId: "receipt.a" },
      { eventId: "event.b", sequence: 2, actor: "tianyi", recordedAt: "2026-08-14T00:00:02.000Z", visibleContent: "天意整理：留下会保留悬念。", receiptId: "receipt.b" },
      { eventId: "event.c", sequence: 3, actor: "author", recordedAt: "2026-08-14T00:00:03.000Z", visibleContent: "谁在灯塔地下室留下了那张地图？", receiptId: "receipt.c" },
      { eventId: "event.d", sequence: 4, actor: "tianyi", recordedAt: "2026-08-14T00:00:04.000Z", visibleContent: "天意整理：地图可以作为下一步验证入口。", receiptId: "receipt.d" }
    ]
  };
}

function fixtureContext(): TianyiContextRequest {
  return {
    productMode: "world",
    activeOwner: { kind: "project", id: "project.founder" },
    selection: { documentId: null, objectId: null, timelinePointId: null },
    sourceRefs: [{ id: "source.founder", kind: "project", origin: "fixture" }],
    memorySelections: [],
    enabledSkillRefs: []
  };
}

test("retired Tianyi aliases and view queries canonicalize to the single official workspace", () => {
  assert.deepEqual(resolveStoryStudioWorkspaceLocation({ pathname: "/tianyi-v2", search: "" }), { id: "tianyi", migrated: true });
  assert.deepEqual(PRODUCT_WORKSPACE_MODES, ["world", "tianyi", "event-line", "multiverse", "nuwa", "library", "writing", "data"]);
  assert.deepEqual(normalizeRetiredUiLocation({ pathname: "/tianyi-v2", search: "?view=record" }), {
    pathname: "/tianyi",
    search: "",
    hash: "",
    changed: true,
    retiredSurface: "tianyi-v2-alias"
  });
  assert.deepEqual(normalizeRetiredUiLocation({ pathname: "/tianyi", search: "?view=spine" }).pathname, "/tianyi");
  assert.equal(normalizeRetiredUiLocation({ pathname: "/tianyi", search: "?view=spine" }).search, "");
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  assert.match(app, /normalizeRetiredUiLocation/);
  assert.match(app, /window\.history\.replaceState/);
  assert.match(app, /clearRetiredTianyiUiPreferencesFromBrowser/);
  assert.doesNotMatch(app, /DELETE_LATER/);
});

test("close projection is deterministic, five-way, and does not close the Session", () => {
  const first = deriveTianyiV2CloseProjection(fixtureSession());
  const second = deriveTianyiV2CloseProjection(fixtureSession());
  assert.deepEqual(first, second);
  assert.deepEqual(first.map((item) => item.category), ["author-decision", "open-question", "source-candidate", "story-candidate", "nuwa-question"]);
  assert.equal(new Set(first.map((item) => item.id)).size, 5);
  assert.equal(first.every((item) => item.decision === "pending"), true);
  assert.equal(first.some((item) => item.content.includes("地图")), true);
  assert.equal(first.find((item) => item.category === "source-candidate")?.content.includes("receipt."), false);
});

test("reject and defer decisions remain local and produce no durable brief", () => {
  const items = deriveTianyiV2CloseProjection(fixtureSession());
  assert.equal(hasDurableTianyiV2CloseDecision(items.map((item) => ({ ...item, decision: "rejected" as const }))), false);
  assert.equal(hasDurableTianyiV2CloseDecision(items.map((item) => ({ ...item, decision: "deferred" as const }))), false);
  assert.equal(hasDurableTianyiV2CloseDecision(items.map((item, index) => ({ ...item, decision: index === 0 ? "accepted" as const : "deferred" as const }))), true);
});

test("explicit Session rail selection reopens completed projections without making them resumable", () => {
  const closed = { ...fixtureSession(), id: "session.completed", closed: true };
  assert.equal(selectResumableTianyiSession([closed]), null);
  assert.equal(selectSharedTianyiSession([closed], closed.id)?.id, closed.id);
});

test("accepted and edited close items map only to existing Execution Brief fields", () => {
  const items = deriveTianyiV2CloseProjection(fixtureSession()).map((item, index) => ({
    ...item,
    decision: index === 0 ? "accepted" as const : index === 1 ? "edited" as const : index === 2 ? "rejected" as const : index === 4 ? "accepted" as const : "deferred" as const,
    editedContent: index === 1 ? "作者修改后的开放问题" : null
  }));
  const changes = mapTianyiV2BriefChanges({ session: fixtureSession(), contextRequest: fixtureContext(), items });
  assert.equal(changes.authorGoal, "验证：谁在灯塔地下室留下了那张地图？");
  assert.deepEqual(changes.mustKeep, ["雾中灯塔的主人不应该立刻离开。"]);
  assert.deepEqual(changes.unresolvedQuestions, ["作者修改后的开放问题", "验证：谁在灯塔地下室留下了那张地图？"]);
  assert.deepEqual(changes.selectedContextReceiptIds, []);
  assert.equal("briefId" in changes, false);
  assert.equal("canon" in changes, false);

  const acceptedSources = items.map((item) => item.category === "source-candidate" ? { ...item, decision: "accepted" as const } : item);
  assert.deepEqual(mapTianyiV2BriefChanges({ session: fixtureSession(), contextRequest: fixtureContext(), items: acceptedSources }).selectedContextReceiptIds, ["receipt.a", "receipt.b", "receipt.c", "receipt.d"]);
});

test("official Tianyi uses the thread surface without a generic world-data sidebar", () => {
  const app = readFileSync("apps/story-studio/src/App.tsx", "utf8");
  const workspace = readFileSync("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx", "utf8");
  const css = readFileSync("apps/story-studio/src/styles/tianyi.css", "utf8");
  const shellCss = readFileSync("apps/story-studio/src/styles/product-shell-r0.css", "utf8");
  const productNavigation = readFileSync("apps/story-studio/src/product-shell/navigation/ProductShellNavigation.tsx", "utf8");
  assert.match(app, /<ProductShellNavigation[\s\S]*?story-studio-workspace-stage/);
  assert.doesNotMatch(app, /showAllDestinations/);
  assert.match(app, /productMode === "tianyi" \? <TianyiWorkspace/);
  assert.match(app, /readLatestExecutionBridge/);
  assert.match(app, /readReceipt: readTianyiReceipt/);
  assert.match(app, /runGroundedQuestion: async \(input\)/);
  assert.match(app, /streamTianyiGroundedAnswer/);
  assert.doesNotMatch(app, /runTianyiQuestion/);
  assert.match(app, /sharedDraft=\{sharedTianyiDraft\}/);
  assert.match(app, /openNuwaWorkspace\(brief, exploration, "tianyi"\)/);
  assert.match(productNavigation, /destination\.authorNavigation === "global"/);
  assert.doesNotMatch(workspace, /finalizeTianyiSessionClose/);
  assert.doesNotMatch(workspace, /localStorage|indexedDB|applyAuthorChangeSet|CanonWriter/iu);
  assert.match(workspace, /<TianyiConversationThread/);
  assert.match(workspace, /<TianyiConversationRail/);
  assert.match(workspace, /<TianyiComposer/);
  assert.match(workspace, /const hasConversationHistory = Boolean\(controller\.session \|\| controller\.sessions\.length\)/);
  assert.match(workspace, /contextLabel !== "0"/);
  assert.match(workspace, /hasConversationHistory \? <button/);
  assert.match(workspace, /onSelectSession=\{\(sessionId\) => \{ props\.onSharedSessionId\(sessionId\); controller\.selectSession\(sessionId\)/u);
  const sessionController = readFileSync("apps/story-studio/src/components/tianyi/useTianyiSessionController.ts", "utf8");
  assert.match(sessionController, /const selected = sessions\.find\(\(candidate\) => candidate\.id === sessionId\);/u);
  assert.match(workspace, /告诉天意，你希望故事接下来如何生长/);
  assert.match(workspace, /role="tablist" aria-label="天意工作方式"/);
  assert.doesNotMatch(workspace, /role="tablist" aria-label="天意显示方式"|开始记录|开始对话/);
  assert.doesNotMatch(workspace, /label: "Agent"/);
  assert.match(workspace, /onReturnProject/);
  assert.match(workspace, /来源与技术详情/);
  assert.doesNotMatch(workspace, /deterministic preview|offline Provider|来源 Receipt|Receipts|operation key|Brief revision/);
  assert.equal(existsSync("apps/story-studio/src/components/TianyiWorkspace.tsx"), false);
  assert.equal(existsSync("apps/story-studio/src/components/tianyi/TianyiCompanionPanel.tsx"), false);
  assert.doesNotMatch(css, /story-studio-shell\[data-product-mode="tianyi"\] > \.product-shell-navigation/);
  assert.match(css, /\.tianyi-workspace \{ box-sizing: border-box; height: calc\(100dvh - 56px\); min-height: 0; padding-bottom: calc\(max\(var\(--r1-mobile-nav-height, 70px\), 70px\) \+ 16px\); \}/);
  assert.match(shellCss, /\.story-studio-shell > \.story-studio-workspace-stage > \.tianyi-workspace \{[\s\S]*?height: calc\(100dvh - 56px\);[\s\S]*?min-height: 0;/);
  assert.match(css, /\.tianyi-conversation-main \{ box-sizing: border-box; height: 100%; padding-bottom: 16px; \}/);
  assert.match(css, /\.tianyi-composer \{ position: relative; bottom: 16px; width: calc\(100% - 20px\); margin-bottom: 8px; border-radius: 13px; \}/);
  assert.match(shellCss, /\.story-studio-shell \{[\s\S]*?grid-template-columns: var\(--r1-rail-width\) minmax\(0, 1fr\)/);
});
