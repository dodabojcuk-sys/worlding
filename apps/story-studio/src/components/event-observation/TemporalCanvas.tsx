import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge, type Node, type NodeProps, type ReactFlowInstance } from "@xyflow/react";
import { AlertTriangle, Clock3, Focus, LocateFixed, Network } from "lucide-react";
import { useCallback, useMemo, useState, type CSSProperties } from "react";

import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { TemporalPlacement, TemporalProjectionRun } from "../../../../../src/storyContracts/temporalProjection.ts";
import { TEMPORAL_COORDINATE_TRACKS } from "../../../../../src/storyContracts/temporalCoordinateTracks.ts";
import { eventLineEventMetadata, eventLineSemanticNode, type EventLineEventSummary } from "../eventLineCommittedEvents";

type TemporalNodeData = {
  title: string;
  timeLabel: string;
  sourceLabel: string;
  state: "anchored" | "inferred" | "ambiguous" | "unplaced" | "conflict";
  detail: "compact" | "standard" | "expanded";
};

const nodeTypes = { temporalEvent: TemporalEventNode };

export function TemporalCanvas(props: {
  events: readonly EventLineEventSummary[];
  relations: readonly RelationReadProjectionR0[];
  selectedEventId: string | null;
  onSelectEvent(eventId: string): void;
  onReturnGraph(): void;
  temporalRun: TemporalProjectionRun | null;
  temporalState: "idle" | "loading" | "ready" | "stale" | "missing" | "failed" | "provider-unavailable";
  temporalMessage: string | null;
}) {
  const [flow, setFlow] = useState<ReactFlowInstance<Node<TemporalNodeData>, Edge> | null>(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const detail = viewport.zoom < .9 ? "compact" : viewport.zoom > 1.18 ? "expanded" : "standard";
  const projection = useMemo(() => buildTemporalCanvasProjection(props.events, props.relations, props.temporalRun, detail, props.selectedEventId), [detail, props.events, props.relations, props.selectedEventId, props.temporalRun]);
  const selectedNode = projection.nodes.find((node) => node.id === props.selectedEventId) ?? null;
  const focusCurrent = useCallback(() => {
    if (!flow || !props.selectedEventId) return;
    void flow.fitView({ nodes: [{ id: props.selectedEventId }], duration: 280, padding: .42, minZoom: .82, maxZoom: 1.22 });
  }, [flow, props.selectedEventId]);
  const selectedScreenPosition = selectedNode ? {
    x: selectedNode.position.x * viewport.zoom + viewport.x + 250 * viewport.zoom,
    y: selectedNode.position.y * viewport.zoom + viewport.y + 72 * viewport.zoom
  } : null;
  const stateLabel = props.temporalState === "ready" ? "时间投影已就绪" : props.temporalState === "stale" ? "正在显示上次时间投影" : props.temporalState === "missing" ? "基础时间布局" : props.temporalState === "provider-unavailable" ? "基础时间布局 · 模型未连接" : props.temporalState === "failed" ? "上次分析未完成" : props.temporalState === "loading" ? "读取时间投影" : "基础时间布局";

  return <section className="temporal-workspace" aria-label="独立时间线工作区" data-temporal-projection="independent" data-event-owner="shared-identities" data-view-switch-provider-calls="0" data-view-switch-agent-runs="0" data-temporal-state={props.temporalState}>
    <header className="temporal-commandbar">
      <strong><Clock3 />时间线</strong>
      <span>{stateLabel}</span>
      <div>
        <button type="button" onClick={() => props.onReturnGraph()}><Network />返回关系图</button>
        <button type="button" disabled={!props.selectedEventId} onClick={focusCurrent}><LocateFixed />定位所选</button>
        <button type="button" onClick={() => void flow?.fitView({ duration: 280, padding: .18, minZoom: .82, maxZoom: 1 })}><Focus />时间总览</button>
      </div>
    </header>
    <div className={`temporal-canvas-status is-${props.temporalState}`} role="status"><Clock3 /><div><strong>{stateLabel}</strong><span>{props.temporalMessage ?? "切换、缩放、平移和刷新均不会启动分析或产生费用。"}</span></div></div>
    <div className="temporal-flow" tabIndex={0}>
      <ReactFlow<Node<TemporalNodeData>, Edge>
        nodes={projection.nodes}
        edges={projection.edges}
        nodeTypes={nodeTypes}
        onInit={setFlow}
        onMove={(_, next) => setViewport(next)}
        onNodeClick={(_, node) => props.onSelectEvent(node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        minZoom={.82}
        maxZoom={1.6}
        defaultViewport={{ x: 72, y: 26, zoom: .88 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="rgba(20, 78, 88, .10)" />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <TemporalCoordinateOverlay nodes={projection.nodes} viewport={viewport} detail={detail} selected={selectedNode} selectedScreenPosition={selectedScreenPosition} unresolvedCount={projection.unresolvedCount} conflictCount={projection.conflictCount} />
    </div>
  </section>;
}

function TemporalEventNode(props: NodeProps<Node<TemporalNodeData>>) {
  const data = props.data;
  return <article className={`temporal-event-card is-${data.state} is-${data.detail}`} aria-label={`${data.title}，${data.timeLabel}，${temporalStateLabel(data.state)}`}>
    <Handle className="temporal-event-port is-input" type="target" position={Position.Left} isConnectable={false} />
    <header><Clock3 aria-hidden="true" /><span>{temporalStateLabel(data.state)}</span></header>
    <strong>{data.title}</strong>
    <time>{data.timeLabel}</time>
    {data.detail === "expanded" ? <small>{data.sourceLabel}</small> : null}
    <Handle className="temporal-event-port is-output" type="source" position={Position.Right} isConnectable={false} />
  </article>;
}

function buildTemporalCanvasProjection(events: readonly EventLineEventSummary[], relations: readonly RelationReadProjectionR0[], run: TemporalProjectionRun | null, detail: TemporalNodeData["detail"], selectedEventId: string | null): { nodes: Node<TemporalNodeData>[]; edges: Edge[]; unresolvedCount: number; conflictCount: number } {
  const placementByEvent = new Map(run?.status === "ready" ? run.placements.map((placement) => [placement.versionedEventRef.eventId, placement]) : []);
  const ordered = events.map((event, index) => ({ event, index, semantic: eventLineSemanticNode(event), placement: placementByEvent.get(event.id) ?? null }));
  const resolvedValues = ordered.filter((item) => temporalState(item.semantic.time.kind, item.placement) !== "unplaced" && temporalState(item.semantic.time.kind, item.placement) !== "conflict").map((item) => item.placement?.relativePosition ?? item.index);
  const minimum = resolvedValues.length ? Math.min(...resolvedValues) : 0;
  const maximum = resolvedValues.length ? Math.max(...resolvedValues) : Math.max(1, events.length - 1);
  const span = Math.max(1, maximum - minimum);
  let unresolvedIndex = 0;
  let conflictIndex = 0;
  const nodes = ordered.map(({ event, index, semantic, placement }): Node<TemporalNodeData> => {
    const state = temporalState(semantic.time.kind, placement);
    const track = TEMPORAL_COORDINATE_TRACKS[trackIndex(semantic.storyLine.kind)]!;
    const position = state === "unplaced"
      ? { x: 150 + unresolvedIndex++ * 244, y: 735 }
      : state === "conflict"
        ? { x: 150 + conflictIndex++ * 244, y: 930 }
        : { x: 150 + (((placement?.relativePosition ?? index) - minimum) / span) * Math.max(780, events.length * 190), y: track.coordinateY };
    const timeLabel = placement?.authoredTimeLabel ?? (placement?.inferredWindow ? `推断区间 ${placement.inferredWindow.start}–${placement.inferredWindow.end}` : semantic.time.label);
    return { id: event.id, type: "temporalEvent", position, sourcePosition: Position.Right, targetPosition: Position.Left, data: { title: event.title, timeLabel, state, detail, sourceLabel: eventLineEventMetadata(event).unitLabel ?? "未归入单元" }, className: `temporal-event-node is-${state}` };
  });
  const ids = new Set(events.map((event) => event.id));
  const edges = relations.filter((relation) => ids.has(relation.sourceObjectId) && ids.has(relation.targetObjectId) && relation.reviewState === "confirmed" && (isTemporalRelation(relation) || isSelectedCausalChain(relation, selectedEventId))).map((relation): Edge => ({ id: `temporal.${relation.relationId}`, source: relation.sourceObjectId, target: relation.targetObjectId, type: "smoothstep", label: relation.currentTypeLabel ?? relation.relationLabelSnapshot, markerEnd: { type: MarkerType.ArrowClosed }, className: "temporal-constraint-edge" }));
  return { nodes, edges, unresolvedCount: unresolvedIndex, conflictCount: conflictIndex };
}

function temporalState(timeKind: ReturnType<typeof eventLineSemanticNode>["time"]["kind"], placement: TemporalPlacement | null): TemporalNodeData["state"] {
  if (placement?.placementKind === "conflict") return "conflict";
  if (placement?.placementKind === "unplaced") return "unplaced";
  if (placement?.placementKind === "ambiguous") return "ambiguous";
  if (placement?.placementKind === "inferred") return "inferred";
  if (placement?.placementKind === "anchored" || timeKind === "exact") return "anchored";
  if (timeKind === "relative" || timeKind === "range") return "ambiguous";
  return "unplaced";
}

function temporalStateLabel(state: TemporalNodeData["state"]): string {
  return ({ anchored: "正式时间", inferred: "AI 推断", ambiguous: "模糊区间", unplaced: "时间未定", conflict: "时间冲突" } as const)[state];
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

function TemporalCoordinateOverlay(props: { nodes: readonly Node<TemporalNodeData>[]; viewport: { x: number; y: number; zoom: number }; detail: TemporalNodeData["detail"]; selected: Node<TemporalNodeData> | null; selectedScreenPosition: { x: number; y: number } | null; unresolvedCount: number; conflictCount: number }) {
  const resolved = props.nodes.filter((node) => node.data.state !== "unplaced" && node.data.state !== "conflict");
  const ruler = resolved.filter((_, index) => props.detail !== "compact" || index % 2 === 0).slice(0, 14);
  return <div className="temporal-coordinate-overlay" aria-label="二维时间坐标" data-zoom-density={props.detail}>
    <div className="temporal-top-ruler" aria-label="时间标尺"><strong>故事时间 →</strong>{ruler.map((node) => <span key={node.id} style={{ left: `${node.position.x * props.viewport.zoom + props.viewport.x}px` }}><i />{node.data.timeLabel}</span>)}</div>
    <div className="temporal-left-scale" aria-label="稳定故事轨道"><strong>稳定轨道</strong>{TEMPORAL_COORDINATE_TRACKS.map((track) => <span key={track.id} data-track-id={track.id} style={{ top: `${track.coordinateY * props.viewport.zoom + props.viewport.y + 48}px` }}><i />{track.label}</span>)}</div>
    {props.selected && props.selectedScreenPosition ? <div className="temporal-crosshair" style={{ "--crosshair-x": `${props.selectedScreenPosition.x}px`, "--crosshair-y": `${props.selectedScreenPosition.y}px` } as CSSProperties}><span>{props.selected.data.title}</span></div> : null}
    {props.unresolvedCount ? <aside className="temporal-unplaced-tray" aria-label="未定位事件"><Clock3 /><strong>未定位托盘 · {props.unresolvedCount}</strong><span>未知时间保持未定位，不会被塞到时间末尾。</span></aside> : null}
    {props.conflictCount ? <aside className="temporal-conflict-zone" aria-label="时间冲突区"><AlertTriangle /><strong>冲突区域 · {props.conflictCount}</strong><span>冲突事件与正式时间、推断区间严格分离。</span></aside> : null}
  </div>;
}
