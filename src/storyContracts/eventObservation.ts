import { buildEventSemanticNode, type EventNarrativeTime } from "./eventSemanticHierarchy.ts";
import type { PerspectiveObjectRef } from "./eventPerspectiveProjection.ts";

export const EVENT_OBSERVATION_STATE_VERSION = "tianyan-event-observation/v1" as const;
export const EVENT_OBSERVATION_MAX_FOCUS = 5;
export const EVENT_OBSERVATION_MAX_VISIBLE_EVENTS = 240;

export type EventObservationLayout = "structure" | "narrative" | "world-time" | "relation-network";
export type EventObservationLens = "none" | "participation" | "character-perspective" | "relationship-evolution";
export type EventObservationLayer = "causal" | "temporal-constraints" | "candidate-conflict" | "source-evidence";
export type EventObservationScale = "story" | "unit" | "event";

export type EventObservationState = {
  version: typeof EVENT_OBSERVATION_STATE_VERSION;
  layout: EventObservationLayout;
  lens: EventObservationLens;
  layers: EventObservationLayer[];
  focusObjectIds: string[];
  scale: EventObservationScale;
};

export type LegacyEventWorkspaceView = "spine" | "line" | "graph" | "timeline" | "perspective";

export const DEFAULT_EVENT_OBSERVATION_STATE: EventObservationState = {
  version: EVENT_OBSERVATION_STATE_VERSION,
  layout: "structure",
  lens: "none",
  layers: ["source-evidence"],
  focusObjectIds: [],
  scale: "unit"
};

export type EventObservationCombinationSupport = { supported: true } | { supported: false; reason: string };

export function eventObservationCombinationSupport(layout: EventObservationLayout, lens: EventObservationLens): EventObservationCombinationSupport {
  if (lens === "none") return { supported: true };
  if (lens === "participation") return layout === "narrative" || layout === "world-time"
    ? { supported: true }
    : { supported: false, reason: "参与镜头本轮只支持叙事顺序与世界时间坐标。" };
  if (lens === "character-perspective") return layout === "narrative"
    ? { supported: true }
    : { supported: false, reason: "角色视角当前只支持叙事顺序坐标。" };
  return { supported: false, reason: "关系演变需要版本化关系状态序列，本轮尚未开放。" };
}

export function normalizeEventObservationState(value: unknown, objects: readonly PerspectiveObjectRef[] = []): EventObservationState {
  const record = isRecord(value) ? value : {};
  let layout = isLayout(record.layout) ? record.layout : DEFAULT_EVENT_OBSERVATION_STATE.layout;
  let lens = isLens(record.lens) ? record.lens : DEFAULT_EVENT_OBSERVATION_STATE.lens;
  const scale = isScale(record.scale) ? record.scale : DEFAULT_EVENT_OBSERVATION_STATE.scale;
  const layers = unique((Array.isArray(record.layers) ? record.layers : DEFAULT_EVENT_OBSERVATION_STATE.layers).filter(isLayer));
  const validObjects = new Map(objects.filter((object) => object.formal === true).map((object) => [object.id, object]));
  let focusObjectIds = unique((Array.isArray(record.focusObjectIds) ? record.focusObjectIds : []).filter((id): id is string => typeof id === "string" && validObjects.has(id))).slice(0, EVENT_OBSERVATION_MAX_FOCUS);

  if (lens === "relationship-evolution") lens = "none";
  if (lens === "participation" && layout !== "narrative" && layout !== "world-time") layout = "narrative";
  if (lens === "character-perspective") {
    layout = "narrative";
    focusObjectIds = focusObjectIds.filter((id) => validObjects.get(id)?.type === "character");
  }
  return {
    version: EVENT_OBSERVATION_STATE_VERSION,
    layout,
    lens,
    layers,
    focusObjectIds,
    scale
  };
}

export function eventObservationStateFromLegacyView(view: string | null | undefined, objects: readonly PerspectiveObjectRef[] = []): EventObservationState {
  const partial: Partial<EventObservationState> = view === "line"
    ? { layout: "narrative", lens: "none" }
    : view === "graph"
      ? { layout: "relation-network", lens: "none" }
      : view === "timeline"
        ? { layout: "world-time", lens: "none" }
        : view === "perspective"
          ? { layout: "narrative", lens: "character-perspective" }
          : { layout: "structure", lens: "none" };
  return normalizeEventObservationState({ ...DEFAULT_EVENT_OBSERVATION_STATE, ...partial }, objects);
}

export function eventObservationLegacyView(state: EventObservationState): LegacyEventWorkspaceView {
  if (state.lens === "character-perspective") return "perspective";
  if (state.layout === "narrative") return "line";
  if (state.layout === "world-time") return "timeline";
  if (state.layout === "relation-network") return "graph";
  return "spine";
}

export function parseEventObservationState(serialized: string | null | undefined, legacyView: string | null | undefined, objects: readonly PerspectiveObjectRef[] = []): EventObservationState {
  if (serialized) {
    try {
      return normalizeEventObservationState(JSON.parse(serialized), objects);
    } catch {
      // Invalid browser view state must never block the Event workspace.
    }
  }
  return eventObservationStateFromLegacyView(legacyView, objects);
}

export function serializeEventObservationState(state: EventObservationState): string {
  return JSON.stringify({
    version: EVENT_OBSERVATION_STATE_VERSION,
    layout: state.layout,
    lens: state.lens,
    layers: state.layers,
    focusObjectIds: state.focusObjectIds,
    scale: state.scale
  });
}

