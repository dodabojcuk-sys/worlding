export type TianyiRelationHandoff = {
  active: boolean;
  relationId: string | null;
  relationLabel: string | null;
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
    materialIds,
    eventRefs
  };
}
