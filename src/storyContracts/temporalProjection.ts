import {
  normalizeStoryStudioEventReference,
  type StoryStudioEventReference
} from "./storyStudioEventReference.ts";

export const TEMPORAL_PROJECTION_VERSION = "tianyan-temporal-projection/v1" as const;

export type TemporalPlacementKind = "anchored" | "inferred" | "ambiguous" | "conflict" | "unplaced";
export type TemporalProjectionStatus = "created" | "generating" | "ready" | "failed" | "stopped";

export type TemporalProjectionRequest = {
  projectId: string;
  graphRevisionHash: string;
  eventRefs: StoryStudioEventReference[];
  operationId: string;
  trigger: "author-requested" | "author-retry";
};

export type TemporalPlacement = {
  versionedEventRef: StoryStudioEventReference;
  placementKind: TemporalPlacementKind;
  relativePosition: number;
  segmentId: string;
  authoredTimeLabel: string | null;
  inferredWindow: { start: number; end: number } | null;
  anchorBeforeEventIds: string[];
  anchorAfterEventIds: string[];
  confidence: number | null;
  evidenceRefs: string[];
  authorFacingSummary: string;
  alternatives: Array<{ relativePosition: number; label: string }>;
};

export type TemporalSegment = {
  id: string;
  order: number;
  label: string;
  kind: "authored_anchor" | "inferred_phase" | "interval" | "unresolved";
  startAnchorEventIds: string[];
  endAnchorEventIds: string[];
  confidence: number | null;
};

export type TemporalConflict = {
  id: string;
  eventIds: string[];
  summary: string;
  evidenceRefs: string[];
};

export type TemporalProjectionResult = {
  placements: TemporalPlacement[];
  segments: TemporalSegment[];
  conflicts: TemporalConflict[];
};

export type TemporalProjectionRun = {
  version: typeof TEMPORAL_PROJECTION_VERSION;
  runId: string;
  projectId: string;
  graphRevisionHash: string;
  operationId: string;
  trigger: TemporalProjectionRequest["trigger"];
  sourceSnapshot: StoryStudioEventReference[];
  status: TemporalProjectionStatus;
  createdAt: string;
  stale: boolean;
  placements: TemporalPlacement[];
  segments: TemporalSegment[];
  conflicts: TemporalConflict[];
  failureReason: string | null;
};

export function normalizeTemporalProjectionRequest(value: unknown): TemporalProjectionRequest {
  const input = exactObject(value, ["projectId", "graphRevisionHash", "eventRefs", "operationId", "trigger"], "Temporal projection request");
  const projectId = requireProjectId(input.projectId);
  if (!Array.isArray(input.eventRefs) || input.eventRefs.length === 0 || input.eventRefs.length > 512) throw new Error("Temporal projection event references are invalid.");
  const seen = new Set<string>();
  const eventRefs = input.eventRefs.map((item) => {
    const reference = normalizeStoryStudioEventReference(item);
    if (reference.projectId !== projectId) throw new Error("Temporal projection event reference belongs to another project.");
    if (reference.requestedUse !== "constraint") throw new Error("Temporal projection event reference use must be constraint.");
    if (seen.has(reference.eventId)) throw new Error("Temporal projection event reference is duplicated.");
    seen.add(reference.eventId);
    return reference;
  });
  return {
    projectId,
    graphRevisionHash: requireHash(input.graphRevisionHash, "Temporal projection graph revision"),
    eventRefs,
    operationId: requireStableId(input.operationId, "Temporal projection operation"),
    trigger: oneOf(input.trigger, ["author-requested", "author-retry"] as const, "Temporal projection trigger")
  };
}

