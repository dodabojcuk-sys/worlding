import type { StoryStudioObjectProfile } from "./storyStudioObjectProfile.ts";

export type StoryStudioLocationTopologyObject = { id: string; title: string; type: string; profile?: StoryStudioObjectProfile | null };
export type StoryStudioLocationTopologyRelation = { relationId: string; sourceObjectId: string; targetObjectId: string; currentTypeLabel: string | null; relationLabelSnapshot: string; reviewState: "candidate" | "confirmed" | "rejected"; archived: boolean };
export type LocationTopologyNode = { objectId: string; title: string; region: string | null };
export type LocationTopologyEdge = { relationId: string; sourceObjectId: string; targetObjectId: string; label: string; state: "confirmed" | "candidate"; archived: boolean };
export type LocationTopologyProjection = { version: "story-location-topology-projection/v1"; nodes: LocationTopologyNode[]; confirmedEdges: LocationTopologyEdge[]; candidateEdges: LocationTopologyEdge[] };

const TOPOLOGY_RELATION_WORDS = ["contains", "contained", "located", "adjacent", "connected", "reachable", "blocked", "entrance", "exit", "位于", "包含", "相邻", "连通", "可达", "阻断", "入口", "出口"];

export function createLocationTopologyProjection(input: { objects: StoryStudioLocationTopologyObject[]; relations: StoryStudioLocationTopologyRelation[] }): LocationTopologyProjection {
  const locations = input.objects.filter((object) => object.type === "location").sort(compareObject);
  const locationIds = new Set(locations.map((object) => object.id));
  const edges = input.relations
    .filter((relation) => !relation.archived && locationIds.has(relation.sourceObjectId) && locationIds.has(relation.targetObjectId) && isTopologyRelation(relation))
    .map((relation) => ({ relationId: relation.relationId, sourceObjectId: relation.sourceObjectId, targetObjectId: relation.targetObjectId, label: relation.currentTypeLabel || relation.relationLabelSnapshot, state: relation.reviewState === "confirmed" ? "confirmed" as const : "candidate" as const, archived: relation.archived }))
    .sort(compareEdge);
  return {
    version: "story-location-topology-projection/v1",
    nodes: locations.map((object) => ({ objectId: object.id, title: object.title, region: readRegion(object) })),
    confirmedEdges: edges.filter((edge) => edge.state === "confirmed"),
    candidateEdges: edges.filter((edge) => edge.state === "candidate")
  };
}

export type LocationStructureKind = "geography" | "administration";
export type StoryStudioTypedLocationRelation = StoryStudioLocationTopologyRelation & { relationTypeId: string };
export type LocationStructureRule = { geographyRelationTypeIds: readonly string[]; administrationRelationTypeIds: readonly string[] };
export type TypedLocationStructureProjection = {
  version: "story-location-structure-projection/v1";
  kind: LocationStructureKind;
  nodes: LocationTopologyNode[];
  edges: LocationTopologyEdge[];
  childrenByParentId: ReadonlyMap<string, readonly LocationTopologyEdge[]>;
  unclassifiedRelationCount: number;
};

/**
 * Build a structure only from author-selected Relation Type IDs.  This is
 * intentionally separate from the legacy keyword topology above: labels such
 * as “位于” are ambiguous and must never silently become geographic facts.
 */
export function createTypedLocationStructureProjection(input: {
  objects: StoryStudioLocationTopologyObject[];
  relations: StoryStudioTypedLocationRelation[];
  rule: LocationStructureRule;
  kind: LocationStructureKind;
}): TypedLocationStructureProjection {
  const locations = input.objects.filter((object) => object.type === "location").sort(compareObject);
  const locationIds = new Set(locations.map((object) => object.id));
  const selectedTypeIds = new Set(input.kind === "geography" ? input.rule.geographyRelationTypeIds : input.rule.administrationRelationTypeIds);
  const eligible = input.relations.filter((relation) => !relation.archived && relation.reviewState === "confirmed" && locationIds.has(relation.sourceObjectId) && locationIds.has(relation.targetObjectId));
  const edges = eligible.filter((relation) => selectedTypeIds.has(relation.relationTypeId)).map((relation) => ({
    relationId: relation.relationId,
    sourceObjectId: relation.sourceObjectId,
    targetObjectId: relation.targetObjectId,
    label: relation.currentTypeLabel || relation.relationLabelSnapshot,
    state: "confirmed" as const,
    archived: false
  })).sort(compareEdge);
  const childrenByParentId = new Map<string, LocationTopologyEdge[]>();
  for (const edge of edges) {
    const current = childrenByParentId.get(edge.targetObjectId) || [];
    current.push(edge);
    childrenByParentId.set(edge.targetObjectId, current);
  }
  for (const children of childrenByParentId.values()) children.sort(compareEdge);
  return {
    version: "story-location-structure-projection/v1",
    kind: input.kind,
    nodes: locations.map((object) => ({ objectId: object.id, title: object.title, region: readRegion(object) })),
    edges,
    childrenByParentId,
    unclassifiedRelationCount: eligible.filter((relation) => !selectedTypeIds.has(relation.relationTypeId)).length
  };
}

function isTopologyRelation(relation: StoryStudioLocationTopologyRelation): boolean {
  const label = `${relation.currentTypeLabel || ""} ${relation.relationLabelSnapshot}`.toLocaleLowerCase("en-US");
  return TOPOLOGY_RELATION_WORDS.some((word) => label.includes(word.toLocaleLowerCase("en-US")));
}

function readRegion(object: StoryStudioLocationTopologyObject): string | null {
  const value = object.profile?.fields.region?.value;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function compareObject(left: StoryStudioLocationTopologyObject, right: StoryStudioLocationTopologyObject): number {
  return left.title.localeCompare(right.title, "zh-CN") || left.id.localeCompare(right.id);
}

function compareEdge(left: LocationTopologyEdge, right: LocationTopologyEdge): number {
  return left.sourceObjectId.localeCompare(right.sourceObjectId) || left.targetObjectId.localeCompare(right.targetObjectId) || left.label.localeCompare(right.label, "zh-CN") || left.relationId.localeCompare(right.relationId);
}
