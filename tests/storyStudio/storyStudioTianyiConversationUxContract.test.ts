import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

import { buildTianyiThreadProjection, deriveTianyiThreadBriefDraft, mapTianyiThreadBriefChanges, type TianyiThreadBriefDraft } from "../../apps/story-studio/src/components/tianyi/tianyiConversationBrief.ts";
import type { TianyiContextRequest, TianyiNuwaExecutionBrief, TianyiSessionMetadata } from "../../apps/story-studio/src/lib/localTransport.ts";

type TianyiController = {
  session: TianyiSessionMetadata | null;
  briefDraft: { authorGoal: string } | null;
  draft: string;
  setDraft(value: string): void;
  sendMode: "ask" | "record";
  setSendMode(mode: "ask" | "record"): void;
  send(mode?: "ask" | "record"): Promise<{ ok: boolean }>;
  beginCloseReview(): void;
  updateBriefDraft(patch: { authorGoal: string }): void;
  saveBrief(): Promise<void>;
  approveBrief(): Promise<{ ok: boolean }>;
  startNuwa(): Promise<{ ok: boolean }>;
  runRecoveryAction(action: "reload-compare-brief" | "reread-tianyi-session" | "retry-start"): Promise<{ ok: boolean }>;
};

type TianyiControllerModule = { useTianyiV2SessionController(props: Record<string, unknown>): TianyiController };

type TianyiHookRuntime = {
  __tianyiControllerTestRuntime: {
    render<T>(render: () => T): T;
    flush(): Promise<void>;
  };
};

const hookRuntimeId = "virtual:tianyi-controller-hook-runtime";
const hookRuntimeResolvedId = "\0tianyi-controller-hook-runtime";
const hookRuntimeSource = `
const values = [];
let cursor = 0;
let effects = [];
const changed = (previous, next) => !previous || previous.length !== next.length || previous.some((value, index) => value !== next[index]);
export function useState(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = typeof initial === "function" ? initial() : initial; return [values[slot], (value) => { values[slot] = typeof value === "function" ? value(values[slot]) : value; }]; }
export function useRef(initial) { const slot = cursor++; if (!(slot in values)) values[slot] = { current: initial }; return values[slot]; }
export function useMemo(factory, deps) { const slot = cursor++; const previous = values[slot]; if (!previous || changed(previous.deps, deps)) values[slot] = { deps, value: factory() }; return values[slot].value; }
export function useCallback(callback, deps) { return useMemo(() => callback, deps); }
export function useEffect(effect, deps) { const slot = cursor++; const previous = values[slot]; if (!previous || changed(previous.deps, deps)) { values[slot] = { deps }; effects.push(effect); } }
export const __tianyiControllerTestRuntime = {
  render(render) { cursor = 0; effects = []; const value = render(); for (const effect of effects) effect(); return value; },
  async flush() { for (let index = 0; index < 16; index += 1) await Promise.resolve(); }
};
`;

async function mountTianyiController(initialProps: Record<string, unknown>) {
  const server = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    resolve: { alias: { react: hookRuntimeId } },
    plugins: [{
      name: "tianyi-controller-hook-test-runtime",
      resolveId(id) { return id === "react" ? hookRuntimeResolvedId : id === hookRuntimeId ? hookRuntimeResolvedId : null; },
      load(id) { return id === hookRuntimeResolvedId ? hookRuntimeSource : null; },
    }],
  });
  let controllerModule: TianyiControllerModule;
  let runtime: TianyiHookRuntime;
  try {
    controllerModule = await server.ssrLoadModule("/apps/story-studio/src/components/tianyi/useTianyiSessionController.ts") as TianyiControllerModule;
    runtime = await server.ssrLoadModule(hookRuntimeId) as TianyiHookRuntime;
  } catch (error) {
    await server.close();
    throw error;
  }
  let props = initialProps;
  let controller = runtime.__tianyiControllerTestRuntime.render(() => controllerModule.useTianyiV2SessionController(props));
  await runtime.__tianyiControllerTestRuntime.flush();
  controller = runtime.__tianyiControllerTestRuntime.render(() => controllerModule.useTianyiV2SessionController(props));
  return {
    get current() { return controller; },
    rerender(nextProps: Record<string, unknown> = props) {
      props = nextProps;
      controller = runtime.__tianyiControllerTestRuntime.render(() => controllerModule.useTianyiV2SessionController(props));
      return controller;
    },
    async flush() { await runtime.__tianyiControllerTestRuntime.flush(); },
    close() { return server.close(); },
  };
}

