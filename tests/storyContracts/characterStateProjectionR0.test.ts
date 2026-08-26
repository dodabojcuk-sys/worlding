import assert from "node:assert/strict";
import test from "node:test";

import { CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION, createCharacterStateProjectionPort, type CharacterStateEvidence, type CharacterStateProjectionInput } from "../../src/storyContracts/characterStateProjection.ts";

const port = createCharacterStateProjectionPort();
const scope = { projectId: "project.tide-letter", projectVersion: "fixture-r0", branchId: "branch.main", narrativePosition: 3, worldTime: { kind: "relative" as const, label: "雾港来信后", sortKey: 3 }, sceneId: "scene.harbor", sourceRevision: "sources-r3" };
const item = (patch: Partial<CharacterStateEvidence> & Pick<CharacterStateEvidence, "claimId" | "category" | "statement" | "value" | "authority">): CharacterStateEvidence => ({ characterId: "fixture.character.shen-yan", learnedAtEventId: "fixture.event.letter", sourceAnchorIds: ["source.letter#2"], sourceRevision: "r1", branchId: "branch.main", narrativePosition: 1, worldTime: { kind: "relative", label: "来信后", sortKey: 1 }, sceneId: "scene.harbor", scope: "character_private", stale: false, conflictGroupId: null, ...patch });
const input = (evidence: CharacterStateEvidence[], override: Partial<CharacterStateProjectionInput["scope"]> = {}): CharacterStateProjectionInput => ({ character: { id: "fixture.character.shen-yan", name: "沈砚", revision: "character-r1" }, scope: { ...scope, ...override }, evidence });

test("Character State projects world state, knowledge, belief, misinformation and unknown without creating truth", () => {
  const projection = port.projectCharacterState(input([
    item({ claimId: "location", category: "location", statement: "沈砚在雾港", value: "雾港", authority: "world_fact" }),
    item({ claimId: "letter", category: "knowledge", statement: "沈砚知道信中警告", value: "知道警告", authority: "confirmed_knowledge" }),
    item({ claimId: "sender", category: "belief", statement: "沈砚误以为寄信人是守塔人", value: "寄信人是守塔人", authority: "misinformation" }),
    item({ claimId: "identity", category: "knowledge", statement: "寄信人身份", value: "未知", authority: "unknown", sourceAnchorIds: [] })
  ]));
  assert.equal(projection.locationState[0]?.value, "雾港");
  assert.equal(projection.knowledgeState[0]?.claimId, "letter");
  assert.equal(projection.beliefState[0]?.authority, "misinformation");
  assert.equal(projection.openQuestions[0]?.claimId, "identity");
  assert.equal(port.getProjectionProvenance(projection).length, 4);
});

test("scope rejects future, other-branch and other-character leakage", () => {
  const projection = port.projectCharacterState(input([
    item({ claimId: "current", category: "knowledge", statement: "当前", value: "可见", authority: "confirmed_knowledge" }),
    item({ claimId: "future", category: "knowledge", statement: "未来", value: "泄漏", authority: "confirmed_knowledge", narrativePosition: 4 }),
    item({ claimId: "future-world-time", category: "knowledge", statement: "同一叙事位置的未来世界时间", value: "泄漏", authority: "confirmed_knowledge", narrativePosition: 3, worldTime: { kind: "relative", label: "未来", sortKey: 4 } }),
    item({ claimId: "branch", category: "knowledge", statement: "副本", value: "泄漏", authority: "confirmed_knowledge", branchId: "branch.if" }),
    item({ claimId: "other", category: "knowledge", statement: "阿芜秘密", value: "泄漏", authority: "confirmed_knowledge", characterId: "fixture.character.a-wu" })
  ]));
  assert.deepEqual(projection.knowledgeState.map((entry) => entry.claimId), ["current"]);
});

