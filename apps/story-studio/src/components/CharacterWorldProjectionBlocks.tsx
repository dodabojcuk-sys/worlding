import { AlertTriangle, ChevronRight, Clock3, GitFork, Map, MapPin, Network, Shapes } from "lucide-react";

import type { CharacterRelationDirection } from "../../../../src/storyCardPresentation/characterCardWorldProjection";
import type { ObjectCardBlock, ObjectVisualReference, WorldObject, WorldObjectSummary } from "../lib/localTransport";

type VisualSummary = { id: string; relativePath: string; title: string; type: "map" | "graph" | "canvas" | "timeline" | "tree" };
type OpenContext = { objectId: string; source: "map-marker" | "graph-node" | "graph-edge" | "canvas-node" | "timeline-event" | "tree-node"; documentId: string; blockId?: string | null; relationId?: string | null };

export function RelationGroupBlock(props: {
  block: ObjectCardBlock;
  object: WorldObject;
  visualDocuments: VisualSummary[];
  onChange(block: ObjectCardBlock): void;
  onOpen(reference: ObjectVisualReference, context?: OpenContext): void;
}) {
  const projection = props.object.worldProjection?.relationGroups.find((group) => group.blockId === props.block.id);
  const config = props.block.relationConfig || emptyConfig();
  const graphs = props.visualDocuments.filter((document) => document.type === "graph");
  const relationTypes = [...new Set((props.object.worldProjection?.confirmedRelations || []).map((relation) => relation.relation))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const edges = props.object.worldProjection?.confirmedRelations || [];

  function changeConfig(patch: Partial<typeof config>) {
    props.onChange({ ...props.block, relationConfig: { ...config, ...patch } });
  }

  return <div className="character-relation-group" data-testid="character-relation-group">
    <label className="relation-group-label"><span>分组名称</span><input value={props.block.label || ""} maxLength={80} onChange={(event) => props.onChange({ ...props.block, label: event.target.value })} /></label>
    <details className="relation-group-config"><summary>投影范围</summary>
      <fieldset><legend>来源图谱</legend>{graphs.map((graph) => <label key={graph.id}><input type="checkbox" checked={config.sourceDocumentIds.includes(graph.id)} onChange={(event) => changeConfig({ sourceDocumentIds: toggle(config.sourceDocumentIds, graph.id, event.target.checked) })} />{graph.title}</label>)}{!graphs.length && <p>尚无关系图谱。</p>}</fieldset>
      <fieldset><legend>相对方向</legend>{(["outgoing", "incoming", "both", "none"] as CharacterRelationDirection[]).map((direction) => <label key={direction}><input type="checkbox" checked={config.directions.includes(direction)} onChange={(event) => changeConfig({ directions: toggle(config.directions, direction, event.target.checked) })} />{directionLabel(direction)}</label>)}</fieldset>
      {relationTypes.length > 0 && <fieldset><legend>关系类型</legend>{relationTypes.map((relation) => <label key={relation}><input type="checkbox" checked={config.relationTypes.includes(relation)} onChange={(event) => changeConfig({ relationTypes: toggle(config.relationTypes, relation, event.target.checked) })} />{relation}</label>)}</fieldset>}
      {edges.length > 0 && <fieldset><legend>精确关系（留空表示全部）</legend>{edges.map((relation) => <label key={`${relation.sourceDocumentId}:${relation.id}`}><input type="checkbox" checked={config.edgeIds.includes(relation.id)} onChange={(event) => changeConfig({ edgeIds: toggle(config.edgeIds, relation.id, event.target.checked) })} />{relation.otherObject.title || "端点已缺失"} · {relation.relation}</label>)}</fieldset>}
    </details>
    {projection?.relations.length ? <div className="projection-item-list">{projection.relations.map((relation) => <article key={`${relation.sourceDocumentId}:${relation.id}`} className={relation.otherObject.missing ? "is-missing" : ""}><span><strong>{relation.otherObject.title || "关系端点已缺失"}</strong><small>{directionLabel(relation.direction)} · {relation.relation} · {relation.sourceDocumentTitle}</small></span><button type="button" onClick={() => props.onOpen(toVisualReference("graph", relation), { objectId: props.object.id, source: "graph-edge", documentId: relation.sourceDocumentId, relationId: relation.id })}>在原图谱中打开<ChevronRight /></button></article>)}</div> : <p className="block-empty-copy">当前筛选下还没有已确认关系。</p>}
    {Boolean(projection?.pendingProposalCount) && <p className="projection-pending-hint"><AlertTriangle />Graph 中有 {projection!.pendingProposalCount} 条待确认的关系提议；未计入已确认关系。</p>}
    {projection?.missingSourceDocumentIds.map((id) => <p className="missing-reference-copy" key={id}><AlertTriangle />来源图谱已缺失；稳定引用仍保留。</p>)}
    {projection?.missingEdgeIds.map((id) => <p className="missing-reference-copy" key={id}><AlertTriangle />已选关系已缺失；恢复同一稳定 ID 后会重新投影。</p>)}
  </div>;
}

export function CharacterProjectionBlock(props: {
  type: "graph" | "timeline" | "map" | "tree" | "canvas";
  object: WorldObject;
  onOpen(reference: ObjectVisualReference, context?: OpenContext): void;
  onOpenObject(object: WorldObjectSummary): void;
  objects: WorldObjectSummary[];
}) {
  const projection = props.object.worldProjection;
  if (!projection) return <p className="block-empty-copy">这类卡片没有人物世界投影。</p>;
  if (props.type === "graph") {
    const graphAppearances = props.object.visualReferences.filter((reference) => reference.type === "graph");
    return <div className="projection-item-list" data-testid="confirmed-graph-projection">
      {projection.confirmedRelations.map((relation) => <article key={`${relation.sourceDocumentId}:${relation.id}`} className={relation.otherObject.missing ? "is-missing" : ""}><GitFork /><span><strong>{relation.otherObject.title || "关系端点已缺失"}</strong><small>{directionLabel(relation.direction)} · {relation.relation}</small></span><button type="button" onClick={() => props.onOpen(toVisualReference("graph", relation), { objectId: props.object.id, source: "graph-edge", documentId: relation.sourceDocumentId, relationId: relation.id })}>打开《{relation.sourceDocumentTitle}》<ChevronRight /></button></article>)}
      {!projection.confirmedRelations.length && <p className="block-empty-copy">还没有已确认的 Graph 关系。</p>}
      {projection.pendingGraphProposals.map((proposal) => <article className="projection-pending-hint" key={proposal.sourceDocumentId}><AlertTriangle /><span><strong>待确认关系提议</strong><small>{proposal.sourceDocumentTitle} · {proposal.count} 条，未计入正式关系</small></span><button type="button" onClick={() => props.onOpen({ type: "graph", title: proposal.sourceDocumentTitle, relativePath: proposal.sourceRelativePath }, { objectId: props.object.id, source: "graph-node", documentId: proposal.sourceDocumentId })}>打开<ChevronRight /></button></article>)}
      {!projection.confirmedRelations.length && graphAppearances.map((reference) => <button type="button" className="projection-source-appearance" onClick={() => props.onOpen(reference)} key={reference.relativePath}><GitFork /><span><strong>{reference.title}</strong><small>人物节点出现于此图谱；不等同于已确认关系</small></span><ChevronRight /></button>)}
    </div>;
  }
  if (props.type === "timeline") {
    return <div className="projection-item-list" data-testid="timeline-participation-projection">{projection.timelineParticipations.map((participation) => <article className={participation.state === "missing" || participation.state === "drift" ? "is-missing" : ""} key={participation.id}><Clock3 /><span><strong>{participation.eventTitle || "事件来源已缺失"}</strong><small>{timelineStateLabel(participation.state)} · {participation.sourceDocumentTitle}{participation.trackBadges.length ? ` · ${participation.trackBadges.join(" / ")}` : ""}</small>{participation.eventExcerpt && <p>{participation.eventExcerpt}</p>}</span><button type="button" onClick={() => props.onOpen({ type: "timeline", title: participation.sourceDocumentTitle, relativePath: participation.sourceRelativePath }, { objectId: participation.eventId, source: "timeline-event", documentId: participation.sourceDocumentId })}>打开<ChevronRight /></button></article>)}{!projection.timelineParticipations.length && <p className="block-empty-copy">还没有明确的时间线参与。</p>}</div>;
  }
  const appearances = props.type === "map" ? projection.mapAppearances : props.type === "tree" ? projection.treeAppearances : projection.canvasAppearances;
  const Icon = props.type === "map" ? Map : props.type === "tree" ? Network : Shapes;
  const source = props.type === "map" ? "map-marker" : props.type === "tree" ? "tree-node" : "canvas-node";
  return <div className="projection-item-list" data-testid={`${props.type}-appearance-projection`}>{appearances.map((appearance) => <article className={appearance.missingSource ? "is-missing" : ""} key={appearance.sourceDocumentId}><Icon /><span><strong>{appearance.sourceDocumentTitle}</strong><small>{appearance.appearanceCount} 处出现 · {appearanceRoleLabel(appearance.role)}{appearance.missingSource ? " · 来源图谱已缺失" : ""}</small></span><button type="button" onClick={() => props.onOpen({ type: props.type, title: appearance.sourceDocumentTitle, relativePath: appearance.sourceRelativePath }, { objectId: props.object.id, source, documentId: appearance.sourceDocumentId, blockId: appearance.referenceIds[0] || null })}>打开<ChevronRight /></button></article>)}{!appearances.length && <p className="block-empty-copy">这个人物还没有出现在任何{props.type === "map" ? "地图" : props.type === "tree" ? "关系树" : "画布"}中。</p>}</div>;
}

export function CharacterStoryReferenceSummary(props: { object: WorldObject; objects: WorldObjectSummary[]; onOpenObject(object: WorldObjectSummary): void }) {
  const projection = props.object.worldProjection;
  if (!projection) return null;
  const objectsById = new globalThis.Map(props.objects.map((object) => [object.id, object]));
  const groups = [
    ["当前所在地", projection.currentLocation ? [projection.currentLocation] : []],
    ["相关场景", projection.linkedScenes],
    ["关联派系", projection.factions],
    ["未解决伏笔", projection.openThreads]
  ] as const;
  return <section className="character-story-reference-summary" data-testid="character-story-references"><header><MapPin /><strong>故事与世界线索</strong></header>{groups.map(([label, references]) => <div key={label}><span>{label}</span>{references.length ? references.map((reference) => {
    const object = objectsById.get(reference.id);
    return object ? <button type="button" onClick={() => props.onOpenObject(object)} key={`${reference.provenance}:${reference.id}`}>{reference.title || reference.id}<small>{provenanceLabel(reference.provenance)}</small></button> : <em key={`${reference.provenance}:${reference.id}`}>来源已缺失</em>;
  }) : <em>{label === "当前所在地" ? "尚未在人物 Markdown 中指定" : "暂无"}</em>}</div>)}</section>;
}

function emptyConfig() {
  return { sourceDocumentIds: [], directions: [] as CharacterRelationDirection[], relationTypes: [], edgeIds: [] };
}

function toggle<T>(values: T[], value: T, enabled: boolean): T[] {
  return enabled ? values.includes(value) ? values : [...values, value] : values.filter((item) => item !== value);
}

function directionLabel(direction: CharacterRelationDirection): string {
  return direction === "outgoing" ? "向外" : direction === "incoming" ? "向内" : direction === "both" ? "双向" : "无向";
}

function timelineStateLabel(state: "canon" | "planned" | "abandoned" | "drift" | "missing"): string {
  return state === "canon" ? "正史" : state === "planned" ? "规划" : state === "abandoned" ? "已放弃" : state === "missing" ? "来源缺失" : "来源漂移";
}

function appearanceRoleLabel(role: string): string {
  return ({ marker: "地图标记", root: "根对象", "included-range": "关系范围", "ordinary-node": "普通节点", "object-node": "对象节点" } as Record<string, string>)[role] || "对象引用";
}

function provenanceLabel(provenance: string): string {
  return provenance === "confirmed-graph" ? "已确认 Graph" : provenance === "markdown-backlink" ? "Markdown 反向引用" : "Markdown 引用";
}

function toVisualReference(type: "graph", source: { sourceDocumentTitle: string; sourceRelativePath: string }): ObjectVisualReference {
  return { type, title: source.sourceDocumentTitle, relativePath: source.sourceRelativePath };
}
