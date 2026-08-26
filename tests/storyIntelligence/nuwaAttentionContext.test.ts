import assert from "node:assert/strict";
import test from "node:test";

import { buildNuwaAttentionContext, normalizeNuwaAttentionContext, projectNuwaAttentionForAuthor } from "../../src/storyIntelligence/nuwaAttentionContext.ts";
import { buildNuwaStoryRecallProjection } from "../../src/storyIntelligence/nuwaStoryRecallProjection.ts";
import type { StorySnapshot } from "../../src/storyIntelligence/storyIntelligenceTypes.ts";

function snapshot(): StorySnapshot {
  const project = { id: "project.demo", relativePath: "project.md", type: "project" as const, title: "雨城", status: "current", links: [], evidenceExcerpt: "雨城的钟楼守着北门。" };
  const scene = { id: "scene.roof", relativePath: "chapters/01/scene.md", type: "scene" as const, title: "屋顶", status: "current", links: ["character.lin"], evidenceExcerpt: "林海在屋顶等雨停。" };
  const actor = { id: "character.lin", relativePath: "characters/lin.md", type: "character" as const, title: "林海", status: "current", links: [], evidenceExcerpt: "林海知道钟声来自北门。" };
  const rule = { id: "rule.no-magic", relativePath: "rules/no-magic.md", type: "rule" as const, title: "不能凭空施法", status: "locked", links: [], evidenceExcerpt: "任何变化必须有可追溯来源。" };
  const thread = { id: "thread.bell", relativePath: "threads/bell.md", type: "thread" as const, title: "第三声钟的来源", status: "open", links: [], evidenceExcerpt: "第三声钟仍未解释。" };
  const notes = [project, scene, actor, rule, thread];
  const base = { version: "world-os-story-snapshot-v1" as const, project, currentChapter: null, currentScene: scene, notes, selectedNoteRefs: [scene.relativePath, actor.relativePath], openThreads: [thread], lockedRules: [rule], recentAcceptedChanges: [], deterministic: true as const };
  return { ...base, snapshotHash: "f".repeat(64) };
}

function brief(snapshotHash: string) {
  return {
    briefId: "brief.demo", sourceProject: { projectId: "project.demo", projectRevision: snapshotHash },
    currentContext: { documentId: "scene.roof", objectIds: ["character.lin"], selectionRef: "block.roof" },
    startingPoint: { beatId: "beat.wait", checkpoint: "checkpoint.roof" }, authorGoal: "看看第三声钟会如何改变林海的选择。", sourceQuestion: "第三声钟的来源是什么？",
    selectedContextReceiptIds: ["receipt.authored"], selectedArchiveMessageRefs: [], approvedMemoryRefs: [], mustKeep: ["不能凭空施法"], mustAvoid: ["不要直接确认未知事实"], unresolvedQuestions: ["第三声钟的来源"], participatingActorIds: ["character.lin"], observationCriteria: { success: ["形成可验证差异"], failure: ["使用未来信息"] }, capabilityBudget: { maxAgentRuns: 3, maxSkillCalls: 1, maxTokens: 4000 }
  };
}

test("attention context is deterministic, exact-versioned, and author-projectable", () => {
  const context = buildNuwaAttentionContext({ brief: brief(snapshot().snapshotHash), snapshot: snapshot(), resolvedSources: [{ kind: "context-receipt", id: "receipt.authored", hash: "a".repeat(64), label: "作者钉住的回执", excerpt: "只保留当前问题相关材料。" }] });
  assert.equal(context.deterministic, true);
  assert.equal(context.readOnly, true);
  assert.equal(context.capsuleHash.length, 64);
  assert.equal(buildNuwaAttentionContext({ brief: brief(snapshot().snapshotHash), snapshot: snapshot(), resolvedSources: [{ kind: "context-receipt", id: "receipt.authored", hash: "a".repeat(64), label: "作者钉住的回执", excerpt: "只保留当前问题相关材料。" }] }).capsuleHash, context.capsuleHash);
  assert.ok(context.includedSources.some((source) => source.label === "屋顶"));
  assert.ok(context.excludedSources.some((source) => source.reason === "与当前焦点无直接关系") || context.excludedSources.length === 0);
  assert.ok(context.actorKnowledge[0]?.unknowns.length);
  assert.doesNotMatch(JSON.stringify(projectNuwaAttentionForAuthor(context)), /snapshotHash|capsuleHash|receipt\.authored/u);
  assert.deepEqual(normalizeNuwaAttentionContext(context), context);
  const changedQuestion = buildNuwaAttentionContext({ brief: { ...brief(snapshot().snapshotHash), sourceQuestion: "换一个问题" }, snapshot: snapshot(), resolvedSources: [{ kind: "context-receipt", id: "receipt.authored", hash: "a".repeat(64), label: "作者钉住的回执", excerpt: "只保留当前问题相关材料。" }] });
  assert.notEqual(changedQuestion.capsuleHash, context.capsuleHash);
});

test("attention context fails closed on stale snapshots and wildcard revisions", () => {
  const sourceSnapshot = snapshot();
  const context = buildNuwaAttentionContext({ brief: brief(sourceSnapshot.snapshotHash), snapshot: sourceSnapshot });
  assert.throws(() => buildNuwaAttentionContext({ brief: brief("0".repeat(64)), snapshot: sourceSnapshot }), /stale/u);
  const tampered = structuredClone(context);
  tampered.includedSources[0]!.revision = "latest";
  assert.throws(() => normalizeNuwaAttentionContext(tampered), /exact source revisions/u);
});

test("story recall is rebuildable projection and never imports rejected candidate prose", () => {
  const current = snapshot();
  const projection = buildNuwaStoryRecallProjection({ snapshot: current, acceptedCandidateSourceIds: ["thread.bell"] });
  assert.equal(projection.rebuildable, true);
  assert.equal(projection.writesCanonicalMemory, false);
  assert.ok(projection.entries.every((entry) => entry.sourceIds.includes("thread.bell")));
  assert.doesNotMatch(JSON.stringify(projection), /candidate|rejected|Run Pack/u);
  assert.equal(buildNuwaStoryRecallProjection({ snapshot: current, acceptedCandidateSourceIds: ["thread.bell"] }).projectionHash, projection.projectionHash);
});
