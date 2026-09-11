import { ChevronLeft, Expand, GitBranch, List, Minus, Move, Plus, Search } from "lucide-react";
import { useEffect, useState } from "react";

import { getWorldLibrary, listRelations, type WorldObjectSummary } from "../../lib/localTransport";
import { relationActiveAtWorldTime, relationWorldTimeUnknownReason } from "../../../../../src/storyContracts/relationTemporalComparison.ts";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

type ViewMode = "graph" | "list";
type RelationData = { objects: readonly WorldObjectSummary[]; relations: readonly RelationReadProjectionR0[] };
type Point = { x: number; y: number };
type GraphViewport = { x: number; y: number; scale: number };
const defaultViewport: GraphViewport = { x: 0, y: 0, scale: 1 };

/** Read-only object neighbourhood; Relation Owner remains the sole fact owner. */
export function FocusedRelationsWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const params = new URLSearchParams(window.location.search);
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId;
  const [centerId, setCenterId] = useState(() => params.get("relationCenter") || "");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set((params.get("relationExpanded") || "").split(",").filter(Boolean)));
  const [mode, setMode] = useState<ViewMode>(() => params.get("relationView") === "list" ? "list" : "graph");
  const [typeFilter, setTypeFilter] = useState(() => params.get("relationType") || "");
  const [showAll, setShowAll] = useState(() => params.get("relationScope") === "all");
  const [viewport, setViewport] = useState<GraphViewport>(() => normalizeViewport({ x: Number(params.get("relationPanX") || 0), y: Number(params.get("relationPanY") || 0), scale: Number(params.get("relationZoom") || 1) }));
  const [data, setData] = useState<RelationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const observedAt = params.get("mapObservedAt");

  useEffect(() => {
    let active = true;
    setData(null); setError(null); setSourceError(null);
    if (!projectId || !workVersionId) return;
    void Promise.all([getWorldLibrary(projectId), listRelations({ projectId, workVersionId, reviewState: "confirmed", includeArchived: true })]).then(([library, read]) => {
      if (active) setData({ objects: library.objects, relations: read.relations });
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "正式关系暂时无法读取；没有将失败显示为零条关系。"); });
    return () => { active = false; };
  }, [projectId, workVersionId, observedAt]);

  const writeRoute = (next: Partial<{ center: string; mode: ViewMode; type: string; all: boolean; expanded: ReadonlySet<string>; viewport: GraphViewport }>) => {
    const target = new URL(window.location.href);
    target.searchParams.set("worldView", "relations");
    const center = next.center ?? centerId;
    if (center) target.searchParams.set("relationCenter", center); else target.searchParams.delete("relationCenter");
    const nextMode = next.mode ?? mode;
    if (nextMode === "list") target.searchParams.set("relationView", nextMode); else target.searchParams.delete("relationView");
    const type = next.type ?? typeFilter;
    if (type) target.searchParams.set("relationType", type); else target.searchParams.delete("relationType");
    const all = next.all ?? showAll;
    if (all) target.searchParams.set("relationScope", "all"); else target.searchParams.delete("relationScope");
    const expandedValue = [...(next.expanded ?? expanded)].sort().join(",");
    if (expandedValue) target.searchParams.set("relationExpanded", expandedValue); else target.searchParams.delete("relationExpanded");
    const nextViewport = normalizeViewport(next.viewport ?? viewport);
    if (nextViewport.x) target.searchParams.set("relationPanX", String(nextViewport.x)); else target.searchParams.delete("relationPanX");
    if (nextViewport.y) target.searchParams.set("relationPanY", String(nextViewport.y)); else target.searchParams.delete("relationPanY");
    if (nextViewport.scale !== 1) target.searchParams.set("relationZoom", String(nextViewport.scale)); else target.searchParams.delete("relationZoom");
    return `${target.pathname}?${target.searchParams.toString()}`;
  };
  const updateRoute = (next: Parameters<typeof writeRoute>[0]) => window.history.replaceState({}, "", writeRoute(next));
  const selectCenter = (id: string) => { const next = new Set<string>(); setCenterId(id); setExpanded(next); updateRoute({ center: id, expanded: next }); };
  const selectMode = (next: ViewMode) => { setMode(next); updateRoute({ mode: next }); };
  const selectType = (next: string) => { setTypeFilter(next); updateRoute({ type: next }); };
  const selectScope = (next: boolean) => { setShowAll(next); updateRoute({ all: next }); };
  const updateExpanded = (next: ReadonlySet<string>) => { setExpanded(next); updateRoute({ expanded: next }); };
  const updateViewport = (next: GraphViewport) => { const normalized = normalizeViewport(next); setViewport(normalized); updateRoute({ viewport: normalized }); };
  const back = () => { const value = params.get("relationReturn"); window.location.assign(safeReturn(value) ?? "/world?worldView=map"); };
  const returnTarget = safeReturn(params.get("relationReturn"));

  if (!projectId) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>先打开一个作品</h1></section></main>;
  if (!workVersionId) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>正在确定作品版本</h1><p>不会以其他版本的正式关系代替当前范围。</p></section></main>;
  if (error) return <main className="shell-workspace"><section className="focused-relations" role="alert"><h1>关系暂时无法读取</h1><p>{error}</p><button type="button" onClick={back}>返回</button></section></main>;
  if (!data) return <main className="shell-workspace"><section className="focused-relations" aria-busy="true"><p>正在读取当前作品版本的正式关系……</p></section></main>;

  const labels = new Map(data.objects.map((item) => [item.id, item]));
  const displayable = observedAt ? data.relations.filter((relation) => relationActiveAtWorldTime(relation, observedAt)) : data.relations.filter((relation) => !relation.archived);
  const unknown = observedAt ? data.relations.filter((relation) => relationWorldTimeUnknownReason(relation) !== null) : [];
  const availableTypes = [...new Set(displayable.map(relationTypeLabel))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const filtered = typeFilter ? displayable.filter((relation) => relationTypeLabel(relation) === typeFilter) : displayable;
  const direct = centerId ? filtered.filter((relation) => isAttached(relation, centerId)) : [];
  const visibleIds = new Set<string>(centerId ? [centerId] : []);
  for (const relation of showAll ? filtered : direct) addRelationEndpoints(visibleIds, relation);
  for (const nodeId of expanded) for (const relation of filtered) if (isAttached(relation, nodeId)) addRelationEndpoints(visibleIds, relation);
  const visibleRelations = (showAll ? filtered : filtered.filter((relation) => visibleIds.has(relation.sourceObjectId) && visibleIds.has(relation.targetObjectId))).filter((relation) => showAll || isAttached(relation, centerId) || expanded.has(relation.sourceObjectId) || expanded.has(relation.targetObjectId));
  const unknownInScope = unknown.filter((relation) => (typeFilter ? relationTypeLabel(relation) === typeFilter : true)).filter((relation) => showAll || isAttached(relation, centerId) || expanded.has(relation.sourceObjectId) || expanded.has(relation.targetObjectId));
  const center = labels.get(centerId) ?? null;
  const openEvent = (relation: RelationReadProjectionR0) => {
    const reference = relation.evidenceRefs.find((item) => item.kind === "confirmed-event")?.reference as { eventId?: string; revisionToken?: string; revision?: string } | undefined;
    const revision = reference?.revisionToken ?? reference?.revision;
    if (!reference?.eventId || !revision) { setSourceError("这条关系没有可验证的正式事件与修订；没有用当前正文或同名事件替代。"); return; }
    const query = new URLSearchParams({ projectId, workVersionId, eventId: reference.eventId, eventRevision: revision, relationReturn: writeRoute({}) });
    window.location.assign(`/event-line?${query.toString()}`);
  };
  return <main className="shell-workspace focused-relations-shell" aria-label="聚焦关系查看">
    <section className="focused-relations" data-testid="focused-relations-workspace">
      <header className="focused-relations-toolbar"><button type="button" onClick={back}><ChevronLeft aria-hidden="true" />{returnLabel(returnTarget)}</button><div className="focused-relations-heading"><strong>关系查看</strong><span>{center ? `中心：${objectLabel(center)}` : "请选择中心对象"} · {props.runtime.workVersionLabel ?? "当前作品版本"} · {observationLabel(params)}</span></div><label><Search aria-hidden="true" />中心对象<select aria-label="选择关系中心" value={centerId} onChange={(event) => selectCenter(event.target.value)}><option value="">请选择人物或地点</option>{data.objects.filter((item) => item.type === "character" || item.type === "location").map((item) => <option key={item.id} value={item.id}>{objectLabel(item)} · {item.type === "character" ? "人物" : "地点"}</option>)}</select></label><label>类型<select aria-label="筛选关系类型" value={typeFilter} onChange={(event) => selectType(event.target.value)}><option value="">全部类型</option>{availableTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><div className="focused-relations-actions"><button type="button" aria-pressed={mode === "graph"} onClick={() => selectMode("graph")}><GitBranch aria-hidden="true" />图</button><button type="button" aria-pressed={mode === "list"} onClick={() => selectMode("list")}><List aria-hidden="true" />列表</button><button type="button" aria-pressed={showAll} onClick={() => selectScope(!showAll)}>{showAll ? "聚焦中心" : "全局查看"}</button></div></header>
      {observedAt && unknownInScope.length ? <p className="focused-relations-notice">当前范围有 {unknownInScope.length} 条关系缺少、无效或不确定的故事生效时间，未伪装为该节点的历史关系。</p> : null}
      {sourceError ? <p className="focused-relations-notice" role="alert">{sourceError}</p> : null}
      {!center && !showAll ? <section className="focused-relations-empty"><h1>围绕一个对象查看关系</h1><p>选择人物或地点后，只显示它的直接正式关系；事件因果关系仍在事件线中查看。</p></section> : mode === "list" ? <RelationList relations={visibleRelations} labels={labels} onCenter={selectCenter} onEvidence={openEvent} /> : <RelationGraph centerId={centerId} nodeIds={visibleIds} relations={visibleRelations} labels={labels} expanded={expanded} viewport={viewport} onViewport={updateViewport} onExpand={(id) => updateExpanded(new Set([...expanded, id]))} onCollapse={(id) => { const next = new Set(expanded); next.delete(id); updateExpanded(next); }} onCenter={selectCenter} onEvidence={openEvent} />}
      <footer>范围：{showAll ? `全局已确认关系 ${filtered.length} 条` : `${center ? objectLabel(center) : "未选择中心"}的直接正式关系 ${direct.length} 条`}；浏览、筛选、图形平移、缩放与展开均不写入关系、世界状态或人物记忆。</footer>
    </section>
  </main>;
}

function RelationList(props: { relations: readonly RelationReadProjectionR0[]; labels: ReadonlyMap<string, WorldObjectSummary>; onCenter(id: string): void; onEvidence(relation: RelationReadProjectionR0): void }) {
  return <section className="focused-relations-list" aria-label="关系列表">{props.relations.length ? <ul>{props.relations.map((relation) => <li key={relation.relationId}><div><button type="button" onClick={() => props.onCenter(relation.sourceObjectId)}>{endpointLabel(props.labels, relation.sourceObjectId)}</button><strong>{relationTypeLabel(relation)}</strong><button type="button" onClick={() => props.onCenter(relation.targetObjectId)}>{endpointLabel(props.labels, relation.targetObjectId)}</button></div><small>{directionLabel(relation.direction)} · {relation.temporal?.validFrom ? `${relation.temporal.validFrom} 至 ${relation.temporal.validTo ?? "仍有效"}` : "有效时间未知"}{relation.archived ? " · 现已归档，仍按故事时间保留此历史记录" : ""}</small>{relation.evidenceRefs.some((item) => item.kind === "confirmed-event") ? <button type="button" onClick={() => props.onEvidence(relation)}>查看支持事件</button> : <small>没有可定位的正式事件依据</small>}</li>)}</ul> : <p>当前范围没有可显示的已确认正式关系。</p>}</section>;
}

function RelationGraph(props: { centerId: string; nodeIds: ReadonlySet<string>; relations: readonly RelationReadProjectionR0[]; labels: ReadonlyMap<string, WorldObjectSummary>; expanded: ReadonlySet<string>; viewport: GraphViewport; onViewport(value: GraphViewport): void; onExpand(id: string): void; onCollapse(id: string): void; onCenter(id: string): void; onEvidence(relation: RelationReadProjectionR0): void }) {
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const nodes = [...props.nodeIds].sort((left, right) => left.localeCompare(right)).map((id) => ({ id, object: props.labels.get(id) ?? null }));
  const positions = graphPositions(nodes.map((node) => node.id), props.centerId);
  const groups = relationGroups(props.relations);
  const move = (delta: Point) => props.onViewport({ ...props.viewport, x: props.viewport.x + delta.x, y: props.viewport.y + delta.y });
  return <section className="focused-relations-graph" aria-label="对象关系图"><header className="focused-relations-graph-toolbar"><span><Move aria-hidden="true" />拖动平移，滚轮缩放；方向箭头来自正式 Relation。</span><div><button type="button" aria-label="缩小关系图" onClick={() => props.onViewport({ ...props.viewport, scale: props.viewport.scale - .15 })}><Minus aria-hidden="true" /></button><button type="button" aria-label="放大关系图" onClick={() => props.onViewport({ ...props.viewport, scale: props.viewport.scale + .15 })}><Plus aria-hidden="true" /></button><button type="button" onClick={() => props.onViewport(defaultViewport)}>适配视图</button></div></header><div className="focused-relations-canvas" data-testid="focused-relations-canvas" tabIndex={0} aria-label="关系连线画布" onWheel={(event) => { event.preventDefault(); props.onViewport({ ...props.viewport, scale: props.viewport.scale + (event.deltaY < 0 ? .1 : -.1) }); }} onPointerDown={(event) => { if (event.target === event.currentTarget) setDragStart({ x: event.clientX, y: event.clientY }); }} onPointerMove={(event) => { if (!dragStart) return; move({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y }); setDragStart({ x: event.clientX, y: event.clientY }); }} onPointerUp={() => setDragStart(null)} onPointerLeave={() => setDragStart(null)} onKeyDown={(event) => { const step = 24; if (event.key === "ArrowLeft") { event.preventDefault(); move({ x: -step, y: 0 }); } if (event.key === "ArrowRight") { event.preventDefault(); move({ x: step, y: 0 }); } if (event.key === "ArrowUp") { event.preventDefault(); move({ x: 0, y: -step }); } if (event.key === "ArrowDown") { event.preventDefault(); move({ x: 0, y: step }); } if (event.key === "+" || event.key === "=") { event.preventDefault(); props.onViewport({ ...props.viewport, scale: props.viewport.scale + .1 }); } if (event.key === "-") { event.preventDefault(); props.onViewport({ ...props.viewport, scale: props.viewport.scale - .1 }); } if (event.key === "0") { event.preventDefault(); props.onViewport(defaultViewport); } }}><div className="focused-relations-canvas-world" style={{ transform: `translate(${props.viewport.x}px, ${props.viewport.y}px) scale(${props.viewport.scale})` }}><svg className="focused-relations-edges" viewBox="0 0 960 560" aria-hidden="true"><defs><marker id="relation-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>{groups.map((group) => { const source = positions.get(group.sourceId); const target = positions.get(group.targetId); if (!source || !target) return null; const first = group.relations[0]; return <line key={group.key} x1={source.x} y1={source.y} x2={target.x} y2={target.y} markerStart={first.direction === "reverse" || first.direction === "both" ? "url(#relation-arrow)" : undefined} markerEnd={first.direction === "forward" || first.direction === "both" ? "url(#relation-arrow)" : undefined} />; })}</svg>{groups.map((group) => { const source = positions.get(group.sourceId); const target = positions.get(group.targetId); if (!source || !target) return null; return <button key={group.key} type="button" className="focused-relations-edge-label" style={{ left: `${(source.x + target.x) / 2}px`, top: `${(source.y + target.y) / 2}px` }} onClick={() => props.onEvidence(group.relations[0])}>{group.relations.length > 1 ? `${group.relations.length} 条关系` : relationTypeLabel(group.relations[0])}</button>; })}{nodes.map((node) => { const point = positions.get(node.id)!; const isExpanded = props.expanded.has(node.id); return <article key={node.id} className={`focused-relations-node ${node.id === props.centerId ? "is-center" : ""}`} style={{ left: `${point.x}px`, top: `${point.y}px` }}><small>{node.object ? node.object.type === "character" ? "人物" : node.object.type === "location" ? "地点" : "对象" : "未解析端点"}</small><strong>{node.object ? objectLabel(node.object) : "未解析的正式端点"}</strong><div><button type="button" onClick={() => props.onCenter(node.id)}>以此为中心</button>{node.id !== props.centerId ? isExpanded ? <button type="button" onClick={() => props.onCollapse(node.id)}>收起邻居</button> : <button type="button" onClick={() => props.onExpand(node.id)}><Expand aria-hidden="true" />展开邻居</button> : null}</div></article>; })}</div></div><RelationList relations={props.relations} labels={props.labels} onCenter={props.onCenter} onEvidence={props.onEvidence} /></section>;
}

function graphPositions(ids: readonly string[], centerId: string): ReadonlyMap<string, Point> { const ordered = [...ids].sort((left, right) => left === centerId ? -1 : right === centerId ? 1 : left.localeCompare(right)); const positions = new Map<string, Point>(); const center = ordered[0]; if (center) positions.set(center, { x: 480, y: 280 }); const neighbours = ordered.slice(1); for (const [index, id] of neighbours.entries()) { const angle = (Math.PI * 2 * index / Math.max(1, neighbours.length)) - Math.PI / 2; positions.set(id, { x: 480 + Math.cos(angle) * 218, y: 280 + Math.sin(angle) * 178 }); } return positions; }
function relationGroups(relations: readonly RelationReadProjectionR0[]): Array<{ key: string; sourceId: string; targetId: string; relations: RelationReadProjectionR0[] }> { const groups = new Map<string, { key: string; sourceId: string; targetId: string; relations: RelationReadProjectionR0[] }>(); for (const relation of relations) { const key = [relation.sourceObjectId, relation.targetObjectId].sort().join("\u0000"); const current = groups.get(key) ?? { key, sourceId: relation.sourceObjectId, targetId: relation.targetObjectId, relations: [] }; current.relations.push(relation); groups.set(key, current); } return [...groups.values()]; }
function normalizeViewport(value: GraphViewport): GraphViewport { return { x: Number.isFinite(value.x) ? Math.max(-720, Math.min(720, value.x)) : 0, y: Number.isFinite(value.y) ? Math.max(-440, Math.min(440, value.y)) : 0, scale: Number.isFinite(value.scale) ? Math.max(.55, Math.min(1.8, value.scale)) : 1 }; }
function relationTypeLabel(relation: RelationReadProjectionR0): string { return relation.currentTypeLabel ?? relation.relationLabelSnapshot; }
function isAttached(relation: RelationReadProjectionR0, id: string): boolean { return Boolean(id) && (relation.sourceObjectId === id || relation.targetObjectId === id); }
function addRelationEndpoints(ids: Set<string>, relation: RelationReadProjectionR0) { ids.add(relation.sourceObjectId); ids.add(relation.targetObjectId); }
function objectLabel(object: WorldObjectSummary): string { return `${object.title}${object.status === "archived" ? "（对象已归档）" : ""}`; }
function endpointLabel(labels: ReadonlyMap<string, WorldObjectSummary>, id: string): string { const object = labels.get(id); return object ? objectLabel(object) : "未解析的正式端点"; }
function directionLabel(direction: RelationReadProjectionR0["direction"]): string { return direction === "both" ? "双向" : direction === "forward" ? "由左至右" : direction === "reverse" ? "由右至左" : "方向未指定"; }
function safeReturn(value: string | null): string | null { return value && value.startsWith("/") && !value.startsWith("//") ? value : null; }
function returnLabel(target: string | null): string { return target?.includes("worldView=character") ? "返回角色" : target?.includes("worldView=map") ? "返回地图" : "返回来源"; }
function observationLabel(params: URLSearchParams): string { if (!params.get("mapObservedAt")) return "当前状态"; return params.get("mapObservationLabel") || `故事节点 · ${params.get("mapObservationEvent") || "未命名"}`; }
