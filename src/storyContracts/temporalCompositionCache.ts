import type { StoryStudioEventReference } from "./storyStudioEventReference.ts";
import type { TemporalPlacement } from "./temporalProjection.ts";

export const TEMPORAL_COMPOSITION_CACHE_VERSION = "tianyan-temporal-composition-cache/v1" as const;

export type TemporalCompositionCacheItem = {
  versionedEventRef: StoryStudioEventReference;
  branchTrack: string;
  point: number | null;
  interval: { start: number; end: number } | null;
  confidence: number | null;
  evidenceRefs: string[];
  alternatives: Array<{ relativePosition: number; label: string }>;
};

export type TemporalCompositionCache = {
  version: typeof TEMPORAL_COMPOSITION_CACHE_VERSION;
  sourceManifestDigest: `sha256:${string}`;
  layoutRevision: string;
  items: TemporalCompositionCacheItem[];
};

export type TemporalTrackProjection = {
  origin: "author-formal" | "ai-suggested" | "ai-suggested-stale";
  trackByEventId: Record<string, string>;
  tracks: Array<{ id: string; order: number; label: string }>;
};

export function buildTemporalCompositionCache(input: {
  sourceManifestDigest: string;
  layoutRevision: string;
  placements: readonly TemporalPlacement[];
  branchTrackByEventId: Readonly<Record<string, string>>;
}): TemporalCompositionCache {
  if (!/^sha256:[a-f0-9]{64}$/u.test(input.sourceManifestDigest)) throw new Error("Temporal composition source manifest digest is invalid.");
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(input.layoutRevision)) throw new Error("Temporal composition layout revision is invalid.");
  const seen = new Set<string>();
  const items = input.placements.map((placement) => {
    const eventId = placement.versionedEventRef.eventId;
    if (seen.has(eventId)) throw new Error("Temporal composition cache contains a duplicated Event.");
    seen.add(eventId);
    const branchTrack = input.branchTrackByEventId[eventId] ?? "track.primary";
    if (!/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(branchTrack)) throw new Error("Temporal composition branch track is invalid.");
    const point = placement.placementKind === "anchored" || (placement.placementKind === "inferred" && !placement.inferredWindow)
      ? placement.relativePosition
      : null;
    return {
      versionedEventRef: placement.versionedEventRef,
      branchTrack,
      point,
      interval: placement.inferredWindow,
      confidence: placement.confidence,
      evidenceRefs: [...placement.evidenceRefs],
      alternatives: placement.alternatives.map((alternative) => ({ ...alternative }))
    };
  });
  return {
    version: TEMPORAL_COMPOSITION_CACHE_VERSION,
    sourceManifestDigest: input.sourceManifestDigest as `sha256:${string}`,
    layoutRevision: input.layoutRevision,
    items
  };
}

export function validateTemporalCompositionCache(value: unknown, eventRefs: readonly StoryStudioEventReference[]): TemporalCompositionCache {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Temporal composition cache is invalid.");
  const input = value as Partial<TemporalCompositionCache>;
  if (input.version !== TEMPORAL_COMPOSITION_CACHE_VERSION || !Array.isArray(input.items)) throw new Error("Temporal composition cache version is invalid.");
  const scope = new Map(eventRefs.map((reference) => [reference.eventId, reference]));
  const placements = input.items.map((item): TemporalPlacement => {
    if (!item || typeof item !== "object" || !scope.has(item.versionedEventRef?.eventId)) throw new Error("Temporal composition cache Event is out of scope.");
    const reference = scope.get(item.versionedEventRef.eventId)!;
    if (JSON.stringify(reference) !== JSON.stringify(item.versionedEventRef)) throw new Error("Temporal composition cache Event version is stale.");
    return {
      versionedEventRef: reference,
      placementKind: item.interval ? "ambiguous" : item.point === null ? "unplaced" : "anchored",
      relativePosition: item.point ?? item.interval?.start ?? 0,
      segmentId: "temporal-cache.validation",
      authoredTimeLabel: item.point === null ? null : "cache",
      inferredWindow: item.interval ?? null,
      anchorBeforeEventIds: [],
      anchorAfterEventIds: [],
      confidence: item.confidence ?? null,
      evidenceRefs: Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [],
      authorFacingSummary: "cache",
      alternatives: Array.isArray(item.alternatives) ? item.alternatives : []
    };
  });
  const cache = buildTemporalCompositionCache({
    sourceManifestDigest: input.sourceManifestDigest ?? "",
    layoutRevision: input.layoutRevision ?? "",
    placements,
    branchTrackByEventId: Object.fromEntries(input.items.map((item) => [item.versionedEventRef.eventId, item.branchTrack]))
  });
  return { ...cache, items: input.items.map((item) => ({ ...item, evidenceRefs: [...item.evidenceRefs], alternatives: item.alternatives.map((alternative) => ({ ...alternative })) })) };
}

/** Resolves the cache-owned stable branch tracks, falling back only when the cache is absent or invalid. */
export function resolveTemporalTrackProjection(input: {
  eventIds: readonly string[];
  fallbackTrackByEventId: Readonly<Record<string, string>>;
  cache?: TemporalCompositionCache | null;
  stale?: boolean;
}): TemporalTrackProjection {
  const eventIds = [...new Set(input.eventIds)];
  const eventScope = new Set(eventIds);
  const cached = new Map<string, string>();
  let valid = Boolean(input.cache && input.cache.items.length === eventIds.length);
  for (const item of input.cache?.items ?? []) {
    const eventId = item.versionedEventRef.eventId;
    if (!eventScope.has(eventId) || cached.has(eventId) || !/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(item.branchTrack)) valid = false;
    cached.set(eventId, item.branchTrack);
  }
  if (cached.size !== eventIds.length) valid = false;
  const trackByEventId = Object.fromEntries(eventIds.map((eventId) => [eventId, valid ? cached.get(eventId)! : input.fallbackTrackByEventId[eventId] ?? "primary"]));
  const origin: TemporalTrackProjection["origin"] = valid ? input.stale ? "ai-suggested-stale" : "ai-suggested" : "author-formal";
  const tracks = [...new Set(Object.values(trackByEventId))]
    .sort((left, right) => temporalTrackOrder(left) - temporalTrackOrder(right) || left.localeCompare(right, "zh-CN"))
    .map((id, order) => ({ id, order, label: temporalTrackLabel(id, origin) }));
  return { origin, trackByEventId, tracks };
}

function temporalTrackOrder(id: string): number {
  return id === "track.primary" || id === "primary" ? 0 : id === "track.parallel" || id === "parallel" ? 1 : id === "track.aftermath" || id === "aftermath" ? 2 : 100;
}

function temporalTrackLabel(id: string, origin: TemporalTrackProjection["origin"]): string {
  const prefix = origin === "author-formal" ? "作者正式" : "AI 建议";
  const label = id === "track.primary" || id === "primary" ? "主序轨道" : id === "track.parallel" || id === "parallel" ? "并行轨道" : id === "track.aftermath" || id === "aftermath" ? "余波轨道" : id.replace(/^track[._:-]?/u, "").replace(/[._:-]+/gu, " ").trim() || "故事轨道";
  return `${prefix}·${label}`;
}
