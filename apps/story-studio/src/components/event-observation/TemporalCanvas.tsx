import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { AlertTriangle, Check, Clock3, Eye, Focus, GripHorizontal, LocateFixed, Minus, Network } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";

import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { buildFocusTrajectoryOverlay, type FocusTrajectoryRenderState } from "../../../../../src/storyContracts/eventObservation.ts";
import type { PerspectiveObjectRef } from "../../../../../src/storyContracts/eventPerspectiveProjection.ts";
import type { TemporalPlacement, TemporalProjectionRun } from "../../../../../src/storyContracts/temporalProjection.ts";
import { TEMPORAL_COORDINATE_TRACKS } from "../../../../../src/storyContracts/temporalCoordinateTracks.ts";
import { resolveTemporalTrackProjection } from "../../../../../src/storyContracts/temporalCompositionCache.ts";
import type { NarrativeArrangementRead } from "../../lib/localTransport";
import { eventLineEventMetadata, eventLineSemanticNode, type EventLineEventSummary } from "../eventLineCommittedEvents";

type TemporalEventState = "anchored" | "inferred" | "range" | "relative" | "fuzzy" | "unplaced" | "conflict";
type TemporalEventNodeData = {
  kind: "event";
  eventId: string;
  title: string;
  timeLabel: string;
  sourceLabel: string;
  state: TemporalEventState;
  detail: "compact" | "standard" | "expanded";
  trackId: string;
  trackLabel: string;
  trackOrigin: "author-formal" | "ai-suggested" | "ai-suggested-stale";
  intervalWidth: number;
  anchorLabel: string | null;
  placementCount: number;
  concurrent: boolean;
};
type TemporalFocusNodeData = {
  kind: "focus";
  state: FocusTrajectoryRenderState;
  label: string;
  conflict: boolean;
};
type TemporalCanvasNodeData = TemporalEventNodeData | TemporalFocusNodeData;

export type TemporalCanvasTrack = {
  id: string;
  label: string;
  coordinateY: number;
  origin: TemporalEventNodeData["trackOrigin"];
};

const nodeTypes = { temporalEvent: TemporalEventNode, temporalFocus: TemporalFocusNode };

