export type NarrativeLayoutEvent = { id: string; sourceVersion: string; order: number; trackId?: string | null; trackKind?: "main" | "branch"; pinnedPosition?: { x: number; y: number } | null };
export type NarrativeLayoutRelation = { sourceEventId: string; targetEventId: string; confirmed: boolean };
export type NarrativeLayoutProjection = {
  schemaVersion: "tianyan-event-narrative-layout/r1";
  revision: `layout:${string}`;
  sourceVersion: `layout:${string}`;
  positions: Record<string, { x: number; y: number }>;
  tracks: Array<{ id: string; kind: "main" | "branch"; y: number; eventIds: string[] }>;
};

export type NarrativeNavigationProjection = {
  trackIds: string[];
  trackByEventId: Record<string, string>;
  eventOrderById: Record<string, number>;
  branchPoints: Array<{ eventId: string; targetEventIds: string[]; branchTrackIds: string[] }>;
  mergePoints: Array<{ eventId: string; sourceEventIds: string[]; sourceTrackIds: string[] }>;
};

/** Horizontal narrative composition. It is a projection and never owns Events or Relations. */
export function buildEventNarrativeLayout(input: { events: readonly NarrativeLayoutEvent[]; relations: readonly NarrativeLayoutRelation[] }): NarrativeLayoutProjection {
  const events = [...input.events].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const ids = new Set(events.map((event) => event.id));
  const relations = input.relations.filter((relation) => relation.confirmed && ids.has(relation.sourceEventId) && ids.has(relation.targetEventId) && relation.sourceEventId !== relation.targetEventId);
  const orderIndex = new Map(events.map((event, index) => [event.id, index]));
  const incoming = new Map(events.map((event) => [event.id, [] as string[]]));
  const outgoing = new Map(events.map((event) => [event.id, [] as string[]]));
  relations.forEach((relation) => { incoming.get(relation.targetEventId)?.push(relation.sourceEventId); outgoing.get(relation.sourceEventId)?.push(relation.targetEventId); });
  const indegree = new Map(events.map((event) => [event.id, incoming.get(event.id)?.length ?? 0]));
  const queue = events.filter((event) => indegree.get(event.id) === 0).map((event) => event.id);
  const ordered: string[] = [];
  while (queue.length) {
    queue.sort((left, right) => (orderIndex.get(left) ?? 0) - (orderIndex.get(right) ?? 0) || left.localeCompare(right));
    const id = queue.shift()!;
    ordered.push(id);
    for (const target of outgoing.get(id) ?? []) { indegree.set(target, (indegree.get(target) ?? 1) - 1); if (indegree.get(target) === 0) queue.push(target); }
  }
  for (const event of events) if (!ordered.includes(event.id)) ordered.push(event.id);

  const depth = new Map<string, number>();
  for (const id of ordered) {
    const predecessors = incoming.get(id) ?? [];
    depth.set(id, predecessors.length
      ? Math.max(...predecessors.map((source) => (depth.get(source) ?? -1) + 1))
      : orderIndex.get(id) ?? 0);
  }
  const trackKeys = ["main", ...new Set(events.filter((event) => event.trackKind === "branch" || event.trackId).map((event) => event.trackId || "branch"))];
  // Keep four authored tracks readable at 1440px without fitting the whole
  // narrative into an illegible miniature. Wider stories remain pannable.
  const tracks = trackKeys.map((id, index) => ({ id, kind: (id === "main" ? "main" : "branch") as "main" | "branch", y: 160 + index * 190, eventIds: [] as string[] }));
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const positions: Record<string, { x: number; y: number }> = {};
  for (const event of events) {
    const track = trackById.get(event.trackKind === "branch" || event.trackId ? event.trackId || "branch" : "main") ?? tracks[0]!;
    track.eventIds.push(event.id);
    positions[event.id] = event.pinnedPosition ?? { x: 90 + (depth.get(event.id) ?? event.order) * 270, y: track.y };
  }
  const sourceVersion = digest(events.map(({ id, sourceVersion, order, trackId, trackKind }) => ({ id, sourceVersion, order, trackId: trackId ?? null, trackKind: trackKind ?? "main" })));
  return { schemaVersion: "tianyan-event-narrative-layout/r1", sourceVersion, revision: digest({ sourceVersion, relations, positions }), positions, tracks };
}

/** Read-only topology used by the branch navigator; it never rewrites graph identity. */
export function buildNarrativeNavigation(input: { events: readonly NarrativeLayoutEvent[]; relations: readonly NarrativeLayoutRelation[] }): NarrativeNavigationProjection {
  const orderedEvents = [...input.events].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  const trackByEventId = Object.fromEntries(orderedEvents.map((event) => [event.id, event.trackKind === "branch" || event.trackId ? event.trackId || "branch" : "main"]));
  const eventOrderById = Object.fromEntries(orderedEvents.map((event, index) => [event.id, index]));
  const ids = new Set(orderedEvents.map((event) => event.id));
  const relations = input.relations.filter((relation) => relation.confirmed && ids.has(relation.sourceEventId) && ids.has(relation.targetEventId) && relation.sourceEventId !== relation.targetEventId);
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const relation of relations) {
    outgoing.set(relation.sourceEventId, [...(outgoing.get(relation.sourceEventId) ?? []), relation.targetEventId]);
    incoming.set(relation.targetEventId, [...(incoming.get(relation.targetEventId) ?? []), relation.sourceEventId]);
  }
  const branchPoints = orderedEvents.flatMap((event) => {
    const targets = [...new Set(outgoing.get(event.id) ?? [])];
    const sourceTrack = trackByEventId[event.id];
    const branchTrackIds = [...new Set(targets.map((id) => trackByEventId[id]).filter((trackId) => trackId && trackId !== sourceTrack))];
    return targets.length > 1 || branchTrackIds.some((trackId) => trackId !== "main") ? [{ eventId: event.id, targetEventIds: targets, branchTrackIds: branchTrackIds.filter((trackId) => trackId !== "main") }] : [];
  });
  const mergePoints = orderedEvents.flatMap((event) => {
    const sources = [...new Set(incoming.get(event.id) ?? [])];
    const targetTrack = trackByEventId[event.id];
    const sourceTrackIds = [...new Set(sources.map((id) => trackByEventId[id]).filter((trackId) => trackId && trackId !== targetTrack))];
    return sources.length > 1 || (targetTrack === "main" && sourceTrackIds.length) ? [{ eventId: event.id, sourceEventIds: sources, sourceTrackIds }] : [];
  });
  return { trackIds: [...new Set(orderedEvents.map((event) => trackByEventId[event.id]!))], trackByEventId, eventOrderById, branchPoints, mergePoints };
}

function digest(value: unknown): `layout:${string}` {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return `layout:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
