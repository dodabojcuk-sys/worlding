import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  attachAuthorControlReviewR0,
  createSourceImportHandoffR0,
  decideSourceCandidateR0,
  extractSourceCandidatesR0,
  importSourceDocumentR0,
  readSourceImportR0
} from "../../src/storyControlSurface/sourceImportReviewR0.ts";

function fixture() {
  const projectPath = mkdtempSync(path.join(os.tmpdir(), "tianyan-source-import-r0-"));
  const projectId = "source-fixture";
  const content = [
    "# 钟楼外寻找阿岚",
    "",
    "## 雨夜抵达",
    "人物：林远",
    "地点：钟楼外",
    "秘密：阿岚藏在门侧，林远尚不知道。",
    "事件：林远抵达钟楼外。",
    "",
    "## 门侧选择",
    "人物：阿岚",
    "事实：银钥匙在守门人手中。"
  ].join("\n");
  return { projectPath, projectId, content };
}

test("source import is idempotent and appends immutable revisions", () => {
  const input = fixture();
  try {
    const first = importSourceDocumentR0({ ...input, filename: "钟楼.md", now: "2026-08-17T00:00:00.000Z" });
    const retry = importSourceDocumentR0({ ...input, filename: "钟楼.md", now: "2026-08-17T00:01:00.000Z" });
    assert.equal(retry.idempotent, true);
    assert.equal(retry.document.revisions.length, 1);
    const second = importSourceDocumentR0({ ...input, filename: "钟楼.md", content: `${input.content}\n\n新增：雨停了。`, now: "2026-08-17T00:02:00.000Z" });
    assert.equal(second.newRevision, true);
    assert.equal(second.document.revisions.length, 2);
    assert.equal(second.document.revisions[0].content, input.content);
    assert.equal(second.document.candidates.length, 0);
    const persisted = JSON.parse(readFileSync(path.join(input.projectPath, ".world-os/story-intelligence/source-import-reviews", `${first.document.sourceDocumentId}.json`), "utf8")) as { revisions: Array<{ content: string }> };
    assert.equal(persisted.revisions[0].content, input.content);
  } finally {
    rmSync(input.projectPath, { recursive: true, force: true });
  }
});

test("deterministic extraction creates stable anchors and explicit candidate kinds", () => {
  const input = fixture();
  try {
    const imported = importSourceDocumentR0({ ...input, filename: "钟楼.md", now: "2026-08-17T00:00:00.000Z" }).document;
    const extracted = extractSourceCandidatesR0({
      ...input,
      sourceDocumentId: imported.sourceDocumentId,
      knownObjects: [{ id: "character.lin-yuan", type: "character", title: "林远" }],
      now: "2026-08-17T00:01:00.000Z"
    });
    assert.ok(extracted.candidates.some((candidate) => candidate.kind === "unit" && candidate.displayName === "钟楼外寻找阿岚"));
    assert.ok(extracted.candidates.some((candidate) => candidate.kind === "beat" && candidate.displayName === "雨夜抵达"));
    const actor = extracted.candidates.find((candidate) => candidate.kind === "actor" && candidate.displayName === "林远");
    assert.ok(actor);
    assert.equal(actor.duplicateMatches[0]?.objectId, "character.lin-yuan");
    assert.equal(actor.anchor.revisionHash, extracted.currentRevisionHash);
    assert.equal(actor.anchor.excerptHash.length, 64);
    const repeat = extractSourceCandidatesR0({ ...input, sourceDocumentId: imported.sourceDocumentId, now: "2026-08-17T00:02:00.000Z" });
    assert.deepEqual(repeat.candidates.map((candidate) => candidate.candidateId), extracted.candidates.map((candidate) => candidate.candidateId));
  } finally {
    rmSync(input.projectPath, { recursive: true, force: true });
  }
});

