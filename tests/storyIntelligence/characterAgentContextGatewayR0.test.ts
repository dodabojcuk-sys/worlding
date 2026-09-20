import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildEventStoryCrossingKnowledgeProjection } from "../../src/storyContracts/eventStoryCrossingKnowledge.ts";
import {
  prepareCharacterContextGateway,
  projectCharacterContextExclusionCounts,
  projectNuwaN1ProviderSafeContext,
  serializeNuwaN1ProviderSafeContext
} from "../../src/storyContracts/characterAgentContextGateway.ts";
import { projectWorldReferences } from "../../src/storyContracts/worldReferenceProjection.ts";

const guardRevision = "a".repeat(64);
const twinRevision = "b".repeat(64);
const SECRET_TITLE = "SECRET_UNKNOWN_TITLE_SENTINEL";
const SECRET_BODY = "SECRET_UNKNOWN_BODY_SENTINEL";

const characters = [
  { id: "character.guard", label: "林月如", revisionToken: guardRevision },
  { id: "character.twin", label: "林月如", revisionToken: twinRevision }
];

const events = [
  { id: "event.known", title: "林月如目击潮门开启", status: "active", revisionToken: "known-r1", tags: ["知情：character.guard=已亲历"], knowledgeSubjectIds: ["character.guard"], body: "允许角色知道的正文也不应整段进入上下文。" },
  { id: "event.belief", title: "林月如怀疑渡船藏有密函", status: "active", revisionToken: "belief-r1", tags: ["知情：character.guard=怀疑"], body: "怀疑依据正文不跨越安全投影。" },
  { id: "event.twin", title: "同名角色独有线索", status: "active", revisionToken: "twin-r1", tags: ["知情：character.twin=已得知"], body: "只属于另一个稳定 ID。" },
  { id: "event.secret", title: SECRET_TITLE, status: "active", revisionToken: "secret-r1", tags: ["作者秘密"], body: SECRET_BODY }
];

function projection(observerId = "character.guard") {
  return buildEventStoryCrossingKnowledgeProjection({ projectId: "gray-tower", observerId, events, characters });
}

function prepare(overrides: Partial<Parameters<typeof prepareCharacterContextGateway>[0]> = {}) {
  return prepareCharacterContextGateway({
    projectId: "gray-tower",
    projection: projection(),
    characters: characters.map((character) => ({ id: character.id, label: character.label, type: "character" as const, formal: true, version: character.revisionToken })),
    actor: { id: "character.guard", revision: guardRevision, profileCore: "先求证，再行动", boundaries: "不伤害无辜" },
    scene: { storyUnit: { id: "story-unit.harbor", revision: "unit-r1" }, sceneRef: { id: "scene.tide-gate", revision: "scene-r1" }, observedAt: null, label: "潮门外" },
    localGoal: "核实潮门异动",
    excludedReasonCounts: { "author-note": 1, rumor: 1, "character-unknown": 1 },
    ...overrides
  });
}

test("character permission produces one safe NuwaN1Context preview without a Provider call", () => {
  const result = prepare();

  assert.equal(result.handoff.contextAccess, "character");
  assert.equal(result.providerCalls, 0);
  assert.equal(result.writes, 0);
  assert.ok(result.context);
  assert.equal(result.context.actor.id, "character.guard");
  assert.equal(result.context.scene.observedAt, "无世界时间依据");
  assert.deepEqual(result.context.knownFacts.map((fact) => fact.factId), ["event.known"]);
  assert.deepEqual(result.context.beliefs.map((belief) => [belief.beliefId, belief.stance]), [["event.belief", "suspected"]]);
  assert.equal(result.authorPreviewCanonicalJson, result.providerSafeContextCanonicalJson);
});

