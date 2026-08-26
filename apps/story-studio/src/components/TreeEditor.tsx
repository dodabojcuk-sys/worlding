import dagre from "@dagrejs/dagre";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node, type ReactFlowInstance } from "@xyflow/react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, ChevronsUpDown, Focus, GitFork, LayoutGrid, Plus, Redo2, Undo2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { GraphDocument, GraphEdge, GraphRelationProposal, TreeDocument, WorldObjectSummary } from "../lib/localTransport";
import { acceptRelationProposal, createRelationProposal, RELATION_TEMPLATES, rejectRelationProposal, type RelationPlacement } from "../lib/graphAuthoring";
import type { WorkspaceSelection } from "../../../../src/productWorkspace/storyStudioWorkspaceSelection";

export function TreeEditor(props: {
  document: TreeDocument;
  graphs: GraphDocument[];
  objects: WorldObjectSummary[];
  selection: WorkspaceSelection;
  canUndo: boolean;
  canRedo: boolean;
  onChange(document: TreeDocument): void;
  onUndo(): void;
  onRedo(): void;
  onSelectObject(object: WorldObjectSummary): void;
  onSelectRelation(relationId: string): void;
  onOpenObject(object: WorldObjectSummary): void;
  onSaveSourceGraph(document: GraphDocument): Promise<{ conflict: boolean; document: GraphDocument }>;
  sourceGraphWritable: boolean;
  candidateObjectIds: string[];
}) {
  const propSource = props.graphs.find((graph) => graph.relativePath === props.document.content.sourceGraphPath) || null;
  const [sourceOverride, setSourceOverride] = useState<GraphDocument | null>(null);
  const source = sourceOverride?.relativePath === props.document.content.sourceGraphPath ? sourceOverride : propSource;
  const objectsById = useMemo(() => new Map(props.objects.map((object) => [object.id, object])), [props.objects]);
  const projection = useMemo(() => buildTreeProjection(props.document, source, objectsById, props.selection.objectId, props.candidateObjectIds), [props.document, source, objectsById, props.selection.objectId, props.candidateObjectIds]);
  const instanceRef = useRef<ReactFlowInstance | null>(null);
  const [targetObjectId, setTargetObjectId] = useState("");
  const [relation, setRelation] = useState("关联");
  const [proposalError, setProposalError] = useState("");
  const [conflictingSource, setConflictingSource] = useState<GraphDocument | null>(null);

  useEffect(() => {
    if (!sourceOverride) return;
    if (!propSource || propSource.relativePath !== sourceOverride.relativePath) setSourceOverride(null);
    else if (propSource.contentHash === sourceOverride.contentHash) setSourceOverride(null);
  }, [propSource, sourceOverride]);

  useEffect(() => {
    let timeout = 0;
    const fit = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => void instanceRef.current?.fitView({ padding: 0.28, duration: 0 }), 40);
    };
    window.addEventListener("resize", fit);
    fit();
    return () => { window.removeEventListener("resize", fit); window.clearTimeout(timeout); };
  }, [projection.nodes.length, projection.edges.length, props.document.content.direction, props.document.content.sourceGraphPath]);

  function chooseSource(relativePath: string) {
    const graph = props.graphs.find((item) => item.relativePath === relativePath);
    changeTree(props.document, props.onChange, graph ? {
      sourceGraphPath: graph.relativePath,
      includedEdgeIds: graph.content.edges.map((edge) => edge.id),
      rootObjectIds: graph.content.nodes[0] ? [graph.content.nodes[0].objectId] : [],
      collapsedObjectIds: []
    } : { sourceGraphPath: "", includedEdgeIds: [], rootObjectIds: [], collapsedObjectIds: [] });
  }

  function toggleEdge(edgeId: string) {
    const next = props.document.content.includedEdgeIds.includes(edgeId)
      ? props.document.content.includedEdgeIds.filter((id) => id !== edgeId)
      : [...props.document.content.includedEdgeIds, edgeId];
    changeTree(props.document, props.onChange, { includedEdgeIds: next });
  }

  function toggleRoot(objectId: string) {
    const next = props.document.content.rootObjectIds.includes(objectId)
      ? props.document.content.rootObjectIds.filter((id) => id !== objectId)
      : [...props.document.content.rootObjectIds, objectId];
    changeTree(props.document, props.onChange, { rootObjectIds: next });
  }

  function focusAsRoot() {
    if (!props.selection.objectId) return;
    const rootObjectIds = props.document.content.rootObjectIds.includes(props.selection.objectId)
      ? props.document.content.rootObjectIds
      : [...props.document.content.rootObjectIds, props.selection.objectId];
    if (rootObjectIds !== props.document.content.rootObjectIds) changeTree(props.document, props.onChange, { rootObjectIds });
    const selected = projection.nodes.find((node) => node.data.objectId === props.selection.objectId);
    if (selected) void instanceRef.current?.setCenter(selected.position.x + 88, selected.position.y + 32, { zoom: 1.2, duration: 160 });
  }

  function toggleCollapsed(objectId: string) {
    if (!objectId || !source?.content.nodes.some((node) => node.objectId === objectId)) return;
    const next = props.document.content.collapsedObjectIds.includes(objectId)
      ? props.document.content.collapsedObjectIds.filter((id) => id !== objectId)
      : [...props.document.content.collapsedObjectIds, objectId];
    changeTree(props.document, props.onChange, { collapsedObjectIds: next });
  }

  async function proposeRelationship(placement: RelationPlacement) {
    if (!source || !props.selection.objectId || !targetObjectId || !props.sourceGraphWritable) return;
    const template = RELATION_TEMPLATES.find((item) => item.relation === relation) || RELATION_TEMPLATES[0];
    setProposalError("");
    try {
      const created = createRelationProposal({
        document: source,
        anchorObjectId: props.selection.objectId,
        targetObjectId,
        relation,
        direction: template.direction,
        placement,
        origin: "tree",
        sourceDocumentId: props.document.id
      });
      const result = await props.onSaveSourceGraph(created.document);
      if (result.conflict) {
        setProposalError("来源图谱已被外部修改，请重新读取后再提出关系。");
        setConflictingSource(result.document);
        return;
      }
      setConflictingSource(null);
      setSourceOverride(result.document);
      setTargetObjectId("");
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : "无法创建关系提案。");
    }
  }

  async function resolveProposal(proposal: GraphRelationProposal, accepted: boolean) {
    if (!source || !props.sourceGraphWritable) return;
    setProposalError("");
    try {
      const acceptedResult = accepted ? acceptRelationProposal(source, proposal.id) : null;
      const next = acceptedResult?.document || rejectRelationProposal(source, proposal.id);
      const result = await props.onSaveSourceGraph(next);
      if (result.conflict) {
        setProposalError("来源图谱已改变，本次决定没有覆盖磁盘内容。");
        setConflictingSource(result.document);
        return;
      }
      setConflictingSource(null);
      setSourceOverride(result.document);
      if (acceptedResult && !props.document.content.includedEdgeIds.includes(acceptedResult.edge.id)) {
        changeTree(props.document, props.onChange, { includedEdgeIds: [...props.document.content.includedEdgeIds, acceptedResult.edge.id] });
      }
    } catch (error) {
      setProposalError(error instanceof Error ? error.message : "无法处理关系提案。");
    }
  }

  return <section className="tree-editor" data-testid="tree-editor">
    <header className="tree-toolbar">
      <div className="history-actions">
        <button type="button" onClick={props.onUndo} disabled={!props.canUndo} title="撤销"><Undo2 /></button>
        <button type="button" onClick={props.onRedo} disabled={!props.canRedo} title="重做"><Redo2 /></button>
      </div>
      <label><GitFork /><span>关系来源</span><select aria-label="树的关系图谱" value={props.document.content.sourceGraphPath} onChange={(event) => chooseSource(event.target.value)}><option value="">选择现有图谱</option>{props.graphs.map((graph) => <option value={graph.relativePath} key={graph.relativePath}>{graph.title}</option>)}</select></label>
      <details className="tree-root-picker"><summary>根对象 · {props.document.content.rootObjectIds.length || "全部"}</summary><div>{source?.content.nodes.flatMap((node) => { const object = objectsById.get(node.objectId); return object ? [<label key={object.id}><input type="checkbox" checked={props.document.content.rootObjectIds.includes(object.id)} onChange={() => toggleRoot(object.id)} /><span>{object.title}</span></label>] : []; })}<button type="button" onClick={() => changeTree(props.document, props.onChange, { rootObjectIds: [] })}>显示全部</button></div></details>
      <button type="button" className="quiet-action" onClick={() => changeTree(props.document, props.onChange, { direction: props.document.content.direction === "LR" ? "TB" : "LR" })}><LayoutGrid />{props.document.content.direction === "LR" ? "横向" : "纵向"}</button>
      <button type="button" className="quiet-action" disabled={!props.selection.objectId || !source} onClick={focusAsRoot}><Focus />聚焦</button>
      <button type="button" className="quiet-action" disabled={!props.selection.objectId} onClick={() => { const object = props.selection.objectId ? objectsById.get(props.selection.objectId) : null; if (object) props.onOpenObject(object); }} title="打开当前对象"><BookOpen />资料卡</button>
      <button type="button" className="quiet-action" disabled={!props.selection.objectId || !source} onClick={() => props.selection.objectId && toggleCollapsed(props.selection.objectId)}><ChevronsUpDown />{props.selection.objectId && props.document.content.collapsedObjectIds.includes(props.selection.objectId) ? "展开分支" : "收起分支"}</button>
    </header>

    {!source ? <div className="tree-empty-state"><GitFork /><strong>选择一份关系图谱</strong><p>Tree 只投影图谱中已存在的关系，不会创建第二套人物或家族真值。</p></div> : <>
      <div className="tree-canvas">
        {props.document.content.rootObjectIds.length > 0 && <div className="tree-root-strip" data-testid="tree-root-strip"><span>根对象</span>{props.document.content.rootObjectIds.map((objectId) => {
          const object = objectsById.get(objectId);
          return <button type="button" key={objectId} className={props.selection.objectId === objectId ? "is-focused" : ""} onClick={() => object && props.onSelectObject(object)} disabled={!object}>{object?.title || "对象已缺失"}</button>;
        })}</div>}
        <ReactFlow
          nodes={projection.nodes}
          edges={projection.edges}
          onInit={(instance) => { instanceRef.current = instance; }}
          fitView
          minZoom={0.35}
          maxZoom={2.2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          deleteKeyCode={null}
          proOptions={{ hideAttribution: true }}
          onNodeClick={(_, node) => { const object = objectsById.get(String(node.data.objectId)); if (object) props.onSelectObject(object); }}
          onNodeDoubleClick={(_, node) => { const object = objectsById.get(String(node.data.objectId)); if (object) props.onOpenObject(object); }}
          onEdgeClick={(_, edge) => props.onSelectRelation(edge.id)}
        >
          <Background color="rgba(117, 170, 159, .14)" gap={24} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <aside className="tree-relation-panel">
        <header><strong>关系范围</strong><small>来自《{source.title}》</small></header>
        {source.content.edges.map((edge) => <label key={edge.id}><input type="checkbox" checked={props.document.content.includedEdgeIds.includes(edge.id)} onChange={() => toggleEdge(edge.id)} /><span><strong>{edge.relation}</strong><small>{edgeLabel(edge, source, objectsById)}</small></span></label>)}
        {source.content.edges.length === 0 && <p>这份图谱还没有关系。请先回到图谱编辑真实关系。</p>}
        {(source.content.proposals || []).length > 0 && <section className="tree-proposal-list" data-testid="tree-proposal-list"><h3>等待作者决定</h3>{source.content.proposals.map((proposal) => <article key={proposal.id}><span><strong>{proposal.relation}</strong><small>{edgeLabel(proposal, source, objectsById)} · {proposal.origin === "tree" ? "树中提出" : "图谱连线"}</small></span><div><button type="button" className="primary-action" onClick={() => void resolveProposal(proposal, true)} disabled={!props.sourceGraphWritable} title="采用关系"><Check /></button><button type="button" className="quiet-action" onClick={() => void resolveProposal(proposal, false)} disabled={!props.sourceGraphWritable} title="撤回提案"><X /></button></div></article>)}</section>}
      </aside>
      <aside className="tree-proposal-builder" data-testid="tree-proposal-builder">
        <header><Plus /><span><strong>提出关系</strong><small>{props.selection.objectId ? `从 ${objectsById.get(props.selection.objectId)?.title || "当前对象"} 出发` : "先选择树中的对象"}</small></span></header>
        <div className="tree-proposal-fields"><select aria-label="关系目标对象" value={targetObjectId} onChange={(event) => setTargetObjectId(event.target.value)} disabled={!props.selection.objectId}><option value="">选择另一个世界对象</option>{props.objects.filter((object) => object.id !== props.selection.objectId).map((object) => <option value={object.id} key={object.id}>{object.title}</option>)}</select><select aria-label="关系模板" value={relation} onChange={(event) => setRelation(event.target.value)}>{groupedRelationOptions()}</select></div>
        <div className="tree-direction-actions"><button type="button" disabled={!targetObjectId || !props.sourceGraphWritable} onClick={() => void proposeRelationship("above")} title="在上方提出关系"><ArrowUp /></button><button type="button" disabled={!targetObjectId || !props.sourceGraphWritable} onClick={() => void proposeRelationship("left")} title="在左侧提出关系"><ArrowLeft /></button><button type="button" disabled={!targetObjectId || !props.sourceGraphWritable} onClick={() => void proposeRelationship("right")} title="在右侧提出关系"><ArrowRight /></button><button type="button" disabled={!targetObjectId || !props.sourceGraphWritable} onClick={() => void proposeRelationship("below")} title="在下方提出关系"><ArrowDown /></button></div>
        {!props.sourceGraphWritable && <p>来源图谱有未保存修改，保存后才能提出新关系。</p>}
        {proposalError && <p role="alert">{proposalError}{conflictingSource && <button type="button" className="tree-source-reload" onClick={() => { setSourceOverride(conflictingSource); setConflictingSource(null); setProposalError(""); }}>重新读取来源图谱</button>}</p>}
      </aside>
    </>}
  </section>;
}

