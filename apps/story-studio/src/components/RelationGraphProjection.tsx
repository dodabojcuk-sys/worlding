import dagre from "@dagrejs/dagre";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { Filter, Focus, Search } from "lucide-react";
import { useMemo, useState } from "react";

import type { RelationRecord, WorldObjectSummary, WorldObjectType } from "../lib/localTransport";
import { objectTypeLabel } from "../worldObjectCatalog";

type GraphStatus = "confirmed" | "candidate" | "archived" | "all";

export function RelationGraphProjection(props: {
  objects: WorldObjectSummary[];
  relations: RelationRecord[];
  query: string;
  onOpenObject(object: WorldObjectSummary): void;
  onOpenRelation(relationId: string): void;
}) {
  const [status, setStatus] = useState<GraphStatus>("confirmed");
  const [type, setType] = useState<WorldObjectType | "all">("all");
  const [search, setSearch] = useState("");
  const [focusObjectId, setFocusObjectId] = useState("");
  const objectsById = useMemo(() => new Map(props.objects.map((object) => [object.id, object])), [props.objects]);
  const records = useMemo(() => props.relations.filter((relation) => {
    if (status === "confirmed" && (relation.reviewState !== "confirmed" || relation.archived)) return false;
    if (status === "candidate" && (relation.reviewState !== "candidate" || relation.archived)) return false;
    if (status === "archived" && !relation.archived) return false;
    return Boolean(objectsById.get(relation.sourceObjectId) && objectsById.get(relation.targetObjectId));
  }), [objectsById, props.relations, status]);
  const normalized = `${props.query} ${search}`.trim().toLocaleLowerCase("zh-CN");
  const graph = useMemo(() => createRelationGraphProjection({ objectsById, relations: records, normalized, type, focusObjectId }), [focusObjectId, normalized, objectsById, records, type]);
  const labels = useMemo(() => [...new Set(records.flatMap((relation) => [relation.sourceObjectId, relation.targetObjectId]))]
    .map((id) => objectsById.get(id)).filter((object): object is WorldObjectSummary => Boolean(object)), [objectsById, records]);

  if (!records.length) return <section className="relation-graph-empty" data-testid="relation-graph-empty"><strong>{status === "confirmed" ? "还没有已确认关系" : "没有符合筛选的关系"}</strong><p>先创建已有资料之间的关系候选，并在列表详情中明确确认；图谱不会自动建立或确认关系。</p>{status === "confirmed" && props.relations.some((relation) => relation.reviewState === "candidate" && !relation.archived) ? <button type="button" className="secondary-action" onClick={() => setStatus("candidate")}>查看候选关系</button> : null}</section>;

  return <section className="relation-graph-projection" data-testid="relation-graph-projection" aria-label="关系图谱投影">
    <div className="relation-graph-tools" aria-label="图谱筛选">
      <label><Search aria-hidden="true" /><span className="sr-only">搜索图谱</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索资料或关系" /></label>
      <label><Filter aria-hidden="true" /><span>状态</span><select value={status} onChange={(event) => setStatus(event.target.value as GraphStatus)}><option value="confirmed">已确认</option><option value="candidate">候选</option><option value="archived">已归档</option><option value="all">全部状态</option></select></label>
      <label><span>资料类型</span><select value={type} onChange={(event) => setType(event.target.value as WorldObjectType | "all")}><option value="all">全部类型</option>{[...new Set(labels.map((object) => object.type))].map((value) => <option key={value} value={value}>{objectTypeLabel(value)}</option>)}</select></label>
      <label><Focus aria-hidden="true" /><span>局部聚焦</span><select value={focusObjectId} onChange={(event) => setFocusObjectId(event.target.value)}><option value="">显示全部结果</option>{labels.map((object) => <option key={object.id} value={object.id}>{object.title || "未命名资料"}</option>)}</select></label>
    </div>
    <p className="relation-graph-summary">显示 {graph.relations.length} 条关系、{graph.nodes.length} 份资料。节点与边均来自 Relation repository 的只读投影；拖动和连线已禁用。</p>
    <div className="relation-graph-canvas" aria-label="关系图谱画布（可选视图）">
      <ReactFlow nodes={graph.nodes} edges={graph.edges} nodesDraggable={false} nodesConnectable={false} elementsSelectable onNodeClick={(_, node) => { const object = objectsById.get(String(node.data.objectId)); if (object) props.onOpenObject(object); }} onEdgeClick={(_, edge) => props.onOpenRelation(String(edge.id))} fitView minZoom={0.4} maxZoom={2} proOptions={{ hideAttribution: true }} aria-label="关系图谱；可使用下方列表替代视图">
        <Background color="rgba(117, 170, 159, .14)" gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <section className="relation-graph-list-alternative" aria-labelledby="relation-graph-list-heading">
      <header><h2 id="relation-graph-list-heading">图谱列表替代</h2><small>无需操作画布；按 Tab 可打开资料或关系详情。</small></header>
      <div role="list">{graph.relations.map((relation) => <article key={relation.relationId} role="listitem"><button type="button" onClick={() => { const object = objectsById.get(relation.sourceObjectId); if (object) props.onOpenObject(object); }}>{objectTitle(objectsById, relation.sourceObjectId)}</button><button type="button" onClick={() => props.onOpenRelation(relation.relationId)}>{directionGlyph(relation.direction)} {relation.currentTypeLabel || relation.relationLabelSnapshot} · {stateLabel(relation)}</button><button type="button" onClick={() => { const object = objectsById.get(relation.targetObjectId); if (object) props.onOpenObject(object); }}>{objectTitle(objectsById, relation.targetObjectId)}</button></article>)}</div>
    </section>
  </section>;
}

