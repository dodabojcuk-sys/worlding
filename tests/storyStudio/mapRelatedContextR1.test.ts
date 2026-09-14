import test from "node:test";
import assert from "node:assert/strict";

import { confirmedEventReference, mapRelatedCharacters, mapRelationDirection } from "../../apps/story-studio/src/components/world/mapRelatedContext.ts";
import type { WorldObjectSummary } from "../../apps/story-studio/src/lib/localTransport.ts";
import type { RelationReadProjectionR0 } from "../../src/storyControlSurface/storyStudioRelationOperations.ts";

const object = (id: string, title: string, type: WorldObjectSummary["type"], status = "active"): WorldObjectSummary => ({ id, relativeId: id, title, type, status, tags: [], aliases: [], revisionToken: `${id}.r1`, source: "markdown" });
const relation = (input: Partial<RelationReadProjectionR0> & Pick<RelationReadProjectionR0, "relationId" | "sourceObjectId" | "targetObjectId">): RelationReadProjectionR0 => ({
  relationTypeId: "relation.type",
  relationLabelSnapshot: "驻港调查",
  direction: "forward",
  reviewState: "confirmed",
  evidenceRefs: [],
  provenance: {},
  sourceRevision: "r1",
  revision: 1,
  archived: false,
  supersedesRelationId: null,
  decisionReceipt: null,
  currentTypeLabel: "驻港调查",
  relationType: null,
  evidenceWarnings: [],
  ...input
});

test("map related people come only from explicit active confirmed relations", () => {
  const objects = [object("place.fog", "雾港", "location"), object("char.lin", "林昭", "character"), object("char.archived", "旧守卫", "character", "archived"), object("event.one", "港务记录", "event")];
  const confirmed = relation({ relationId: "relation.confirmed", sourceObjectId: "place.fog", targetObjectId: "char.lin" });
  const candidate = relation({ relationId: "relation.candidate", sourceObjectId: "place.fog", targetObjectId: "char.lin", reviewState: "candidate" });
  const archivedTarget = relation({ relationId: "relation.archived-target", sourceObjectId: "place.fog", targetObjectId: "char.archived" });
  assert.deepEqual(mapRelatedCharacters("place.fog", objects, [confirmed, candidate, archivedTarget]), [{ character: objects[1], relations: [confirmed] }]);
  assert.deepEqual(mapRelatedCharacters("place.unrecorded", objects, [confirmed]), [], "names and proximity cannot invent a relation");
});

test("map relation presentation preserves direction and exact event revision", () => {
  const value = relation({ relationId: "relation.one", sourceObjectId: "char.lin", targetObjectId: "place.fog", direction: "reverse", evidenceRefs: [{ kind: "confirmed-event", reference: { eventId: "event.harbour", revisionToken: "event-r7" } }] });
  assert.equal(mapRelationDirection(value, new Map([["char.lin", "林昭"], ["place.fog", "雾港"]])), "雾港 → 林昭");
  assert.deepEqual(confirmedEventReference(value), { eventId: "event.harbour", revision: "event-r7" });
});
