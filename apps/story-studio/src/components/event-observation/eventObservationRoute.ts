export type EventObservationView = "spine" | "canvas" | "timeline";

export type EventObservationRouteRequest =
  | { status: "none"; eventId: null }
  | { status: "selected"; eventId: string; source: "canonical" | "legacy" | "both"; needsCanonicalization: boolean }
  | { status: "invalid"; eventId: null; reason: "invalid-id" | "conflict" };

export type EventObservationRouteAvailability =
  | { status: "none" }
  | { status: "invalid"; reason: "invalid-id" | "conflict" }
  | { status: "loading"; eventId: string }
  | { status: "unavailable"; eventId: string }
  | { status: "not-found"; eventId: string }
  | { status: "ready"; eventId: string };

const stableEventIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,179}$/u;

/** Resolves a route request without touching Event, WorldState, or Canon.
 * `storyCanvas=successor-r0` is read-only compatibility input, never an owner. */
export function resolveEventObservationView(search: string, storedView: string | null = null): { view: EventObservationView; legacyCanvas: boolean; explicit: boolean } {
  const params = new URLSearchParams(search);
  const view = params.get("view");
  if (view === "spine" || view === "canvas" || view === "timeline") return { view, legacyCanvas: false, explicit: true };
  if (params.get("storyCanvas") === "successor-r0") return { view: "canvas", legacyCanvas: true, explicit: false };
  return { view: storedView === "canvas" || storedView === "timeline" ? storedView : "spine", legacyCanvas: false, explicit: false };
}

/** Reads the public Event Line route contract. `eventId` is accepted only as
 * legacy input; all writers must serialize the stable Canon ID as `event`. */
export function resolveEventObservationRoute(search: string): EventObservationRouteRequest {
  const params = new URLSearchParams(search);
  const canonical = resolveRouteValues(params.getAll("event"));
  const legacy = resolveRouteValues(params.getAll("eventId"));
  if (canonical.status === "invalid" || legacy.status === "invalid") return { status: "invalid", eventId: null, reason: "invalid-id" };
  if (canonical.status === "conflict" || legacy.status === "conflict") return { status: "invalid", eventId: null, reason: "conflict" };
  if (canonical.value && legacy.value && canonical.value !== legacy.value) return { status: "invalid", eventId: null, reason: "conflict" };
  const eventId = canonical.value ?? legacy.value;
  if (!eventId) return { status: "none", eventId: null };
  const source = canonical.value && legacy.value ? "both" : canonical.value ? "canonical" : "legacy";
  return {
    status: "selected",
    eventId,
    source,
    needsCanonicalization: source !== "canonical" || canonical.count !== 1 || legacy.count > 0
  };
}

export function serializeEventObservationRoute(search: string, eventId: string | null): string {
  if (eventId !== null && !stableEventIdPattern.test(eventId)) throw new Error("Invalid stable Event ID.");
  const params = new URLSearchParams(search);
  params.delete("event");
  params.delete("eventId");
  if (eventId) params.set("event", eventId);
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function resolveEventObservationRouteAvailability(
  request: EventObservationRouteRequest,
  listState: { status: "loading" | "ready" | "error" },
  eventIds: readonly string[]
): EventObservationRouteAvailability {
  if (request.status === "invalid") return { status: "invalid", reason: request.reason };
  if (request.status === "none") return { status: "none" };
  if (listState.status === "loading") return { status: "loading", eventId: request.eventId };
  if (listState.status === "error") return { status: "unavailable", eventId: request.eventId };
  if (!eventIds.includes(request.eventId)) return { status: "not-found", eventId: request.eventId };
  return { status: "ready", eventId: request.eventId };
}

function resolveRouteValues(values: string[]): { status: "ready" | "invalid" | "conflict"; value: string | null; count: number } {
  if (values.some((value) => !stableEventIdPattern.test(value))) return { status: "invalid", value: null, count: values.length };
  const unique = [...new Set(values)];
  if (unique.length > 1) return { status: "conflict", value: null, count: values.length };
  return { status: "ready", value: unique[0] ?? null, count: values.length };
}
