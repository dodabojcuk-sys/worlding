import dagre from "@dagrejs/dagre";

import type {
  GraphDocument,
  TimelineDocument,
  VisualDocument,
  WorldObject,
  WorldObjectSummary
} from "../../lib/localTransport";
import {
  eventLineEventMetadata,
  eventLineSemanticNode,
  type EventLineEventMetadata
} from "../eventLineCommittedEvents.ts";
import type {
  StoryObservationClueSource,
  StoryObservationProjectionMode,
  StoryObservationProposalPatch,
  StoryObservationSelectionContext
} from "../../../../../src/storyContracts/storyObservationProposalPatch.ts";
import type { EventSemanticStatus } from "../../../../../src/storyContracts/eventSemanticHierarchy.ts";

export type StoryObservationNodeKind = "fact" | "decision" | "state" | "evidence" | "hub" | "cluster" | "candidate";
export type StoryObservationRelationKind = "narrative" | StoryObservationClueSource;
export type StoryObservationRelationSource = "timeline_dependency" | "visual_graph" | "world_object_link" | "projection_sequence" | "proposal_patch";
export type StoryObservationRelationStatus = "confirmed" | "inferred" | "candidate";

export type StoryObservationWorldTime = {
  label: string;
  start: number | null;
  end: number | null;
  precision: "exact" | "approximate" | "range" | "unknown";
  sourceKey: string | null;
};

export type StoryObservationNode = {
  id: string;
  eventId: string | null;
  title: string;
  summary: string;
  kind: StoryObservationNodeKind;
  status: "confirmed" | "candidate";
  semanticStatus?: EventSemanticStatus;
  metadata: EventLineEventMetadata;
  tags: string[];
  revisionToken: string | null;
  time: StoryObservationWorldTime;
  sourceLabel: string;
  proposalOperationId: string | null;
};

export type StoryObservationRelation = {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: StoryObservationRelationKind;
  sourceKind: StoryObservationRelationSource;
  status: StoryObservationRelationStatus;
};

export type StoryObservationModel = {
  nodes: StoryObservationNode[];
  relations: StoryObservationRelation[];
  canonVersion: string;
  timelineDocumentId: string | null;
  sourceCounts: Record<StoryObservationClueSource, number>;
};

export type StoryObservationLayoutNode = StoryObservationNode & {
  position: { x: number; y: number };
  width: number;
  laneLabel: string;
};

const CLUE_SOURCES: StoryObservationClueSource[] = ["causality", "character", "object", "location", "foreshadow", "custom"];
const NODE_WIDTH = 264;
const NODE_HEIGHT = 126;
const OVERVIEW_NODE_WIDTH = 142;
const OVERVIEW_NODE_HEIGHT = 72;
export type StoryObservationCanvasScale = "overview" | "focus";

export function buildStoryObservationModel(input: {
  events: readonly WorldObjectSummary[];
  detailsById: Readonly<Record<string, WorldObject>>;
  visualDocuments: readonly VisualDocument[];
  proposalPatch: StoryObservationProposalPatch | null;
}): StoryObservationModel {
  const eventIds = new Set(input.events.map((event) => event.id));
  const timeline = selectTimeline(input.visualDocuments);
  const graphDocuments = input.visualDocuments.filter((document): document is GraphDocument => document.type === "graph");
  const nodes = input.events.map((event) => projectConfirmedNode(event, input.detailsById[event.id] ?? null));
  const relations = uniqueRelations([
    ...projectTimelineRelations(timeline, eventIds),
    ...projectGraphRelations(graphDocuments, eventIds),
    ...projectObjectRelations(input.detailsById, eventIds),
    ...projectNarrativeSequence(input.events, timeline),
    ...projectProposalRelations(input.proposalPatch, eventIds)
  ]);
  const proposalNodes = input.proposalPatch ? projectProposalNodes(input.proposalPatch, nodes) : [];
  const sourceCounts = Object.fromEntries(CLUE_SOURCES.map((source) => [source, relations.filter((relation) => relation.kind === source).length])) as Record<StoryObservationClueSource, number>;
  return {
    nodes: [...nodes, ...proposalNodes],
    relations,
    canonVersion: canonVersion(input.events),
    timelineDocumentId: timeline?.id ?? null,
    sourceCounts
  };
}

export function layoutStoryObservationNodes(
  model: StoryObservationModel,
  mode: StoryObservationProjectionMode,
  scale: StoryObservationCanvasScale = "focus"
): StoryObservationLayoutNode[] {
  const dimensions = scale === "overview"
    ? { width: OVERVIEW_NODE_WIDTH, height: OVERVIEW_NODE_HEIGHT }
    : { width: NODE_WIDTH, height: NODE_HEIGHT };
  return mode === "timeline" ? layoutTimeline(model.nodes, dimensions) : layoutEventLine(model.nodes, model.relations, dimensions);
}

export function visibleStoryObservationRelations(
  relations: readonly StoryObservationRelation[],
  clueSources: ReadonlySet<StoryObservationClueSource>
): StoryObservationRelation[] {
  return relations.filter((relation) => relation.kind === "narrative" || clueSources.has(relation.kind));
}

export function storyObservationHiddenDescendants(
  rootIds: ReadonlySet<string>,
  relations: readonly StoryObservationRelation[]
): Set<string> {
  const outgoing = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.status === "candidate") continue;
    outgoing.set(relation.source, [...(outgoing.get(relation.source) ?? []), relation.target]);
  }
  const hidden = new Set<string>();
  const queue = [...rootIds];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    for (const target of outgoing.get(current) ?? []) {
      if (rootIds.has(target) || hidden.has(target)) continue;
      hidden.add(target);
      queue.push(target);
    }
  }
  return hidden;
}

export function createStoryObservationSelectionContext(input: {
  projection: StoryObservationProjectionMode;
  nodeIds: readonly string[];
  relationIds: readonly string[];
  timeWindow: StoryObservationSelectionContext["timeWindow"];
  clueSources: readonly StoryObservationClueSource[];
  observer: string;
}): StoryObservationSelectionContext {
  return {
    projection: input.projection,
    nodeIds: uniqueSorted(input.nodeIds),
    relationIds: uniqueSorted(input.relationIds),
    timeWindow: input.timeWindow,
    clueSources: [...new Set(input.clueSources)].sort(),
    observer: input.observer.trim() || "author-omniscient"
  };
}

export function timeWindowFromPercents(left: number, right: number): { startLabel: string; endLabel: string } {
  const start = Math.min(left, right);
  const end = Math.max(left, right);
  return { startLabel: timeLabelFromPercent(start), endLabel: timeLabelFromPercent(end) };
}

export function storyObservationTimeFromEvent(detail: WorldObject | null): StoryObservationWorldTime {
  if (!detail) return unknownTime();
  const values = normalizedPropertyMap(detail.properties, detail.tags);
  const range = firstValue(values, ["world_time_range", "time_range", "世界时间范围", "时间范围"]);
  if (range) {
    const [left, right] = range.split(/\s*(?:~|–|—|至)\s*/u, 2);
    const start = parseWorldTime(left);
    const end = parseWorldTime(right);
    if (start !== null && end !== null && end >= start) {
      return { label: range, start, end, precision: "range", sourceKey: "world_time_range" };
    }
  }
  const rawStart = firstValue(values, ["world_time", "worldtime", "start_time", "time", "date", "世界时间", "发生时间"]);
  const start = parseWorldTime(rawStart);
  if (start === null) return unknownTime();
  const rawEnd = firstValue(values, ["end_time", "world_time_end", "结束时间"]);
  const parsedEnd = parseWorldTime(rawEnd);
  const duration = parsePositiveNumber(firstValue(values, ["duration_minutes", "duration", "持续分钟", "持续时间"]));
  const end = parsedEnd !== null && parsedEnd >= start ? parsedEnd : duration !== null ? start + duration : null;
  const precisionValue = firstValue(values, ["time_precision", "时间精度"])?.toLocaleLowerCase("zh-CN") ?? "";
  const approximate = /approx|约|大概|估计/u.test(precisionValue) || /[~约]/u.test(rawStart ?? "");
  return {
    label: end !== null ? `${rawStart} – ${rawEnd || formatDurationEnd(end)}` : String(rawStart),
    start,
    end,
    precision: end !== null ? "range" : approximate ? "approximate" : "exact",
    sourceKey: "world_time"
  };
}

function projectConfirmedNode(event: WorldObjectSummary, detail: WorldObject | null): StoryObservationNode {
  const semantic = detail ? eventLineSemanticNode(detail) : eventLineSemanticNode(event);
  return {
    id: event.id,
    eventId: event.id,
    title: authorFacingEventTitle(event.title),
    summary: authorFacingEventSummary(event, detail),
    kind: inferNodeKind(event),
    status: "confirmed",
    semanticStatus: semantic.status,
    metadata: eventLineEventMetadata(event),
    tags: [...event.tags],
    revisionToken: event.revisionToken,
    time: storyObservationTimeFromEvent(detail),
    sourceLabel: semantic.status === "confirmed" ? "作者确认 · 正式事件" : semantic.status === "prediction" ? "预测投影 · 待审" : semantic.status === "candidate" ? "候选投影 · 待审" : "状态未知 · 待核对",
    proposalOperationId: null
  };
}

/** Canon event bodies contain a protected AuthorControl receipt.  The canvas
 * should expose the event in author language, not turn receipt Markdown and
 * internal evidence identifiers into the node's primary reading surface. */
function authorFacingEventTitle(title: string): string {
  return title.replace(/\s*·\s*立即揭示$/u, "").trim() || title;
}

function authorFacingEventSummary(event: WorldObjectSummary, detail: WorldObject | null): string {
  const fixtureSummary = event.tags.find((tag) => tag.startsWith("观测摘要: "))?.slice("观测摘要: ".length).trim();
  if (fixtureSummary) return fixtureSummary;
  if (!detail) return "已经作者确认的事件；详情尚未加载。";
  const choice = detail.body.match(/##\s*作者选择\s*\n+([^\n#-][^\n]*)/u)?.[1]?.trim();
  if (choice) return `作者已确认：${choice}`;
  const prose = detail.body
    .split(/\n+/u)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && !line.startsWith("-") && !line.startsWith("事件记录") && !line.startsWith("变更来源"));
  return prose || "已经作者确认的事件；详情可追溯到既有审核链。";
}

function projectProposalNodes(
  patch: StoryObservationProposalPatch,
  confirmedNodes: readonly StoryObservationNode[]
): StoryObservationNode[] {
  const fallbackMetadata = confirmedNodes.find((node) => patch.selection.nodeIds.includes(node.id))?.metadata ?? {
    unitLabel: null,
    setPointLabel: null,
    sceneLabel: null,
    storyLineLabel: null,
    storyLineKind: "main" as const,
    characterLabels: [],
    locationLabels: [],
    narrativeTimeLabel: "未知时间",
    narrativeTimeKind: "unknown" as const,
    openQuestions: [],
    status: "confirmed" as const
  };
  return patch.operations
    .filter((operation) => operation.kind === "add-event")
    .map((operation) => ({
      id: `candidate:${operation.operationId}`,
      eventId: null,
      title: operation.title,
      summary: operation.after,
      kind: "candidate" as const,
      status: "candidate" as const,
      metadata: fallbackMetadata,
      tags: ["AI Candidate", "未经作者确认"],
      revisionToken: null,
      time: operation.timeEstimate ? {
        label: operation.timeEstimate.label,
        start: parseWorldTime(operation.timeEstimate.label),
        end: null,
        precision: operation.timeEstimate.precision,
        sourceKey: "proposal_patch"
      } : unknownTime(),
      sourceLabel: "Proposal Patch · 待评审",
      proposalOperationId: operation.operationId
    }));
}

function projectTimelineRelations(timeline: TimelineDocument | null, eventIds: ReadonlySet<string>): StoryObservationRelation[] {
  if (!timeline) return [];
  return timeline.content.dependencies.flatMap((dependency) => eventIds.has(dependency.fromEventId) && eventIds.has(dependency.toEventId) ? [{
    id: `timeline:${timeline.id}:${dependency.id}`,
    source: dependency.fromEventId,
    target: dependency.toEventId,
    label: "需要前置",
    kind: "causality" as const,
    sourceKind: "timeline_dependency" as const,
    status: "confirmed" as const
  }] : []);
}

function projectGraphRelations(graphs: readonly GraphDocument[], eventIds: ReadonlySet<string>): StoryObservationRelation[] {
  return graphs.flatMap((graph) => {
    const objectIdByNodeId = new Map(graph.content.nodes.map((node) => [node.id, node.objectId]));
    const confirmed = graph.content.edges.flatMap((edge) => {
      const source = objectIdByNodeId.get(edge.source);
      const target = objectIdByNodeId.get(edge.target);
      if (!source || !target || !eventIds.has(source) || !eventIds.has(target)) return [];
      return [{
        id: `graph:${graph.id}:${edge.id}`,
        source,
        target,
        label: edge.relation || "自定义关系",
        kind: relationKindFromLabel(edge.relation),
        sourceKind: "visual_graph" as const,
        status: "inferred" as const
      }];
    });
    const proposals = graph.content.proposals.flatMap((edge) => {
      const source = objectIdByNodeId.get(edge.source);
      const target = objectIdByNodeId.get(edge.target);
      if (!source || !target || !eventIds.has(source) || !eventIds.has(target)) return [];
      return [{
        id: `graph-proposal:${graph.id}:${edge.id}`,
        source,
        target,
        label: edge.relation || "候选关系",
        kind: relationKindFromLabel(edge.relation),
        sourceKind: "visual_graph" as const,
        status: "candidate" as const
      }];
    });
    return [...confirmed, ...proposals];
  });
}

function projectObjectRelations(
  detailsById: Readonly<Record<string, WorldObject>>,
  eventIds: ReadonlySet<string>
): StoryObservationRelation[] {
  return Object.values(detailsById).flatMap((detail) => detail.linkedObjects.flatMap((target) => {
    if (!eventIds.has(detail.id) || !eventIds.has(target.id)) return [];
    return [{
      id: `object-link:${detail.id}:${target.id}`,
      source: detail.id,
      target: target.id,
      label: "已链接事件",
      kind: "custom" as const,
      sourceKind: "world_object_link" as const,
      status: "confirmed" as const
    }];
  }));
}

function projectNarrativeSequence(
  events: readonly WorldObjectSummary[],
  timeline: TimelineDocument | null
): StoryObservationRelation[] {
  const eventOrder = timeline
    ? timeline.content.entries
      .filter((entry) => events.some((event) => event.id === entry.eventId))
      .sort((left, right) => left.order - right.order)
      .map((entry) => entry.eventId)
    : events.map((event) => event.id);
  const deduplicated = [...new Set(eventOrder)];
  return deduplicated.slice(0, -1).map((eventId, index) => ({
    id: `projection-sequence:${eventId}:${deduplicated[index + 1]}`,
    source: eventId,
    target: deduplicated[index + 1],
    label: "叙事推进",
    kind: "narrative" as const,
    sourceKind: "projection_sequence" as const,
    status: "inferred" as const
  }));
}

function projectProposalRelations(
  patch: StoryObservationProposalPatch | null,
  eventIds: ReadonlySet<string>
): StoryObservationRelation[] {
  if (!patch) return [];
  return patch.operations.flatMap((operation, index) => {
    const source = operation.affectedNodeIds.find((id) => eventIds.has(id)) ?? patch.selection.nodeIds.find((id) => eventIds.has(id));
    if (!source) return [];
    const proposalNodeId = operation.kind === "add-event" ? `candidate:${operation.operationId}` : null;
    const target = proposalNodeId ?? operation.affectedNodeIds.find((id) => id !== source && eventIds.has(id));
    if (!target) return [];
    return [{
      id: `proposal:${patch.patchId}:${index}`,
      source,
      target,
      label: operation.kind === "change-time" ? "候选时间调整" : "AI 候选",
      kind: operation.kind === "add-relation" ? "causality" as const : "custom" as const,
      sourceKind: "proposal_patch" as const,
      status: "candidate" as const
    }];
  });
}

function layoutEventLine(
  nodes: readonly StoryObservationNode[],
  relations: readonly StoryObservationRelation[],
  dimensions: { width: number; height: number }
): StoryObservationLayoutNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  const compact = dimensions.width < NODE_WIDTH;
  graph.setGraph({ rankdir: "LR", ranksep: compact ? 44 : 128, nodesep: compact ? 34 : 66, marginx: compact ? 38 : 96, marginy: compact ? 50 : 88 });
  nodes.forEach((node) => graph.setNode(node.id, { width: dimensions.width, height: dimensions.height }));
  relations.filter((relation) => nodes.some((node) => node.id === relation.source) && nodes.some((node) => node.id === relation.target))
    .forEach((relation) => graph.setEdge(relation.source, relation.target));
  dagre.layout(graph);
  return nodes.map((node, index) => {
    const value = graph.node(node.id);
    return {
      ...node,
      position: value ? { x: value.x - dimensions.width / 2, y: value.y - dimensions.height / 2 } : { x: index * (dimensions.width + 48) + 64, y: 112 },
      width: dimensions.width,
      laneLabel: node.metadata.unitLabel || node.metadata.sceneLabel || "故事推进"
    };
  });
}

function layoutTimeline(nodes: readonly StoryObservationNode[], dimensions: { width: number; height: number }): StoryObservationLayoutNode[] {
  const compact = dimensions.width < NODE_WIDTH;
  const knownTimes = nodes.flatMap((node) => node.time.start === null ? [] : [node.time.start]);
  const timelinePivot = findClockTimelinePivot(knownTimes);
  const normalizedTime = (value: number) => normalizeClockTimelineMinute(value, timelinePivot);
  const normalizedKnownTimes = knownTimes.map(normalizedTime);
  const minimum = normalizedKnownTimes.length > 0 ? Math.min(...normalizedKnownTimes) : 0;
  const maximum = normalizedKnownTimes.length > 0 ? Math.max(...normalizedKnownTimes) : minimum;
  const span = Math.max(maximum - minimum, 60);
  const sameTimeCount = new Map<number, number>();
  let undeterminedIndex = 0;
  return nodes.map((node, index) => {
    const laneLabel = node.metadata.characterLabels[0]
      ? `角色 · ${node.metadata.characterLabels[0]}`
      : node.metadata.locationLabels[0]
        ? `地点 · ${node.metadata.locationLabels[0]}`
        : node.metadata.sceneLabel || "世界事件";
    if (node.time.start === null) {
      const y = (compact ? 220 : 300) + undeterminedIndex * (compact ? 104 : 154);
      undeterminedIndex += 1;
      return { ...node, position: { x: (compact ? 156 : 220) + (knownTimes.length > 0 ? (compact ? 940 : 1_380) : 0), y }, width: dimensions.width, laneLabel: "时间未定" };
    }
    const displayStart = normalizedTime(node.time.start);
    const collisionIndex = sameTimeCount.get(displayStart) ?? 0;
    sameTimeCount.set(displayStart, collisionIndex + 1);
    const x = (compact ? 118 : 180) + ((displayStart - minimum) / span) * (compact ? 980 : 1_420);
    const y = (compact ? 96 : 132) + ((index + collisionIndex) % 5) * (compact ? 104 : 154);
    const durationWidth = node.time.end !== null
      ? Math.max(dimensions.width, ((normalizeClockTimelineEnd(node.time.end, displayStart, timelinePivot) - displayStart) / span) * (compact ? 980 : 1_420))
      : dimensions.width;
    return { ...node, position: { x, y }, width: Math.min(durationWidth, compact ? 350 : 560), laneLabel };
  });
}

/**
 * Clock-only world times have no date. Pick the beginning of the smallest
 * circular arc containing all events so a post-midnight event follows the
 * preceding evening instead of jumping to the far left of the projection.
 */
function findClockTimelinePivot(values: readonly number[]): number | null {
  if (values.length < 2 || values.some((value) => value < 0 || value >= 1_440)) return null;
  const sorted = [...new Set(values)].sort((left, right) => left - right);
  if (sorted.length < 2) return sorted[0] ?? null;
  let largestGap = -1;
  let pivot = sorted[0];
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = index === sorted.length - 1 ? sorted[0] + 1_440 : sorted[index + 1];
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      pivot = next % 1_440;
    }
  }
  return pivot;
}

function normalizeClockTimelineMinute(value: number, pivot: number | null): number {
  if (pivot === null || value < 0 || value >= 1_440) return value;
  return value < pivot ? value + 1_440 : value;
}

function normalizeClockTimelineEnd(value: number, normalizedStart: number, pivot: number | null): number {
  let normalized = normalizeClockTimelineMinute(value, pivot);
  while (normalized < normalizedStart) normalized += 1_440;
  return normalized;
}

function selectTimeline(documents: readonly VisualDocument[]): TimelineDocument | null {
  return documents.find((document): document is TimelineDocument => document.type === "timeline") ?? null;
}

