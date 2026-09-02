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
