import assert from "node:assert/strict";
import test from "node:test";

import { ensureRelationWriteAttempt, relationWriteFingerprint } from "../../apps/story-studio/src/components/world/relationCreateAttempt.ts";

test("a relation form retry keeps operation identities and the already-created relation type", () => {
  let sequence = 0;
  const id = () => `id-${++sequence}`;
  const fingerprint = relationWriteFingerprint({ sourceId: "character.a", targetId: "character.b", direction: "forward", typeChoice: "__new__", newTypeLabel: " 兄妹 ", evidenceMode: "author-declaration", evidenceEventId: "ignored-event" });
  const first = ensureRelationWriteAttempt(null, fingerprint, id);
  first.createdTypeId = "relation-type.siblings";
  const retried = ensureRelationWriteAttempt(first, fingerprint, id);

  assert.equal(retried, first);
  assert.equal(retried.createdTypeId, "relation-type.siblings");
  assert.equal(retried.typeOperationId, "relation-type-create.id-1");
  assert.equal(retried.candidateOperationId, "relation-manual-create.id-2");
  assert.equal(sequence, 2, "a retry must not allocate a new server operation identity");
});

test("changing relation meaning starts a new operation while author declaration ignores a stale event selection", () => {
  let sequence = 0;
  const id = () => `id-${++sequence}`;
  const authorDeclared = relationWriteFingerprint({ sourceId: "character.a", targetId: "character.b", direction: "forward", typeChoice: "relation-type.family", newTypeLabel: "", evidenceMode: "author-declaration", evidenceEventId: "event.stale" });
  const sameMeaning = relationWriteFingerprint({ sourceId: "character.a", targetId: "character.b", direction: "forward", typeChoice: "relation-type.family", newTypeLabel: "", evidenceMode: "author-declaration", evidenceEventId: "" });
  assert.equal(authorDeclared, sameMeaning);

  const first = ensureRelationWriteAttempt(null, authorDeclared, id);
  const changed = ensureRelationWriteAttempt(first, relationWriteFingerprint({ sourceId: "character.a", targetId: "character.b", direction: "both", typeChoice: "relation-type.family", newTypeLabel: "", evidenceMode: "author-declaration", evidenceEventId: "" }), id);
  assert.notEqual(changed.candidateOperationId, first.candidateOperationId);
});