test("knowledge-boundary tool declaration is complete and author-facing", () => {
  assert.equal(CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION.authorFacingLabel, "检查角色知识边界");
  assert.equal(CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION.classification, "read");
  assert.deepEqual(CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION.inputSchema.required, ["projection", "claims"]);
  assert.equal(CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION.outputSchema.type, "KnowledgeBoundaryReceipt");
  assert.equal(CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION.owner, "CharacterStateProjectionPort");
  assert.equal(CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION.timeoutMs, 2_000);
  assert.match(CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION.idempotency, /same projection revision/);
  assert.match(CHARACTER_KNOWLEDGE_BOUNDARY_TOOL_DEFINITION.failureBehavior, /fail closed/);
});

test("unknown world time is retained and never interpolated", () => {
  const projection = port.projectCharacterState(input([item({ claimId: "unknown-time", category: "knowledge", statement: "潮声低语", value: "听见低语", authority: "confirmed_knowledge", worldTime: { kind: "unknown", label: "世界时间未知", sortKey: null } })]));
  assert.equal(projection.knowledgeState[0]?.worldTime.kind, "unknown");
  assert.equal(projection.knowledgeState[0]?.worldTime.sortKey, null);
});

test("conflict and stale sources remain visible but do not become current knowledge", () => {
  const projection = port.projectCharacterState(input([
    item({ claimId: "conflict-a", category: "knowledge", statement: "旧名出现", value: "出现", authority: "contradiction", conflictGroupId: "conflict.old-name" }),
    item({ claimId: "stale", category: "knowledge", statement: "旧账册", value: "曾出现", authority: "confirmed_knowledge", stale: true })
  ]));
  assert.equal(projection.conflicts.length, 1);
  assert.equal(projection.staleSources.length, 1);
  assert.equal(projection.knowledgeState.length, 0);
});

test("knowledge boundary distinguishes verified, belief, secret, omniscient, missing, conflict and stale", () => {
  const projection = port.projectCharacterState(input([
    item({ claimId: "known", category: "knowledge", statement: "来信警告", value: "已知", authority: "confirmed_knowledge" }),
    item({ claimId: "belief", category: "belief", statement: "寄信人猜测", value: "守塔人", authority: "belief" }),
    item({ claimId: "secret", category: "knowledge", statement: "阿芜秘密", value: "秘密", authority: "confirmed_knowledge", subjectCharacterId: "fixture.character.a-wu" }),
    item({ claimId: "omniscient", category: "knowledge", statement: "作者全知", value: "旧名真相", authority: "confirmed_knowledge", scope: "author_only" }),
    item({ claimId: "conflict", category: "knowledge", statement: "冲突", value: "两种说法", authority: "contradiction", conflictGroupId: "c1" }),
    item({ claimId: "stale", category: "knowledge", statement: "过期", value: "旧说法", authority: "confirmed_knowledge", stale: true })
  ]));
  const claims = ["known", "belief", "secret", "omniscient", "missing", "conflict", "stale"].map((id) => ({ claimId: `assert-${id}`, characterId: projection.characterId, statement: id, assertedAs: id === "belief" ? "world_fact" as const : "character_knowledge" as const, sourceClaimId: id === "missing" ? null : id, branchId: projection.branchId, narrativePosition: projection.narrativePosition }));
  assert.deepEqual(port.validateKnowledgeBoundary(projection, claims).findings.map((finding) => finding.outcome), ["verified", "boundary_violation", "boundary_violation", "boundary_violation", "missing_evidence", "source_conflict", "stale_source"]);
});

test("state comparison explains only sourced changes", () => {
  const before = port.projectCharacterState(input([item({ claimId: "key", category: "possession", statement: "铜钥匙", value: "阿芜持有", authority: "world_fact" })], { narrativePosition: 1 }));
  const after = port.projectCharacterState(input([item({ claimId: "key", category: "possession", statement: "铜钥匙", value: "沈砚持有", authority: "world_fact", narrativePosition: 2, learnedAtEventId: "fixture.event.key-transfer" })], { narrativePosition: 2 }));
  assert.equal(port.compareCharacterStates(before, after)[0]?.after, "沈砚持有");
  assert.match(port.explainStateTransition(before, after)[0] || "", /fixture\.event\.key-transfer/);
});
