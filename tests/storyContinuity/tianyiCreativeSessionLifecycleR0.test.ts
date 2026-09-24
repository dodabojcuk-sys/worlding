import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioTianyiOperations } from "../../src/storyControlSurface/storyStudioTianyiOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("Creative lifecycle preserves safe points, provider-unavailable recovery, stale protection, and idempotent close", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-creative-lifecycle-"));
  const stateFilePath = path.join(rootPath, "state.json");
  const projectId = "creative-lifecycle-fixture";
  const fixture = {
    reply: "原话保留；候选只进入作者审查。",
    summary: "守夜人守着一枚钥匙。",
    themes: ["秘密与守望"],
    openQuestions: ["钥匙打开什么？"],
    candidates: [
      { kind: "character", title: "守夜人", summary: "可能掌握钥匙。", uncertainties: ["动机未确认"] },
      { kind: "inspiration", title: "潮湿井边", summary: "作为氛围意象。", uncertainties: ["没有唯一 Owner"] }
    ]
  };
  try {
    createStoryStudioWorkspaceOperations({ rootPath, stateFilePath }).createProject({ title: "生命周期夹具", folderSlug: projectId });
    const operations = createStoryStudioTianyiOperations({ rootPath, stateFilePath, now: () => "2026-08-21T13:00:00.000Z" });
    const opened = await operations.openTianyiSession({ projectId, operationId: "creative-lifecycle-open" });
    const sourceText = "守夜人把钥匙藏在井边。\n原话必须保留。";
    const captured = await operations.captureTianyiCreativeAuthorSource({ projectId, sessionId: opened.sessionId, operationId: "creative-lifecycle-capture", submissionId: "creative-lifecycle-submission", text: sourceText, collaborate: true });
    assert.equal((await operations.readTianyiCreativeProjection({ projectId, sessionId: opened.sessionId }))?.lifecycle, "capturing");
    const unavailable = await operations.markTianyiCreativeProviderUnavailable({ projectId, sessionId: opened.sessionId, operationId: "creative-lifecycle-provider-unavailable", stage: "extraction" });
    assert.equal(unavailable.projection.lifecycle, "provider-unavailable");
    assert.equal(unavailable.projection.providerUnavailable?.message, "原话已保存，分析未运行。");
    assert.equal(unavailable.projection.originals[0]?.text, sourceText);
    const recovered = await operations.recoverTianyiCreativeSession({ projectId, sessionId: opened.sessionId, operationId: "creative-lifecycle-recover" });
    assert.equal(recovered.projection.originals[0]?.text, sourceText);
    assert.ok(recovered.projection.lastSafePoint);
    const metadata = await operations.readTianyiSessionMetadata({ projectId, sessionId: opened.sessionId });
    const originalMessage = metadata.visibleMessages.find((message) => message.eventId === captured.source.eventId);
    assert.equal(originalMessage?.contentHash, captured.source.contentHash, "message extraction must reuse the immutable original source, not append a new author message");
    const extracted = await operations.extractTianyiCreativeProjection({ projectId, sessionId: opened.sessionId, operationId: "creative-lifecycle-extract", source: captured.source, fixture });
    assert.equal(extracted.projection.lifecycle, "review-ready");
    assert.equal(extracted.projection.summaryState, "current");
    const character = extracted.projection.candidates.find((candidate) => candidate.kind === "character");
    const inspiration = extracted.projection.candidates.find((candidate) => candidate.kind === "inspiration");
    assert.ok(character && inspiration);
    const edited = await operations.editTianyiCreativeCandidate({ projectId, sessionId: opened.sessionId, candidateId: character.candidateId, operationId: "creative-lifecycle-edit", expectedRevision: character.revision, title: "守夜人（作者修订）", summary: "作者补充：她可能掌握钥匙，但仍只是候选。", uncertainties: character.uncertainties });
    assert.equal(edited.projection.candidates.find((candidate) => candidate.candidateId === character.candidateId)?.title, "守夜人（作者修订）");
    await assert.rejects(() => operations.editTianyiCreativeCandidate({ projectId, sessionId: opened.sessionId, candidateId: character.candidateId, operationId: "creative-lifecycle-edit-stale", expectedRevision: character.revision, title: "过期编辑", summary: "不应覆盖新版本。", uncertainties: [] }), /stale/u);
    const captured2 = await operations.captureTianyiCreativeAuthorSource({ projectId, sessionId: opened.sessionId, operationId: "creative-lifecycle-capture-2", submissionId: "creative-lifecycle-submission-2", text: "又补充一句：井底还有回声。", collaborate: false });
    assert.equal((await operations.readTianyiCreativeProjection({ projectId, sessionId: opened.sessionId }))?.summaryState, "stale");
    await assert.rejects(() => operations.decideTianyiCreativeCandidate({ projectId, sessionId: opened.sessionId, candidateId: character.candidateId, operationId: "creative-lifecycle-stale-handoff", decision: "handed-off", ownerReceipt: { owner: "agent-recognition-proposal", id: "proposal.stale", revision: 1 } }), /stale/u);
    await operations.decideTianyiCreativeCandidate({ projectId, sessionId: opened.sessionId, candidateId: character.candidateId, operationId: "creative-lifecycle-reject", decision: "rejected" });
    await operations.decideTianyiCreativeCandidate({ projectId, sessionId: opened.sessionId, candidateId: inspiration.candidateId, operationId: "creative-lifecycle-defer", decision: "deferred" });
    const reExtracted = await operations.extractTianyiCreativeProjection({ projectId, sessionId: opened.sessionId, operationId: "creative-lifecycle-extract-2", source: captured2.source, fixture });
    const paused = await operations.pauseTianyiCreativeSession({ projectId, sessionId: opened.sessionId, operationId: "creative-lifecycle-pause" });
    assert.equal(paused.projection.lifecycle, "paused");
    const resumed = await operations.recoverTianyiCreativeSession({ projectId, sessionId: opened.sessionId, operationId: "creative-lifecycle-recover-2" });
    assert.equal(resumed.projection.lifecycle, "review-ready");
    const refreshedCharacter = reExtracted.projection.candidates.find((candidate) => candidate.kind === "character" && candidate.state === "pending");
    const refreshedInspiration = reExtracted.projection.candidates.find((candidate) => candidate.kind === "inspiration" && candidate.state === "pending");
    assert.ok(refreshedCharacter && refreshedInspiration);
    await operations.decideTianyiCreativeCandidate({ projectId, sessionId: opened.sessionId, candidateId: refreshedCharacter.candidateId, operationId: "creative-lifecycle-reject-2", decision: "rejected" });
    await operations.decideTianyiCreativeCandidate({ projectId, sessionId: opened.sessionId, candidateId: refreshedInspiration.candidateId, operationId: "creative-lifecycle-defer-2", decision: "deferred" });
    const completed = await operations.completeTianyiCreativeSession({ projectId, sessionId: opened.sessionId, operationId: "creative-lifecycle-complete" });
    assert.equal(completed.close.closed, true);
    const retry = await operations.completeTianyiCreativeSession({ projectId, sessionId: opened.sessionId, operationId: "creative-lifecycle-complete" });
    assert.equal(retry.alreadyCompleted, true);
    const projection = await operations.readTianyiCreativeProjection({ projectId, sessionId: opened.sessionId });
    assert.equal(projection?.lifecycle, "completed");
    assert.equal(projection?.archived, true);
    assert.equal((await operations.finalizeTianyiSessionClose({ projectId, sessionId: opened.sessionId, operationId: "operation.creative-close.creative-lifecycle-complete" })).closed, true);
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});


test("conversation rename is project scoped, revision checked, idempotent and not a visible message", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-rename-"));
  const stateFilePath = path.join(rootPath, "state.json");
  try {
    const projects = createStoryStudioWorkspaceOperations({ rootPath, stateFilePath });
    for (const projectId of ["rename-a", "rename-b"]) projects.createProject({ title: projectId, folderSlug: projectId });
    const operations = createStoryStudioTianyiOperations({ rootPath, stateFilePath, now: () => "2026-09-22T23:00:00.000Z" });
    const a = await operations.openTianyiSession({ projectId: "rename-a", operationId: "open-a" });
    const b = await operations.openTianyiSession({ projectId: "rename-b", operationId: "open-b" });
    const input = { projectId: "rename-a", sessionId: a.sessionId, expectedContentHash: a.contentHash!, title: "第一幕", operationId: "rename-1" };
    const renamed = await operations.renameTianyiSession(input);
    assert.equal(renamed.title, "第一幕");
    assert.equal(renamed.visibleMessages.length, 0);
    assert.equal((await operations.renameTianyiSession(input)).eventCount, renamed.eventCount);
    await assert.rejects(operations.renameTianyiSession({ ...input, title: "覆盖", operationId: "rename-2" }), /changed/u);
    const second = await operations.readTianyiSessionMetadata({ projectId: "rename-b", sessionId: b.sessionId });
    assert.ok(second && !Array.isArray(second));
    assert.equal(second.title, null);
    const before = projects.getBootstrap();
    projects.renameProject({ projectId: "rename-a", title: "改名项目", expectedTitle: "rename-a" });
    assert.equal(projects.listProjects().find((p) => p.id === "rename-a")?.title, "改名项目");
    assert.equal(projects.getBootstrap().activeProject?.id, before.activeProject?.id);
    assert.throws(() => projects.renameProject({ projectId: "rename-a", title: "过期覆盖", expectedTitle: "rename-a" }), /changed/u);
  } finally { await rm(rootPath, { recursive: true, force: true }); }
});

test("browser reopen retains scoped conversation choices and migrates tab hints without reviving a cleared choice", async () => {
  const recovery = await import("../../apps/story-studio/src/product-shell/runtime/tianyiShellSessionRecovery.ts");
  const store = () => {
    const data = new Map<string, string>();
    return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  };
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  const localStorage = store();
  const sessionStorage = store();
  Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, sessionStorage } });
  try {
    sessionStorage.setItem(recovery.tianyiConversationStorageKey("A"), "session.1");
    assert.equal(recovery.readSelectedConversation("A"), "session.1");
    recovery.retainSelectedConversation("B", "session.2");
    const drafts = ["A", "B"].flatMap((project) => ["session.1", "session.2"].map((session) => [recovery.tianyiComposerDraftStorageKey(project, "creative", session), `${project}/${session}`]));
    for (const [key, value] of drafts) recovery.retainBrowserRecovery(key, value);
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage, sessionStorage: store() } });
    assert.equal(recovery.readSelectedConversation("A"), "session.1");
    assert.equal(recovery.readSelectedConversation("B"), "session.2");
    for (const [key, value] of drafts) assert.equal(recovery.readBrowserRecovery(key), value);
    assert.equal(recovery.readBrowserRecovery(recovery.tianyiComposerDraftStorageKey("A", "creative", "session.3")), null);
    recovery.retainSelectedConversation("A", null);
    assert.equal(recovery.readSelectedConversation("A"), null);
    assert.equal(recovery.readSelectedConversation("B"), "session.2");
  } finally {
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
