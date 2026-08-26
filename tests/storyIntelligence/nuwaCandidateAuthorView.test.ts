import assert from "node:assert/strict";
import test from "node:test";

import { createNuwaCandidateAuthorViewModel } from "../../src/storyIntelligence/nuwaCandidateFutureRuns.ts";
import type { NuwaCandidateFutureRun } from "../../src/storyIntelligence/storyIntelligenceTypes.ts";

function candidate(strategy: NuwaCandidateFutureRun["branch"]["strategy"]): NuwaCandidateFutureRun {
  return {
    version: "story-studio-nuwa-candidate-future-run/v1", candidateId: "candidate-1", runId: "run-1", parentRunId: "run-parent", seed: 1701, snapshotHash: "a".repeat(64), startingRevision: "a".repeat(64), branchId: "branch-1",
    branch: { id: "branch-1", strategy, title: "候选", summary: "围绕“作者问题”提供部分可验证信息。", immediateConsequence: "林海看见门外的灯灭了。", mediumTermConsequence: "他必须在雨里选择是否追出去。", longTermPressure: "第三声钟的来源仍需回收。", affectedObjects: [], preservedMysteries: ["第三声钟的来源"], risks: [{ id: "risk-1", level: "medium", summary: "过早揭示会压缩悬念。", evidenceIds: [] }], evidence: [], assumptions: [], unsupported: false, sourceAgentRoles: [] },
    actorDecisionSequence: [], beatEvolution: [], stateDiff: [], causalChain: [], checkpoint: "检查点", unresolvedRisks: [], sourceRefs: [], traceHash: "b".repeat(64), knowledgeBoundary: { rule: "角色只能使用当前快照。", unknownBeforeCheckpoint: [] }, cost: { modelCalls: 0, provider: "deterministic", estimatedUsd: 0 }, status: "candidate"
  };
}

test("candidate author view is concise, strategy-specific, and hides technical repetition", () => {
  const immediate = createNuwaCandidateAuthorViewModel({ candidate: candidate("immediate-reveal") });
  const partial = createNuwaCandidateAuthorViewModel({ candidate: candidate("partial-clue") });
  const delayed = createNuwaCandidateAuthorViewModel({ candidate: candidate("delayed-reveal") });
  assert.notEqual(immediate.direction, partial.direction);
  assert.notEqual(partial.direction, delayed.direction);
  assert.doesNotMatch(JSON.stringify({ immediate, partial, delayed }), /1701|run-1|snapshotHash|作者问题/u);
  assert.match(delayed.causalDifference, /当前场景变化最小/u);
  assert.match(partial.causalDifference, /悬念仍保留/u);
});