async function renderThread(): Promise<string> {
  const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent" });
  try {
    const module = await server.ssrLoadModule("/apps/story-studio/src/components/tianyi/TianyiConversationThread.tsx") as { TianyiConversationThread(props: Record<string, unknown>): ReturnType<typeof createElement> };
    return renderToStaticMarkup(createElement(module.TianyiConversationThread, { messages: session().visibleMessages, streamingText: "", onOpenSource: () => {} }));
  } finally {
    await server.close();
  }
}

async function renderConversationRail(): Promise<string> {
  const server = await createServer({ appType: "custom", configFile: false, logLevel: "silent" });
  try {
    const module = await server.ssrLoadModule("/apps/story-studio/src/components/tianyi/TianyiConversationRail.tsx") as { TianyiConversationRail(props: Record<string, unknown>): ReturnType<typeof createElement> };
    return renderToStaticMarkup(createElement(module.TianyiConversationRail, {
      currentSession: { ...session(), eventCount: 17 },
      recentSessions: [],
      projectTitle: "雾中灯塔",
      sceneLabel: "地下室地图",
      briefState: "idle",
      onReturnProject: () => {}
    }));
  } finally {
    await server.close();
  }
}

function session(): TianyiSessionMetadata {
  return {
    id: "session.thread",
    contentHash: "hash.thread",
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
      { eventId: "author.1", sequence: 1, actor: "author", recordedAt: "2026-08-14T00:00:01.000Z", visibleContent: "先保留地下室地图的悬念。", receiptId: "receipt.a" },
      { eventId: "tianyi.1", sequence: 2, actor: "tianyi", recordedAt: "2026-08-14T00:00:02.000Z", visibleContent: "天意建议：让地图只揭示一个新的矛盾。", receiptId: "receipt.b" },
      { eventId: "author.2", sequence: 3, actor: "author", recordedAt: "2026-08-14T00:00:03.000Z", visibleContent: "谁把地图留在灯塔地下室？", receiptId: "receipt.c" },
      { eventId: "tianyi.2", sequence: 4, actor: "tianyi", recordedAt: "2026-08-14T00:00:04.000Z", visibleContent: "天意建议：把留图者作为下一步验证对象。", receiptId: "receipt.d" }
    ]
  };
}

function context(): TianyiContextRequest {
  return {
    productMode: "writing",
    activeOwner: { kind: "project", id: "scene.地下室地图" },
    selection: { documentId: "scene.地下室地图", objectId: null, timelinePointId: null },
    sourceRefs: [{ id: "source.thread", kind: "project", origin: "fixture" }],
    memorySelections: [],
    enabledSkillRefs: []
  };
}

function executionBrief(state: "draft" | "approved"): TianyiNuwaExecutionBrief {
  return {
    version: "story-studio-tianyi-nuwa-execution-brief/v1",
    briefId: "brief.thread",
    revision: 4,
    authorGoal: "验证留图者的意图",
    sourceProject: { projectId: "project.thread", projectRevision: "project-revision" },
    currentContext: { mode: "writing", documentId: "scene.地下室地图", objectIds: [], selectionRef: "selection.thread" },
    selectedContextReceiptIds: ["receipt.a"],
    selectedArchiveMessageRefs: [],
    approvedMemoryRefs: [],
    mustKeep: ["保留悬念"],
    mustAvoid: ["不要确认候选"],
    unresolvedQuestions: ["谁留下地图？"],
    expectedOutputKind: "candidate-routes",
    allowedAgents: [],
    allowedSkills: [],
    capabilityBudget: { maxAgentRuns: 1, maxSkillCalls: 0, maxTokens: 100, timeoutSeconds: 1 },
    sensitivity: "project-private",
    authorApprovalState: state,
    expectedHashes: { brief: "brief-hash", sourceSet: "source-hash" },
    operationId: "operation.thread",
    originatingTianyiSessionId: "session.thread",
    returnDestination: { mode: "writing", documentId: "scene.地下室地图", selectionRef: "selection.thread" },
  };
}

