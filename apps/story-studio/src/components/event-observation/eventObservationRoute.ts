export type EventObservationView = "spine" | "canvas" | "timeline";

/** Resolves a route request without touching Event, WorldState, or Canon.
 * `storyCanvas=successor-r0` is read-only compatibility input, never an owner. */
export function resolveEventObservationView(search: string, storedView: string | null = null): { view: EventObservationView; legacyCanvas: boolean; explicit: boolean } {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view === "spine" || view === "canvas" || view === "timeline") return { view, legacyCanvas: false, explicit: true };
  if (params.get("storyCanvas") === "successor-r0") return { view: "canvas", legacyCanvas: true, explicit: false };
  return { view: storedView === "canvas" || storedView === "timeline" ? storedView : "spine", legacyCanvas: false, explicit: false };
}
