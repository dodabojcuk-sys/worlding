import { ChevronRight, Map as MapIcon, ShieldCheck } from "lucide-react";

import { createLocationTopologyProjection, type LocationTopologyEdge, type LocationTopologyNode } from "../../../../src/storyContracts/storyStudioLocationTopology.ts";
import type { RelationRecord, WorldObject, WorldObjectSummary } from "../lib/localTransport";
import { objectTypeLabel } from "../worldObjectCatalog";

const HOLDER_RELATION_WORDS = ["held", "holder", "owned", "ownership", "possessed", "持有", "持有人", "拥有", "所属", "携带", "归属"];

export { createLocationTopologyProjection };
export type { LocationTopologyEdge, LocationTopologyNode };

export function LocationTopologyProjection(props: { objects: Array<WorldObjectSummary | WorldObject>; relations: RelationRecord[]; onOpenObject(object: WorldObjectSummary): void; onOpenRelation(relationId: string): void }) {
  const projection = createLocationTopologyProjection({ objects: props.objects, relations: props.relations });
  const objectById = new globalThis.Map(props.objects.map((object) => [object.id, object]));
  return <section className="location-topology-projection" data-testid="location-topology-projection">
    <header><div><strong>地点拓扑</strong><small>只读投影 · 只显示地点对象与已确认关系</small></div><span><MapIcon />{projection.nodes.length} 个地点</span></header>
    {projection.nodes.length ? <div className="location-topology-nodes">{projection.nodes.map((node) => {
      const object = objectById.get(node.objectId);
      if (!object) return null;
      return <button type="button" className="location-topology-node" onClick={() => props.onOpenObject(object)} key={node.objectId}><span><strong>{node.title}</strong><small>{node.region || "区域未建立"}</small></span><ChevronRight /></button>;
    })}</div> : <p className="block-empty-copy">当前还没有可投影的地点对象。</p>}
    <div className="location-topology-edges" aria-label="已确认地点关系">{projection.confirmedEdges.length ? projection.confirmedEdges.map((edge) => <TopologyEdge key={edge.relationId} edge={edge} objectById={objectById} onOpenRelation={props.onOpenRelation} />) : <p className="block-empty-copy">还没有已确认的地点拓扑关系。</p>}</div>
    {projection.candidateEdges.length > 0 && <details className="location-topology-candidates"><summary>候选关系 {projection.candidateEdges.length} 条</summary><div>{projection.candidateEdges.map((edge) => <TopologyEdge key={edge.relationId} edge={edge} objectById={objectById} onOpenRelation={props.onOpenRelation} />)}</div><small>候选与已确认关系分开显示；此投影不会确认或修改 Relation。</small></details>}
  </section>;
}

export function ItemHolderProjection(props: { item: WorldObject; objects: WorldObjectSummary[]; relations: RelationRecord[]; onOpenObject(object: WorldObjectSummary): void; onOpenRelation(relationId: string): void }) {
  const objectById = new globalThis.Map(props.objects.map((object) => [object.id, object]));
  const rows = props.relations.filter((relation) => !relation.archived && (relation.sourceObjectId === props.item.id || relation.targetObjectId === props.item.id) && isHolderRelation(relation)).sort((left, right) => left.relationId.localeCompare(right.relationId));
  const confirmed = rows.filter((relation) => relation.reviewState === "confirmed");
  const candidates = rows.filter((relation) => relation.reviewState === "candidate");
  return <section className="item-holder-projection" data-testid="item-holder-projection"><header><div><strong>持有人与时段</strong><small>Relation 只读投影 · 时间信息来自 Relation temporal metadata</small></div><ShieldCheck /></header>{confirmed.length ? confirmed.map((relation) => <HolderRow key={relation.relationId} itemId={props.item.id} relation={relation} objectById={objectById} onOpenObject={props.onOpenObject} onOpenRelation={props.onOpenRelation} />) : <p className="block-empty-copy">尚未确认持有人关系；没有把持有人写进物品 profile。</p>}{candidates.length > 0 && <details className="item-holder-candidates"><summary>候选持有人 {candidates.length} 条</summary>{candidates.map((relation) => <HolderRow key={relation.relationId} itemId={props.item.id} relation={relation} objectById={objectById} onOpenObject={props.onOpenObject} onOpenRelation={props.onOpenRelation} />)}</details>}</section>;
}

function TopologyEdge(props: { edge: LocationTopologyEdge; objectById: globalThis.Map<string, WorldObjectSummary | WorldObject>; onOpenRelation(relationId: string): void }) {
  const source = props.objectById.get(props.edge.sourceObjectId);
  const target = props.objectById.get(props.edge.targetObjectId);
  return <button type="button" className="location-topology-edge" data-relation-id={props.edge.relationId} onClick={() => props.onOpenRelation(props.edge.relationId)}><span>{source?.title || props.edge.sourceObjectId}</span><strong>{props.edge.label}</strong><span>{target?.title || props.edge.targetObjectId}</span><ChevronRight /></button>;
}

function HolderRow(props: { itemId: string; relation: RelationRecord; objectById: globalThis.Map<string, WorldObjectSummary>; onOpenObject(object: WorldObjectSummary): void; onOpenRelation(relationId: string): void }) {
  const holderId = props.relation.sourceObjectId === props.itemId ? props.relation.targetObjectId : props.relation.sourceObjectId;
  const holder = props.objectById.get(holderId);
  const temporal = props.relation.temporal;
  return <article className={`item-holder-row is-${props.relation.reviewState}`} data-relation-id={props.relation.relationId}><button type="button" onClick={() => holder && props.onOpenObject(holder)}><strong>{holder?.title || holderId}</strong><small>{holder ? objectTypeLabel(holder.type) : "对象缺失"} · {props.relation.currentTypeLabel || props.relation.relationLabelSnapshot}</small></button><span><b>{temporal?.validFrom || "起始未建立"}</b><i>→</i><b>{temporal?.validTo || "当前 / 未建立"}</b><small>{temporal?.confidence === "high" ? "高置信" : temporal?.confidence === "medium" ? "中置信" : temporal?.confidence === "low" ? "低置信" : "置信度未知"}</small></span><button type="button" className="text-action" onClick={() => props.onOpenRelation(props.relation.relationId)}>查看关系</button></article>;
}

function isHolderRelation(relation: RelationRecord): boolean {
  const label = `${relation.currentTypeLabel || ""} ${relation.relationLabelSnapshot}`.toLocaleLowerCase("en-US");
  return HOLDER_RELATION_WORDS.some((word) => label.includes(word.toLocaleLowerCase("en-US")));
}