function controllerProps(input: {
  brief: TianyiNuwaExecutionBrief;
  calls: { approve: number; start: number; create: number; revise: number; openSession: number };
  start?: () => Promise<unknown>;
  latestBrief?: TianyiNuwaExecutionBrief;
  receiptState?: "current" | "stale";
  onExecutionBrief?: (brief: TianyiNuwaExecutionBrief) => void;
  recoverySignals?: { sourceState?: "stale"; briefRevisionState?: "conflict"; nuwaReturnRecoveryState?: "failed" };
  onRecoveryAction?: (action: string) => void;
  sharedDraft?: string;
  onSharedDraft?: (value: string) => void;
  onGroundedQuestion?: () => void;
  emptySession?: boolean;
}): Record<string, unknown> {
  let openedSessionId: string | null = null;
  return {
    projectId: "project.thread",
    baseContextRequest: context(),
    token: "offline-test-token",
    withConnection: async (operation: (token: string) => Promise<unknown>) => operation("offline-test-token"),
    operations: {
      getSessionMetadata: async (_projectId: string, sessionId: string | null) => input.emptySession
        ? (sessionId || openedSessionId ? { ...session(), id: sessionId || openedSessionId! } : null)
        : session(),
      readReceipt: async () => ({ currentStatus: input.receiptState ?? "current" }),
      readLatestBrief: async () => input.latestBrief ?? input.brief,
      openSession: async () => { input.calls.openSession += 1; openedSessionId = "session.started"; return { sessionId: openedSessionId }; },
      runGroundedQuestion: async (operation: { onDraft?(event: { attempt: number; text: string }): void }) => {
        input.onGroundedQuestion?.();
        operation.onDraft?.({ attempt: 1, text: "正在整理" });
        return { answer: null, sessionId: "session.thread" };
      },
      createBrief: async () => { input.calls.create += 1; return input.brief; },
      reviseBrief: async () => { input.calls.revise += 1; return input.brief; },
      approveBrief: async () => { input.calls.approve += 1; return { ...input.brief, authorApprovalState: "approved" as const }; },
      startBrief: async () => { input.calls.start += 1; return input.start ? input.start() : { id: "exploration.thread" }; },
    },
    executionBrief: input.brief,
    onExecutionBrief: input.onExecutionBrief ?? (() => {}),
    onOpenNuwa: () => {},
    sharedSessionId: input.emptySession ? null : "session.thread",
    onSharedSessionId: () => {},
    sharedDraft: input.sharedDraft ?? "",
    onSharedDraft: input.onSharedDraft ?? (() => {}),
    recoverySignals: input.recoverySignals,
    onRecoveryAction: input.onRecoveryAction,
  };
}

test("Record projection preserves every visible event in sequence without inventing provenance", () => {
  const groups = buildTianyiThreadProjection(session().visibleMessages);
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.author?.visibleContent, "先保留地下室地图的悬念。");
  assert.equal(groups[0]?.suggestions[0]?.visibleContent, "天意建议：让地图只揭示一个新的矛盾。");
  assert.equal(groups[1]?.author?.visibleContent, "谁把地图留在灯塔地下室？");
  assert.equal(groups.flatMap((group) => [group.author, ...group.suggestions].filter(Boolean)).length, 4);
});