export function TemporalCanvas(props: {
  events: readonly EventLineEventSummary[];
  relations: readonly RelationReadProjectionR0[];
  selectedEventId: string | null;
  onSelectEvent(eventId: string): void;
  onReturnGraph(): void;
  temporalRun: TemporalProjectionRun | null;
  temporalState: "idle" | "loading" | "ready" | "stale" | "missing" | "failed" | "provider-unavailable";
  temporalMessage: string | null;
  focusObjects?: readonly PerspectiveObjectRef[];
  narratives?: readonly NarrativeArrangementRead[];
  detailsOpen?: boolean;
  taskSurface?: boolean;
  viewport?: { x: number; y: number; zoom: number } | null;
  onViewportChange?(viewport: { x: number; y: number; zoom: number }): void;
}) {
  const [flow, setFlow] = useState<ReactFlowInstance<Node<TemporalCanvasNodeData>, Edge> | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const detail = viewport.zoom < .76 ? "compact" : viewport.zoom > 1.12 ? "expanded" : "standard";
  const placementCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const read of props.narratives ?? []) for (const placement of read.projection.placed) counts.set(placement.eventId, (counts.get(placement.eventId) ?? 0) + 1);
    return counts;
  }, [props.narratives]);
  const projection = useMemo(() => buildTemporalCanvasProjection(props.events, props.relations, props.temporalRun, detail, props.selectedEventId, props.focusObjects ?? [], placementCounts), [detail, placementCounts, props.events, props.focusObjects, props.relations, props.selectedEventId, props.temporalRun]);
  const selectedNode = projection.nodes.find((node) => node.data.kind === "event" && node.data.eventId === props.selectedEventId) ?? null;
  const focusCurrent = useCallback((eventId = props.selectedEventId, duration = 280) => {
    if (!flow || !eventId) return;
    const target = projection.nodes.find((node) => node.data.kind === "event" && node.data.eventId === eventId);
    if (!target) return;
    void flow.setCenter(target.position.x + 112, target.position.y + 64, { zoom: Math.max(.84, flow.getZoom()), duration });
  }, [flow, projection.nodes, props.selectedEventId]);
  const focusOverview = useCallback(() => {
    if (!flow) return;
    const authored = projection.nodes.filter((node) => node.data.kind === "event" && node.data.state !== "unplaced" && node.data.state !== "conflict");
    const visible = authored.length ? authored : projection.nodes.filter((node) => node.data.kind === "event");
    if (!visible.length) return;
    const minimumX = Math.min(...visible.map((node) => node.position.x));
    const minimumY = Math.min(...visible.map((node) => node.position.y));
    void flow.setViewport({ x: 112 - minimumX * .82, y: 78 - minimumY * .82, zoom: .82 }, { duration: 280 });
  }, [flow, projection.nodes]);
  useEffect(() => {
    if (!props.detailsOpen || !props.selectedEventId) return;
    const timer = window.setTimeout(() => focusCurrent(props.selectedEventId, 220), 90);
    return () => window.clearTimeout(timer);
  }, [focusCurrent, props.detailsOpen, props.selectedEventId]);
  useEffect(() => {
    const receive = (event: Event) => focusCurrent((event as CustomEvent<{ eventId?: string }>).detail?.eventId ?? props.selectedEventId);
    window.addEventListener("story-studio-event-line-focus-current", receive);
    return () => window.removeEventListener("story-studio-event-line-focus-current", receive);
  }, [focusCurrent, props.selectedEventId]);
  const selectedScreenPosition = selectedNode ? {
    x: selectedNode.position.x * viewport.zoom + viewport.x + 112 * viewport.zoom,
    y: selectedNode.position.y * viewport.zoom + viewport.y + 64 * viewport.zoom
  } : null;
  const stateLabel = props.temporalState === "ready" ? "时间投影已就绪" : props.temporalState === "stale" ? "正在显示上次时间投影" : props.temporalState === "provider-unavailable" ? "作者时间证据 · 模型未连接" : props.temporalState === "failed" ? "作者时间证据 · 上次分析未完成" : props.temporalState === "loading" ? "读取时间投影" : "作者时间证据";

  return <section className={`temporal-workspace ${props.taskSurface ? "is-task-surface" : ""}`} aria-label="独立时间线工作区" data-testid="formal-temporal-canvas" data-time-line-renderer="TemporalCanvas" data-temporal-projection="independent" data-event-owner="shared-identities" data-view-switch-provider-calls="0" data-view-switch-agent-runs="0" data-temporal-state={props.temporalState}>
    <header className="temporal-commandbar">
      <div><strong><Clock3 />连续世界时间</strong><span>{stateLabel} · {projection.rangeCount} 个范围 · {projection.concurrentCount} 组并发</span></div>
      <nav>{!props.taskSurface ? <button type="button" onClick={() => props.onReturnGraph()}><Network />返回关系图</button> : null}<button type="button" disabled={!props.selectedEventId} onClick={() => focusCurrent()}><LocateFixed />定位所选</button><button type="button" onClick={focusOverview}><Focus />时间总览</button></nav>
    </header>
    <div className={`temporal-canvas-status is-${props.temporalState}`} role="status"><Clock3 /><div><strong>{stateLabel}</strong><span>{props.temporalMessage ?? "横向距离来自时间证据；切换、缩放和平移不会启动分析或产生费用。"}</span></div></div>
    {projection.conflictCount ? <aside className="temporal-conflict-summary" aria-label="时间冲突区"><AlertTriangle /><div><strong>冲突区 · {projection.conflictCount}</strong><span>冲突证据没有被自动选成一个日期。</span></div></aside> : null}
    <div className="temporal-flow" tabIndex={0}>
      <ReactFlow<Node<TemporalCanvasNodeData>, Edge>
        nodes={projection.nodes}
        edges={projection.edges}
        nodeTypes={nodeTypes}
        onInit={(instance) => { setFlow(instance); if (props.viewport) void instance.setViewport(props.viewport, { duration: 0 }); }}
        onMove={(_, next) => { setViewport(next); props.onViewportChange?.(next); }}
        onNodeClick={(_, node) => { if (node.data.kind === "event") props.onSelectEvent(node.data.eventId); }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={.5}
        maxZoom={1.6}
        defaultViewport={props.viewport ?? { x: 72, y: 24, zoom: .82 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="rgba(20, 78, 88, .10)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <TemporalCoordinateOverlay nodes={projection.nodes} tracks={projection.tracks} viewport={viewport} detail={detail} selected={selectedNode} selectedScreenPosition={selectedScreenPosition} unresolvedCount={projection.unresolvedCount} conflictCount={projection.conflictCount} />
    </div>
  </section>;
}

function TemporalEventNode(props: NodeProps<Node<TemporalCanvasNodeData>>) {
  if (props.data.kind !== "event") return null;
  const data = props.data;
  return <article className={`temporal-event-card is-${data.state} is-${data.detail} ${data.concurrent ? "is-concurrent" : ""}`} data-event-id={data.eventId} data-temporal-track={data.trackId} data-track-origin={data.trackOrigin} aria-label={`${data.title}，${data.timeLabel}，${data.trackLabel}，${temporalStateLabel(data.state)}`}>
    {data.state === "range" ? <span className="temporal-range-span" style={{ inlineSize: `${data.intervalWidth}px` }} aria-hidden="true" /> : null}
    <Handle className="temporal-event-port is-input" type="target" position={Position.Left} isConnectable={false} />
    <header><Clock3 aria-hidden="true" /><span>{temporalStateLabel(data.state)}{data.concurrent ? " · 并发轨道" : ""}</span></header>
    <strong>{data.title}</strong>
    <time>{data.timeLabel}</time>
    {data.anchorLabel ? <small>相对锚点 · {data.anchorLabel}</small> : null}
    {data.placementCount > 1 ? <em>{data.placementCount} 个 NarrativePlacement</em> : null}
    {data.detail === "expanded" ? <small>{data.sourceLabel} · {data.trackOrigin === "author-formal" ? "作者正式轨道" : data.trackOrigin === "ai-suggested-stale" ? "AI 建议轨道已过期" : "AI 建议轨道"}</small> : null}
    <Handle className="temporal-event-port is-output" type="source" position={Position.Right} isConnectable={false} />
  </article>;
}

function TemporalFocusNode(props: NodeProps<Node<TemporalCanvasNodeData>>) {
  if (props.data.kind !== "focus") return null;
  return <span className={`temporal-focus-point is-${props.data.state} ${props.data.conflict ? "has-conflict" : ""}`} aria-label={props.data.label}><Handle type="target" position={Position.Left} isConnectable={false} />{props.data.state === "direct" ? <Check /> : props.data.state === "witnessed" ? <Eye /> : props.data.state === "explicit-absence" ? <Minus /> : <GripHorizontal />}<Handle type="source" position={Position.Right} isConnectable={false} /></span>;
}

export function buildTemporalCanvasProjection(events: readonly EventLineEventSummary[], relations: readonly RelationReadProjectionR0[], run: TemporalProjectionRun | null, detail: TemporalEventNodeData["detail"], selectedEventId: string | null, focusObjects: readonly PerspectiveObjectRef[] = [], placementCounts: ReadonlyMap<string, number> = new Map()): { nodes: Node<TemporalCanvasNodeData>[]; edges: Edge[]; tracks: TemporalCanvasTrack[]; unresolvedCount: number; conflictCount: number; rangeCount: number; concurrentCount: number } {
  const placementByEvent = new Map(run?.status === "ready" ? run.placements.map((placement) => [placement.versionedEventRef.eventId, placement]) : []);
  const resolvedTracks = resolveTemporalTrackProjection({
    eventIds: events.map((event) => event.id),
    fallbackTrackByEventId: Object.fromEntries(events.map((event) => { const semantic = eventLineSemanticNode(event); return [event.id, TEMPORAL_COORDINATE_TRACKS[trackIndex(semantic.storyLine.kind)]!.id]; })),
    cache: run?.status === "ready" ? run.compositionCache : null,
    stale: Boolean(run?.stale)
  });
  const cacheTrackByEvent = new Map(Object.entries(resolvedTracks.trackByEventId));
  const evidence = events.map((event, sourceIndex) => temporalEvidence(event, placementByEvent.get(event.id) ?? null, events, sourceIndex));
  const dated = evidence.filter((item) => item.coordinate !== null && item.state !== "conflict");
  const minimum = dated.length ? Math.min(...dated.map((item) => item.coordinate!)) : 0;
  const maximum = dated.length ? Math.max(...dated.map((item) => item.endCoordinate ?? item.coordinate!)) : minimum + 1;
  const span = Math.max(1, maximum - minimum);
  const pixelsPerDay = Math.max(68, Math.min(230, 1_520 / span));
  const concurrencyTotals = new Map<string, number>();
  for (const item of dated) {
    const key = `${item.coordinate}`;
    concurrencyTotals.set(key, (concurrencyTotals.get(key) ?? 0) + 1);
  }
  const trackIdFor = (item: TemporalEvidence) => {
    const semantic = eventLineSemanticNode(item.event);
    return cacheTrackByEvent.get(item.event.id) ?? TEMPORAL_COORDINATE_TRACKS[trackIndex(semantic.storyLine.kind)]!.id;
  };
  const layoutByEvent = new Map<string, { lane: number; concurrent: boolean }>();
  const laneEndsByTrack = new Map<string, number[]>();
  for (const item of [...dated].sort((left, right) => left.coordinate! - right.coordinate! || left.sourceIndex - right.sourceIndex)) {
    const trackId = trackIdFor(item);
    const startX = 150 + (item.coordinate! - minimum) * pixelsPerDay;
    const width = item.endCoordinate === null ? 230 : Math.max(230, (item.endCoordinate - item.coordinate!) * pixelsPerDay);
    const laneEnds = laneEndsByTrack.get(trackId) ?? [];
    let lane = laneEnds.findIndex((endX) => endX + 28 <= startX);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = startX + width;
    laneEndsByTrack.set(trackId, laneEnds);
    layoutByEvent.set(item.event.id, { lane, concurrent: (concurrencyTotals.get(`${item.coordinate}`) ?? 0) > 1 });
  }
  let nextTrackY = 150;
  const tracks = resolvedTracks.tracks.map((track) => {
    const result = { id: track.id, label: track.label, coordinateY: nextTrackY, origin: resolvedTracks.origin };
    nextTrackY += Math.max(245, (laneEndsByTrack.get(track.id)?.length ?? 1) * 112 + 145);
    return result;
  });
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const focusBaseY = nextTrackY + 40;
  const unresolvedBaseY = focusBaseY + Math.max(1, focusObjects.length) * 92 + 105;
  const conflictBaseY = unresolvedBaseY + 170;
  let unresolvedIndex = 0;
  let conflictIndex = 0;
  const eventNodes: Node<TemporalCanvasNodeData>[] = evidence.map((item): Node<TemporalCanvasNodeData> => {
    const semantic = eventLineSemanticNode(item.event);
    const fallbackTrack = TEMPORAL_COORDINATE_TRACKS[trackIndex(semantic.storyLine.kind)]!;
    const trackId = cacheTrackByEvent.get(item.event.id) ?? fallbackTrack.id;
    const track = trackById.get(trackId) ?? tracks[0]!;
    let position: { x: number; y: number };
    let concurrent = false;
    if (item.state === "conflict") position = { x: 150 + conflictIndex++ * 252, y: conflictBaseY };
    else if (item.coordinate === null) position = { x: 150 + unresolvedIndex++ * 252, y: unresolvedBaseY };
    else {
      const layout = layoutByEvent.get(item.event.id) ?? { lane: 0, concurrent: false };
      concurrent = layout.concurrent;
      position = { x: 150 + (item.coordinate - minimum) * pixelsPerDay, y: track.coordinateY + layout.lane * 112 };
    }
    return {
      id: item.event.id,
      type: "temporalEvent",
      position,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      className: `temporal-event-node is-${item.state}`,
      style: { zIndex: item.event.id === selectedEventId ? 4 : 2 },
      data: {
        kind: "event",
        eventId: item.event.id,
        title: item.event.title,
        timeLabel: item.label,
        state: item.state,
        detail,
        sourceLabel: eventLineEventMetadata(item.event).unitLabel ?? "未归入单元",
        trackId: track.id,
        trackLabel: track.label,
        trackOrigin: track.origin,
        intervalWidth: item.endCoordinate === null || item.coordinate === null ? 230 : Math.max(230, (item.endCoordinate - item.coordinate) * pixelsPerDay),
        anchorLabel: item.anchorLabel,
        placementCount: placementCounts.get(item.event.id) ?? 0,
        concurrent
      }
    };
  });
  const eventNodeById = new Map(eventNodes.map((node) => [node.id, node]));
  const ids = new Set(events.map((event) => event.id));
  const edges: Edge[] = relations.filter((relation) => ids.has(relation.sourceObjectId) && ids.has(relation.targetObjectId) && relation.reviewState === "confirmed" && (isTemporalRelation(relation) || isSelectedCausalChain(relation, selectedEventId))).map((relation): Edge => ({ id: `temporal.${relation.relationId}`, source: relation.sourceObjectId, target: relation.targetObjectId, type: "smoothstep", label: relation.currentTypeLabel ?? relation.relationLabelSnapshot, markerEnd: { type: MarkerType.ArrowClosed }, className: "temporal-constraint-edge" }));
  const chronological = evidence.filter((item) => item.coordinate !== null && item.state !== "conflict").sort((left, right) => left.coordinate! - right.coordinate! || left.sourceIndex - right.sourceIndex);
  const focusNodes: Node<TemporalCanvasNodeData>[] = [];
  for (const [objectIndex, object] of focusObjects.slice(0, 3).entries()) {
    const overlay = buildFocusTrajectoryOverlay({ anchors: chronological.map((item) => ({ anchorId: item.event.id, event: item.event })), objects: focusObjects, focusObjectIds: [object.id] });
    const laneY = focusBaseY + objectIndex * 92;
    for (const point of overlay.points) {
      const anchor = eventNodeById.get(point.anchorId);
      if (!anchor) continue;
      focusNodes.push({ id: `time:${point.pointId}`, type: "temporalFocus", position: { x: anchor.position.x + 94, y: laneY }, selectable: false, draggable: false, data: { kind: "focus", state: point.state, label: `${point.objectLabel} · ${temporalTrajectoryStateLabel(point.state)}`, conflict: point.conflict } });
    }
    for (const segment of overlay.segments) {
      const sourceId = `time:${segment.sourcePointId}`;
      const targetId = `time:${segment.targetPointId}`;
      const source = focusNodes.find((node) => node.id === sourceId);
      const target = focusNodes.find((node) => node.id === targetId);
      if (!source || !target || source.position.x === target.position.x) continue;
      edges.push({ id: `time:${segment.segmentId}`, source: sourceId, target: targetId, type: "straight", className: `temporal-focus-edge ${segment.weak ? "is-weak" : ""}` });
    }
  }
  return { nodes: [...eventNodes, ...focusNodes], edges, tracks, unresolvedCount: unresolvedIndex, conflictCount: conflictIndex, rangeCount: evidence.filter((item) => item.state === "range").length, concurrentCount: [...concurrencyTotals.values()].filter((count) => count > 1).length };
}

type TemporalEvidence = { event: EventLineEventSummary; sourceIndex: number; state: TemporalEventState; label: string; coordinate: number | null; endCoordinate: number | null; anchorLabel: string | null };

function temporalEvidence(event: EventLineEventSummary, placement: TemporalPlacement | null, allEvents: readonly EventLineEventSummary[], sourceIndex: number): TemporalEvidence {
  const semantic = eventLineSemanticNode(event);
  const rawLabel = placement?.authoredTimeLabel ?? semantic.time.label;
  const conflict = placement?.placementKind === "conflict" || event.tags.some((tag) => /^(?:时间冲突|Time Conflict)(?:[：:]|$)/iu.test(tag));
  if (conflict) return { event, sourceIndex, state: "conflict", label: rawLabel, coordinate: null, endCoordinate: null, anchorLabel: null };
  const fuzzy = /^(?:约|大约|around)\s*/iu.test(rawLabel);
  const cleanLabel = rawLabel.replace(/^(?:约|大约|around)\s*/iu, "");
  if (semantic.time.kind === "range") {
    const start = parseCalendarCoordinate(semantic.time.start);
    const end = parseCalendarCoordinate(semantic.time.end);
    if (start !== null && end !== null) return { event, sourceIndex, state: "range", label: rawLabel, coordinate: Math.min(start, end), endCoordinate: Math.max(start, end), anchorLabel: null };
  }
  const exact = parseCalendarCoordinate(cleanLabel);
  if (exact !== null) return { event, sourceIndex, state: fuzzy ? "fuzzy" : "anchored", label: rawLabel, coordinate: exact, endCoordinate: exact, anchorLabel: null };
  if (semantic.time.kind === "relative") {
    const anchorRef = taggedValue(event.tags, ["相对锚点", "Relative Anchor"]);
    const anchor = anchorRef ? allEvents.find((candidate) => candidate.id === anchorRef || candidate.title === anchorRef) ?? null : null;
    const anchorCoordinate = anchor ? parseCalendarCoordinate(eventLineSemanticNode(anchor).time.label.replace(/^(?:约|大约|around)\s*/iu, "")) : null;
    const offset = relativeOffsetDays(rawLabel);
    return { event, sourceIndex, state: fuzzy ? "fuzzy" : "relative", label: rawLabel, coordinate: anchorCoordinate === null ? null : anchorCoordinate + offset, endCoordinate: anchorCoordinate === null ? null : anchorCoordinate + offset, anchorLabel: anchor?.title ?? anchorRef };
  }
  if (placement?.placementKind === "anchored" || placement?.placementKind === "inferred" || placement?.placementKind === "ambiguous") {
    return { event, sourceIndex, state: placement.placementKind === "anchored" ? "anchored" : "inferred", label: placement.inferredWindow ? `推断区间 ${placement.inferredWindow.start}–${placement.inferredWindow.end}` : rawLabel, coordinate: placement.relativePosition, endCoordinate: placement.relativePosition, anchorLabel: placement.anchorBeforeEventIds[0] ?? placement.anchorAfterEventIds[0] ?? null };
  }
  return { event, sourceIndex, state: "unplaced", label: rawLabel, coordinate: null, endCoordinate: null, anchorLabel: null };
}

function parseCalendarCoordinate(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4})[-/.年](\d{1,2})(?:[-/.月](\d{1,2})日?)?(?:[ T](\d{1,2})(?::(\d{2}))?)?$/u.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3] ?? 1);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate() || hour > 23 || minute > 59) return null;
  return Date.UTC(year, month - 1, day, hour, minute) / 86_400_000;
}