function buildTreeProjection(document: TreeDocument, graph: GraphDocument | null, objectsById: Map<string, WorldObjectSummary>, selectedObjectId: string | null, candidateObjectIds: string[]): { nodes: Node[]; edges: Edge[] } {
  if (!graph) return { nodes: [], edges: [] };
  const allowedEdges = graph.content.edges.filter((edge) => document.content.includedEdgeIds.includes(edge.id));
  const proposals = graph.content.proposals || [];
  const graphNodesById = new Map(graph.content.nodes.map((node) => [node.id, node]));
  const collapsed = new Set(document.content.collapsedObjectIds);
  const oriented = allowedEdges.map((edge) => ({ ...orientEdge(edge), proposal: false }));
  const orientedProposals = proposals.map((edge) => ({ ...orientEdge(edge), proposal: true }));
  const allOriented = [...oriented, ...orientedProposals];
  const rootNodeIds = new Set(graph.content.nodes.filter((node) => document.content.rootObjectIds.includes(node.objectId)).map((node) => node.id));
  const visibleNodeIds = rootNodeIds.size > 0 ? reachableNodes(rootNodeIds, allOriented, graphNodesById, collapsed) : new Set(allOriented.flatMap((edge) => [edge.source, edge.target]));
  for (const root of rootNodeIds) visibleNodeIds.add(root);
  const visibleEdges = allOriented.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target) && !collapsed.has(graphNodesById.get(edge.source)?.objectId || ""));

  const layout = new dagre.graphlib.Graph();
  layout.setDefaultEdgeLabel(() => ({}));
  layout.setGraph({ rankdir: document.content.direction, nodesep: 42, ranksep: 100, marginx: 38, marginy: 38 });
  for (const nodeId of visibleNodeIds) layout.setNode(nodeId, { width: 176, height: 64 });
  for (const edge of visibleEdges) layout.setEdge(edge.source, edge.target);
  dagre.layout(layout);

  const nodes = [...visibleNodeIds].flatMap((nodeId) => {
    const graphNode = graphNodesById.get(nodeId);
    const object = graphNode ? objectsById.get(graphNode.objectId) : null;
    const point = layout.node(nodeId);
    if (!graphNode || !point) return [];
    const missing = !object;
    const candidate = !missing && candidateObjectIds.includes(object.id);
    return [{
      id: nodeId,
      position: { x: point.x - 88, y: point.y - 32 },
      data: { label: missing ? "对象已缺失" : object.title, objectId: graphNode.objectId, missing },
      selected: !missing && selectedObjectId === object.id,
      style: {
        width: 176,
        minHeight: 64,
        borderRadius: 6,
        border: missing ? "1px dashed rgba(231,126,114,.72)" : `1px solid ${selectedObjectId === object.id ? "#f0b56f" : candidate ? "#63c3b5" : "rgba(126, 174, 163, .42)"}`,
        background: "rgba(9, 18, 17, .96)",
        color: missing ? "#efaaa2" : "#eef3ef",
        fontSize: 12,
        boxShadow: candidate ? "0 0 0 3px rgba(99,195,181,.14)" : "0 12px 30px rgba(0,0,0,.2)"
      }
    }];
  });
  const edges = visibleEdges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.proposal ? `待确认 · ${edge.relation}` : edge.relation,
    type: "smoothstep",
    markerEnd: { type: MarkerType.ArrowClosed, color: edge.proposal ? "#63c3b5" : "#d08b43" },
    style: { stroke: edge.proposal ? "#63c3b5" : "#d08b43", strokeWidth: edge.proposal ? 2 : 1.4, strokeDasharray: edge.proposal ? "6 5" : undefined },
    labelStyle: { fill: edge.proposal ? "#9de0d6" : "#d8c19d", fontSize: 10 },
    labelBgStyle: { fill: "#0a1211", fillOpacity: 0.9 }
  }));
  return { nodes, edges };
}

