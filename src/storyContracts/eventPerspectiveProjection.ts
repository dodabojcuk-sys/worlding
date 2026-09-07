import type { PerspectiveMatch, PerspectiveMode } from "./storyModeling.ts";
import type { EventKnowledgeState, EventStoryCrossingKnowledgeProjection } from "./eventStoryCrossingKnowledge.ts";

export type PerspectiveObjectType = "character" | "location" | "item";
export type PerspectiveObjectRef = { id: string; type: PerspectiveObjectType; label: string; ownerId?: string; version?: string; scope?: "project" | "unit" | "selection"; formal?: boolean };
export type PerspectiveEvent = {
  id: string;
  title: string;
  tags: readonly string[];
  /** Stable formal subject references supplied by an Owner projection. */
  participantSubjectIds?: readonly string[];
  witnessSubjectIds?: readonly string[];
  knowledgeBySubjectId?: Readonly<Record<string, PerspectiveMatch["knowledgeState"]>>;
};
export type PerspectiveRelation = { sourceEventId: string; targetEventId: string; reviewState: string };
export type PerspectiveVisibility = "experienced" | "witnessed" | "informed" | "inferred" | "known" | "misunderstood" | "unknown" | "blind-spot";
export type PerspectiveProjectionMatch = {
  object: PerspectiveObjectRef;
  relationKind: PerspectiveMatch["relationKind"] | "none";
  knowledgeState: PerspectiveMatch["knowledgeState"];
  visibility: PerspectiveVisibility;
  confidence: number;
  evidenceRefs: string[];
};
export type PerspectiveProjectionItem = {
  eventId: string;
  title: string;
  mode: PerspectiveMode;
  shared: boolean;
  matches: PerspectiveProjectionMatch[];
};

export function listPerspectiveObjects(events: readonly PerspectiveEvent[]): PerspectiveObjectRef[] {
  const objects = new Map<string, PerspectiveObjectRef>();
  for (const event of events) for (const [type, prefixes] of Object.entries(PREFIXES) as Array<[PerspectiveObjectType, readonly string[]]>) for (const label of taggedValues(event.tags, prefixes)) {
    const id = `${type}.${slug(label)}`;
    objects.set(id, { id, type, label, formal: false });
  }
  return [...objects.values()].sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label, "zh-CN"));
}

/** Adapts the existing Owner projection without treating labels as identities. */
export function perspectiveEventsFromKnowledgeProjection(
  events: readonly PerspectiveEvent[],
  projection: EventStoryCrossingKnowledgeProjection | null
): PerspectiveEvent[] {
  if (!projection) return [];
  const sourceById = new Map(events.map((event) => [event.id, event]));
  return projection.visibleEvents.flatMap((projected) => {
    const source = sourceById.get(projected.eventId);
    if (!source) return [];
    const participantSubjectIds = projected.perspectives.filter((item) => item.state === "experienced").map((item) => item.observerId);
    const witnessSubjectIds = projected.perspectives.filter((item) => item.state === "witnessed").map((item) => item.observerId);
    const knowledgeBySubjectId = Object.fromEntries(projected.perspectives.map((item) => [item.observerId, perspectiveKnowledgeState(item.state)]));
    return [{ ...source, title: projected.title, participantSubjectIds, witnessSubjectIds, knowledgeBySubjectId }];
  });
}

/** Builds one Owner's evidence-backed read-only lens. Blind spots are opt-in. */
export function buildSinglePerspectiveProjection(input: {
  events: readonly PerspectiveEvent[];
  relations: readonly PerspectiveRelation[];
  selected: PerspectiveObjectRef;
  aiMatches?: readonly PerspectiveMatch[];
  includeBlindSpots?: boolean;
}): PerspectiveProjectionItem[] {
  if (!isFormalPerspectiveCharacter(input.selected)) return [];
  return input.events
    .map((event) => ({ eventId: event.id, title: event.title, mode: "single" as const, shared: true, matches: [resolveMatch(event, input.selected, input.events, input.relations, input.aiMatches ?? [])] }))
    .filter((item) => input.includeBlindSpots || !isBlindSpot(item.matches[0]!.visibility));
}

/** Builds a 2–5 Owner comparison without collapsing divergent knowledge into an intersection. */
export function buildPerspectiveComparison(input: {
  events: readonly PerspectiveEvent[];
  relations: readonly PerspectiveRelation[];
  selected: readonly PerspectiveObjectRef[];
  aiMatches?: readonly PerspectiveMatch[];
}): PerspectiveProjectionItem[] {
  if (input.selected.length < 2 || input.selected.length > 5 || !input.selected.every(isFormalPerspectiveCharacter)) return [];
  return input.events.map((event) => {
    const matches = input.selected.map((object) => resolveMatch(event, object, input.events, input.relations, input.aiMatches ?? []));
    return { eventId: event.id, title: event.title, mode: "compare" as const, shared: matches.every((match) => !isBlindSpot(match.visibility)), matches };
  });
}