export function createTemporalProjectionRun(input: TemporalProjectionRequest & { runId: string; createdAt: string }): TemporalProjectionRun {
  return {
    version: TEMPORAL_PROJECTION_VERSION,
    runId: requireRunId(input.runId),
    projectId: input.projectId,
    graphRevisionHash: input.graphRevisionHash,
    operationId: input.operationId,
    trigger: input.trigger,
    sourceSnapshot: input.eventRefs,
    status: "created",
    createdAt: requireIsoDate(input.createdAt),
    stale: false,
    placements: [],
    segments: [],
    conflicts: [],
    failureReason: null
  };
}

export function validateTemporalProjectionResult(input: {
  request: TemporalProjectionRequest;
  result: unknown;
}): TemporalProjectionResult {
  const result = exactObject(input.result, ["placements", "segments", "conflicts"], "Temporal projection result");
  if (!Array.isArray(result.placements) || !Array.isArray(result.segments) || !Array.isArray(result.conflicts)) throw new Error("Temporal projection result lists are invalid.");
  const scope = new Map(input.request.eventRefs.map((reference) => [reference.eventId, reference]));
  const placed = new Set<string>();
  const placements = result.placements.map((value) => normalizePlacement(value, scope, placed));
  if (placements.length !== scope.size || placements.some((placement) => !scope.has(placement.versionedEventRef.eventId))) throw new Error("Temporal projection must place every current Event exactly once.");
  const segments = result.segments.map(normalizeSegment);
  const segmentIds = new Set(segments.map((segment) => segment.id));
  if (segmentIds.size !== segments.length) throw new Error("Temporal projection segment is duplicated.");
  if (placements.some((placement) => !segmentIds.has(placement.segmentId))) throw new Error("Temporal placement references an unknown segment.");
  const conflicts = result.conflicts.map((value) => normalizeConflict(value, scope));
  assertNoInternalFields({ placements, segments, conflicts });
  return { placements, segments, conflicts };
}

export function validateTemporalProjectionRun(value: unknown): TemporalProjectionRun {
  const input = exactObject(value, ["version", "runId", "projectId", "graphRevisionHash", "operationId", "trigger", "sourceSnapshot", "status", "createdAt", "stale", "placements", "segments", "conflicts", "failureReason"], "Temporal projection run");
  if (input.version !== TEMPORAL_PROJECTION_VERSION) throw new Error("Temporal projection run version is invalid.");
  const request: TemporalProjectionRequest = {
    projectId: requireProjectId(input.projectId),
    graphRevisionHash: requireHash(input.graphRevisionHash, "Temporal projection graph revision"),
    operationId: requireStableId(input.operationId, "Temporal projection operation"),
    trigger: oneOf(input.trigger, ["author-requested", "author-retry"] as const, "Temporal projection trigger"),
    eventRefs: Array.isArray(input.sourceSnapshot)
      ? input.sourceSnapshot.map((reference) => normalizeStoryStudioEventReference(reference))
      : []
  };
  const status = oneOf(input.status, ["created", "generating", "ready", "failed", "stopped"] as const, "Temporal projection status");
  const result = status === "ready"
    ? validateTemporalProjectionResult({ request, result: { placements: input.placements, segments: input.segments, conflicts: input.conflicts } })
    : emptyOrValidatedResult(input, request);
  return {
    version: TEMPORAL_PROJECTION_VERSION,
    runId: requireRunId(input.runId),
    projectId: request.projectId,
    graphRevisionHash: request.graphRevisionHash,
    operationId: request.operationId,
    trigger: request.trigger,
    sourceSnapshot: request.eventRefs,
    status,
    createdAt: requireIsoDate(input.createdAt),
    stale: requireBoolean(input.stale, "Temporal projection stale state"),
    ...result,
    failureReason: input.failureReason === null ? null : requireText(input.failureReason, 240, "Temporal projection failure reason")
  };
}

function emptyOrValidatedResult(input: Record<string, unknown>, request: TemporalProjectionRequest): TemporalProjectionResult {
  if (Array.isArray(input.placements) && input.placements.length === 0 && Array.isArray(input.segments) && input.segments.length === 0 && Array.isArray(input.conflicts) && input.conflicts.length === 0) {
    return { placements: [], segments: [], conflicts: [] };
  }
  return validateTemporalProjectionResult({ request, result: { placements: input.placements, segments: input.segments, conflicts: input.conflicts } });
}

