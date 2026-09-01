import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { Clock3, Focus, MapPin, Maximize2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { eventLineSemanticNode, type EventLineEventSummary } from "../eventLineCommittedEvents";

export type EventTimelineItem = { event: EventLineEventSummary; timeLabel: string; timeKind: "exact" | "relative" | "range" | "unknown"; sortKey: string; location: string; participants: readonly string[]; };
export type EventTimelineBand = { id: string; label: string; timeKind: EventTimelineItem["timeKind"]; items: EventTimelineItem[]; unknown: boolean; };
type TimelineNodeData = EventTimelineItem & { selected: boolean; bandId: string; bandLabel: string; unknown: boolean };
type TimelineBandNodeData = { label: string; kindLabel: string; count: number; unknown: boolean };
type TimelineFlowNode = Node<TimelineNodeData, "event"> | Node<TimelineBandNodeData, "band">;

const BAND_WIDTH = 240;
const BAND_GAP = 20;
const EVENT_WIDTH = 220;
const EVENT_ROW_HEIGHT = 158;
const nodeTypes = { event: TimelineEventNode, band: TimelineBandNode };

/**
 * A read-only canvas projection of the Event owner's existing world-time
 * fields. Time determines horizontal placement; Relation owner projections
 * remain edges. It never invents a date, duration, Canon fact, WorldState
 * value, or layout authority.
 */
export function projectEventTimeline(events: readonly EventLineEventSummary[]): { dated: EventTimelineItem[]; undated: EventTimelineItem[]; bands: EventTimelineBand[]; } {
  const items = events.map((event) => {
    const semantic = eventLineSemanticNode(event);
    const time = semantic.time;
    return { event, timeLabel: time.label, timeKind: time.kind, sortKey: timelineSortKey(time.start ?? time.end ?? time.label), location: semantic.locations[0] ?? "地点未提供", participants: semantic.participants } satisfies EventTimelineItem;
  });
  const dated = items.filter((item) => item.timeKind !== "unknown").sort(compareTimelineItems);
  const bandsByLabel = new Map<string, EventTimelineBand>();
  for (const item of dated) {
    const id = `${item.timeKind}:${item.timeLabel}`;
    const band = bandsByLabel.get(id) ?? { id, label: item.timeLabel, timeKind: item.timeKind, items: [], unknown: false };
    band.items.push(item);
    bandsByLabel.set(id, band);
  }
  const knownBands = [...bandsByLabel.values()].sort((left, right) => compareTimelineItems(left.items[0]!, right.items[0]!));
  const undated = items.filter((item) => item.timeKind === "unknown").sort(compareTimelineItems);
  return { dated, undated, bands: [...knownBands, { id: "unknown", label: "时间未定", timeKind: "unknown", items: undated, unknown: true }] };
}

export function EventTimelineProjection(props: { events: readonly EventLineEventSummary[]; relations: readonly RelationReadProjectionR0[]; selectedEventId: string | null; onSelect(eventId: string): void; }) {
  const timeline = useMemo(() => projectEventTimeline(props.events), [props.events]);
  const [flow, setFlow] = useState<ReactFlowInstance<TimelineFlowNode, Edge> | null>(null);
  const projection = useMemo(() => deriveTimelineGraph(timeline, props.relations, props.selectedEventId), [props.relations, props.selectedEventId, timeline]);
  const focusOverview = (duration = 180) => {
    const knownBands = timeline.bands.filter((band) => !band.unknown).slice(0, 4);
    const visibleBandIds = new Set((knownBands.length ? knownBands : timeline.bands.slice(-1)).map((band) => `timeline-band.${band.id}`));
    const visibleBandKeys = new Set(knownBands.map((band) => band.id));
    const overviewNodes = projection.nodes.filter((node) => visibleBandIds.has(node.id) || (node.type === "event" && visibleBandKeys.has(node.data.bandId)));
    void flow?.fitView({ nodes: overviewNodes, padding: 0.08, duration, minZoom: 0.84, maxZoom: 1 });
  };
  useEffect(() => {
    if (!flow || !projection.nodes.length) return;
    const frame = window.requestAnimationFrame(() => {
      const selected = projection.nodes.find((node) => node.type === "event" && node.id === props.selectedEventId);
      if (selected) void flow.setCenter(selected.position.x + EVENT_WIDTH / 2, selected.position.y + 70, { zoom: 1, duration: 0 });
      else focusOverview(0);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flow, projection.layoutKey, props.selectedEventId]);
  const focusCurrent = () => {
    const selected = projection.nodes.find((node) => node.type === "event" && node.id === props.selectedEventId);
    if (selected) void flow?.setCenter(selected.position.x + EVENT_WIDTH / 2, selected.position.y + 70, { zoom: 1, duration: 180 });
  };
  return <section className="event-timeline-projection" aria-label="事件时间关系画布" data-testid="event-timeline-projection" data-timeline-owner="event-read-projection" data-timeline-graph-engine="react-flow">
    <header className="event-timeline-heading"><div><small>故事世界时间投影</small><strong>时间关系图</strong><p>从左到右表达世界时间；关系跨越时间隔栏仍保持同一条连线。</p></div><dl><div><dt>可定位</dt><dd>{timeline.dated.length}</dd></div><div><dt>时间未定</dt><dd>{timeline.undated.length}</dd></div><div><dt>关系</dt><dd>{projection.edges.length}</dd></div></dl></header>
    <div className="event-timeline-canvas" data-timeline-canvas="world-time">
      <div className="event-timeline-flow" aria-label="可平移缩放的时间化关系图"><ReactFlow<TimelineFlowNode, Edge> nodes={projection.nodes} edges={projection.edges} nodeTypes={nodeTypes} onInit={setFlow} onNodeClick={(_, node) => { if (node.type === "event") props.onSelect(node.id); }} minZoom={0.84} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} elementsSelectable proOptions={{ hideAttribution: true }}><Background gap={20} size={1} color="rgba(20, 125, 120, 0.13)" /><Controls showInteractive={false} /></ReactFlow></div>
      <div className="event-timeline-actions" aria-label="时间图聚焦操作"><button type="button" aria-label="时间图总览" onClick={() => focusOverview()}><Maximize2 />时间总览</button><button type="button" aria-label="聚焦当前时间节点" disabled={!props.selectedEventId} onClick={focusCurrent}><Focus />聚焦当前</button></div>
    </div>
  </section>;
}

export function deriveTimelineGraph(timeline: ReturnType<typeof projectEventTimeline>, relations: readonly RelationReadProjectionR0[], selectedEventId: string | null): { nodes: TimelineFlowNode[]; edges: Edge[]; layoutKey: string } {
  const bandByEvent = new Map<string, string>();
  const nodes: TimelineFlowNode[] = [];
  const maximumItems = Math.max(1, ...timeline.bands.map((band) => band.items.length));
  const bandHeight = Math.max(430, 116 + maximumItems * EVENT_ROW_HEIGHT);
  timeline.bands.forEach((band, bandIndex) => {
    const x = 30 + bandIndex * (BAND_WIDTH + BAND_GAP);
    nodes.push({ id: `timeline-band.${band.id}`, type: "band", position: { x, y: 34 }, data: { label: band.label, kindLabel: band.unknown ? "未知时间" : timeKindLabel(band.timeKind), count: band.items.length, unknown: band.unknown }, style: { width: BAND_WIDTH, height: bandHeight }, selectable: false, draggable: false, connectable: false, focusable: false, zIndex: -1 });
    band.items.forEach((item, itemIndex) => {
      bandByEvent.set(item.event.id, band.id);
      nodes.push({ id: item.event.id, type: "event", position: { x: x + (BAND_WIDTH - EVENT_WIDTH) / 2, y: 126 + itemIndex * EVENT_ROW_HEIGHT }, data: { ...item, selected: item.event.id === selectedEventId, bandId: band.id, bandLabel: band.label, unknown: band.unknown }, style: { width: EVENT_WIDTH }, zIndex: 2 });
    });
  });
  const ids = new Set(nodes.filter((node) => node.type === "event").map((node) => node.id));
  const edges = relations.filter((relation) => ids.has(relation.sourceObjectId) && ids.has(relation.targetObjectId) && relation.reviewState !== "rejected").map((relation) => ({ id: relation.relationId, source: relation.sourceObjectId, target: relation.targetObjectId, label: relation.currentTypeLabel ?? relation.relationLabelSnapshot, type: "smoothstep", className: bandByEvent.get(relation.sourceObjectId) !== bandByEvent.get(relation.targetObjectId) ? "timeline-cross-band-edge" : "timeline-relation-edge", zIndex: 1, style: { stroke: relation.reviewState === "confirmed" ? "#147d78" : "#8b6e2f", strokeWidth: 2, strokeDasharray: relation.reviewState === "confirmed" ? undefined : "6 4" }, labelStyle: { fill: "#31514f", fontSize: 12 }, labelBgStyle: { fill: "#fcfcf8", fillOpacity: 0.92 } }));
  return { nodes, edges, layoutKey: timeline.bands.map((band) => `${band.id}:${band.items.map((item) => item.event.id).join(",")}`).join("|") };
}

function TimelineBandNode(props: NodeProps<Node<TimelineBandNodeData, "band">>) {
  const { data } = props;
  return <section className={`event-timeline-background-band ${data.unknown ? "is-unknown" : ""}`} aria-label={`${data.label}，${data.count} 个事件`}><header><small>{data.kindLabel}</small><strong>{data.label}</strong><span>{data.count ? `${data.count} 个事件` : "暂无事件"}</span></header></section>;
}

function TimelineEventNode(props: NodeProps<Node<TimelineNodeData, "event">>) {
  const { data } = props;
  return <article className={`event-timeline-node ${data.selected ? "is-selected" : ""} ${data.unknown ? "is-unknown" : ""}`} aria-label={`${data.event.title}，${data.timeLabel}`}><Handle type="target" position={Position.Left} isConnectable={false} /><Handle type="source" position={Position.Right} isConnectable={false} /><small>{data.unknown ? "时间未定" : data.bandLabel}</small><strong>{data.event.title}</strong><time><Clock3 />{data.timeLabel}</time><span><MapPin />{data.location}</span>{data.participants.length ? <span><UsersRound />{data.participants.join("、")}</span> : null}</article>;
}

function compareTimelineItems(left: EventTimelineItem, right: EventTimelineItem): number { return left.sortKey.localeCompare(right.sortKey, "zh-CN") || left.event.title.localeCompare(right.event.title, "zh-CN"); }
function timeKindLabel(kind: EventTimelineBand["timeKind"]): string { return kind === "exact" ? "明确时间" : kind === "range" ? "时间范围" : kind === "relative" ? "相对顺序" : "未知时间"; }
function timelineSortKey(value: string): string { const trimmed = value.trim(); const numeric = trimmed.match(/\d+/gu); return !numeric?.length ? `z:${trimmed}` : `a:${numeric.map((part) => part.padStart(12, "0")).join(":")}:${trimmed}`; }
