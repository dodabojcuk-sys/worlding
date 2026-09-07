import assert from "node:assert/strict";
import test from "node:test";

import { createCharacterKnowledgeHandoff } from "../../src/storyContracts/characterKnowledgeHandoff.ts";
import { buildEventStoryCrossingKnowledgeProjection } from "../../src/storyContracts/eventStoryCrossingKnowledge.ts";

const revision = "a".repeat(64);
const characters = [
  { id: "character.guard", label: "林昭", revisionToken: revision },
  { id: "character.cartographer", label: "林昭", revisionToken: "b".repeat(64) }
];
const events = [
  { id: "event.guard", title: "守卫看见灯火", status: "draft", revisionToken: "e1", tags: ["知情：character.guard=已亲历"], knowledgeSubjectIds: ["character.guard"], body: "守卫知道的正文" },
  { id: "event.author", title: "作者秘密", status: "draft", revisionToken: "e2", tags: ["作者秘密"], knowledgeSubjectIds: [], body: "角色不可见的正文" }
];

test("single formal role handoff carries one stable SubjectRef and no story prose", () => {
  const projection = buildEventStoryCrossingKnowledgeProjection({ projectId: "gray-tower", observerId: "character.guard", events, characters });
  const handoff = createCharacterKnowledgeHandoff({
    projectId: "gray-tower",
    projection,
    characters: characters.map((character) => ({ id: character.id, label: character.label, type: "character" as const, formal: true, version: character.revisionToken }))
  });
  assert.equal(handoff.contextAccess, "character");
  assert.equal(handoff.subjectRef?.stableId, "character.guard");
  assert.equal(handoff.subjectRef?.contentHash, revision);
  assert.equal(JSON.stringify(handoff).includes("角色不可见的正文"), false);
  assert.equal(JSON.stringify(handoff).includes("作者秘密"), false);
});

test("author comparison never masquerades as a role request and stale roles fail closed", () => {
  const comparison = buildEventStoryCrossingKnowledgeProjection({ projectId: "gray-tower", observerId: "author", observerIds: ["character.guard", "character.cartographer"], events, characters });
  const authorHandoff = createCharacterKnowledgeHandoff({ projectId: "gray-tower", projection: comparison, characters: [] });
  assert.equal(authorHandoff.contextAccess, "author");
  assert.equal(authorHandoff.subjectRef, null);

  const role = buildEventStoryCrossingKnowledgeProjection({ projectId: "gray-tower", observerId: "character.guard", events, characters });
  const staleHandoff = createCharacterKnowledgeHandoff({ projectId: "gray-tower", projection: role, characters: [{ id: "character.guard", label: "林昭", type: "character", formal: true, version: "stale" }] });
  assert.equal(staleHandoff.contextAccess, "display-only");
  assert.equal(staleHandoff.subjectRef, null);
});