export type ParticipationState = "direct" | "witnessed" | "explicit-absence" | "unknown";
export type ParticipationEvent = { id: string; title: string; tags: readonly string[]; status?: string | null; revisionToken?: string | null };
export type ParticipationCell = {
  eventId: string;
  objectId: string;
  state: ParticipationState;
  conflict: boolean;
  evidenceRefs: string[];
};
export type ParticipationColumn = {
  event: ParticipationEvent;
  narrativeIndex: number;
  unitLabel: string;
  time: EventNarrativeTime;
  temporalGroup: "ordered" | "described" | "unknown";
  cells: ParticipationCell[];
};
export type ParticipationProjection = {
  layout: "narrative" | "world-time";
  objects: PerspectiveObjectRef[];
  columns: ParticipationColumn[];
};

/** Pure read projection. It cannot turn visual absence or missing tags into a story fact. */
export function buildEventParticipationProjection(input: {
  events: readonly ParticipationEvent[];
  objects: readonly PerspectiveObjectRef[];
  focusObjectIds: readonly string[];
  layout: "narrative" | "world-time";
}): ParticipationProjection {
  const formalById = new Map(input.objects.filter((object) => object.formal === true).map((object) => [object.id, object]));
  const objects = unique(input.focusObjectIds).flatMap((id) => formalById.get(id) ?? []).slice(0, EVENT_OBSERVATION_MAX_FOCUS);
  const columns = input.events.map((event, narrativeIndex): ParticipationColumn & { temporalOrder: number | null } => {
    const semantic = buildEventSemanticNode({ id: event.id, title: event.title, tags: event.tags, status: event.status, revision: event.revisionToken });
    const temporalOrder = strictTemporalOrder(semantic.time);
    const temporalGroup = semantic.time.kind === "unknown" ? "unknown" : temporalOrder === null ? "described" : "ordered";
    return {
      event,
      narrativeIndex,
      unitLabel: semantic.storyUnit.label,
      time: semantic.time,
      temporalGroup,
      temporalOrder,
      cells: objects.map((object) => participationCell(event, object))
    };
  });
  if (input.layout === "world-time") {
    const rank = { ordered: 0, described: 1, unknown: 2 } as const;
    columns.sort((left, right) => rank[left.temporalGroup] - rank[right.temporalGroup]
      || (left.temporalOrder ?? 0) - (right.temporalOrder ?? 0)
      || left.narrativeIndex - right.narrativeIndex);
  }
  return { layout: input.layout, objects, columns: columns.map(({ temporalOrder: _temporalOrder, ...column }) => column) };
}

function participationCell(event: ParticipationEvent, object: PerspectiveObjectRef): ParticipationCell {
  const direct = taggedValues(event.tags, DIRECT_PREFIXES[object.type]).some((value) => sameLabel(value, object.label));
  const witnessed = object.type === "character" && taggedValues(event.tags, ["目击", "Witness"]).some((value) => sameLabel(value, object.label));
  const absent = taggedValues(event.tags, ["缺席", "明确缺席", "Absent"]).some((value) => sameLabel(value, object.label));
  const state: ParticipationState = direct ? "direct" : witnessed ? "witnessed" : absent ? "explicit-absence" : "unknown";
  return {
    eventId: event.id,
    objectId: object.id,
    state,
    conflict: absent && (direct || witnessed),
    evidenceRefs: state === "unknown" ? [] : [`event:${event.id}`, `owner:${object.ownerId ?? object.id}@${object.version ?? "unknown"}`]
  };
}

function strictTemporalOrder(time: EventNarrativeTime): number | null {
  if (time.kind !== "exact" && time.kind !== "range") return null;
  // The shared semantic parser conservatively classifies ISO dates containing
  // hyphens as ranges. The untouched author label is therefore the safest
  // value for recognizing a strict calendar date in this read projection.
  const value = time.label;
  const match = /^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?$/u.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] ?? 1);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return null;
  return year * 10_000 + month * 100 + day;
}

const DIRECT_PREFIXES: Record<PerspectiveObjectRef["type"], readonly string[]> = {
  character: ["Character", "Actor", "角色", "人物"],
  location: ["Location", "地点", "场所"],
  item: ["Item", "Object", "物品", "道具"]
};

function taggedValues(tags: readonly string[], prefixes: readonly string[]): string[] {
  return unique(tags.flatMap((tag) => prefixes.flatMap((prefix) => {
    const match = tag.match(new RegExp(`^${escapeRegExp(prefix)}[：:]\\s*(.+)$`, "iu"));
    return match?.[1] ? match[1].split(/[,，、;；|]/u).map((item) => item.trim()).filter(Boolean) : [];
  })));
}
function sameLabel(left: string, right: string): boolean { return normalizeLabel(left) === normalizeLabel(right); }
function normalizeLabel(value: string): string { return value.normalize("NFKC").toLocaleLowerCase("zh-CN"); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isLayout(value: unknown): value is EventObservationLayout { return value === "structure" || value === "narrative" || value === "world-time" || value === "relation-network"; }
function isLens(value: unknown): value is EventObservationLens { return value === "none" || value === "participation" || value === "character-perspective" || value === "relationship-evolution"; }
function isLayer(value: unknown): value is EventObservationLayer { return value === "causal" || value === "temporal-constraints" || value === "candidate-conflict" || value === "source-evidence"; }
function isScale(value: unknown): value is EventObservationScale { return value === "story" || value === "unit" || value === "event"; }
function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }
