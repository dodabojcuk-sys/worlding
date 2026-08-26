import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createStoryStudioTianyiOperations } from "../../src/storyControlSurface/storyStudioTianyiOperations.ts";
import { createStoryStudioWorkspaceOperations } from "../../src/storyControlSurface/storyStudioWorkspaceOperations.ts";

test("Creative capture persists exact source before extraction, converges retries, and reconstructs after restart", async () => {
  const rootPath = await mkdtemp(path.join(tmpdir(), "tianyi-creative-source-"));
  const projectId = "creative-source-fixture";
  const sourceText = "第一行：月亮落进井里。\n第二行：🪷 我想让守夜人先撒谎，再求救。";
  try {
    createStoryStudioWorkspaceOperations({ rootPath, stateFilePath: path.join(rootPath, "state.json") }).createProject({ title: "创意来源夹具", folderSlug: projectId });
    const first = createStoryStudioTianyiOperations({ rootPath, stateFilePath: path.join(rootPath, "state.json"), now: () => "2026-08-21T12:00:00.000Z" });
    const opened = await first.openTianyiSession({ projectId, operationId: "operation.creative.open" });
    const captured = await first.captureTianyiCreativeAuthorSource({ projectId, sessionId: opened.sessionId, operationId: "operation.creative.capture", submissionId: "submission.creative.capture", text: sourceText, collaborate: false });
    assert.equal(captured.alreadyCompleted, false);
    const retry = await first.captureTianyiCreativeAuthorSource({ projectId, sessionId: opened.sessionId, operationId: "operation.creative.capture", submissionId: "submission.creative.capture", text: sourceText, collaborate: false });
    assert.equal(retry.alreadyCompleted, true);
    assert.deepEqual(retry.source, captured.source);
    const metadata = await first.readTianyiSessionMetadata({ projectId, sessionId: opened.sessionId });
    assert.equal(metadata?.visibleMessages.length, 1);
    assert.equal(metadata?.visibleMessages[0]?.visibleContent, sourceText);

    const restarted = createStoryStudioTianyiOperations({ rootPath, stateFilePath: path.join(rootPath, "state.json"), now: () => "2026-08-21T12:00:01.000Z" });
    const beforeExtraction = await restarted.readTianyiCreativeProjection({ projectId, sessionId: opened.sessionId });
    assert.equal(beforeExtraction?.originals[0]?.text, sourceText);
    const extracted = await restarted.extractTianyiCreativeProjection({
      projectId,
      sessionId: opened.sessionId,
      operationId: "operation.creative.extract",
      source: captured.source,
      fixture: {
        reply: "原话已安全保存；我们先确认守夜人的动机。",
        summary: "守夜人先撒谎后求救，井与月亮是关键意象。",
        themes: ["谎言与求救"],
        openQuestions: ["谁看见了井中的月亮？"],
        candidates: [
          { kind: "character", title: "守夜人", summary: "可能主动撒谎后求救。", uncertainties: ["动机尚未确认"] },
          { kind: "inspiration", title: "井中的月亮", summary: "可作为反复出现的意象。", uncertainties: ["没有唯一资料 Owner"] }
        ]
      }
    });
    assert.equal(extracted.projection.summaryState, "current");
    assert.equal(extracted.projection.candidates.length, 2);
    assert.equal(extracted.projection.candidates.every((candidate) => candidate.sourceRefs[0]?.eventId === captured.source.eventId), true);
    assert.equal(extracted.projection.candidates.every((candidate) => candidate.sourceRefs[0]?.contentHash === captured.source.contentHash), true);
    const character = extracted.projection.candidates.find((candidate) => candidate.kind === "character")!;
    const inspiration = extracted.projection.candidates.find((candidate) => candidate.kind === "inspiration")!;
    await restarted.decideTianyiCreativeCandidate({ projectId, sessionId: opened.sessionId, candidateId: character.candidateId, operationId: "operation.creative.reject", decision: "rejected" });
    const deferred = await restarted.decideTianyiCreativeCandidate({ projectId, sessionId: opened.sessionId, candidateId: inspiration.candidateId, operationId: "operation.creative.defer", decision: "deferred" });
    assert.equal(deferred.projection.pendingCount, 0);
    const completed = await restarted.completeTianyiCreativeSession({ projectId, sessionId: opened.sessionId, operationId: "operation.creative.complete" });
    assert.equal(completed.close.closed, true);
    assert.equal((await restarted.readTianyiCreativeProjection({ projectId, sessionId: opened.sessionId }))?.lifecycle, "completed");
  } finally {
    await rm(rootPath, { recursive: true, force: true });
  }
});