function relativeOffsetDays(label: string): number {
  const match = /(\d+(?:\.\d+)?)\s*(小时|时|天|日|周|月|年)/u.exec(label);
  const amount = Number(match?.[1] ?? 1);
  const unit = match?.[2] ?? "天";
  const days = unit === "小时" || unit === "时" ? amount / 24 : unit === "周" ? amount * 7 : unit === "月" ? amount * 30 : unit === "年" ? amount * 365 : amount;
  return /(?:之前|before|前)/iu.test(label) ? -days : days;
}

function temporalStateLabel(state: TemporalEventState): string {
  return ({ anchored: "精确时间", inferred: "推断位置", range: "时间范围", relative: "相对时间", fuzzy: "模糊时间", unplaced: "时间待定", conflict: "时间冲突" } as const)[state];
}

function temporalTrajectoryStateLabel(state: FocusTrajectoryRenderState): string {
  return state === "direct" ? "参与" : state === "witnessed" ? "见证" : state === "explicit-absence" ? "明确缺席" : state === "weak" ? "听闻/推测" : "unknown";
}

function trackIndex(kind: ReturnType<typeof eventLineSemanticNode>["storyLine"]["kind"]): number {
  if (kind === "main") return 0;
  if (kind === "side" || kind === "character" || kind === "location") return 1;
  return 2;
}