export function createRelationGraphProjection(input: { objectsById: Map<string, WorldObjectSummary>; relations: RelationRecord[]; normalized?: string; type?: WorldObjectType | "all"; focusObjectId?: string }): { nodes: Node[]; edges: Edge[]; relations: RelationRecord[] } {
  const initial = input.relations.filter((relation) => {
    const source = input.objectsById.get(relation.sourceObjectId); const target = input.objectsById.get(relation.targetObjectId);
    if (!source || !target) return false;
    if (input.type && input.type !== "all" && source.type !== input.type && target.type !== input.type) return false;
    const text = `${source.title} ${target.title} ${relation.currentTypeLabel || relation.relationLabelSnapshot}`.toLocaleLowerCase("zh-CN");
    return !input.normalized || text.includes(input.normalized);
  });
  const relations = input.focusObjectId ? initial.filter((relation) => relation.sourceObjectId === input.focusObjectId || relation.targetObjectId === input.focusObjectId) : initial;
  const ids = [...new Set(relations.flatMap((relation) => [relation.sourceObjectId, relation.targetObjectId]))];
  const layout = new dagre.graphlib.Graph(); layout.setDefaultEdgeLabel(() => ({})); layout.setGraph({ rankdir: "LR", nodesep: 44, ranksep: 96, marginx: 28, marginy: 28 });
  for (const id of ids) layout.setNode(id, { width: 172, height: 68 });
  for (const relation of relations) layout.setEdge(relation.sourceObjectId, relation.targetObjectId, { name: relation.relationId });
  dagre.layout(layout);
  const nodes: Node[] = ids.map((id) => { const object = input.objectsById.get(id)!; const point = layout.node(id); return { id, position: { x: point.x - 86, y: point.y - 34 }, data: { label: <><strong>{object.title || "未命名资料"}</strong><small>{objectTypeLabel(object.type)}</small></>, objectId: object.id }, ariaLabel: `${object.title || "未命名资料"}，${objectTypeLabel(object.type)}；打开资料详情`, style: { width: 172, minHeight: 68, border: "1px solid rgba(103, 195, 181, .48)", borderRadius: 9, background: "#0a1412", color: "#edf5ef", padding: "10px 11px", fontSize: 12 } }; });
  const edges: Edge[] = relations.map((relation) => ({ id: relation.relationId, source: relation.direction === "reverse" ? relation.targetObjectId : relation.sourceObjectId, target: relation.direction === "reverse" ? relation.sourceObjectId : relation.targetObjectId, label: relation.currentTypeLabel || relation.relationLabelSnapshot, ariaLabel: `${objectTitle(input.objectsById, relation.sourceObjectId)} ${directionGlyph(relation.direction)} ${relation.currentTypeLabel || relation.relationLabelSnapshot} ${objectTitle(input.objectsById, relation.targetObjectId)}；打开关系详情`, markerEnd: relation.direction === "none" ? undefined : { type: MarkerType.ArrowClosed, color: "#67c3b5" }, markerStart: relation.direction === "both" ? { type: MarkerType.ArrowClosed, color: "#67c3b5" } : undefined, style: { stroke: relation.archived ? "#9b7c75" : relation.reviewState === "candidate" ? "#d08b43" : "#67c3b5", strokeDasharray: relation.archived || relation.reviewState === "candidate" ? "5 4" : undefined }, labelStyle: { fill: "#d4e5dc", fontSize: 10 }, labelBgStyle: { fill: "#08100f", fillOpacity: .9 }, labelBgPadding: [4, 3] }));
  return { nodes, edges, relations };
}

function objectTitle(objects: Map<string, WorldObjectSummary>, id: string): string { return objects.get(id)?.title || "已失效资料引用"; }
function directionGlyph(direction: RelationRecord["direction"]): string { return direction === "both" ? "↔" : direction === "none" ? "—" : direction === "reverse" ? "←" : "→"; }
function stateLabel(relation: RelationRecord): string { return relation.archived ? "已归档" : relation.reviewState === "candidate" ? "候选" : relation.reviewState === "confirmed" ? "已确认" : "已拒绝"; }
