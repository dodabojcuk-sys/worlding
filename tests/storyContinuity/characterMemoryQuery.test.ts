import assert from "node:assert/strict";
import test from "node:test";

import { buildCharacterMemoryQueryProjection } from "../../src/storyContinuity/characterMemoryQuery.ts";
import { buildEventStoryCrossingKnowledgeProjection } from "../../src/storyContracts/eventStoryCrossingKnowledge.ts";
import type { CharacterMemoryLedger } from "../../src/storyContinuity/continuityTypes.ts";

const sourceIdentity = { kind: "root" as const, workVersionId: "work.main", revision: "2" };

test("character memory query joins only the selected character's event evidence and compatible heard ledger records", () => {
  const knowledge = buildEventStoryCrossingKnowledgeProjection({
    projectId: "story.memory-query",
    observerId: "character.lin",
    characters: [{ id: "character.lin", label: "林昭", revisionToken: "character-r1" }, { id: "character.lu", label: "陆衍", revisionToken: "character-r2" }],
    events: [
      { id: "event.key", title: "林昭接过铜钥匙", status: "confirmed", revisionToken: "event-r1", tags: ["知情：character.lin=已亲历"], knowledgeSubjectIds: ["character.lin"], body: "林昭接过铜钥匙。" },
      { id: "event.secret", title: "陆衍独自进入仓库", status: "confirmed", revisionToken: "event-r2", tags: ["知情：character.lu=已亲历"], knowledgeSubjectIds: ["character.lu"], body: "不应跨角色泄露。" },
      { id: "event.belief", title: "林昭怀疑北闸仍可通行", status: "confirmed", revisionToken: "event-r3", tags: ["知情：character.lin=怀疑"], knowledgeSubjectIds: ["character.lin"], body: "怀疑不是正式世界事实。" }
    ]
  });
  const projection = buildCharacterMemoryQueryProjection({ projectId: "story.memory-query", characterId: "character.lin", sourceIdentity, knowledge, ledger: ledger() });

  assert.deepEqual(projection.records.map((record) => [record.kind, record.source.eventId ?? record.source.runId, record.validity]), [
    ["belief", "event.belief", "active"],
    ["experienced", "event.key", "active"],
    ["heard", "nuwa.run.north-gate", "active"],
    ["heard", "nuwa.run.rolled-back", "invalidated"]
  ]);
  assert.equal(JSON.stringify(projection).includes("陆衍独自进入仓库"), false, "another character's Event must not cross the query boundary");
  assert.equal(projection.counts.heard, 2);
  assert.equal(projection.counts.invalidated, 1, "rollback remains inspectable but is clearly not active memory");
  assert.equal(projection.providerCalls, 0);
});

test("derived work version query requires the exact source revision", () => {
  const knowledge = buildEventStoryCrossingKnowledgeProjection({ projectId: "story.memory-query", observerId: "character.lin", characters: [{ id: "character.lin", label: "林昭", revisionToken: "character-r1" }], events: [] });
  const projection = buildCharacterMemoryQueryProjection({
    projectId: "story.memory-query",
    characterId: "character.lin",
    sourceIdentity: { kind: "derived", workVersionId: "work.if.north-gate", revision: "4" },
    knowledge,
    ledger: ledger()
  });
  assert.equal(projection.records.length, 0, "main-line heard records cannot drift into an IF query");
});

function ledger(): CharacterMemoryLedger {
  const base = {
    epistemicState: "heard" as const,
    recipientId: "character.lin",
    speakerId: "character.awu",
    statement: "北闸已封，钥匙已交给林昭。",
    sourceStepRevision: "step-r1",
    sourceScene: { id: "story-unit.north-gate", revision: "scene-r1", observedAt: "2026-09-10T10:00:00.000Z" },
    sourceIdentity: { kind: "root" as const, workVersionId: "work.main", revision: "1" },
    recordedAt: "2026-09-10T10:00:00.000Z"
  };
  return {
    version: "story-continuity-character-memory-ledger/v1",
    ownerId: "character-memory-ledger.test",
    projectId: "story.memory-query",
    recipientId: "character.lin",
    state: "active",
    records: [
      { ...base, id: "character-memory.active", sourceRunId: "nuwa.run.north-gate", sourceStepId: "nuwa.step.north-gate", validity: { state: "active", invalidatedAt: null, invalidatedByOperationId: null, reason: null } },
      { ...base, id: "character-memory.invalidated", sourceRunId: "nuwa.run.rolled-back", sourceStepId: "nuwa.step.rolled-back", validity: { state: "invalidated", invalidatedAt: "2026-09-10T11:00:00.000Z", invalidatedByOperationId: "nuwa.rollback.1", reason: "source-rollback" } }
    ]
  };
}
