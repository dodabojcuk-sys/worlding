import assert from "node:assert/strict";
import test from "node:test";

import { buildEventCausalIndex } from "../../src/storyContracts/eventCausalIndex.ts";
import type { RelationReadProjectionR0 } from "../../src/storyControlSurface/storyStudioRelationOperations.ts";

function relation(input: Partial<RelationReadProjectionR0> & Pick<RelationReadProjectionR0, "relationId" | "sourceObjectId" | "targetObjectId" | "relationLabelSnapshot">): RelationReadProjectionR0 {
  return {
    relationTypeId: "relation-type.causal",
    currentTypeLabel: input.relationLabelSnapshot,
    relationType: null,
    relationTypeResolution: "resolved",
    direction: "forward",
    reviewState: "confirmed",
    evidenceRefs: [{ kind: "author-source" }],
    evidenceWarnings: [],
    provenance: { kind: "author-action" },
    sourceRevision: "fixture-v1",
    revision: 1,
    archived: false,
    supersedesRelationId: null,
    decisionReceipt: null,
    ...input
  };
}

test("causal index traverses the existing Relation contract by Event ID without inventing a fact", () => {
  const relations = [
    relation({ relationId: "r-cause", sourceObjectId: "event.1", targetObjectId: "event.4", relationLabelSnapshot: "导致" }),
    relation({ relationId: "r-trigger", sourceObjectId: "event.2", targetObjectId: "event.4", relationLabelSnapshot: "直接触发" }),
    relation({ relationId: "r-condition", sourceObjectId: "event.3", targetObjectId: "event.4", relationLabelSnapshot: "必要条件" }),
    relation({ relationId: "r-result", sourceObjectId: "event.4", targetObjectId: "event.5", relationLabelSnapshot: "结果" }),
    relation({ relationId: "r-impact", sourceObjectId: "event.5", targetObjectId: "event.6", relationLabelSnapshot: "后续影响" }),
    relation({ relationId: "r-candidate", sourceObjectId: "event.4", targetObjectId: "event.7", relationLabelSnapshot: "因果候选", reviewState: "candidate" }),
    relation({ relationId: "r-conflict", sourceObjectId: "event.8", targetObjectId: "event.4", relationLabelSnapshot: "关系待定", relationTypeId: "relation-type.unresolved", relationTypeResolution: "unresolved" })
  ];
  const index = buildEventCausalIndex("event.4", relations);
  assert.deepEqual(index.antecedents.map((item) => item.eventId), ["event.1"]);
  assert.deepEqual(index.directTriggers.map((item) => item.eventId), ["event.2"]);
  assert.deepEqual(index.necessaryConditions.map((item) => item.eventId), ["event.3"]);
  assert.deepEqual(index.results.map((item) => item.eventId), ["event.5"]);
  assert.deepEqual(index.downstreamImpacts.map((item) => [item.eventId, item.depth]), [["event.6", 2]]);
  assert.deepEqual(index.uncertainOrConflicted.map((item) => [item.eventId, item.certainty]).sort(), [["event.7", "ai-candidate"], ["event.8", "conflict"]]);
  assert.equal(relations.length, 7);
});