function orientEdge(edge: GraphEdge): GraphEdge {
  return edge.direction === "reverse" ? { ...edge, source: edge.target, target: edge.source } : edge;
}

function reachableNodes(roots: Set<string>, edges: GraphEdge[], nodesById: Map<string, { objectId: string }>, collapsed: Set<string>): Set<string> {
  const visible = new Set(roots);
  const queue = [...roots];
  while (queue.length > 0) {
    const source = queue.shift()!;
    if (collapsed.has(nodesById.get(source)?.objectId || "")) continue;
    for (const edge of edges.filter((item) => item.source === source)) {
      if (visible.has(edge.target)) continue;
      visible.add(edge.target);
      queue.push(edge.target);
    }
  }
  return visible;
}

function edgeLabel(edge: GraphEdge, graph: GraphDocument, objectsById: Map<string, WorldObjectSummary>): string {
  const nodes = new Map(graph.content.nodes.map((node) => [node.id, node.objectId]));
  return `${objectsById.get(nodes.get(edge.source) || "")?.title || "未知对象"} → ${objectsById.get(nodes.get(edge.target) || "")?.title || "未知对象"}`;
}

function changeTree(document: TreeDocument, onChange: (document: TreeDocument) => void, content: Partial<TreeDocument["content"]>) {
  onChange({ ...document, content: { ...document.content, ...content } });
}

function groupedRelationOptions() {
  return [...new Set(RELATION_TEMPLATES.map((item) => item.group))].map((group) => <optgroup label={group} key={group}>{RELATION_TEMPLATES.filter((item) => item.group === group).map((item) => <option value={item.relation} key={item.relation}>{item.relation}</option>)}</optgroup>);
}
