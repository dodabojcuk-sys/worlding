import type {
  TimelineDependency,
  TimelineDocument,
  TimelineEntry,
  TimelineTrackView,
  WorldObjectSummary
} from "./localTransport";

export type TimelineEntryStatus = "canonical" | "planned" | "missing" | "ineligible";

export type TimelineProjectedEntry = {
  entry: TimelineEntry;
  event: WorldObjectSummary | null;
  status: TimelineEntryStatus;
  characterIds: string[];
  locationIds: string[];
  trackIds: string[];
  plannedFromEventId: string | null;
  enteredCanonEventId: string | null;
  dependencyOrderWarning: boolean;
};

export type TimelineProjectedTrack = {
  track: TimelineTrackView;
  title: string;
  color: string;
  missingReference: boolean;
  entries: TimelineProjectedEntry[];
};

export type TimelineProjection = {
  tracks: TimelineProjectedTrack[];
  entries: TimelineProjectedEntry[];
  unprojectedEntries: TimelineProjectedEntry[];
  storedEntryCount: number;
  projectedCardCount: number;
};

export function buildTimelineProjection(
  document: TimelineDocument,
  objects: WorldObjectSummary[],
  searchQuery = ""
): TimelineProjection {
  const objectsById = new Map(objects.map((object) => [object.id, object]));
  const runtimeByEntry = new Map(document.diagnostics.timeline.projectedEntries.map((item) => [item.entryId, item]));
  const statusByEntry = new Map(document.diagnostics.timeline.entryStates.map((item) => [item.entryId, item.status]));
  const canonByPlanningEventId = new Map((document.diagnostics.timeline.canonicalLinks || []).map((item) => [item.planningEventId, item.canonicalEventId]));
  const orderByEvent = new Map(document.content.entries.map((entry) => [entry.eventId, entry.order]));
  const warnedEvents = new Set(document.content.dependencies.flatMap((dependency) => {
    const fromOrder = orderByEvent.get(dependency.fromEventId);
    const toOrder = orderByEvent.get(dependency.toEventId);
    return fromOrder != null && toOrder != null && fromOrder >= toOrder ? [dependency.fromEventId, dependency.toEventId] : [];
  }));
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const entries = [...document.content.entries]
    .sort(compareTimelineEntries)
    .map((entry): TimelineProjectedEntry => {
      const runtime = runtimeByEntry.get(entry.id);
      const event = objectsById.get(entry.eventId) || null;
      // The repository owns source eligibility. Summaries can be stale during an
      // external edit, so the visual projection must not reclassify an entry.
      const status = statusByEntry.get(entry.id) || sourceStatus(event);
      const characterIds = runtime?.characterIds || [];
      const locationIds = runtime?.locationIds || [];
      const isProjectable = status === "canonical" || status === "planned";
      const trackIds = document.content.trackViews.flatMap((track) => {
        if (track.kind === "canon" && status === "canonical") return [track.id];
        if (track.kind === "planning" && status === "planned") return [track.id];
        if (isProjectable && track.kind === "custom" && track.refId === entry.laneId) return [track.id];
        if (isProjectable && track.kind === "character" && track.refId && characterIds.includes(track.refId)) return [track.id];
        if (isProjectable && track.kind === "location" && track.refId && locationIds.includes(track.refId)) return [track.id];
        return [];
      });
      return {
        entry,
        event,
        status,
        characterIds,
        locationIds,
        trackIds,
        plannedFromEventId: runtime?.plannedFromEventId || null,
        enteredCanonEventId: canonByPlanningEventId.get(entry.eventId) || null,
        dependencyOrderWarning: warnedEvents.has(entry.eventId)
      };
    })
    .filter((item) => matchesPersistedFilters(item, document))
    .filter((item) => matchesSearch(item, objectsById, normalizedQuery));

  const lanesById = new Map(document.content.lanes.map((lane) => [lane.id, lane]));
  const tracks = document.content.trackViews
    .filter((track) => track.visible)
    .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
    .map((track): TimelineProjectedTrack => {
      const reference = track.refId ? objectsById.get(track.refId) : null;
      const lane = track.kind === "custom" && track.refId ? lanesById.get(track.refId) : null;
      return {
        track,
        title: trackTitle(track, reference, lane?.title),
        color: lane?.color || trackColor(track.kind),
        missingReference: (track.kind === "character" || track.kind === "location") && !reference,
        entries: entries.filter((entry) => entry.trackIds.includes(track.id))
      };
    });

  return {
    tracks,
    entries,
    unprojectedEntries: entries.filter((entry) => entry.trackIds.length === 0 && (entry.status === "missing" || entry.status === "ineligible")),
    storedEntryCount: document.content.entries.length,
    projectedCardCount: tracks.reduce((count, track) => count + track.entries.length, 0)
  };
}

function sourceStatus(event: WorldObjectSummary | null): TimelineEntryStatus {
  if (!event) return "missing";
  if (event.type === "event" && event.status === "committed" && event.tags.includes("作者确认")) return "canonical";
  if (event.type === "event" && event.status === "planned" && event.tags.includes("作者规划")) return "planned";
  return "ineligible";
}

