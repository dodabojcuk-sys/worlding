import {
  addEdge,
  applyNodeChanges,
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type ReactFlowInstance
} from "@xyflow/react";
import { FileText, ImagePlus, Images, Redo2, Shapes, Trash2, Undo2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";

import type { WorkspaceSelection } from "../../../../src/productWorkspace/storyStudioWorkspaceSelection";
import { visualAssetUrl, type CanvasDocument, type CanvasEdge, type CanvasNode, type VisualAsset, type WorldObjectSummary } from "../lib/localTransport";

export function CanvasEditor(props: {
  projectId: string;
  document: CanvasDocument;
  objects: WorldObjectSummary[];
  selection: WorkspaceSelection;
  canUndo: boolean;
  canRedo: boolean;
  onChange(document: CanvasDocument): void;
  onUndo(): void;
  onRedo(): void;
  onImportImage(file: File): Promise<VisualAsset>;
  onSelectObject(object: WorldObjectSummary, nodeId: string): void;
  onSelectRelation(relationId: string): void;
  onOpenObject(object: WorldObjectSummary): void;
  candidateObjectIds: string[];
}) {
  const objectsById = useMemo(() => new Map(props.objects.map((object) => [object.id, object])), [props.objects]);
  const [flowNodes, setFlowNodes] = useState<Node[]>(() => toFlowNodes(props.projectId, props.document.content.nodes, objectsById, props.selection.objectId, props.candidateObjectIds));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const instanceRef = useRef<ReactFlowInstance | null>(null);

  useEffect(() => {
    setFlowNodes(toFlowNodes(props.projectId, props.document.content.nodes, objectsById, props.selection.objectId, props.candidateObjectIds));
  }, [props.document.content.nodes, objectsById, props.projectId, props.selection.objectId, props.candidateObjectIds]);

  function handleNodeChanges(changes: NodeChange[]) {
    setFlowNodes((nodes) => applyNodeChanges(changes, nodes));
  }

  function persistNodePositions(nodes = flowNodes) {
    const positions = new Map(nodes.map((node) => [node.id, node.position]));
    changeCanvas(props.document, props.onChange, {
      nodes: props.document.content.nodes.map((node) => {
        const position = positions.get(node.id);
        return position ? { ...node, x: round(position.x), y: round(position.y) } : node;
      })
    });
  }

  function connect(connection: Connection) {
    if (!connection.source || !connection.target || connection.source === connection.target) return;
    const edge: CanvasEdge = { id: nextId("edge", props.document.content.edges.map((item) => item.id)), source: connection.source, target: connection.target, label: "关联" };
    const next = addEdge(edge, toFlowEdges(props.document.content.edges));
    if (next.length > props.document.content.edges.length) {
      changeCanvas(props.document, props.onChange, { edges: [...props.document.content.edges, edge] });
      setSelectedEdgeId(edge.id);
      props.onSelectRelation(edge.id);
    }
  }

  function dropObject(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const objectId = event.dataTransfer.getData("application/x-story-world-object");
    const object = objectsById.get(objectId);
    const instance = instanceRef.current;
    if (!object || !instance) return;
    const position = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const node: CanvasNode = { id: nextId("node", props.document.content.nodes.map((item) => item.id)), kind: "object", objectId, text: "", assetPath: "", x: round(position.x), y: round(position.y), width: 220, height: 110 };
    changeCanvas(props.document, props.onChange, { nodes: [...props.document.content.nodes, node] });
    props.onSelectObject(object, node.id);
  }

  function addTextNode() {
    const node: CanvasNode = { id: nextId("node", props.document.content.nodes.map((item) => item.id)), kind: "text", objectId: "", text: "新的画布笔记", assetPath: "", x: 160 + props.document.content.nodes.length * 24, y: 140 + props.document.content.nodes.length * 20, width: 240, height: 120 };
    changeCanvas(props.document, props.onChange, { nodes: [...props.document.content.nodes, node] });
    setSelectedNodeId(node.id);
  }

  async function addImageNode(file: File) {
    const asset = await props.onImportImage(file);
    const node: CanvasNode = { id: nextId("node", props.document.content.nodes.map((item) => item.id)), kind: "image", objectId: "", text: file.name, assetPath: asset.relativePath, x: 190 + props.document.content.nodes.length * 22, y: 160 + props.document.content.nodes.length * 18, width: 260, height: 180 };
    changeCanvas(props.document, props.onChange, { nodes: [...props.document.content.nodes, node] });
    setSelectedNodeId(node.id);
  }

  function addGroup() {
    if (!props.document.content.nodes.length) return;
    const id = nextId("group", props.document.content.groups.map((group) => group.id));
    changeCanvas(props.document, props.onChange, { groups: [...props.document.content.groups, { id, title: `分组 ${props.document.content.groups.length + 1}`, nodeIds: props.document.content.nodes.map((node) => node.id) }] });
  }

  function updateSelectedText(text: string) {
    if (!selectedNodeId) return;
    changeCanvas(props.document, props.onChange, { nodes: props.document.content.nodes.map((node) => node.id === selectedNodeId ? { ...node, text } : node) });
  }

  function removeSelected() {
    if (selectedEdgeId) {
      changeCanvas(props.document, props.onChange, { edges: props.document.content.edges.filter((edge) => edge.id !== selectedEdgeId) });
      setSelectedEdgeId(null);
      return;
    }
    if (!selectedNodeId) return;
    changeCanvas(props.document, props.onChange, {
      nodes: props.document.content.nodes.filter((node) => node.id !== selectedNodeId),
      edges: props.document.content.edges.filter((edge) => edge.source !== selectedNodeId && edge.target !== selectedNodeId),
      groups: props.document.content.groups.map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => id !== selectedNodeId) }))
    });
    setSelectedNodeId(null);
  }

  const selectedNode = props.document.content.nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedEdge = props.document.content.edges.find((edge) => edge.id === selectedEdgeId) || null;

  return <section className="canvas-editor" data-testid="canvas-editor" onDragOver={(event) => event.preventDefault()} onDrop={dropObject}>
    <ReactFlow
      nodes={flowNodes}
      edges={toFlowEdges(props.document.content.edges)}
      onInit={(instance) => { instanceRef.current = instance; }}
      onNodesChange={handleNodeChanges}
      onNodeDragStop={() => persistNodePositions()}
      onConnect={connect}
      onNodeClick={(_, node) => {
        setSelectedNodeId(node.id);
        setSelectedEdgeId(null);
        const canvasNode = props.document.content.nodes.find((item) => item.id === node.id);
        const object = canvasNode?.objectId ? objectsById.get(canvasNode.objectId) : null;
        if (object) props.onSelectObject(object, node.id);
      }}
      onNodeDoubleClick={(_, node) => {
        const canvasNode = props.document.content.nodes.find((item) => item.id === node.id);
        const object = canvasNode?.objectId ? objectsById.get(canvasNode.objectId) : null;
        if (object) props.onOpenObject(object);
      }}
      onEdgeClick={(_, edge) => { setSelectedEdgeId(edge.id); setSelectedNodeId(null); props.onSelectRelation(edge.id); }}
      onMoveEnd={(event, viewport) => { if (event) props.onChange({ ...props.document, viewport: { x: round(viewport.x), y: round(viewport.y), zoom: round(viewport.zoom) } }); }}
      defaultViewport={props.document.viewport}
      fitView={props.document.content.nodes.length > 0 && props.document.viewport.x === 0 && props.document.viewport.y === 0}
      fitViewOptions={{ padding: 0.28, maxZoom: 1.1 }}
      minZoom={0.2}
      maxZoom={2.5}
      deleteKeyCode={null}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="rgba(117, 170, 159, .14)" gap={24} size={1} />
      <Controls showInteractive={false} />
      <MiniMap pannable zoomable maskColor="rgba(5, 10, 10, .72)" />
    </ReactFlow>
    <div className="visual-floating-toolbar canvas-toolbar" aria-label="画布工具">
      <button type="button" onClick={props.onUndo} disabled={!props.canUndo} title="撤销"><Undo2 /></button>
      <button type="button" onClick={props.onRedo} disabled={!props.canRedo} title="重做"><Redo2 /></button>
      <span />
      <button type="button" onClick={addTextNode} title="新增文本"><FileText /></button>
      <label title="新增图片"><ImagePlus /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void addImageNode(file); event.currentTarget.value = ""; }} /></label>
      <button type="button" onClick={addGroup} disabled={!props.document.content.nodes.length} title="将当前节点加入新分组"><Shapes /></button>
    </div>
    {!props.document.content.nodes.length && <div className="graph-empty-overlay"><Images /><strong>把世界资料拖到画布中</strong><p>也可以添加文本和本地图片，再用箭头整理线索。</p></div>}
    {(selectedNode || selectedEdge) && <aside className="canvas-inspector">
      <header><span>{selectedNode ? "画布节点" : "连接"}</span><button type="button" onClick={removeSelected} aria-label="删除选中内容"><Trash2 /></button></header>
      {selectedNode && ["text", "excerpt"].includes(selectedNode.kind) && <label><span>内容</span><textarea value={selectedNode.text} onChange={(event) => updateSelectedText(event.target.value)} /></label>}
      {selectedNode?.kind === "object" && <p>对象节点只引用世界对象，不复制正文。</p>}
      {selectedNode?.kind === "image" && <p>{selectedNode.text || "本地图片"}</p>}
      {selectedEdge && <label><span>标签</span><input value={selectedEdge.label} onChange={(event) => changeCanvas(props.document, props.onChange, { edges: props.document.content.edges.map((edge) => edge.id === selectedEdge.id ? { ...edge, label: event.target.value } : edge) })} /></label>}
      {props.document.content.groups.length > 0 && <div className="canvas-group-list">{props.document.content.groups.map((group) => <span key={group.id}>{group.title} · {group.nodeIds.length}</span>)}</div>}
    </aside>}
  </section>;
}

