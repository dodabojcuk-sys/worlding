import { Background, Controls, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { Clock3, Focus, MapPin, Maximize2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import { eventLineSemanticNode, type EventLineEventSummary } from "../eventLineCommittedEvents";

export type EventTimelineItem = { event: EventLineEventSummary; timeLabel: string; timeKind: "exact" | "relative" | "range" | "unknown"; sortKey: string; location: string; participants: readonly string[]; };
export type EventTimelineBand = { id: string; label: string; timeKind: Exclude<EventTimelineItem["timeKind"], "unknown">; items: EventTimelineItem[]; };
type TimelineNodeData = EventTimelineItem & { selected: boolean; bandLabel: string; unknown: boolean };
const nodeTypes = { event: TimelineEventNode };

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
    const timeKind = item.timeKind as EventTimelineBand["timeKind"];
    const id = `${timeKind}:${item.timeLabel}`;
    const band = bandsByLabel.get(id) ?? { id, label: item.timeLabel, timeKind, items: [] };
    band.items.push(item); bandsByLabel.set(id, band);
  }
  const bands = [...bandsByLabel.values()].sort((left, right) => compareTimelineItems(left.items[0]!, right.items[0]!));
  return { dated, undated: items.filter((item) => item.timeKind === "unknown"), bands };
}

export function EventTimelineProjection(props: { events: readonly EventLineEventSummary[]; relations: readonly RelationReadProjectionR0[]; selectedEventId: string | null; onSelect(eventId: string): void; }) {
  const timeline = useMemo(() => projectEventTimeline(props.events), [props.events]);
  const [flow, setFlow] = useState<ReactFlowInstance<Node<TimelineNodeData>, Edge> | null>(null);
  const projection = useMemo(() => deriveTimelineGraph(timeline, props.relations, props.selectedEventId), [props.relations, props.selectedEventId, timeline]);
  useEffect(() => {
    if (!flow || !projection.nodes.length) return;
    const frame = window.requestAnimationFrame(() => void flow.fitView({ padding: 0.18, duration: 0, maxZoom: 1.05 }));
    return () => window.cancelAnimationFrame(frame);
  }, [flow, projection.nodes.length]);
  const focusCurrent = () => {
    const selected = projection.nodes.find((node) => node.id === props.selectedEventId);
    if (selected) void flow?.setCenter(selected.position.x + 140, selected.position.y + 76, { zoom: 1.05, duration: 180 });
  };
  return <section className="event-timeline-projection" aria-label="事件时间关系画布" data-testid="event-timeline-projection" data-timeline-owner="event-read-projection" data-timeline-graph-engine="react-flow">
    <header className="event-timeline-heading"><div><small>故事世界时间投影</small><strong>时间关系图</strong><p>时间决定横向位置；关系由边连接。未知时间不会伪造日期。</p></div><dl><div><dt>可定位</dt><dd>{timeline.dated.length}</dd></div><div><dt>时间未定</dt><dd>{timeline.undated.length}</dd></div><div><dt>关系</dt><dd>{projection.edges.length}</dd></div></dl></header>
    <div className="event-timeline-canvas" data-timeline-canvas="world-time">
      <div className="event-timeline-axis" aria-label="故事世界时间轴"><span>已知时间起点</span><i aria-hidden="true" /><span>后续时间 →</span></div>
      <div className="event-timeline-band-labels" aria-label="时间隔栏">{timeline.bands.map((band, index) => <div key={band.id} data-time-kind={band.timeKind} style={{ "--timeline-band-index": index } as CSSProperties}><small>{timeKindLabel(band.timeKind)}</small><strong>{band.label}</strong></div>)}</div>
      <div className="event-timeline-flow" aria-label="可平移缩放的时间化关系图"><ReactFlow nodes={projection.nodes} edges={projection.edges} nodeTypes={nodeTypes} onInit={setFlow} onNodeClick={(_, node) => props.onSelect(node.id)} fitView minZoom={0.25} maxZoom={1.8} nodesDraggable={false} nodesConnectable={false} elementsSelectable proOptions={{ hideAttribution: true }}><Background gap={20} size={1} color="rgba(20, 125, 120, 0.13)" /><Controls showInteractive={false} /></ReactFlow></div>
      <section className="event-timeline-undated" aria-label="时间未定泳道"><Clock3 /><div><small>未知时间泳道</small><strong>时间未定</strong><p>{timeline.undated.length ? `${timeline.undated.length} 个节点保留在此，补充时间后将进入对应时间隔栏。` : "所有当前事件都已有故事世界时间。"}</p></div></section>
      <div className="event-timeline-actions"><button type="button" aria-label="聚焦当前时间节点" disabled={!props.selectedEventId} onClick={focusCurrent}><Focus />聚焦当前</button><button type="button" aria-label="适应时间图视图" onClick={() => void flow?.fitView({ padding: 0.18, duration: 180, maxZoom: 1.05 })}><Maximize2 />适应视图</button></div>
    </div>
  </section>;
}

