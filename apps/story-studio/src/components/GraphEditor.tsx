import dagre from "@dagrejs/dagre";
import {
  addEdge,
  applyNodeChanges,
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance
} from "@xyflow/react";
import { Check, Filter, Focus, LayoutGrid, Link2, Redo2, Route, Search, Trash2, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";

import type { GraphDocument, GraphEdge, GraphNode, GraphRelationProposal, WorldObjectSummary, WorldObjectType } from "../lib/localTransport";
import { acceptRelationProposal, immediateNeighborhood, RELATION_TEMPLATES, rejectRelationProposal, shortestRelationshipPath } from "../lib/graphAuthoring";
import type { WorkspaceSelection } from "../../../../src/productWorkspace/storyStudioWorkspaceSelection";
import { objectTypeLabel } from "../worldObjectCatalog";

export function GraphEditor(props: {
  document: GraphDocument;
  objects: WorldObjectSummary[];
  selection: WorkspaceSelection;
  canUndo: boolean;
  canRedo: boolean;
  onChange(document: GraphDocument): void;
  onUndo(): void;
  onRedo(): void;
  onSelectObject(object: WorldObjectSummary): void;
  onSelectRelation(relationId: string): void;
  onOpenObject(object: WorldObjectSummary): void;
  candidateObjectIds: string[];
}) {
  const objectsById = useMemo(() => new Map(props.objects.map((object) => [object.id, object])), [props.objects]);
  const validObjectIds = useMemo(() => new Set(props.objects.map((object) => object.id)), [props.objects]);
  const [flowNodes, setFlowNodes] = useState<Node[]>(() => toFlowNodes(props.document.content.nodes, objectsById, props.selection.objectId, props.candidateObjectIds));
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<WorldObjectType | "all">("all");
  const [relationFilter, setRelationFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [focusObjectId, setFocusObjectId] = useState<string | null>(null);
  const [pathMode, setPathMode] = useState(false);
  const [pathObjects, setPathObjects] = useState<[string | null, string | null]>([null, null]);
  const instanceRef = useRef<ReactFlowInstance | null>(null);
  const nodeClickTimers = useRef(new Map<string, number>());
  const fitOnMount = typeof window !== "undefined" && window.innerWidth <= 820;

  useEffect(() => {
    setFlowNodes(toFlowNodes(props.document.content.nodes, objectsById, props.selection.objectId, props.candidateObjectIds));
  }, [props.document.content.nodes, objectsById, props.selection.objectId, props.candidateObjectIds]);

  useEffect(() => {
    const fitForMobile = () => {
      if (window.innerWidth <= 820) void instanceRef.current?.fitView({ padding: 0.24, duration: 0 });
    };
    window.addEventListener("resize", fitForMobile);
    fitForMobile();
    return () => window.removeEventListener("resize", fitForMobile);
  }, [props.document.content.nodes.length]);

  useEffect(() => () => {
    for (const timer of nodeClickTimers.current.values()) window.clearTimeout(timer);
    nodeClickTimers.current.clear();
  }, []);

  const path = useMemo(() => pathObjects[0] && pathObjects[1]
    ? shortestRelationshipPath(props.document, pathObjects[0], pathObjects[1], validObjectIds)
    : null, [props.document, pathObjects, validObjectIds]);
  const focusNodeIds = useMemo(() => focusObjectId ? immediateNeighborhood(props.document, focusObjectId, validObjectIds) : null, [props.document, focusObjectId, validObjectIds]);
  const relationNodeIds = useMemo(() => relationFilter === "all" ? null : new Set(props.document.content.edges
    .filter((edge) => edge.relation === relationFilter)
    .flatMap((edge) => [edge.source, edge.target])), [props.document.content.edges, relationFilter]);
  const normalizedSearch = search.trim().toLocaleLowerCase("zh-CN");
  const visibleNodeIds = useMemo(() => new Set(flowNodes
    .filter((node) => {
      const object = objectsById.get(String(node.data.objectId));
      if (!object) return typeFilter === "all" && !normalizedSearch && !relationNodeIds && !focusNodeIds && !path;
      if (typeFilter !== "all" && object.type !== typeFilter) return false;
      if (normalizedSearch && !object.title.toLocaleLowerCase("zh-CN").includes(normalizedSearch)) return false;
      if (relationNodeIds && !relationNodeIds.has(node.id)) return false;
      if (focusNodeIds && !focusNodeIds.has(node.id)) return false;
      if (path && !path.nodeIds.includes(node.id)) return false;
      return true;
    })
    .map((node) => node.id)), [flowNodes, objectsById, typeFilter, normalizedSearch, relationNodeIds, focusNodeIds, path]);
  const visibleNodes = flowNodes.filter((node) => visibleNodeIds.has(node.id));
  const visibleEdges = toFlowEdges(props.document.content.edges, props.document.content.proposals || []).filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target));
  const selectedEdge = props.document.content.edges.find((edge) => edge.id === selectedEdgeId) || null;
  const selectedProposal = (props.document.content.proposals || []).find((proposal) => proposal.id === selectedEdgeId) || null;
  const selectedRelationship = selectedProposal || selectedEdge;

  function handleNodeChanges(changes: NodeChange[]) {
    setFlowNodes((nodes) => applyNodeChanges(changes, nodes));
  }

  function persistNodePositions(nodes = flowNodes) {
    const positions = new Map(nodes.map((node) => [node.id, node.position]));
    changeGraph(props.document, props.onChange, {
      nodes: props.document.content.nodes.map((node) => {
        const position = positions.get(node.id);
        return position ? { ...node, x: round(position.x), y: round(position.y) } : node;
      })
    });
  }

  function connect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const proposal: GraphRelationProposal = {
      id: nextId("proposal", [...props.document.content.edges, ...(props.document.content.proposals || [])].map((item) => item.id)),
      source: connection.source,
      target: connection.target,
      relation: "关联",
      direction: "none",
      origin: "graph",
      sourceDocumentId: props.document.id
    };
    const nextEdges = addEdge({ id: proposal.id, source: proposal.source, target: proposal.target }, toFlowEdges(props.document.content.edges, props.document.content.proposals || []));
    if (nextEdges.length > props.document.content.edges.length + (props.document.content.proposals || []).length) {
      changeGraph(props.document, props.onChange, { proposals: [...(props.document.content.proposals || []), proposal] });
      setSelectedEdgeId(proposal.id);
    }
  }

  function dropObject(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const objectId = event.dataTransfer.getData("application/x-story-world-object");
    const worldObject = objectsById.get(objectId);
    const instance = instanceRef.current;
    if (!worldObject || !instance || props.document.content.nodes.some((node) => node.objectId === objectId)) return;
    const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const node: GraphNode = { id: nextId("node", props.document.content.nodes.map((item) => item.id)), objectId, x: round(position.x), y: round(position.y) };
    changeGraph(props.document, props.onChange, { nodes: [...props.document.content.nodes, node] });
  }

  function autoLayout() {
    const graph = new dagre.graphlib.Graph();
    graph.setDefaultEdgeLabel(() => ({}));
    graph.setGraph({ rankdir: "LR", nodesep: 54, ranksep: 110, marginx: 30, marginy: 30 });
    for (const node of props.document.content.nodes) graph.setNode(node.id, { width: 180, height: 68 });
    for (const edge of props.document.content.edges) graph.setEdge(edge.source, edge.target);
    dagre.layout(graph);
    const nodes = props.document.content.nodes.map((node) => {
      const position = graph.node(node.id);
      return { ...node, x: round(position.x - 90), y: round(position.y - 34) };
    });
    changeGraph(props.document, props.onChange, { nodes });
  }

  function updateSelectedRelationship(patch: Partial<GraphEdge>) {
    if (!selectedRelationship) return;
    if (selectedProposal) {
      changeGraph(props.document, props.onChange, { proposals: props.document.content.proposals.map((proposal) => proposal.id === selectedProposal.id ? { ...proposal, ...patch } : proposal) });
      return;
    }
    changeGraph(props.document, props.onChange, { edges: props.document.content.edges.map((edge) => edge.id === selectedEdge!.id ? { ...edge, ...patch } : edge) });
  }

  function removeSelectedEdge() {
    if (!selectedEdge) return;
    changeGraph(props.document, props.onChange, { edges: props.document.content.edges.filter((edge) => edge.id !== selectedEdge.id) });
    setSelectedEdgeId(null);
  }

  function acceptSelectedProposal() {
    if (!selectedProposal) return;
    const result = acceptRelationProposal(props.document, selectedProposal.id);
    props.onChange(result.document);
    setSelectedEdgeId(result.edge.id);
  }

  function rejectSelectedProposal() {
    if (!selectedProposal) return;
    props.onChange(rejectRelationProposal(props.document, selectedProposal.id));
    setSelectedEdgeId(null);
  }

  function focusSelection() {
    const selected = props.document.content.nodes.find((node) => node.objectId === props.selection.objectId);
    if (selected) void instanceRef.current?.setCenter(selected.x + 90, selected.y + 34, { zoom: 1.25, duration: 160 });
  }

  function handleNodeSelection(object: WorldObjectSummary) {
    props.onSelectObject(object);
    if (!pathMode) return;
    setPathObjects(([start, end]) => !start || end ? [object.id, null] : [start, object.id]);
  }

  function toggleFocus() {
    setFocusObjectId((current) => current ? null : props.selection.objectId);
  }

  return <section className="graph-editor" data-testid="graph-editor" onDragOver={(event) => event.preventDefault()} onDrop={dropObject}>
    <ReactFlow
      nodes={visibleNodes}
      edges={visibleEdges}
      onInit={(instance) => { instanceRef.current = instance; }}
      onNodesChange={handleNodeChanges}
      onNodeDragStop={() => persistNodePositions()}
      onConnect={connect}
      onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); props.onSelectRelation(edge.id); }}
      onNodeClick={(_, node) => {
        const object = objectsById.get(String(node.data.objectId));
        if (!object) return;
        const previous = nodeClickTimers.current.get(node.id);
        if (previous) window.clearTimeout(previous);
        const timer = window.setTimeout(() => {
          nodeClickTimers.current.delete(node.id);
          handleNodeSelection(object);
        }, 180);
        nodeClickTimers.current.set(node.id, timer);
      }}
      onNodeDoubleClick={(_, node) => {
        const pending = nodeClickTimers.current.get(node.id);
        if (pending) window.clearTimeout(pending);
        nodeClickTimers.current.delete(node.id);
        const object = objectsById.get(String(node.data.objectId));
        if (object) props.onOpenObject(object);
      }}
      onMoveEnd={(event, viewport) => {
        if (!event) return;
        props.onChange({ ...props.document, viewport: { x: round(viewport.x), y: round(viewport.y), zoom: round(viewport.zoom) } });
      }}
      defaultViewport={props.document.viewport}
      fitView={fitOnMount || (props.document.content.nodes.length > 0 && props.document.viewport.x === 0 && props.document.viewport.y === 0)}
      minZoom={0.25}
      maxZoom={2.5}
      proOptions={{ hideAttribution: true }}
      deleteKeyCode={null}
      edgesReconnectable={false}
      nodesConnectable
      nodesDraggable
    >
      <Background color="rgba(117, 170, 159, .16)" gap={24} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable nodeColor={(node) => String(node.style?.borderColor || "#63c3b5")} maskColor="rgba(5, 10, 10, .72)" />
    </ReactFlow>

    <div className="visual-floating-toolbar graph-toolbar" aria-label="图谱工具">
      <button type="button" onClick={props.onUndo} disabled={!props.canUndo} title="撤销"><Undo2 /></button>
      <button type="button" onClick={props.onRedo} disabled={!props.canRedo} title="重做"><Redo2 /></button>
      <span />
      <button type="button" onClick={autoLayout} title="自动布局"><LayoutGrid /></button>
      <button type="button" onClick={focusSelection} disabled={!props.selection.objectId} title="定位当前对象"><Focus /></button>
      <button type="button" className={focusObjectId ? "is-active" : ""} onClick={toggleFocus} disabled={!props.selection.objectId} title="只看当前对象的一度关系"><Link2 /></button>
      <button type="button" className={pathMode ? "is-active" : ""} onClick={() => { setPathMode((value) => !value); setPathObjects([null, null]); }} title="解释两点间的关系路径"><Route /></button>
      <label className="graph-search" title="搜索对象"><Search /><input aria-label="搜索图谱对象" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索对象" /></label>
      <label title="筛选对象类型"><Filter /><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as WorldObjectType | "all")}><option value="all">全部对象</option>{[...new Set(props.objects.map((object) => object.type))].map((type) => <option value={type} key={type}>{objectTypeLabel(type)}</option>)}</select></label>
      <label title="筛选关系"><select aria-label="筛选关系" value={relationFilter} onChange={(event) => setRelationFilter(event.target.value)}><option value="all">全部关系</option>{[...new Set(props.document.content.edges.map((edge) => edge.relation))].map((relation) => <option value={relation} key={relation}>{relation}</option>)}</select></label>
    </div>

    {pathMode && <div className="graph-path-status" data-testid="graph-path-status"><Route /><span><strong>{pathObjects[0] ? objectsById.get(pathObjects[0])?.title : "选择起点"}{pathObjects[1] ? ` → ${objectsById.get(pathObjects[1])?.title}` : " → 选择终点"}</strong><small>{pathObjects[1] ? path ? `${path.edgeIds.length} 段已确认关系` : "没有已确认的关系路径" : "依次点击两个对象，只使用作者已确认的关系"}</small></span>{pathObjects[0] && <button type="button" onClick={() => setPathObjects([null, null])} aria-label="清除路径"><X /></button>}</div>}

    {props.document.content.nodes.length === 0 && <div className="graph-empty-overlay"><strong>把世界资料拖到图谱中</strong><p>人物、地点、势力和事件都会继续引用同一份 Markdown 内容。</p></div>}

    {selectedRelationship && <aside className={`relation-inspector ${selectedProposal ? "is-proposal" : ""}`}>
      <header><span>{selectedProposal ? "待确认关系" : "已确认关系"}</span>{selectedEdge && <button type="button" onClick={removeSelectedEdge} aria-label="删除关系"><Trash2 /></button>}</header>
      {selectedProposal && <p className="relationship-provenance">来自{selectedProposal.origin === "tree" ? "树中的关系提案" : "图谱连线"}，尚未进入正式关系。</p>}
      <label><span>类型</span><select value={selectedRelationship.relation} onChange={(event) => {
        const template = RELATION_TEMPLATES.find((item) => item.relation === event.target.value);
        updateSelectedRelationship({ relation: event.target.value, ...(template ? { direction: template.direction } : {}) });
      }}>{groupedRelationOptions()}</select></label>
      <label><span>方向</span><select value={selectedRelationship.direction} onChange={(event) => updateSelectedRelationship({ direction: event.target.value as GraphEdge["direction"] })}><option value="none">无方向</option><option value="forward">起点到终点</option><option value="reverse">终点到起点</option><option value="both">双向</option></select></label>
      {selectedProposal && <div className="proposal-actions"><button type="button" className="primary-action" onClick={acceptSelectedProposal}><Check />采用关系</button><button type="button" className="quiet-action" onClick={rejectSelectedProposal}><X />撤回</button></div>}
    </aside>}
  </section>;
}