test("Thread Brief maps only existing Execution Brief fields and never persists local omitted items", () => {
  const draft = deriveTianyiThreadBriefDraft({ session: session(), contextRequest: context(), brief: null });
  const draftWithoutSources = deriveTianyiThreadBriefDraft({
    session: session(),
    contextRequest: context(),
    brief: { ...executionBrief("approved"), selectedContextReceiptIds: [] }
  });
  const withLocalOmission: TianyiThreadBriefDraft = { ...draft, authorGoal: "验证留图者的意图", omittedItems: [{ category: "story-candidate", label: "未纳入", content: "仅用于当前页面的备忘" }] };
  const changes = mapTianyiThreadBriefChanges({ session: session(), contextRequest: context(), draft: withLocalOmission });
  assert.equal(draftWithoutSources.includeCurrentSources, false);
  assert.equal(changes.authorGoal, "验证留图者的意图");
  assert.equal("omittedItems" in changes, false);
  assert.equal("canon" in changes, false);
  assert.equal("candidate" in changes, false);
  assert.deepEqual(changes.selectedContextReceiptIds, ["receipt.a", "receipt.b", "receipt.c", "receipt.d"]);
});

test("conversation thread renders every author and Tianyi message once in chronological order", async () => {
  const thread = await renderThread();
  assert.ok(thread.indexOf("先保留地下室地图的悬念。") < thread.indexOf("天意建议：让地图只揭示一个新的矛盾。"));
  assert.ok(thread.indexOf("天意建议：让地图只揭示一个新的矛盾。") < thread.indexOf("谁把地图留在灯塔地下室？"));
  assert.ok(thread.indexOf("谁把地图留在灯塔地下室？") < thread.indexOf("天意建议：把留图者作为下一步验证对象。"));
  assert.equal((thread.match(/先保留地下室地图的悬念。/g) || []).length, 1);
  assert.equal((thread.match(/天意建议：把留图者作为下一步验证对象。/g) || []).length, 1);
  assert.doesNotMatch(thread, /role="tablist"|tianyi-thread-author-stream|tianyi-thread-suggestion-region/);
});

test("Session sidebar counts only the messages the shared thread can actually render", async () => {
  const markup = await renderConversationRail();
  assert.match(markup, /4 条可见内容/u);
  assert.doesNotMatch(markup, /17 条内容/u);
});

test("conversation-first leaf keeps one Composer, a temporary Source Inspector, and a props-only session rail", () => {
  const workspace = readFileSync("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx", "utf8");
  const thread = readFileSync("apps/story-studio/src/components/tianyi/TianyiConversationThread.tsx", "utf8");
  const composer = readFileSync("apps/story-studio/src/components/tianyi/composer/TianyiComposer.tsx", "utf8");
  const inspector = readFileSync("apps/story-studio/src/components/tianyi/TianyiSourceInspector.tsx", "utf8");
  const sidebar = readFileSync("apps/story-studio/src/components/tianyi/TianyiConversationRail.tsx", "utf8");
  assert.equal((workspace.match(/<TianyiComposer/g) || []).length, 1);
  assert.match(thread, /aria-label="当前天意对话"/);
  assert.match(thread, /TianyiConversationThread/);
  assert.match(thread, /\[\.\.\.props\.messages\]\.sort/);
  assert.match(composer, /仅记录到当前会话/);
  assert.match(composer, /Enter 发送 · Shift\+Enter 换行/);
  assert.match(composer, /nativeEvent\.isComposing/);
  assert.match(inspector, /role="dialog"/);
  assert.match(inspector, /Escape/);
  assert.match(inspector, /returnFocusRef/);
  assert.match(sidebar, /aria-current="page"/);
  assert.match(sidebar, /approved: "执行简报已批准"/);
  assert.doesNotMatch(sidebar, /repository|Provider|Receipt ID|Canon|Candidate/iu);
});