function normalizePlacement(value: unknown, scope: ReadonlyMap<string, StoryStudioEventReference>, placed: Set<string>): TemporalPlacement {
  const input = exactObject(value, ["versionedEventRef", "placementKind", "relativePosition", "segmentId", "authoredTimeLabel", "inferredWindow", "anchorBeforeEventIds", "anchorAfterEventIds", "confidence", "evidenceRefs", "authorFacingSummary", "alternatives"], "Temporal placement");
  const reference = normalizeStoryStudioEventReference(input.versionedEventRef);
  const current = scope.get(reference.eventId);
  if (!current || JSON.stringify(current) !== JSON.stringify(reference)) throw new Error("Temporal placement Event reference is stale or out of scope.");
  if (placed.has(reference.eventId)) throw new Error("Temporal projection contains the same Event more than once.");
  placed.add(reference.eventId);
  const placementKind = oneOf(input.placementKind, ["anchored", "inferred", "ambiguous", "conflict", "unplaced"] as const, "Temporal placement kind");
  const confidence = nullableConfidence(input.confidence);
  const inferredWindow = input.inferredWindow === null ? null : normalizeWindow(input.inferredWindow);
  if (placementKind === "anchored" && input.authoredTimeLabel === null) throw new Error("Anchored temporal placement requires an authored time label.");
  if (placementKind === "ambiguous" && !inferredWindow) throw new Error("Ambiguous temporal placement requires an inferred window.");
  return {
    versionedEventRef: reference,
    placementKind,
    relativePosition: requireFinite(input.relativePosition, "Temporal relative position"),
    segmentId: requireStableId(input.segmentId, "Temporal segment"),
    authoredTimeLabel: input.authoredTimeLabel === null ? null : requireText(input.authoredTimeLabel, 80, "Authored time label"),
    inferredWindow,
    anchorBeforeEventIds: eventIdList(input.anchorBeforeEventIds, scope, "Temporal before anchors"),
    anchorAfterEventIds: eventIdList(input.anchorAfterEventIds, scope, "Temporal after anchors"),
    confidence,
    evidenceRefs: stringList(input.evidenceRefs, 32, "Temporal evidence references"),
    authorFacingSummary: requireText(input.authorFacingSummary, 180, "Temporal author summary"),
    alternatives: normalizeAlternatives(input.alternatives)
  };
}

function normalizeSegment(value: unknown): TemporalSegment {
  const input = exactObject(value, ["id", "order", "label", "kind", "startAnchorEventIds", "endAnchorEventIds", "confidence"], "Temporal segment");
  return {
    id: requireStableId(input.id, "Temporal segment"),
    order: requireInteger(input.order, 0, 10_000, "Temporal segment order"),
    label: requireText(input.label, 80, "Temporal segment label"),
    kind: oneOf(input.kind, ["authored_anchor", "inferred_phase", "interval", "unresolved"] as const, "Temporal segment kind"),
    startAnchorEventIds: stringList(input.startAnchorEventIds, 64, "Temporal segment start anchors"),
    endAnchorEventIds: stringList(input.endAnchorEventIds, 64, "Temporal segment end anchors"),
    confidence: nullableConfidence(input.confidence)
  };
}

function normalizeConflict(value: unknown, scope: ReadonlyMap<string, StoryStudioEventReference>): TemporalConflict {
  const input = exactObject(value, ["id", "eventIds", "summary", "evidenceRefs"], "Temporal conflict");
  const eventIds = eventIdList(input.eventIds, scope, "Temporal conflict Events");
  if (eventIds.length < 2) throw new Error("Temporal conflict requires at least two Events.");
  return { id: requireStableId(input.id, "Temporal conflict"), eventIds, summary: requireText(input.summary, 180, "Temporal conflict summary"), evidenceRefs: stringList(input.evidenceRefs, 32, "Temporal conflict evidence") };
}