function toFlowNodes(nodes: GraphNode[], objectsById: Map<string, WorldObjectSummary>, selectedObjectId: string | null, candidateObjectIds: string[]): Node[] {
  return nodes.map((node) => {
    const object = objectsById.get(node.objectId);
    const missing = !object;
    return {
      id: node.id,
      position: { x: node.x, y: node.y },
      data: { label: missing ? "对象已缺失" : object.title, objectId: node.objectId, missing },
      selected: !missing && object.id === selectedObjectId,
      style: {
        width: 180,
        minHeight: 68,
        borderRadius: 6,
        border: missing
          ? "1px dashed rgba(231,126,114,.72)"
          : `1px solid ${object.id === selectedObjectId ? "#f0b56f" : candidateObjectIds.includes(object.id) ? "#67c3b5" : typeColor(object.type)}`,
        background: "rgba(9, 18, 17, .96)",
        color: missing ? "#efaaa2" : "#eef3ef",
        fontSize: 12,
        boxShadow: !missing && candidateObjectIds.includes(object.id) ? "0 0 0 3px rgba(103,195,181,.14), 0 12px 30px rgba(0,0,0,.24)" : "0 12px 30px rgba(0,0,0,.24)"
      }
    };
  });
}

function toFlowEdges(edges: GraphEdge[], proposals: GraphRelationProposal[]): Edge[] {
  return [...edges.map((edge) => ({ edge, proposal: false })), ...proposals.map((edge) => ({ edge, proposal: true }))].map(({ edge, proposal }) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: proposal ? `待确认 · ${edge.relation}` : edge.relation,
    type: "smoothstep",
    markerEnd: edge.direction === "forward" || edge.direction === "both" ? { type: MarkerType.ArrowClosed, color: "#d08b43" } : undefined,
    markerStart: edge.direction === "reverse" || edge.direction === "both" ? { type: MarkerType.ArrowClosed, color: "#d08b43" } : undefined,
    style: { stroke: proposal ? "#63c3b5" : "#d08b43", strokeWidth: proposal ? 2 : 1.5, strokeDasharray: proposal ? "6 5" : undefined },
    labelStyle: { fill: proposal ? "#9de0d6" : "#d8c19d", fontSize: 10 },
    labelBgStyle: { fill: "#0a1211", fillOpacity: 0.9 }
  }));
}

function groupedRelationOptions() {
  return [...new Set(RELATION_TEMPLATES.map((item) => item.group))].map((group) => <optgroup label={group} key={group}>{RELATION_TEMPLATES.filter((item) => item.group === group).map((item) => <option value={item.relation} key={item.relation}>{item.relation}</option>)}</optgroup>);
}

function changeGraph(document: GraphDocument, onChange: (document: GraphDocument) => void, content: Partial<GraphDocument["content"]>) {
  onChange({ ...document, content: { ...document.content, ...content } });
}

function nextId(prefix: string, existing: string[]): string {
  for (let index = 1; index < 10_000; index += 1) {
    const id = `${prefix}.${index}`;
    if (!existing.includes(id)) return id;
  }
  throw new Error(`Could not create ${prefix} id.`);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function typeColor(type: WorldObjectType): string {
  return ({ character: "#63c3b5", location: "#d08b43", event: "#b49ad6", item: "#9fb7d1", faction: "#d5a2a2", rule: "#a8b58c", thread: "#d5c27a" })[type];
}
