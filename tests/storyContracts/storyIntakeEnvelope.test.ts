import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { validateToolArguments } from "@earendil-works/pi-ai";
import { parseAndNormalizeTianyiGroundedAnswer } from "../../src/storyContinuity/tianyiGroundedAnswer.ts";

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

// Reproduce the live provider's structurally valid but semantically invalid frame.
test("Story Intake rejects incompatible title, path and relation fields without publishing", async () => {
  let published = 0;
  const tool = createStoryIntakeProposalTool({ projectId: "project-fixture", sessionId: sourceRef.sessionId, runId: "run.story-intake", sourceRef, sourceText, baseVersion, onEnvelope() { published += 1; } });
  const invalid = structuredClone(argumentsFixture);
  invalid.candidates[1]!.proposedName = "旧灯塔";
  await assert.rejects(tool.execute({ toolCallId: "live-invalid", arguments: invalid, approvalReceiptId: null }), /name\/title/u);
  assert.equal(published, 0);
  await tool.execute({ toolCallId: "corrected", arguments: argumentsFixture, approvalReceiptId: null });
  assert.equal(published, 1);
  const invalidPath = structuredClone(argumentsFixture);
  invalidPath.candidates[0]!.narrativePath = { kind: "main", label: "错误公开路径" };
  assert.throws(() => build(invalidPath), /Only narrative_path_membership/u);
  const invalidLink = structuredClone(argumentsFixture);
  invalidLink.candidates[2]!.proposedRelations[0]!.targetLocalRef = "character.林昭";
  assert.throws(() => build(invalidLink));
});

const liveEvidence = new URL("../../data/2026-09-22_女娲主导工作区R0/夜间作者工作流R4/", import.meta.url);
test("captured live ordinary reply rejects unsupported fact claims, independently of candidate tools", () => {
  const raw = readFileSync(new URL("answer-2.txt", liveEvidence), "utf8");
  assert.throws(() => parseAndNormalizeTianyiGroundedAnswer(raw, { includedSourceRefs: [], excludedSources: [] }), /factual claim requires current evidence/u);
});

test("captured live candidate frame is rejected by the actual Pi schema before domain publication", () => {
  const response = JSON.parse(JSON.parse(readFileSync(new URL("response-5.json", liveEvidence), "utf8")).text);
  const call = response.choices[0].message.tool_calls[0].function;
  const args = JSON.parse(call.arguments);
  const original = JSON.stringify(args);
  const tool = createStoryIntakeProposalTool({ projectId: "project-fixture", sessionId: sourceRef.sessionId, runId: "run.story-intake", sourceRef, sourceText, baseVersion, onEnvelope() { assert.fail("invalid frame cannot publish"); } });
  const native = { name: tool.name, description: tool.description, parameters: tool.inputSchema };
  assert.throws(() => validateToolArguments(native, { name: call.name, arguments: args }), /Validation failed/u);
  assert.equal(JSON.stringify(args), original, "captured response must not be rewritten");
  assert.deepEqual(validateToolArguments(native, { name: tool.name, arguments: argumentsFixture }), argumentsFixture);
  // Fixing mirrored labels alone must not silently accept invented path membership.
  for (const candidate of args.candidates) candidate.proposedName = null;
  assert.throws(() => validateToolArguments(native, { name: call.name, arguments: args }), /Validation failed/u);
  // Even after structural repair, raw object IDs cannot bypass candidate identity links.
  for (const candidate of args.candidates) candidate.narrativePath = null;
  const requests = readFileSync(new URL("requests.jsonl", liveEvidence), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const authorSource = requests.find((request) => request.id === 5).body.messages[1].content.split("作者原话：\n")[1];
  assert.throws(() => buildStoryIntakeEnvelope({ projectId: "project-fixture", sessionId: sourceRef.sessionId, runId: "run.story-intake", sourceRef, sourceText: authorSource, baseVersion, toolArguments: args, providerCalls: 1, createdAt: "2026-09-23T00:00:00Z" }), /Story Intake link target is invalid/u);
});

test("existing entity links accept exact authorized Chinese IDs but never a cross-type or unlisted ID", () => {
  const args = structuredClone(argumentsFixture);
  args.candidates[0]!.existingEntityId = "character.林昭";
  args.candidates[0]!.identityDecision = "link_existing";
  const input = { projectId: "project-fixture", sessionId: sourceRef.sessionId, runId: "run.story-intake", sourceRef, sourceText, baseVersion, toolArguments: args, providerCalls: 1, createdAt: "2026-09-23T00:00:00Z", existingEntities: [{ objectId: "character.林昭", objectType: "character" as const, title: "林昭", revisionToken: "r1" }] };
  assert.equal(buildStoryIntakeEnvelope(input).candidates[0]?.existingEntityMatch?.objectId, "character.林昭");
  assert.throws(() => buildStoryIntakeEnvelope({ ...input, existingEntities: [] }), /outside the authorized project index/u);
  assert.throws(() => buildStoryIntakeEnvelope({ ...input, existingEntities: [{ ...input.existingEntities[0]!, objectType: "item" }] }), /type does not match/u);
});
