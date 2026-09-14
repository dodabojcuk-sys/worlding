export type TianyiRelationHandoff = {
  active: boolean;
  relationId: string | null;
  relationLabel: string | null;
  sourceObjectId: string | null;
  targetObjectId: string | null;
  direction: "forward" | "reverse" | "both" | "unspecified" | null;
  materialIds: string[];
  eventRefs: Array<{ eventId: string; revision: string }>;
};

export function readTianyiRelationHandoff(params: URLSearchParams): TianyiRelationHandoff {
  const active = params.get("tianyiSource") === "relations";
  const materialIds = [...new Set(params.getAll("materialRef").filter(Boolean))];
  const eventIds = params.getAll("eventRef");
  const eventRevisions = params.getAll("eventRevision");
  const eventRefs = eventIds.flatMap((eventId, index) => eventId && eventRevisions[index]
    ? [{ eventId, revision: eventRevisions[index]! }]
    : []);
  return {
    active,
    relationId: active ? params.get("relationRef") : null,
    relationLabel: active ? params.get("relationLabel") : null,
    sourceObjectId: active ? params.get("relationSource") : null,
    targetObjectId: active ? params.get("relationTarget") : null,
    direction: active ? parseDirection(params.get("relationDirection")) : null,
    materialIds,
    eventRefs
  };
}

function parseDirection(value: string | null): TianyiRelationHandoff["direction"] {
  return value === "forward" || value === "reverse" || value === "both" || value === "unspecified" ? value : null;
}
