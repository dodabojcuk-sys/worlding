import type { PerspectiveMatch } from "./storyModeling.ts";

export type PerspectiveObjectType = "character" | "location" | "item";
export type PerspectiveObjectRef = { id: string; type: PerspectiveObjectType; label: string; ownerId?: string; version?: string; scope?: "project" | "unit" | "selection"; formal?: boolean };
export type PerspectiveEvent = { id: string; title: string; tags: readonly string[] };
export type PerspectiveRelation = { sourceEventId: string; targetEventId: string; reviewState: string };
export type PerspectiveProjectionItem = {
  eventId: string;
  title: string;
  matches: Array<{ object: PerspectiveObjectRef; relationKind: PerspectiveMatch["relationKind"]; knowledgeState: PerspectiveMatch["knowledgeState"]; confidence: number; evidenceRefs: string[] }>;
};

export function listPerspectiveObjects(events: readonly PerspectiveEvent[]): PerspectiveObjectRef[] {
  const objects = new Map<string, PerspectiveObjectRef>();
  for (const event of events) for (const [type, prefixes] of Object.entries(PREFIXES) as Array<[PerspectiveObjectType, readonly string[]]>) for (const label of taggedValues(event.tags, prefixes)) {
    const id = `${type}.${slug(label)}`;
    objects.set(id, { id, type, label });
  }
  return [...objects.values()].sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label, "zh-CN"));
}

/** Builds a read-only intersection from formal metadata, formal relations and optional cached AI matches. */
export function buildPerspectiveIntersection(input: {
  events: readonly PerspectiveEvent[];
  relations: readonly PerspectiveRelation[];
  selected: readonly PerspectiveObjectRef[];
  aiMatches?: readonly PerspectiveMatch[];
}): PerspectiveProjectionItem[] {
  if (input.selected.length < 2 || input.selected.length > 5) return [];
  const ai = input.aiMatches ?? [];
  const direct = new Map<string, Set<string>>();
  for (const event of input.events) {
    const ids = new Set<string>();
    for (const object of listPerspectiveObjects([event])) ids.add(perspectiveEvidenceKey(object));
    direct.set(event.id, ids);
  }
  const formalRelations = input.relations.filter((relation) => relation.reviewState === "confirmed");
  return input.events.flatMap((event) => {
    const matches = input.selected.flatMap((object) => {
      const objectEvidenceKey = perspectiveEvidenceKey(object);
      if (direct.get(event.id)?.has(objectEvidenceKey)) return [{ object, relationKind: "formal-participation" as const, knowledgeState: knowledgeState(event.tags, object), confidence: 1, evidenceRefs: [`event:${event.id}`, `owner:${object.ownerId ?? object.id}@${object.version ?? "unknown"}`] }];
      const upstream = formalRelations.find((relation) => relation.targetEventId === event.id && direct.get(relation.sourceEventId)?.has(objectEvidenceKey));
      if (upstream) return [{ object, relationKind: "upstream" as const, knowledgeState: "unknown" as const, confidence: .8, evidenceRefs: [`event:${upstream.sourceEventId}`, `event:${event.id}`] }];
      const downstream = formalRelations.find((relation) => relation.sourceEventId === event.id && direct.get(relation.targetEventId)?.has(objectEvidenceKey));
      if (downstream) return [{ object, relationKind: "downstream" as const, knowledgeState: "unknown" as const, confidence: .8, evidenceRefs: [`event:${event.id}`, `event:${downstream.targetEventId}`] }];
      const inferred = ai.find((match) => match.eventId === event.id && match.perspectiveObjectId === object.id && match.perspectiveType === object.type);
      return inferred ? [{ object, relationKind: inferred.relationKind, knowledgeState: inferred.knowledgeState, confidence: inferred.confidence, evidenceRefs: inferred.evidenceRefs }] : [];
    });
    return matches.length === input.selected.length ? [{ eventId: event.id, title: event.title, matches }] : [];
  });
}

const PREFIXES: Record<PerspectiveObjectType, readonly string[]> = { character: ["Character", "Actor", "角色", "人物"], location: ["Location", "地点", "场所"], item: ["Item", "Object", "物品", "道具"] };
function taggedValues(tags: readonly string[], prefixes: readonly string[]): string[] { const values: string[] = []; for (const tag of tags) for (const prefix of prefixes) { const value = new RegExp(`^${prefix}[\uff1a:]\\s*(.+)$`, "iu").exec(tag)?.[1]?.trim(); if (value && !values.includes(value)) values.push(value); } return values; }
function slug(value: string): string { return value.normalize("NFKC").toLocaleLowerCase("zh-CN").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/gu, "") || "unnamed"; }
function perspectiveEvidenceKey(object: PerspectiveObjectRef): string { return `${object.type}\u0000${object.label.normalize("NFKC").toLocaleLowerCase("zh-CN")}`; }
function knowledgeState(tags: readonly string[], object: PerspectiveObjectRef): PerspectiveMatch["knowledgeState"] { const value = taggedValues(tags, ["知情", "Knowledge"]).find((item) => item.startsWith(`${object.label}=`))?.split("=")[1]?.trim(); return value === "已知" || value === "known" ? "known" : value === "误解" || value === "misunderstood" ? "misunderstood" : value === "未知" || value === "unknown" ? "unknown" : "not-applicable"; }