test("mounted controller blocks dirty and stale Brief operations before external callbacks", async () => {
  const dirtyApproveCalls = { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 };
  const dirtyApprove = await mountTianyiController(controllerProps({ brief: executionBrief("draft"), calls: dirtyApproveCalls }));
  try {
    assert.ok(dirtyApprove.current.session);
    dirtyApprove.current.beginCloseReview();
    dirtyApprove.rerender();
    dirtyApprove.current.updateBriefDraft({ authorGoal: "作者尚未保存的修改" });
    dirtyApprove.rerender();
    assert.equal((await dirtyApprove.current.approveBrief()).ok, false);
    assert.equal(dirtyApproveCalls.approve, 0);
  } finally {
    await dirtyApprove.close();
  }

  const dirtyStartCalls = { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 };
  const dirtyStart = await mountTianyiController(controllerProps({ brief: executionBrief("approved"), calls: dirtyStartCalls }));
  try {
    dirtyStart.current.beginCloseReview();
    dirtyStart.rerender();
    dirtyStart.current.updateBriefDraft({ authorGoal: "作者尚未保存的修改" });
    dirtyStart.rerender();
    assert.equal((await dirtyStart.current.startNuwa()).ok, false);
    assert.equal(dirtyStartCalls.start, 0);
  } finally {
    await dirtyStart.close();
  }

  const staleCalls = { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 };
  const stale = await mountTianyiController(controllerProps({ brief: executionBrief("draft"), calls: staleCalls, recoverySignals: { sourceState: "stale" } }));
  try {
    assert.equal((await stale.current.approveBrief()).ok, false);
    stale.rerender(controllerProps({ brief: executionBrief("approved"), calls: staleCalls, recoverySignals: { sourceState: "stale" } }));
    assert.equal((await stale.current.startNuwa()).ok, false);
    assert.equal(staleCalls.approve, 0);
    assert.equal(staleCalls.start, 0);
  } finally {
    await stale.close();
  }
});

test("saved Brief is immediately confirmable, refresh-restorable, and repeated confirmation is idempotent", async () => {
  const calls = { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 };
  const saved = executionBrief("draft");
  const projected: TianyiNuwaExecutionBrief[] = [];
  const mounted = await mountTianyiController(controllerProps({ brief: saved, calls, onExecutionBrief: (brief) => projected.push(brief) }));
  try {
    mounted.current.beginCloseReview();
    mounted.rerender();
    mounted.current.updateBriefDraft({ authorGoal: "保存后立即确认" });
    mounted.rerender();
    await mounted.current.saveBrief();
    mounted.rerender();
    assert.equal(calls.revise, 1);
    assert.equal((await mounted.current.approveBrief()).ok, true);
    mounted.rerender();
    assert.equal(calls.approve, 1);
    assert.equal(projected.at(-1)?.authorApprovalState, "approved");
    assert.equal((await mounted.current.approveBrief()).ok, false);
    assert.equal(calls.approve, 1, "an already approved Brief must not dispatch a duplicate confirmation");
  } finally {
    await mounted.close();
  }
});