function deriveTimelineGraph(timeline: ReturnType<typeof projectEventTimeline>, relations: readonly RelationReadProjectionR0[], selectedEventId: string | null): { nodes: Node<TimelineNodeData>[]; edges: Edge[] } {
  const bandByEvent = new Map<string, string>();
  const nodes: Node<TimelineNodeData>[] = [];
  timeline.bands.forEach((band, bandIndex) => band.items.forEach((item, itemIndex) => { bandByEvent.set(item.event.id, band.id); nodes.push({ id: item.event.id, type: "event", position: { x: 90 + bandIndex * 360, y: 120 + itemIndex * 190 }, data: { ...item, selected: item.event.id === selectedEventId, bandLabel: band.label, unknown: false } }); }));
  timeline.undated.forEach((item, itemIndex) => { bandByEvent.set(item.event.id, "unknown"); nodes.push({ id: item.event.id, type: "event", position: { x: 90 + itemIndex * 300, y: 570 }, data: { ...item, selected: item.event.id === selectedEventId, bandLabel: "时间未定", unknown: true } }); });
  const ids = new Set(nodes.map((node) => node.id));
  const edges = relations.filter((relation) => ids.has(relation.sourceObjectId) && ids.has(relation.targetObjectId) && relation.reviewState !== "rejected").map((relation) => ({ id: relation.relationId, source: relation.sourceObjectId, target: relation.targetObjectId, label: relation.currentTypeLabel ?? relation.relationLabelSnapshot, type: "smoothstep", className: bandByEvent.get(relation.sourceObjectId) !== bandByEvent.get(relation.targetObjectId) ? "timeline-cross-band-edge" : "timeline-relation-edge", style: { stroke: relation.reviewState === "confirmed" ? "#147d78" : "#8b6e2f", strokeWidth: 2, strokeDasharray: relation.reviewState === "confirmed" ? undefined : "6 4" }, labelStyle: { fill: "#31514f", fontSize: 11 }, labelBgStyle: { fill: "#fcfcf8", fillOpacity: 0.92 } }));
  return { nodes, edges };
}

function TimelineEventNode(props: NodeProps<Node<TimelineNodeData>>) {
  const { data } = props;
  return <article className={`event-timeline-node ${data.selected ? "is-selected" : ""} ${data.unknown ? "is-unknown" : ""}`}><Handle type="target" position={Position.Left} isConnectable={false} /><Handle type="source" position={Position.Right} isConnectable={false} /><small>{data.unknown ? "时间未定" : data.bandLabel}</small><strong>{data.event.title}</strong><time><Clock3 />{data.timeLabel}</time><span><MapPin />{data.location}</span>{data.participants.length ? <span><UsersRound />{data.participants.join("、")}</span> : null}</article>;
}
function compareTimelineItems(left: EventTimelineItem, right: EventTimelineItem): number { return left.sortKey.localeCompare(right.sortKey, "zh-CN") || left.event.title.localeCompare(right.event.title, "zh-CN"); }
function timeKindLabel(kind: EventTimelineBand["timeKind"]): string { return kind === "exact" ? "明确时间" : kind === "range" ? "时间范围" : "相对顺序"; }
function timelineSortKey(value: string): string { const trimmed = value.trim(); const numeric = trimmed.match(/\d+/gu); return !numeric?.length ? `z:${trimmed}` : `a:${numeric.map((part) => part.padStart(12, "0")).join(":")}:${trimmed}`; }