function normalizeWindow(value: unknown): { start: number; end: number } {
  const input = exactObject(value, ["start", "end"], "Temporal inferred window");
  const start = requireFinite(input.start, "Temporal window start");
  const end = requireFinite(input.end, "Temporal window end");
  if (end < start) throw new Error("Temporal inferred window is reversed.");
  return { start, end };
}

function normalizeAlternatives(value: unknown): Array<{ relativePosition: number; label: string }> {
  if (!Array.isArray(value) || value.length > 8) throw new Error("Temporal alternatives are invalid.");
  return value.map((item) => {
    const input = exactObject(item, ["relativePosition", "label"], "Temporal alternative");
    return { relativePosition: requireFinite(input.relativePosition, "Temporal alternative position"), label: requireText(input.label, 80, "Temporal alternative label") };
  });
}

function eventIdList(value: unknown, scope: ReadonlyMap<string, StoryStudioEventReference>, label: string): string[] {
  const result = stringList(value, 512, label);
  if (result.some((id) => !scope.has(id))) throw new Error(`${label} contains an out-of-scope Event.`);
  return result;
}

function stringList(value: unknown, maximum: number, label: string): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} are invalid.`);
  const result = value.map((item) => requireStableId(item, label));
  if (new Set(result).size !== result.length) throw new Error(`${label} contain duplicates.`);
  return result;
}

function assertNoInternalFields(value: unknown): void {
  const serialized = JSON.stringify(value);
  if (/"(?:prompt|model|messages|tool(?:Call|Calls|Arguments)?|transcript|providerResponse|temperature|tokenUsage)"\s*:/iu.test(serialized)) {
    throw new Error("Temporal projection exposes internal Agent or Provider fields.");
  }
}

function exactObject(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object.`);
  const input = value as Record<string, unknown>;
  const actual = Object.keys(input).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(`${label} fields are invalid.`);
  return input;
}

function requireProjectId(value: unknown): string { const result = requireText(value, 64, "Temporal project identifier"); if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(result)) throw new Error("Temporal project identifier is invalid."); return result; }
function requireRunId(value: unknown): string { const result = requireStableId(value, "Temporal projection Run"); if (!result.startsWith("temporal-run.")) throw new Error("Temporal projection Run identifier is invalid."); return result; }
function requireStableId(value: unknown, label: string): string { const result = requireText(value, 180, label); if (!/^[\p{L}\p{N}][\p{L}\p{N}._:-]*$/u.test(result)) throw new Error(`${label} is invalid.`); return result; }
function requireHash(value: unknown, label: string): string { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new Error(`${label} is invalid.`); return value; }
function requireIsoDate(value: unknown): string { const result = requireText(value, 40, "Temporal projection date"); if (!Number.isFinite(Date.parse(result))) throw new Error("Temporal projection date is invalid."); return result; }
function requireBoolean(value: unknown, label: string): boolean { if (typeof value !== "boolean") throw new Error(`${label} is invalid.`); return value; }
function requireText(value: unknown, maximum: number, label: string): string { if (typeof value !== "string") throw new Error(`${label} is invalid.`); const result = value.normalize("NFC").trim(); if (!result || [...result].length > maximum || /[\u0000-\u001F\u007F]/u.test(result)) throw new Error(`${label} is invalid.`); return result; }
function requireFinite(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error(`${label} is invalid.`); return value; }
function requireInteger(value: unknown, minimum: number, maximum: number, label: string): number { if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) throw new Error(`${label} is invalid.`); return value as number; }
function nullableConfidence(value: unknown): number | null { if (value === null) return null; if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Temporal confidence is invalid."); return value; }
function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T { if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error(`${label} is invalid.`); return value as T; }