test("mounted controller reads real receipt freshness and latest Brief before approve or start", async () => {
  const staleCalls = { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 };
  const staleApprove = await mountTianyiController(controllerProps({
    brief: executionBrief("draft"),
    calls: staleCalls,
    receiptState: "stale",
  }));
  try {
    const result = await staleApprove.current.approveBrief();
    assert.equal(result.ok, false);
    assert.equal(staleCalls.approve, 0);
  } finally {
    await staleApprove.close();
  }

  const staleStart = await mountTianyiController(controllerProps({
    brief: executionBrief("approved"),
    calls: staleCalls,
    receiptState: "stale",
  }));
  try {
    const result = await staleStart.current.startNuwa();
    assert.equal(result.ok, false);
    assert.equal(staleCalls.start, 0);
  } finally {
    await staleStart.close();
  }

  const conflictCalls = { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 };
  const currentBrief = executionBrief("draft");
  const latestBrief = {
    ...currentBrief,
    revision: currentBrief.revision + 1,
    expectedHashes: { ...currentBrief.expectedHashes, brief: "newer-brief-hash" },
  };
  const loaded: TianyiNuwaExecutionBrief[] = [];
  const conflict = await mountTianyiController(controllerProps({
    brief: currentBrief,
    latestBrief,
    calls: conflictCalls,
    onExecutionBrief: (brief) => loaded.push(brief),
  }));
  try {
    conflict.current.beginCloseReview();
    conflict.rerender();
    conflict.current.updateBriefDraft({ authorGoal: "保留作者尚未保存的版本" });
    conflict.rerender();
    assert.equal((await conflict.current.approveBrief()).ok, false);
    conflict.rerender();
    assert.equal(conflict.current.briefDraft?.authorGoal, "保留作者尚未保存的版本");
    assert.equal(conflictCalls.approve, 0);
    assert.equal((await conflict.current.runRecoveryAction("reload-compare-brief")).ok, true);
    assert.equal(loaded.at(-1)?.revision, latestBrief.revision);
    assert.equal(conflict.current.briefDraft?.authorGoal, "保留作者尚未保存的版本");
  } finally {
    await conflict.close();
  }
});

test("mounted controller preserves conflict drafts, retries only start, and rereads without opening a Session", async () => {
  const conflictCalls = { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 };
  const recoveryActions: string[] = [];
  const conflictProps = controllerProps({ brief: executionBrief("draft"), calls: conflictCalls, onRecoveryAction: (action) => recoveryActions.push(action) });
  const conflict = await mountTianyiController(conflictProps);
  try {
    conflict.current.beginCloseReview();
    conflict.rerender();
    conflict.current.updateBriefDraft({ authorGoal: "保留本地草稿" });
    conflict.rerender({ ...conflictProps, recoverySignals: { briefRevisionState: "conflict" } });
    assert.equal((await conflict.current.approveBrief()).ok, false);
    assert.equal(conflict.current.briefDraft?.authorGoal, "保留本地草稿");
    assert.equal((await conflict.current.runRecoveryAction("reload-compare-brief")).ok, true);
    assert.deepEqual(recoveryActions, ["reload-compare-brief"]);
    assert.deepEqual(conflictCalls, { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 });
  } finally {
    await conflict.close();
  }

  const startCalls = { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 };
  let startAttempts = 0;
  const retry = await mountTianyiController(controllerProps({
    brief: executionBrief("approved"),
    calls: startCalls,
    start: async () => { startAttempts += 1; if (startAttempts === 1) throw new Error("start failed"); return { id: "exploration.thread" }; },
  }));
  try {
    assert.equal((await retry.current.startNuwa()).ok, false);
    retry.rerender();
    assert.equal((await retry.current.runRecoveryAction("retry-start")).ok, true);
    assert.deepEqual(startCalls, { approve: 0, start: 2, create: 0, revise: 0, openSession: 0 });
  } finally {
    await retry.close();
  }

  const returnCalls = { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 };
  const returnActions: string[] = [];
  const returning = await mountTianyiController(controllerProps({ brief: executionBrief("approved"), calls: returnCalls, recoverySignals: { nuwaReturnRecoveryState: "failed" }, onRecoveryAction: (action) => returnActions.push(action) }));
  try {
    assert.equal((await returning.current.runRecoveryAction("reread-tianyi-session")).ok, true);
    assert.deepEqual(returnActions, ["reread-tianyi-session"]);
    assert.equal(returnCalls.openSession, 0);
  } finally {
    await returning.close();
  }
});

