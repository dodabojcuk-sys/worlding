import type { NuwaN1Storyline, StoryUnit } from "../../lib/localTransport";

/** A navigation projection. The Story Unit and Event owners remain unchanged. */
export function eventLineJourneyLines(storylines: readonly NuwaN1Storyline[], units: readonly StoryUnit[]) {
  const active = units.filter((unit) => unit.lifecycle !== "archived");
  const byId = new Map(active.map((unit) => [unit.id, unit]));
  const lines = storylines.map((line) => ({
    key: line.key,
    title: line.title,
    units: line.units.flatMap((item) => byId.get(item.id) ?? [])
  }));
  const covered = new Set(lines.flatMap((line) => line.units.map((unit) => unit.id)));
  // Older projects can have a formal Story Unit before Nuwa has a matching
  // scope projection. Keep it findable without inventing a new storyline.
  for (const unit of active) if (!covered.has(unit.id) && unit.kind === "main") {
    lines.push({ key: `unit:${unit.id}`, title: unit.title, units: [unit] });
    covered.add(unit.id);
  }
  return lines;
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