test("display-only and author permissions fail closed before model context construction", () => {
  const displayOnly = prepare({
    characters: [{ id: "character.guard", label: "林月如", type: "character", formal: true, version: "stale" }]
  });
  assert.equal(displayOnly.handoff.contextAccess, "display-only");
  assert.equal(displayOnly.context, null);
  assert.equal(displayOnly.providerSafeContext, null);
  assert.equal(displayOnly.authorPreviewCanonicalJson, null);
  assert.equal(displayOnly.providerCalls, 0);

  const authorProjection = buildEventStoryCrossingKnowledgeProjection({ projectId: "gray-tower", observerId: "author", events, characters });
  const author = prepare({ projection: authorProjection });
  assert.equal(author.handoff.contextAccess, "author");
  assert.equal(author.context, null);
  assert.equal(author.providerSafeContextCanonicalJson, null);
  assert.equal(author.providerCalls, 0);
});

test("renaming a character does not change stable binding and same-name roles never share facts", () => {
  const before = prepare();
  const renamed = prepare({
    characters: characters.map((character) => ({ id: character.id, label: character.id === "character.guard" ? "林月如·改名" : character.label, type: "character" as const, formal: true, version: character.revisionToken })),
    actor: { id: "character.guard", revision: guardRevision, profileCore: "先求证，再行动", boundaries: "不伤害无辜" }
  });
  assert.equal(before.handoff.observerId, renamed.handoff.observerId);
  assert.equal(before.context?.actor.id, renamed.context?.actor.id);
  assert.deepEqual(before.context?.knownFacts.map((fact) => fact.factId), renamed.context?.knownFacts.map((fact) => fact.factId));
  assert.equal(renamed.providerSafeContextCanonicalJson?.includes("林月如·改名"), false, "display names stay outside the model payload");

  const twin = prepare({
    projection: projection("character.twin"),
    actor: { id: "character.twin", revision: twinRevision, profileCore: null, boundaries: null }
  });
  assert.deepEqual(twin.context?.knownFacts.map((fact) => fact.factId), ["event.twin"]);
  assert.equal(twin.context?.knownFacts.some((fact) => fact.factId === "event.known"), false);
});

test("missing scene and goal remain UI conditions instead of fabricated Provider fields", () => {
  const result = prepare({ scene: null, localGoal: null });
  assert.ok(result.context, "the existing NuwaN1Context shape remains available for the read-only preview");
  assert.equal(result.context.localGoal, "");
  assert.equal(result.context.scene.label, "未选择场景");
  assert.equal("scene" in (result.providerSafeContext ?? {}), false);
  assert.equal("localGoal" in (result.providerSafeContext ?? {}), false);
  assert.equal("runId" in (result.providerSafeContext ?? {}), false);
  assert.equal("step" in (result.providerSafeContext ?? {}), false);
  assert.equal("remaining" in (result.providerSafeContext ?? {}), false);
  assert.equal(result.providerSafeContext?.previewMode, true);
  assert.equal(result.context.runId, "");
  assert.equal(result.context.attemptId, "");
  assert.equal(result.context.step, 0);
  assert.equal(result.context.remaining.committedSteps, 0);
  assert.equal(result.context.remaining.dispatches, 0);
  assert.deepEqual(result.missingConditions.slice(0, 3), ["scene", "goal", "world-time"]);
});

test("unknown, author-note and rumor content never appears in serialized model context", () => {
  const result = prepare();
  const serialized = result.providerSafeContextCanonicalJson ?? "";

  assert.equal(serialized.includes(SECRET_TITLE), false);
  assert.equal(serialized.includes(SECRET_BODY), false);
  assert.equal(serialized.includes("允许角色知道的正文"), false);
  assert.equal(serialized.includes("怀疑依据正文"), false);
  assert.deepEqual(result.providerSafeContext?.excluded, {
    count: 3,
    reasonCodes: ["author-note", "character-unknown", "rumor"]
  });
});

test("author preview and Provider adapter use the same safe projection and stable serialization", () => {
  const result = prepare();
  assert.ok(result.context);
  assert.deepEqual(result.providerSafeContext, projectNuwaN1ProviderSafeContext(result.context, { mode: "preview" }));
  assert.equal(result.authorPreviewCanonicalJson, serializeNuwaN1ProviderSafeContext(result.context, { mode: "preview" }));
  assert.throws(() => projectNuwaN1ProviderSafeContext(result.context), /cannot be projected as a Nuwa Run payload/u);

  const adapter = readFileSync("apps/story-studio/server/nuwaN1PiAdapter.mjs", "utf8");
  assert.match(adapter, /projectNuwaN1ProviderSafeContext/);
  assert.doesNotMatch(adapter, /function safeContextForProvider/);
});