test("send mode is local, keeps the App-owned draft intact, and does not revive display tabs", async () => {
  const controller = readFileSync("apps/story-studio/src/components/tianyi/useTianyiSessionController.ts", "utf8");
  const workspace = readFileSync("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx", "utf8");
  const brief = readFileSync("apps/story-studio/src/components/tianyi/TianyiBriefReview.tsx", "utf8");
  assert.match(controller, /setSendMode/);
  assert.match(controller, /draft: props\.sharedDraft/);
  assert.match(controller, /setDraft: props\.onSharedDraft/);
  assert.doesNotMatch(controller, /const \[draft, setDraft\] = useState\(""\)/);
  assert.match(controller, /briefDirty/);
  assert.match(controller, /validateTianyiV3OperationBoundary/);
  assert.match(controller, /runTianyiV3GuardedOperation/);
  assert.match(controller, /recoverySignals/);
  const startBody = controller.match(/const startNuwa[\s\S]*?\n  const runRecoveryAction/)?.[0] || "";
  assert.doesNotMatch(startBody, /approveBrief/);
  assert.doesNotMatch(controller, /finalizeTianyiSessionClose|localStorage|indexedDB|writeCanon/);
  assert.doesNotMatch(workspace, /aria-controls="tianyi-v3-record-panel"|aria-controls="tianyi-v3-collaborate-panel"/);
  assert.match(workspace, /role="tablist" aria-label="天意工作方式"/);
  assert.match(workspace, /RecoveryIssueNotice/);
  assert.match(brief, /aria-current={props.active \? "step" : undefined}/);

  const sharedUpdates: string[] = [];
  let groundedQuestionCount = 0;
  const props = controllerProps({
    brief: executionBrief("draft"),
    calls: { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 },
    sharedDraft: "侧边栏尚未发送的内容",
    onSharedDraft: (value) => sharedUpdates.push(value),
    onGroundedQuestion: () => { groundedQuestionCount += 1; },
  });
  const mounted = await mountTianyiController(props);
  try {
    assert.equal(mounted.current.draft, "侧边栏尚未发送的内容");
    mounted.current.setSendMode("ask");
    mounted.current.setDraft("全页继续编辑的内容");
    assert.deepEqual(sharedUpdates, ["全页继续编辑的内容"]);
    mounted.rerender({ ...props, sharedDraft: "全页继续编辑的内容" });
    assert.equal(mounted.current.draft, "全页继续编辑的内容");
    assert.equal((await mounted.current.send()).ok, true);
    assert.equal(groundedQuestionCount, 1);
  } finally {
    await mounted.close();
  }
});

test("primary composer accepts a draft before a Session exists and opens the existing Session owner on send", async () => {
  const calls = { approve: 0, start: 0, create: 0, revise: 0, openSession: 0 };
  let groundedQuestionCount = 0;
  const mounted = await mountTianyiController(controllerProps({
    brief: executionBrief("draft"),
    calls,
    emptySession: true,
    sharedDraft: "先把问题写下来再开始对话。",
    onGroundedQuestion: () => { groundedQuestionCount += 1; }
  }));
  try {
    assert.equal(mounted.current.session, null);
    assert.equal(mounted.current.draft, "先把问题写下来再开始对话。");
    assert.equal((await mounted.current.send()).ok, true);
    assert.equal(calls.openSession, 1);
    assert.equal(groundedQuestionCount, 1);
    await mounted.flush();
    mounted.rerender();
    assert.equal(mounted.current.transportState, "ready");
  } finally {
    await mounted.close();
  }
});

test("retired Tianyi presentation files are absent while the official leaf is singular", () => {
  assert.equal(existsSync("apps/story-studio/src/components/TianyiWorkspace.tsx"), false);
  assert.equal(existsSync("apps/story-studio/src/components/tianyi/TianyiCompanionPanel.tsx"), false);
  assert.equal(existsSync("apps/story-studio/src/components/tianyi/TianyiExecutionBriefReview.tsx"), false);
  assert.equal(existsSync("apps/story-studio/src/components/tianyi-v2"), false);
  const workspace = readFileSync("apps/story-studio/src/components/tianyi/TianyiWorkspace.tsx", "utf8");
  assert.equal((workspace.match(/export function TianyiWorkspace/g) || []).length, 1);
});
