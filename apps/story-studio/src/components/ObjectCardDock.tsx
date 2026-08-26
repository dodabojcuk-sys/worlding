import { ChevronRight, Clock3, FileText, GitFork, Image, Link2, Map, Maximize2, Network, X } from "lucide-react";

import { stripStoryCardSectionsByKind } from "../../../../src/storyCardPresentation/storyCardSectionAnchors";
import type { WorkspaceSelection } from "../../../../src/productWorkspace/storyStudioWorkspaceSelection";
import { visualAssetUrl, type ObjectVisualReference, type WorldObject, type WorldObjectSummary } from "../lib/localTransport";
import { objectTypeLabel } from "../worldObjectCatalog";

export function ObjectCardDock(props: {
  projectId: string;
  object: WorldObject;
  selection: WorkspaceSelection;
  onClose(): void;
  onOpenFull(): void;
  onOpenObject(object: WorldObjectSummary): void;
  onOpenVisual(reference: ObjectVisualReference): void;
}) {
  const object = props.object;
  return <aside className="visual-object-dock" data-testid="visual-object-dock" data-object-id={object.id} data-source={props.selection.source} data-source-document-id={props.selection.documentId || ""}>
    <header><span>{objectTypeLabel(object.type)}卡片</span><button type="button" className="icon-action" onClick={props.onClose} aria-label="关闭对象卡片"><X /></button></header>
    <div className="dock-object-identity">
      <div className="dock-cover">{object.card.portrait || object.card.cover ? <img src={visualAssetUrl(props.projectId, (object.card.portrait || object.card.cover)!.assetRef)} alt={`${object.title} ${object.card.portrait ? "肖像" : "封面"}`} /> : <Image />}</div>
      <div><p className="eyebrow">{objectTypeLabel(object.type)}</p><h2>{object.title}</h2><p>{object.aliases.join(" · ") || objectStatusLabel(object.status)}</p></div>
    </div>
    <section className="dock-section"><h3><FileText />当前设定</h3><p className="dock-body-excerpt">{plainExcerpt(object.body)}</p><div className="dock-tag-row">{object.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></section>
    <section className="dock-section"><h3><Link2 />关系与引用</h3>{[...object.linkedObjects, ...object.backlinks].length ? [...object.linkedObjects, ...object.backlinks].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 6).map((item) => <button type="button" className="dock-reference" onClick={() => props.onOpenObject(item)} key={item.id}><span>{item.title}</span><small>{objectTypeLabel(item.type)}</small><ChevronRight /></button>) : <p className="dock-empty">还没有关联对象</p>}</section>
    {object.worldProjection && <section className="dock-section dock-projection-counts"><h3><GitFork />当前世界投影</h3><div><span>已确认关系 <strong>{object.worldProjection.confirmedRelations.length}</strong></span><span>时间线参与 <strong>{object.worldProjection.timelineParticipations.length}</strong></span><span>视觉文档 <strong>{object.worldProjection.mapAppearances.length + object.worldProjection.treeAppearances.length + object.worldProjection.canvasAppearances.length}</strong></span></div>{object.worldProjection.pendingGraphProposals.length > 0 && <small>关系图中有待确认提议，未计入正式关系。</small>}</section>}
    <section className="dock-section"><h3><GitFork />出现于</h3>{object.visualReferences.length ? object.visualReferences.map((reference) => <button type="button" className="dock-reference" onClick={() => props.onOpenVisual(reference)} key={reference.relativePath}><span>{visualReferenceIcon(reference.type)}{reference.title}</span><small>{visualReferenceLabel(reference.type)}</small><ChevronRight /></button>) : <p className="dock-empty">还没有放入视觉文档</p>}</section>
    <button type="button" className="primary-action dock-open-full" onClick={props.onOpenFull}><Maximize2 />打开完整卡片</button>
  </aside>;
}

function objectStatusLabel(value: string): string {
  return ({ active: "使用中", draft: "草稿", archived: "已归档", deprecated: "已停用" } as Record<string, string>)[value] ?? "未标记状态";
}

function visualReferenceLabel(type: ObjectVisualReference["type"]): string {
  return type === "map" ? "地图" : type === "graph" ? "图谱" : type === "canvas" ? "画布" : type === "timeline" ? "时间线" : "树";
}

function visualReferenceIcon(type: ObjectVisualReference["type"]) {
  return type === "map" ? <Map /> : type === "graph" ? <GitFork /> : type === "timeline" ? <Clock3 /> : type === "tree" ? <Network /> : null;
}

function plainExcerpt(body: string): string {
  const text = stripStoryCardSectionsByKind(stripStoryCardSectionsByKind(body, "secret"), "character-arc")
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/[#*_>`\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 180) || "这张卡片还没有正文。";
}