function inferNodeKind(event: WorldObjectSummary): StoryObservationNodeKind {
  const value = `${event.title} ${event.tags.join(" ")}`;
  if (/(decision|choice|决定|选择|抉择)/iu.test(value)) return "decision";
  if (/(state|状态|变化|转变)/iu.test(value)) return "state";
  if (/(evidence|clue|证据|线索|观测)/iu.test(value)) return "evidence";
  if (/(hub|merge|汇合|交汇)/iu.test(value)) return "hub";
  if (/(unit|cluster|单元|事件簇)/iu.test(value)) return "cluster";
  return "fact";
}

function relationKindFromLabel(label: string): StoryObservationRelationKind {
  if (/(cause|because|requires|因果|导致|前置)/iu.test(label)) return "causality";
  if (/(character|actor|know|believe|角色|人物|认知|知道)/iu.test(label)) return "character";
  if (/(object|item|carry|物品|道具|流转)/iu.test(label)) return "object";
  if (/(location|place|地点|场所|位置)/iu.test(label)) return "location";
  if (/(foreshadow|payoff|伏笔|兑现|回收)/iu.test(label)) return "foreshadow";
  return "custom";
}

function normalizedPropertyMap(properties: WorldObject["properties"], tags: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (const [key, value] of Object.entries(properties)) {
    const normalized = key.trim().toLocaleLowerCase("zh-CN").replace(/[\s-]+/gu, "_");
    const text = Array.isArray(value) ? value.join(" – ") : value;
    if (text.trim()) values.set(normalized, text.trim());
  }
  for (const tag of tags) {
    const match = tag.match(/^([^:：]+)[:：]\s*(.+)$/u);
    if (!match) continue;
    const key = match[1].trim().toLocaleLowerCase("zh-CN").replace(/[\s-]+/gu, "_");
    if (!values.has(key)) values.set(key, match[2].trim());
  }
  return values;
}

function firstValue(values: ReadonlyMap<string, string>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = values.get(key.toLocaleLowerCase("zh-CN").replace(/[\s-]+/gu, "_"));
    if (value) return value;
  }
  return null;
}

function parseWorldTime(value: string | null | undefined): number | null {
  const text = String(value || "").trim().replace(/^[~约]\s*/u, "");
  if (!text) return null;
  const clock = text.match(/^(?:(\d{4})-(\d{1,2})-(\d{1,2})[ T])?(\d{1,2}):(\d{2})$/u);
  if (clock) {
    if (clock[1]) {
      const timestamp = Date.UTC(Number(clock[1]), Number(clock[2]) - 1, Number(clock[3]), Number(clock[4]), Number(clock[5]));
      return Number.isFinite(timestamp) ? timestamp / 60_000 : null;
    }
    const hour = Number(clock[4]);
    const minute = Number(clock[5]);
    return hour <= 23 && minute <= 59 ? hour * 60 + minute : null;
  }
  const timestamp = Date.parse(text);
  return Number.isFinite(timestamp) ? timestamp / 60_000 : null;
}

function parsePositiveNumber(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(/\d+(?:\.\d+)?/u);
  const number = match ? Number(match[0]) : Number.NaN;
  return Number.isFinite(number) && number > 0 ? number : null;
}

function formatDurationEnd(minutes: number): string {
  const value = ((Math.round(minutes) % 1_440) + 1_440) % 1_440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function unknownTime(): StoryObservationWorldTime {
  return { label: "时间未定", start: null, end: null, precision: "unknown", sourceKey: null };
}

function uniqueRelations(relations: readonly StoryObservationRelation[]): StoryObservationRelation[] {
  const seen = new Set<string>();
  return relations.filter((relation) => {
    const key = `${relation.source}\u0000${relation.target}\u0000${relation.kind}\u0000${relation.status}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonVersion(events: readonly WorldObjectSummary[]): string {
  const value = events.map((event) => `${event.id}:${event.revisionToken}`).sort().join("|");
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  return `canon-projection-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function timeLabelFromPercent(percent: number): string {
  const startMinutes = 18 * 60;
  const totalMinutes = 8 * 60;
  const value = (startMinutes + Math.round(Math.max(0, Math.min(1, percent)) * totalMinutes / 15) * 15) % 1_440;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
