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
