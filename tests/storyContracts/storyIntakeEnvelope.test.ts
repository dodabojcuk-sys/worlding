import assert from "node:assert/strict";
import test from "node:test";

import { buildStoryIntakeEnvelope, confirmStoryIntakeCandidate, migrateStoryIntakeEnvelopeV1, updateStoryIntakeCandidateLifecycle } from "../../src/storyContracts/storyIntakeEnvelope.ts";
import { createStoryIntakeProposalTool } from "../../src/storyAgent/storyIntakeTool.ts";

const sourceText = "故事单元：旧灯塔。林昭带着雾灯匣进入旧灯塔，在值班室找到守夜记录。";
const sourceRef = { sessionId: "session.story-intake", eventId: "event.author.story-intake", contentHash: "a".repeat(64) };
const baseVersion = { workVersionId: "work-version.fixture", revision: 7, manifestId: "manifest.fixture" };
const argumentsFixture = {
  candidates: [
    { localRef: "character-linzhao", type: "character", proposedName: "林昭", proposedTitle: null, summary: "进入灯塔的人物。", sourceSpan: { excerpt: "林昭" }, confidence: 0.99, uncertainties: ["人物背景未知。"], existingEntityId: null, identityDecision: "propose_new", proposedRelations: [], warnings: [], narrativePath: null },
    { localRef: "story-unit-lighthouse", type: "story_unit", proposedName: null, proposedTitle: "旧灯塔", summary: "灯塔叙事单元。", sourceSpan: { excerpt: "故事单元：旧灯塔" }, confidence: 0.97, uncertainties: ["单元边界待审查。"], existingEntityId: null, identityDecision: "propose_new", proposedRelations: [], warnings: [], narrativePath: null },
    { localRef: "path-main", type: "narrative_path_membership", proposedName: null, proposedTitle: "主线：灯塔调查", summary: "同版本主线候选。", sourceSpan: { excerpt: "林昭带着雾灯匣进入旧灯塔" }, confidence: 0.8, uncertainties: ["未确定后续编排。"], existingEntityId: null, identityDecision: "propose_new", proposedRelations: [{ relation: "member-of-narrative-path", targetLocalRef: "story-unit-lighthouse", label: null }], warnings: [], narrativePath: { kind: "main", label: "灯塔调查" } }
  ]
};

function build(toolArguments: unknown = argumentsFixture) {
  return buildStoryIntakeEnvelope({ projectId: "project-fixture", sessionId: sourceRef.sessionId, runId: "run.story-intake", sourceRef, sourceText, baseVersion, toolArguments, providerCalls: 2, createdAt: "2026-09-05T08:00:00.000Z" });
}

test("Story Intake envelope preserves exact evidence, BaseVersion and candidate-only lifecycle", () => {
  const envelope = build();
  assert.equal(envelope.formalStoryWrites, 0);
  assert.equal(envelope.provider.runtime, "pi");
  assert.equal(envelope.candidates[0]?.sourceSpan.start, sourceText.indexOf("林昭"));
  assert.equal(envelope.candidates[0]?.sourceSpan.excerpt, "林昭");
  assert.equal(envelope.candidates[0]?.sourceEvidence.excerpt, "林昭");
  assert.equal(envelope.candidates[1]?.type, "story_unit");
  assert.equal(envelope.candidates[0]?.baseVersion.revision, 7);
  assert.equal(envelope.candidates[2]?.narrativePath?.kind, "main");
  assert.match(envelope.candidates[2]?.proposedRelations[0]?.targetCandidateId ?? "", /^candidate\.story-intake\./u);
  const archived = updateStoryIntakeCandidateLifecycle(envelope, envelope.candidates[0]!.candidateId, "pending-archive");
  assert.equal(archived.candidates[0]?.lifecycleStatus, "pending-archive");
  assert.equal(archived.formalStoryWrites, 0);
  assert.equal(envelope.candidates[0]?.lifecycleStatus, "pending-review");
  const confirmed = confirmStoryIntakeCandidate(envelope, envelope.candidates[0]!.candidateId, { owner: "story-workspace-object", objectId: "character.linzhao", proposalId: "proposal.linzhao", receiptId: "operation.confirm", appliedAt: "2026-09-05T08:01:00.000Z" });
  assert.equal(confirmed.candidates[0]?.lifecycleStatus, "confirmed");
  assert.equal(confirmed.formalStoryWrites, 1);
  assert.throws(() => confirmStoryIntakeCandidate(envelope, envelope.candidates[1]!.candidateId, { owner: "story-workspace-object", objectId: "unit.bad", proposalId: "proposal.bad", receiptId: "operation.bad", appliedAt: "2026-09-05T08:01:00.000Z" }), /safe formal Story Intake writer/u);
});

test("Story Intake v1 migrates legacy aliases only at the read boundary and writes canonical types", () => {
  const canonical = build();
  const legacy = structuredClone(canonical) as any;
  legacy.candidates[1].kind = "storyUnit";
  legacy.candidates[1].type = "story_unit";
  legacy.candidates[1].proposedLinks = legacy.candidates[1].proposedRelations;
  delete legacy.candidates[1].proposedRelations;
  legacy.candidates[2].kind = "narrativePathMembership";
  legacy.candidates[2].type = "storyline";
  const migrated = migrateStoryIntakeEnvelopeV1(legacy)!;
  assert.deepEqual(migrated.candidates.map((candidate) => candidate.type), ["character", "story_unit", "narrative_path_membership"]);
  assert.equal("kind" in migrated.candidates[1]!, false);
  assert.equal("proposedLinks" in migrated.candidates[1]!, false);
  assert.equal(JSON.stringify(canonical).includes("storyUnit"), false);
  assert.equal(JSON.stringify(canonical).includes("narrativePathMembership"), false);
  assert.equal(JSON.stringify(canonical).includes('"storyline"'), false);
});

test("Story Intake rejects missing evidence, invented excerpts and derived-version semantics", () => {
  assert.throws(() => build({ candidates: [{ ...argumentsFixture.candidates[0], sourceSpan: { excerpt: "原文不存在" } }] }), /does not exactly match/u);
  assert.throws(() => build({ candidates: [{ ...argumentsFixture.candidates[0], uncertainties: [] }] }), /uncertainties/u);
  assert.throws(() => build({ candidates: [{ ...argumentsFixture.candidates[2], narrativePath: { kind: "if", label: "IF" } }] }), /Narrative Path kind/u);
  assert.throws(() => build({ candidates: Array.from({ length: 25 }, (_, index) => ({ ...argumentsFixture.candidates[0], localRef: `character-${index}` })) }), /between 1 and 24/u);
  assert.throws(() => build({ candidates: Array.from({ length: 20 }, (_, index) => ({ ...argumentsFixture.candidates[0], localRef: `character-${index}`, uncertainties: Array.from({ length: 8 }, (_, uncertaintyIndex) => `${index}-${uncertaintyIndex}-` + "不确定".repeat(95)) })) }), /bounded archive payload/u);
});

test("propose_story_intake validates its native tool frame and produces no formal story write", async () => {
  let captured = null;
  const tool = createStoryIntakeProposalTool({ projectId: "project-fixture", sessionId: sourceRef.sessionId, runId: "run.story-intake", sourceRef, sourceText, baseVersion, now: () => "2026-09-05T08:00:00.000Z", onEnvelope(envelope) { captured = envelope; } });
  const result = await tool.execute({ toolCallId: "tool-call.fixture", arguments: argumentsFixture, approvalReceiptId: null });
  assert.equal(result.formalStoryWrites, 0);
  assert.equal(result.status, "candidate-only");
  assert.equal(captured?.candidates.length, 3);
  await assert.rejects(tool.execute({ toolCallId: "tool-call.bad", arguments: { candidates: [{ ...argumentsFixture.candidates[0], unexpected: true }] }, approvalReceiptId: null }), /fields are invalid/u);
  await assert.rejects(tool.execute({ toolCallId: "tool-call.too-many", arguments: argumentsFixture, approvalReceiptId: null }), /结构修复机会已用尽/u);
});