test("reject is zero-write, accepted candidates carry Author Control, and stale candidates fail closed", () => {
  const input = fixture();
  try {
    const imported = importSourceDocumentR0({ ...input, filename: "钟楼.md", now: "2026-08-17T00:00:00.000Z" }).document;
    const extracted = extractSourceCandidatesR0({ ...input, sourceDocumentId: imported.sourceDocumentId, now: "2026-08-17T00:01:00.000Z" });
    const actor = extracted.candidates.find((candidate) => candidate.kind === "actor")!;
    const rejected = decideSourceCandidateR0({ ...input, sourceDocumentId: extracted.sourceDocumentId, candidateId: actor.candidateId, decision: "rejected", now: "2026-08-17T00:02:00.000Z" });
    assert.equal(rejected.candidates.find((candidate) => candidate.candidateId === actor.candidateId)?.status, "rejected");
    const unit = extracted.candidates.find((candidate) => candidate.kind === "unit")!;
    const accepted = decideSourceCandidateR0({ ...input, sourceDocumentId: extracted.sourceDocumentId, candidateId: unit.candidateId, decision: "accepted", authorControlReviewId: "candidate-review.source-1", now: "2026-08-17T00:03:00.000Z" });
    assert.equal(accepted.candidates.find((candidate) => candidate.candidateId === unit.candidateId)?.authorControlReviewId, "candidate-review.source-1");
    const attached = attachAuthorControlReviewR0({ ...input, sourceDocumentId: accepted.sourceDocumentId, candidateIds: [unit.candidateId], reviewId: "candidate-review.source-1", now: "2026-08-17T00:04:00.000Z" });
    assert.equal(attached.candidates.find((candidate) => candidate.candidateId === unit.candidateId)?.authorControlReviewId, "candidate-review.source-1");
    const revised = importSourceDocumentR0({ ...input, filename: "钟楼.md", content: `${input.content}\n变化`, now: "2026-08-17T00:05:00.000Z" }).document;
    assert.throws(() => decideSourceCandidateR0({ ...input, sourceDocumentId: revised.sourceDocumentId, candidateId: unit.candidateId, decision: "accepted", now: "2026-08-17T00:06:00.000Z" }), /stale|过期/i);
  } finally {
    rmSync(input.projectPath, { recursive: true, force: true });
  }
});

test("handoff requires an accepted Unit and binds the exact source revision", () => {
  const input = fixture();
  try {
    const imported = importSourceDocumentR0({ ...input, filename: "钟楼.md", now: "2026-08-17T00:00:00.000Z" }).document;
    const extracted = extractSourceCandidatesR0({ ...input, sourceDocumentId: imported.sourceDocumentId, now: "2026-08-17T00:01:00.000Z" });
    const unit = extracted.candidates.find((candidate) => candidate.kind === "unit")!;
    assert.throws(() => createSourceImportHandoffR0({ ...input, sourceDocumentId: extracted.sourceDocumentId, unitCandidateId: unit.candidateId, executionBriefId: "brief.test", attentionContextHash: "a".repeat(64), authorQuestion: "比较", now: "2026-08-17T00:02:00.000Z" }), /reviewed|审核/i);
    const accepted = decideSourceCandidateR0({ ...input, sourceDocumentId: extracted.sourceDocumentId, candidateId: unit.candidateId, decision: "accepted", now: "2026-08-17T00:03:00.000Z" });
    const handoff = createSourceImportHandoffR0({ ...input, sourceDocumentId: accepted.sourceDocumentId, unitCandidateId: unit.candidateId, executionBriefId: "brief.test", attentionContextHash: "a".repeat(64), authorQuestion: "比较", now: "2026-08-17T00:04:00.000Z" });
    assert.equal(handoff.handoffs[0].revisionHash, accepted.currentRevisionHash);
    assert.equal(handoff.handoffs[0].executionBriefId, "brief.test");
    const retry = createSourceImportHandoffR0({ ...input, sourceDocumentId: accepted.sourceDocumentId, unitCandidateId: unit.candidateId, executionBriefId: "brief.test", attentionContextHash: "a".repeat(64), authorQuestion: "比较", now: "2026-08-17T00:05:00.000Z" });
    assert.equal(retry.handoffs.length, 1);
    assert.equal(readSourceImportR0(input.projectPath, accepted.sourceDocumentId)?.handoffs.length, 1);
  } finally {
    rmSync(input.projectPath, { recursive: true, force: true });
  }
});
