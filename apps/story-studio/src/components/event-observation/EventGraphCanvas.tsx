import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  type ReactFlowInstance,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import { Focus, Link2, Network, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { EventLineEventSummary } from "../eventLineCommittedEvents";

type EventGraphNodeData = {
  title: string;
  sequence: number;
  focused: boolean;
  remote: boolean;
  selected: boolean;
};

type EventGraphLayout = {
  version: "tianyan-event-graph-layout/v1";
  positions: Record<string, { x: number; y: number }>;
};

const nodeTypes = { event: EventGraphNode };

/**
 * A pure interaction projection over the existing Event and Relation owners.
 * Layout is a browser preference keyed by stable Event id; it never stores or
 * mutates story facts.
 */
export function EventGraphCanvas(props: {
  projectId: string;
  events: readonly EventLineEventSummary[];
  relations: readonly RelationReadProjectionR0[];
  selectedEventId: string | null;
  onSelectEvent(eventId: string): void;
  onCreateRelation?(connection: { sourceEventId: string; targetEventId: string }): void;
}) {
  const [focusEventId, setFocusEventId] = useState<string | null>(props.selectedEventId);
  const [history, setHistory] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [flow, setFlow] = useState<ReactFlowInstance<Node<EventGraphNodeData>, Edge> | null>(null);
  const layout = useMemo(() => readLayout(props.projectId), [props.projectId]);
  const derived = useMemo(() => deriveGraph({ events: props.events, relations: props.relations, selectedEventId: props.selectedEventId, focusEventId, positions: layout.positions }), [focusEventId, layout.positions, props.events, props.relations, props.selectedEventId]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<EventGraphNodeData>>(derived.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(derived.edges);

  useEffect(() => { setNodes(derived.nodes); setEdges(derived.edges); }, [derived.edges, derived.nodes, setEdges, setNodes]);
  useEffect(() => { if (props.selectedEventId) setFocusEventId((current) => current ?? props.selectedEventId); }, [props.selectedEventId]);
  useEffect(() => {
    if (!flow || derived.nodes.length === 0) return;
    const frame = window.requestAnimationFrame(() => { void flow.fitView({ padding: 0.24, duration: 140, maxZoom: 1 }); });
    return () => window.cancelAnimationFrame(frame);
  }, [derived.nodes, flow]);

  const persistLayout = useCallback(() => {
    const positions = Object.fromEntries(nodes.filter((node) => node.type === "event").map((node) => [node.id, { x: Math.round(node.position.x), y: Math.round(node.position.y) }]));
    writeLayout(props.projectId, positions);
  }, [nodes, props.projectId]);

  const focus = (eventId: string) => {
    setFocusEventId((current) => {
      if (current && current !== eventId) setHistory((items) => [...items, current].slice(-12));
      return eventId;
    });
    props.onSelectEvent(eventId);
  };
  const goBack = () => setHistory((items) => {
    const previous = items.at(-1) ?? null;
    if (previous) { setFocusEventId(previous); props.onSelectEvent(previous); }
    return items.slice(0, -1);
  });
  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    if (!props.onCreateRelation) { setNotice("关系候选入口当前不可用；没有写入任何事实。"); return; }
    props.onCreateRelation({ sourceEventId: connection.source, targetEventId: connection.target });
  };

  return <section className="event-graph-canvas" aria-label="事件线全局图谱" data-event-graph-owner="projection">
    <header className="event-graph-toolbar">
      <div><p className="eyebrow">全局关系图</p><strong>{focusEventId ? "焦点投影" : "全部已确认事件"}</strong><span>拖拽只保存本机布局；连线只会提交待确认候选。</span></div>
      <div>
        <button type="button" disabled={!history.length} onClick={goBack}>返回焦点</button>
        <button type="button" onClick={() => { writeLayout(props.projectId, {}); setNodes(deriveGraph({ events: props.events, relations: props.relations, selectedEventId: props.selectedEventId, focusEventId, positions: {} }).nodes); }}><RotateCcw />重置布局</button>
      </div>
    </header>
    {notice ? <p className="event-graph-notice" role="status">{notice}</p> : null}
    <div className="event-graph-flow" onPointerUp={persistLayout}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, node) => { if (props.events.some((event) => event.id === node.id)) focus(node.id); }}
        onInit={setFlow}
        fitView
        minZoom={0.3}
        maxZoom={1.8}
        nodesConnectable={Boolean(props.onCreateRelation)}
        connectionLineStyle={{ stroke: "var(--color-accent)", strokeWidth: 1.5 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable nodeColor={(node) => node.data?.remote ? "#b5a998" : "#147d78"} />
      </ReactFlow>
    </div>
    {focusEventId ? <footer className="event-graph-focus-note"><Focus /><span>实线是既有 Relation owner 的关系；虚线节点是远处投影，不代表候选或推断。</span></footer> : null}
  </section>;
}

function EventGraphNode(props: NodeProps<Node<EventGraphNodeData>>) {
  return <article className={`event-graph-node ${props.data.focused ? "is-focused" : ""} ${props.data.remote ? "is-remote" : ""} ${props.data.selected ? "is-selected" : ""}`}>
    <Handle type="target" position={Position.Top} />
    <Handle type="source" position={Position.Right} />
    <Handle type="source" position={Position.Bottom} />
    <Handle type="target" position={Position.Left} />
    <small>{props.data.remote ? "远处投影" : `已确认事件 · ${props.data.sequence}`}</small>
    <strong>{props.data.title}</strong>
    <span>{props.data.focused ? <><Focus />当前焦点</> : props.data.remote ? <><Network />未展开关系</> : <><Link2 />正式关系</>}</span>
  </article>;
}

function deriveGraph(input: { events: readonly EventLineEventSummary[]; relations: readonly RelationReadProjectionR0[]; selectedEventId: string | null; focusEventId: string | null; positions: EventGraphLayout["positions"] }): { nodes: Node<EventGraphNodeData>[]; edges: Edge[] } {
  const order = new Map(input.events.map((event, index) => [event.id, index]));
  const focusId = input.focusEventId && order.has(input.focusEventId) ? input.focusEventId : null;
  const connected = new Set<string>();
  if (focusId) for (const relation of input.relations) {
    if (relation.sourceObjectId === focusId) connected.add(relation.targetObjectId);
    if (relation.targetObjectId === focusId) connected.add(relation.sourceObjectId);
  }
  const eventNodes = input.events.map((event, index) => {
    const remote = Boolean(focusId && event.id !== focusId && !connected.has(event.id));
    const fallback = focusId ? focusedPosition(index, event.id === focusId, connected.has(event.id)) : gridPosition(index);
    return {
      id: event.id,
      type: "event",
      position: input.positions[event.id] ?? fallback,
      data: { title: event.title, sequence: index + 1, focused: event.id === focusId, remote, selected: event.id === input.selectedEventId }
    };
  });
  const remoteNodes = eventNodes.filter((node) => node.data.remote);
  // A focus is still a whole-graph view.  Once a remote group gets dense we
  // expose its count as one non-interactive projection node instead of making
  // the focused neighbourhood unreadable.  No relationship is invented here.
  const collapsedRemote = focusId && remoteNodes.length > 3 ? remoteNodes : [];
  const collapsedIds = new Set(collapsedRemote.map((node) => node.id));
  const nodes = eventNodes.filter((node) => !collapsedIds.has(node.id));
  if (collapsedRemote.length) {
    nodes.push({
      id: "projection.remote-cluster",
      type: "event",
      position: { x: 1040, y: 220 },
      data: {
        title: `${collapsedRemote.length} 条远处投影`,
        sequence: 0,
        focused: false,
        remote: true,
        selected: false
      }
    });
  }
  const visible = new Set(nodes.map((node) => node.id));
  const edges = input.relations
    .filter((relation) => relation.reviewState === "confirmed" && visible.has(relation.sourceObjectId) && visible.has(relation.targetObjectId))
    .map((relation) => ({
      id: relation.relationId,
      source: relation.sourceObjectId,
      target: relation.targetObjectId,
      type: "smoothstep",
      label: relation.currentTypeLabel ?? relation.relationLabelSnapshot,
      markerEnd: relation.direction === "none" ? undefined : { type: MarkerType.ArrowClosed },
      animated: false,
      style: { stroke: "var(--color-accent)", strokeWidth: 1.4 },
      labelStyle: { fill: "var(--color-text-muted)", fontSize: 11 }
    }));
  return { nodes, edges };
}

function gridPosition(index: number) { return { x: 70 + (index % 4) * 250, y: 70 + Math.floor(index / 4) * 160 }; }
function focusedPosition(index: number, focused: boolean, connected: boolean) { if (focused) return { x: 410, y: 260 }; if (connected) return { x: 90 + (index % 3) * 320, y: index % 2 ? 80 : 480 }; return { x: 1050 + (index % 2) * 220, y: 80 + Math.floor(index / 2) * 140 }; }
function layoutKey(projectId: string) { return `tianyan.event-graph-layout/v1:${projectId}`; }
function readLayout(projectId: string): EventGraphLayout {
  try {
    const value = window.localStorage.getItem(layoutKey(projectId));
    const parsed = value ? JSON.parse(value) as Partial<EventGraphLayout> : null;
    if (parsed?.version === "tianyan-event-graph-layout/v1" && parsed.positions && typeof parsed.positions === "object") return { version: parsed.version, positions: parsed.positions as EventGraphLayout["positions"] };
  } catch { /* An unavailable browser preference is never a fact-store failure. */ }
  return { version: "tianyan-event-graph-layout/v1", positions: {} };
}
function writeLayout(projectId: string, positions: EventGraphLayout["positions"]) {
  try { window.localStorage.setItem(layoutKey(projectId), JSON.stringify({ version: "tianyan-event-graph-layout/v1", positions } satisfies EventGraphLayout)); } catch { /* Browser preferences may be unavailable. */ }
}