export function reorderTimelineEntry(
  document: TimelineDocument,
  sourceEventId: string,
  targetEventId: string,
  placement: "before" | "after"
): TimelineDocument {
  if (sourceEventId === targetEventId) return document;
  const ordered = [...document.content.entries].sort(compareTimelineEntries);
  const source = ordered.find((entry) => entry.eventId === sourceEventId);
  const target = ordered.find((entry) => entry.eventId === targetEventId);
  if (!source || !target) return document;
  const remaining = ordered.filter((entry) => entry.id !== source.id);
  const targetIndex = remaining.findIndex((entry) => entry.id === target.id);
  remaining.splice(targetIndex + (placement === "after" ? 1 : 0), 0, source);
  return withTimelineContent(document, {
    entries: remaining.map((entry, order) => ({ ...entry, order }))
  });
}

export function moveTimelineEntry(
  document: TimelineDocument,
  eventId: string,
  delta: -1 | 1
): TimelineDocument {
  const ordered = [...document.content.entries].sort(compareTimelineEntries);
  const index = ordered.findIndex((entry) => entry.eventId === eventId);
  const target = ordered[index + delta];
  return target ? reorderTimelineEntry(document, eventId, target.eventId, delta < 0 ? "before" : "after") : document;
}

export function createTimelineDependency(
  document: TimelineDocument,
  prerequisiteEventId: string,
  dependentEventId: string
): TimelineDocument {
  const dependency: TimelineDependency = {
    id: nextTimelineId("dependency", document.content.dependencies.map((item) => item.id)),
    fromEventId: prerequisiteEventId,
    toEventId: dependentEventId,
    kind: "requires"
  };
  return withTimelineContent(document, { dependencies: [...document.content.dependencies, dependency] });
}

export function removeTimelineEntryWithDependencies(document: TimelineDocument, eventId: string): TimelineDocument {
  return withTimelineContent(document, {
    entries: document.content.entries.filter((entry) => entry.eventId !== eventId)
      .sort(compareTimelineEntries)
      .map((entry, order) => ({ ...entry, order })),
    dependencies: document.content.dependencies.filter((dependency) => dependency.fromEventId !== eventId && dependency.toEventId !== eventId)
  });
}

export function removeTimelineDependency(document: TimelineDocument, dependencyId: string): TimelineDocument {
  return withTimelineContent(document, {
    dependencies: document.content.dependencies.filter((dependency) => dependency.id !== dependencyId)
  });
}

export function incidentTimelineDependencies(document: TimelineDocument, eventId: string): TimelineDependency[] {
  return document.content.dependencies.filter((dependency) => dependency.fromEventId === eventId || dependency.toEventId === eventId);
}

export function dependencyOrderWarning(document: TimelineDocument, dependency: TimelineDependency): boolean {
  const orderByEvent = new Map(document.content.entries.map((entry) => [entry.eventId, entry.order]));
  const fromOrder = orderByEvent.get(dependency.fromEventId);
  const toOrder = orderByEvent.get(dependency.toEventId);
  return fromOrder != null && toOrder != null && fromOrder >= toOrder;
}

export function compareTimelineEntries(left: TimelineEntry, right: TimelineEntry): number {
  return left.order - right.order || left.id.localeCompare(right.id);
}

function matchesPersistedFilters(entry: TimelineProjectedEntry, document: TimelineDocument): boolean {
  const { mode, objectIds } = document.content.filters;
  if (mode === "canon" && entry.status !== "canonical") return false;
  if (mode === "planning" && entry.status !== "planned") return false;
  if (objectIds.length === 0) return true;
  const linkedIds = new Set([...entry.characterIds, ...entry.locationIds]);
  return objectIds.every((id) => linkedIds.has(id));
}

function matchesSearch(
  entry: TimelineProjectedEntry,
  objectsById: Map<string, WorldObjectSummary>,
  query: string
): boolean {
  if (!query) return true;
  const values = [
    entry.event?.title || "",
    ...(entry.event?.tags || []),
    ...[...entry.characterIds, ...entry.locationIds].map((id) => objectsById.get(id)?.title || "")
  ];
  return values.some((value) => value.toLocaleLowerCase().includes(query));
}

function trackTitle(track: TimelineTrackView, reference: WorldObjectSummary | null | undefined, laneTitle?: string): string {
  if (track.kind === "canon") return "正史";
  if (track.kind === "planning") return "规划";
  if (track.kind === "custom") return laneTitle || "展示轨道";
  return reference?.title || "对象已缺失";
}

function trackColor(kind: TimelineTrackView["kind"]): string {
  if (kind === "canon") return "#63c3b5";
  if (kind === "planning") return "#d08b43";
  if (kind === "character") return "#b49ad6";
  if (kind === "location") return "#9fb7d1";
  return "#d5c27a";
}

function withTimelineContent(document: TimelineDocument, patch: Partial<TimelineDocument["content"]>): TimelineDocument {
  return { ...document, content: { ...document.content, ...patch } };
}

function nextTimelineId(prefix: string, existing: string[]): string {
  for (let index = 1; index < 100_000; index += 1) {
    const id = `${prefix}.${index}`;
    if (!existing.includes(id)) return id;
  }
  throw new Error(`Could not create ${prefix} id.`);
}
