import type { RelationReadProjectionR0 } from "../storyControlSurface/storyStudioRelationOperations.ts";

/**
 * Read-only Event causal projection. Relation remains the only relationship
 * owner: this module neither infers a formal edge nor writes story facts.
 */
export type EventCausalIndexItem = {
  relation: RelationReadProjectionR0;
  eventId: string;
  depth: 1 | 2;
  category: "cause" | "trigger" | "necessary-condition" | "result" | "downstream-impact" | "uncertain";
  certainty: "author-confirmed" | "ai-candidate" | "speculative" | "conflict";
};

export type EventCausalIndex = {
  antecedents: EventCausalIndexItem[];
  directTriggers: EventCausalIndexItem[];
  necessaryConditions: EventCausalIndexItem[];
  results: EventCausalIndexItem[];
  downstreamImpacts: EventCausalIndexItem[];
  uncertainOrConflicted: EventCausalIndexItem[];
};

const CAUSAL = /(?:cause|causal|trigger|condition|necessary|result|impact|因果|导致|促使|触发|前提|必要条件|结果|影响)/iu;
const TRIGGER = /(?:trigger|触发|引发|导火)/iu;
const NECESSARY = /(?:necessary|condition|前提|必要条件|条件)/iu;

export function buildEventCausalIndex(eventId: string | null, relations: readonly RelationReadProjectionR0[]): EventCausalIndex {
  const empty: EventCausalIndex = { antecedents: [], directTriggers: [], necessaryConditions: [], results: [], downstreamImpacts: [], uncertainOrConflicted: [] };
  if (!eventId) return empty;
  const connected = relations.filter((relation) => !relation.archived && (relation.sourceObjectId === eventId || relation.targetObjectId === eventId));
  const causal = relations.filter((relation) => !relation.archived && isCausal(relation));
  const confirmed = causal.filter((relation) => relation.reviewState === "confirmed" && certaintyOf(relation) === "author-confirmed");
  const antecedents: EventCausalIndexItem[] = [];
  const directTriggers: EventCausalIndexItem[] = [];
  const necessaryConditions: EventCausalIndexItem[] = [];
  const results: EventCausalIndexItem[] = [];
  const downstreamImpacts: EventCausalIndexItem[] = [];

  for (const relation of confirmed) {
    if (relation.targetObjectId === eventId) {
      const item = itemFor(relation, relation.sourceObjectId, 1, relationCategory(relation, "incoming"));
      if (item.category === "trigger") directTriggers.push(item);
      else if (item.category === "necessary-condition") necessaryConditions.push(item);
      else antecedents.push(item);
    }
    if (relation.sourceObjectId === eventId) results.push(itemFor(relation, relation.targetObjectId, 1, "result"));
  }

  const seenDownstream = new Set<string>();
  for (const result of results) {
    for (const relation of confirmed) {
      if (relation.sourceObjectId !== result.eventId) continue;
      const key = `${relation.relationId}:${relation.targetObjectId}`;
      if (seenDownstream.has(key) || relation.targetObjectId === eventId) continue;
      seenDownstream.add(key);
      downstreamImpacts.push(itemFor(relation, relation.targetObjectId, 2, "downstream-impact"));
    }
  }

  const uncertainOrConflicted = connected
    .filter((relation) => !isCausal(relation) || relation.reviewState !== "confirmed" || certaintyOf(relation) !== "author-confirmed")
    .map((relation) => itemFor(relation, relation.sourceObjectId === eventId ? relation.targetObjectId : relation.sourceObjectId, 1, "uncertain"));
  return { antecedents, directTriggers, necessaryConditions, results, downstreamImpacts, uncertainOrConflicted };
}

export function causalRelationLabel(relation: RelationReadProjectionR0): string {
  return (relation.currentTypeLabel ?? relation.relationLabelSnapshot) || "关系类型待确认";
}

function isCausal(relation: RelationReadProjectionR0): boolean {
  return CAUSAL.test(`${relation.relationTypeId} ${causalRelationLabel(relation)}`);
}

function relationCategory(relation: RelationReadProjectionR0, direction: "incoming" | "outgoing"): EventCausalIndexItem["category"] {
  if (direction === "outgoing") return "result";
  const label = `${relation.relationTypeId} ${causalRelationLabel(relation)}`;
  if (TRIGGER.test(label)) return "trigger";
  if (NECESSARY.test(label)) return "necessary-condition";
  return "cause";
}

function certaintyOf(relation: RelationReadProjectionR0): EventCausalIndexItem["certainty"] {
  if (relation.reviewState === "confirmed" && relation.relationTypeResolution !== "unresolved" && !relation.evidenceWarnings.length) return "author-confirmed";
  if (relation.reviewState === "candidate") return "ai-candidate";
  if (relation.relationTypeResolution === "unresolved" || relation.evidenceWarnings.length) return "conflict";
  return "speculative";
}

function itemFor(relation: RelationReadProjectionR0, eventId: string, depth: 1 | 2, category: EventCausalIndexItem["category"]): EventCausalIndexItem {
  return { relation, eventId, depth, category, certainty: certaintyOf(relation) };
}
