import type { NarrativeArrangementRead, NuwaN1Storyline, StoryUnit } from "../../lib/localTransport";

/** A navigation projection. The Story Unit and Event owners remain unchanged. */
export function eventLineJourneyLines(storylines: readonly NuwaN1Storyline[], units: readonly StoryUnit[]) {
  const active = units.filter((unit) => unit.lifecycle !== "archived");
  const byId = new Map(active.map((unit) => [unit.id, unit]));
  return storylines.map((line) => ({
    key: line.key,
    title: line.title,
    units: line.units.flatMap((item) => byId.get(item.id) ?? [])
  }));
}

/** Read the formal placement order; an unplaced linked Event follows placed Events. */
export function eventLineJourneyNodes<T extends { id: string }>(unit: StoryUnit, events: readonly T[], narratives: readonly NarrativeArrangementRead[]): T[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const positions = new Map<string, number>();
  for (const read of narratives) {
    for (const placement of read.projection.placed) {
      if (placement.storyUnitId !== unit.id || positions.has(placement.eventId)) continue;
      positions.set(placement.eventId, placement.narrativeIndex);
    }
  }
  return unit.linkedEntityIds.flatMap((id) => byId.get(id) ?? []).sort((left, right) => {
    const a = positions.get(left.id);
    const b = positions.get(right.id);
    if (a !== undefined && b !== undefined) return a - b;
    if (a !== undefined) return -1;
    if (b !== undefined) return 1;
    return left.id.localeCompare(right.id);
  });
}

export type EventLineJourneyLocation = { lineKey: string | null; unitId: string | null; eventId: string | null };
export function readEventLineJourneyLocation(search: string): EventLineJourneyLocation {
  const params = new URLSearchParams(search);
  return { lineKey: params.get("line"), unitId: params.get("unit"), eventId: params.get("node") };
}

export function eventLineJourneyUrl(location: EventLineJourneyLocation): string {
  const params = new URLSearchParams();
  if (location.lineKey) params.set("line", location.lineKey);
  if (location.unitId) params.set("unit", location.unitId);
  if (location.eventId) params.set("node", location.eventId);
  return `/event-line${params.size ? `?${params.toString()}` : ""}`;
}