function isTemporalRelation(relation: RelationReadProjectionR0): boolean {
  return /(?:time|temporal|before|after|时间|早于|晚于|先于|后于)/iu.test(`${relation.relationTypeId} ${relation.currentTypeLabel ?? ""} ${relation.relationLabelSnapshot}`);
}

function isSelectedCausalChain(relation: RelationReadProjectionR0, selectedEventId: string | null): boolean {
  return Boolean(selectedEventId && (relation.sourceObjectId === selectedEventId || relation.targetObjectId === selectedEventId) && /(?:cause|causal|因果|导致|促使)/iu.test(`${relation.relationTypeId} ${relation.currentTypeLabel ?? ""} ${relation.relationLabelSnapshot}`));
}

function taggedValue(tags: readonly string[], prefixes: readonly string[]): string | null {
  for (const tag of tags) for (const prefix of prefixes) {
    const match = tag.match(new RegExp(`^${escapeRegExp(prefix)}[：:]\\s*(.+)$`, "iu"));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"); }

function TemporalCoordinateOverlay(props: { nodes: readonly Node<TemporalCanvasNodeData>[]; tracks: readonly TemporalCanvasTrack[]; viewport: { x: number; y: number; zoom: number }; detail: TemporalEventNodeData["detail"]; selected: Node<TemporalCanvasNodeData> | null; selectedScreenPosition: { x: number; y: number } | null; unresolvedCount: number; conflictCount: number }) {
  const resolved = props.nodes.filter((node): node is Node<TemporalEventNodeData> => node.data.kind === "event" && node.data.state !== "unplaced" && node.data.state !== "conflict");
  const ruler: Array<{ node: Node<TemporalEventNodeData>; screenX: number }> = [];
  const minimumGap = props.detail === "compact" ? 176 : 132;
  for (const node of [...resolved].sort((left, right) => left.position.x - right.position.x || left.data.timeLabel.localeCompare(right.data.timeLabel))) {
    const screenX = node.position.x * props.viewport.zoom + props.viewport.x;
    if (ruler.length && screenX - ruler.at(-1)!.screenX < minimumGap) continue;
    ruler.push({ node, screenX });
  }
  const selectedData = props.selected?.data.kind === "event" ? props.selected.data : null;
  return <div className="temporal-coordinate-overlay" aria-label="连续世界时间坐标" data-zoom-density={props.detail}>
    <div className="temporal-top-ruler" aria-label="连续时间标尺"><strong>世界时间 →</strong>{ruler.map(({ node, screenX }) => <span key={node.id} title={node.data.timeLabel} style={{ left: `${screenX}px` }}><i />{node.data.timeLabel}</span>)}</div>
    <div className="temporal-left-scale" aria-label="稳定故事轨道"><strong>平行轨道</strong>{props.tracks.map((track) => <span key={track.id} data-track-id={track.id} data-track-origin={track.origin} style={{ top: `${track.coordinateY * props.viewport.zoom + props.viewport.y + 48}px` }}><i />{track.label}</span>)}</div>
    {selectedData && props.selectedScreenPosition ? <div className="temporal-crosshair" style={{ "--crosshair-x": `${props.selectedScreenPosition.x}px`, "--crosshair-y": `${props.selectedScreenPosition.y}px` } as CSSProperties}><span>{selectedData.title}</span></div> : null}
    {props.unresolvedCount ? <aside className="temporal-unplaced-tray" aria-label="时间待定事件"><Clock3 /><strong>时间待定 · {props.unresolvedCount}</strong><span>未知或缺少锚点的相对时间不会被塞到时间末尾。</span></aside> : null}
    {props.conflictCount ? <aside className="temporal-conflict-zone" aria-label="时间证据冲突"><AlertTriangle /><strong>冲突证据 · {props.conflictCount}</strong><span>保留冲突，不自动选择一个日期。</span></aside> : null}
  </div>;
}