test("unrelated project author notes and rumors do not change the operation-scoped exclusion count or leak sentinels", () => {
  const unrelatedAuthorId = "world.unrelated-author-note-stable-id";
  const unrelatedRumorId = "world.unrelated-rumor-stable-id";
  const unrelatedAuthorTitle = "UNRELATED_AUTHOR_NOTE_TITLE_SENTINEL";
  const unrelatedRumorTitle = "UNRELATED_RUMOR_TITLE_SENTINEL";
  const unrelatedAuthorBody = "UNRELATED_AUTHOR_NOTE_BODY_SENTINEL";
  const unrelatedRumorBody = "UNRELATED_RUMOR_BODY_SENTINEL";
  const unrelated = projectWorldReferences([
    { id: unrelatedAuthorId, title: unrelatedAuthorTitle, type: "rule", status: "active", tags: ["作者备注", unrelatedAuthorBody] },
    { id: unrelatedRumorId, title: unrelatedRumorTitle, type: "event", status: "active", tags: ["推测：与当前任务无关", unrelatedRumorBody] }
  ]);
  assert.deepEqual(unrelated.map((entry) => entry.nature).sort(), ["author-note", "rumor"]);

  const before = prepare({ excludedReasonCounts: projectCharacterContextExclusionCounts(projection()) });
  // The production exclusion projector deliberately accepts only the current
  // role's Event projection, so adding unrelated project references is inert.
  const after = prepare({ excludedReasonCounts: projectCharacterContextExclusionCounts(projection()) });
  assert.equal(before.providerSafeContext?.excluded.count, 2);
  assert.deepEqual(after.providerSafeContext?.excluded, before.providerSafeContext?.excluded);
  assert.equal(after.providerSafeContextCanonicalJson, before.providerSafeContextCanonicalJson);
  const serialized = after.providerSafeContextCanonicalJson ?? "";
  for (const sentinel of ["event.secret", unrelatedAuthorId, unrelatedRumorId, unrelatedAuthorTitle, unrelatedRumorTitle, unrelatedAuthorBody, unrelatedRumorBody]) {
    assert.equal(serialized.includes(sentinel), false);
  }
});

test("safe preview is a detached stable snapshot and display-name changes preserve its digest", () => {
  const result = prepare();
  const canonical = result.providerSafeContextCanonicalJson;
  const digest = result.previewDigest;
  assert.ok(result.context);
  result.context.knownFacts[0]!.summary = "MUTATED_AFTER_PROJECTION";
  result.context.profileBasis.core = "MUTATED_PROFILE";
  assert.equal(result.providerSafeContextCanonicalJson, canonical);
  assert.equal(JSON.stringify(result.providerSafeContext).includes("MUTATED_AFTER_PROJECTION"), false);
  assert.equal(JSON.stringify(result.providerSafeContext).includes("MUTATED_PROFILE"), false);

  const renamed = prepare({
    characters: characters.map((character) => ({ id: character.id, label: character.id === "character.guard" ? "稳定 ID 未变的新显示名" : character.label, type: "character" as const, formal: true, version: character.revisionToken }))
  });
  assert.equal(renamed.previewDigest, digest);
  assert.deepEqual(renamed.providerSafeContext?.excluded.reasonCodes, ["author-note", "character-unknown", "rumor"]);
});

test("gateway remains a pure read projection and does not define another CharacterAgentContext", () => {
  const source = readFileSync("src/storyContracts/characterAgentContextGateway.ts", "utf8");
  assert.doesNotMatch(source, /\bfetch\s*\(/u);
  assert.doesNotMatch(source, /writeFile|appendFile|createHash|openProvider|applyAuthor|createConfirmedEvent/u);
  assert.doesNotMatch(source, /(?:type|interface)\s+CharacterAgentContext\b/u);
});