/** Compatibility name for callers that explicitly need a comparison intersection. */
export function buildPerspectiveIntersection(input: Parameters<typeof buildPerspectiveComparison>[0]): PerspectiveProjectionItem[] {
  return buildPerspectiveComparison(input);
}

export function perspectiveModeForSelection(selected: readonly PerspectiveObjectRef[]): PerspectiveMode | null {
  if (!selected.every(isFormalPerspectiveCharacter)) return null;
  return selected.length === 1 ? "single" : selected.length >= 2 && selected.length <= 5 ? "compare" : null;
}

export function isFormalPerspectiveCharacter(object: PerspectiveObjectRef): boolean {
  return object.formal === true && object.type === "character";
}

function resolveMatch(event: PerspectiveEvent, object: PerspectiveObjectRef, events: readonly PerspectiveEvent[], relations: readonly PerspectiveRelation[], ai: readonly PerspectiveMatch[]): PerspectiveProjectionMatch {
  const ownerEvidence = `owner:${object.ownerId ?? object.id}@${object.version ?? "unknown"}`;
  const direct = event.participantSubjectIds?.includes(object.id) === true;
  const explicitKnowledge = event.knowledgeBySubjectId?.[object.id] ?? knowledgeState(event.tags, object);
  const witnessed = event.witnessSubjectIds?.includes(object.id) === true;
  if (direct || witnessed) {
    const visibility: PerspectiveVisibility = explicitKnowledge === "misunderstood" ? "misunderstood" : explicitKnowledge === "unknown" ? "unknown" : witnessed ? "witnessed" : "experienced";
    return { object, relationKind: "formal-participation", knowledgeState: explicitKnowledge === "not-applicable" ? "known" : explicitKnowledge, visibility, confidence: 1, evidenceRefs: [`event:${event.id}`, ownerEvidence] };
  }
  if (explicitKnowledge !== "not-applicable") {
    return { object, relationKind: explicitKnowledge === "unknown" ? "none" : "formal-relation-impact", knowledgeState: explicitKnowledge, visibility: explicitKnowledge === "known" ? "known" : explicitKnowledge === "misunderstood" ? "misunderstood" : "unknown", confidence: 1, evidenceRefs: [`event:${event.id}`, ownerEvidence] };
  }
  // A causal, temporal, or adjacency relation is not evidence that information
  // reached a character.  Only explicit participation/knowledge evidence or a
  // separately reviewed AI match may move a role out of the blind spot.
  void events;
  void relations;
  const inferred = ai.find((match) => match.eventId === event.id && match.perspectiveObjectId === object.id && match.perspectiveType === object.type);
  if (inferred) return { object, relationKind: inferred.relationKind, knowledgeState: inferred.knowledgeState, visibility: inferred.knowledgeState === "known" ? "inferred" : inferred.knowledgeState === "misunderstood" ? "misunderstood" : "unknown", confidence: inferred.confidence, evidenceRefs: inferred.evidenceRefs };
  return { object, relationKind: "none", knowledgeState: "unknown", visibility: "blind-spot", confidence: 1, evidenceRefs: [`event:${event.id}`, ownerEvidence] };
}

function isBlindSpot(visibility: PerspectiveVisibility): boolean {
  return visibility === "blind-spot" || visibility === "unknown";
}

const PREFIXES: Record<PerspectiveObjectType, readonly string[]> = { character: ["Character", "Actor", "角色", "人物"], location: ["Location", "地点", "场所"], item: ["Item", "Object", "物品", "道具"] };
function taggedValues(tags: readonly string[], prefixes: readonly string[]): string[] { const values: string[] = []; for (const tag of tags) for (const prefix of prefixes) { const value = new RegExp(`^${prefix}[\uff1a:]\\s*(.+)$`, "iu").exec(tag)?.[1]?.trim(); if (value && !values.includes(value)) values.push(value); } return values; }
function slug(value: string): string { return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "") || "unnamed"; }
function knowledgeState(tags: readonly string[], object: PerspectiveObjectRef): PerspectiveMatch["knowledgeState"] { const value = taggedValues(tags, ["知情主体", "KnowledgeSubject"]).find((item) => item.startsWith(`${object.id}=`))?.split("=")[1]?.trim(); return value === "已知" || value === "known" ? "known" : value === "误解" || value === "misunderstood" ? "misunderstood" : value === "未知" || value === "unknown" ? "unknown" : "not-applicable"; }
function perspectiveKnowledgeState(state: EventKnowledgeState): PerspectiveMatch["knowledgeState"] { return state === "experienced" || state === "witnessed" || state === "informed" ? "known" : state === "misled" ? "misunderstood" : "unknown"; }
