import assert from "node:assert/strict";
import test from "node:test";

import { buildStoryIntakeEnvelope } from "../../src/storyContracts/storyIntakeEnvelope.ts";
import {
  createActiveStoryIntakeCandidateRef,
  filterStoryIntakeSelection,
  parseActiveStoryIntakeCandidateRef,
  resolveActiveStoryIntakeCandidate,
  selectStoryIntakeCandidateScope,
  serializeActiveStoryIntakeCandidateRef,
  storyIntakeCandidateRefStorageKey
} from "../../apps/story-studio/src/components/tianyi/workspace/storyIntakeWorkspaceState.ts";

const source = "林昭在雾港灯塔目睹守夜钟失踪。阿芜仍在人口中等待，却误以为顾澜偷走了钟。旧城航线因此中断。";

function envelope(projectId = "project.rain-bell", workVersionId = "work-version.rain-bell", revision = 3) {
  return buildStoryIntakeEnvelope({
    projectId,
    sessionId: "session.rain-bell",
    runId: "run.rain-bell.1",
    sourceRef: { sessionId: "session.rain-bell", eventId: "event.author.1", contentHash: "a".repeat(64) },
    sourceText: source,
    baseVersion: { workVersionId, revision, manifestId: "manifest.rain-bell" },
    toolArguments: { candidates: [
      { localRef: "event.missing-bell", type: "event", proposedName: null, proposedTitle: "守夜钟失踪", summary: "林昭目睹守夜钟在雨夜离奇失踪。", sourceSpan: { excerpt: "林昭在雾港灯塔目睹守夜钟失踪" }, confidence: .95, uncertainties: ["发生时间尚未完全确定。"], existingEntityId: null, identityDecision: "propose_new", proposedRelations: [], warnings: [], narrativePath: null },
      { localRef: "unit.investigation", type: "story_unit", proposedName: null, proposedTitle: "雨夜追查", summary: "围绕失踪守夜钟展开追查。", sourceSpan: { excerpt: source }, confidence: .9, uncertainties: ["故事单元边界待作者确认。"], existingEntityId: null, identityDecision: "propose_new", proposedRelations: [], warnings: [], narrativePath: null },
      { localRef: "unresolved.future", type: "unresolved", proposedName: null, proposedTitle: "作者未来意图", summary: "后续希望揭示顾澜并非偷钟者。", sourceSpan: { excerpt: "阿芜仍在人口中等待，却误以为顾澜偷走了钟" }, confidence: .7, uncertainties: ["尚未成为世界规则。"], existingEntityId: null, identityDecision: "propose_new", proposedRelations: [], warnings: [], narrativePath: null }
    ] },
    providerCalls: 1,
    requestedProviderId: "local-fake",
    requestedModelId: "deterministic",
    responseModelId: "deterministic",
    createdAt: "2026-09-05T00:00:00.000Z"
  });
}

test("a visible real Envelope candidate enters Work by reference without changing lifecycle or creating a second candidate", () => {
  const current = envelope();
  const candidate = current.candidates[0];
  const before = structuredClone(current);
  const ref = createActiveStoryIntakeCandidateRef(current, candidate.candidateId);
  const resolved = resolveActiveStoryIntakeCandidate({ projectId: current.projectId, workVersionId: current.baseVersion.workVersionId, sessionId: current.sessionId, envelope: current, ref });

  assert.equal(current.candidates.length, 3, "the same visible Envelope remains the only candidate collection");
  assert.equal(resolved.status, "ready");
  assert.equal(resolved.candidate, candidate, "Work resolves the exact candidate object from the Envelope");
  assert.deepEqual(current, before, "entering Work is a UI reference and cannot mutate candidate lifecycle");
  assert.equal(candidate.lifecycleStatus, "pending-review");
});

test("the active reference survives refresh and remains isolated to project, session, run, and base version", () => {
  const current = envelope();
  const ref = createActiveStoryIntakeCandidateRef(current, current.candidates[0].candidateId);
  const restored = parseActiveStoryIntakeCandidateRef(serializeActiveStoryIntakeCandidateRef(ref), current.projectId);
  assert.deepEqual(restored, ref);
  assert.match(storyIntakeCandidateRefStorageKey(current.projectId, current.sessionId), /project\.rain-bell:session\.rain-bell/u);
  assert.equal(parseActiveStoryIntakeCandidateRef(serializeActiveStoryIntakeCandidateRef(ref), "project.other"), null);

  assert.equal(resolveActiveStoryIntakeCandidate({ projectId: "project.other", workVersionId: current.baseVersion.workVersionId, sessionId: current.sessionId, envelope: current, ref }).status, "project-mismatch");
  assert.equal(resolveActiveStoryIntakeCandidate({ projectId: current.projectId, workVersionId: current.baseVersion.workVersionId, sessionId: "session.other", envelope: current, ref }).status, "session-mismatch");
  assert.equal(resolveActiveStoryIntakeCandidate({ projectId: current.projectId, workVersionId: current.baseVersion.workVersionId, sessionId: current.sessionId, envelope: { ...current, runId: "run.other" }, ref }).status, "run-mismatch");
  assert.equal(resolveActiveStoryIntakeCandidate({ projectId: current.projectId, workVersionId: current.baseVersion.workVersionId, sessionId: current.sessionId, envelope: envelope(current.projectId, current.baseVersion.workVersionId, 4), ref }).status, "base-version-stale");
  assert.equal(resolveActiveStoryIntakeCandidate({ projectId: current.projectId, workVersionId: current.baseVersion.workVersionId, sessionId: current.sessionId, envelope: { ...current, candidates: current.candidates.slice(1) }, ref }).status, "candidate-missing");
});

test("active candidate recovery keys are isolated between old and new conversations in one project", () => {
  const oldConversation = envelope();
  const newConversation = envelope();
  newConversation.sessionId = "session.rain-bell.2";
  newConversation.runId = "run.rain-bell.2";

  assert.notEqual(
    storyIntakeCandidateRefStorageKey(oldConversation.projectId, oldConversation.sessionId),
    storyIntakeCandidateRefStorageKey(newConversation.projectId, newConversation.sessionId),
    "a new conversation must not recover the old conversation's focused Work candidate"
  );
});

test("an explicit batch scope contains only selected candidates and preserves their order and lifecycle", () => {
  const current = envelope();
  const selectedIds = [current.candidates[1].candidateId, current.candidates[0].candidateId];
  const selected = selectStoryIntakeCandidateScope(current, selectedIds);
  assert.deepEqual(selected.map((candidate) => candidate.candidateId), selectedIds);
  assert.equal(selected.some((candidate) => candidate.candidateId === current.candidates[2].candidateId), false, "unselected candidates cannot be smuggled into a batch");
  assert.equal(selected.every((candidate) => candidate.lifecycleStatus === "pending-review"), true);
  assert.throws(() => selectStoryIntakeCandidateScope(current, [...selectedIds, "candidate.missing"]), /不存在/u);
});

test("a new Envelope drops stale selection ids before rendering or entering Work", () => {
  const current = envelope();
  const staleIds = ["candidate.from-an-older-run", current.candidates[1].candidateId, current.candidates[1].candidateId];
  assert.deepEqual(filterStoryIntakeSelection(current, staleIds), [current.candidates[1].candidateId]);
});