function toFlowNodes(projectId: string, nodes: CanvasNode[], objects: Map<string, WorldObjectSummary>, selectedObjectId: string | null, candidateObjectIds: string[]): Node[] {
  return nodes.map((node) => {
    const object = node.objectId ? objects.get(node.objectId) : null;
    let label: ReactNode = node.text;
    if (node.kind === "object") label = <div className="canvas-object-node"><small>{object?.type || "对象"}</small><strong>{object?.title || "缺失对象"}</strong></div>;
    if (node.kind === "image") label = <div className="canvas-image-node"><img src={visualAssetUrl(projectId, node.assetPath)} alt={node.text || "画布图片"} /><span>{node.text}</span></div>;
    return {
      id: node.id,
      position: { x: node.x, y: node.y },
      data: { label, objectId: node.objectId, kind: node.kind },
      selected: Boolean(node.objectId && node.objectId === selectedObjectId),
      style: {
        width: node.width,
        minHeight: node.height,
        borderRadius: 6,
        border: `1px solid ${node.objectId === selectedObjectId ? "#d08b43" : candidateObjectIds.includes(node.objectId) ? "#67c3b5" : "rgba(103,195,181,.38)"}`,
        background: "rgba(9, 18, 17, .97)",
        color: "#eef3ef",
        fontSize: 11,
        boxShadow: candidateObjectIds.includes(node.objectId) ? "0 0 0 3px rgba(103,195,181,.14), 0 12px 30px rgba(0,0,0,.24)" : "0 12px 30px rgba(0,0,0,.24)",
        padding: node.kind === "image" ? 0 : 12,
        overflow: "hidden"
      }
    };
  });
}

function toFlowEdges(edges: CanvasEdge[]): Edge[] {
  return edges.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target, label: edge.label, type: "smoothstep", style: { stroke: "#d08b43", strokeWidth: 1.5 }, labelStyle: { fill: "#d8c19d", fontSize: 10 }, labelBgStyle: { fill: "#0a1211", fillOpacity: 0.9 } }));
}

function changeCanvas(document: CanvasDocument, onChange: (document: CanvasDocument) => void, content: Partial<CanvasDocument["content"]>) {
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
