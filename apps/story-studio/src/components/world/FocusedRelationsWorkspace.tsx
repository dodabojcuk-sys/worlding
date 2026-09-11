import { ChevronLeft, Expand, GitBranch, List, MapPin, Minus, Move, Plus, UserRound, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { getWorldLibrary, listRelations, type WorldObjectSummary } from "../../lib/localTransport";
import { relationActiveAtWorldTime, relationWorldTimeUnknownReason } from "../../../../../src/storyContracts/relationTemporalComparison.ts";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

type ViewMode = "graph" | "list";
type RelationData = { objects: readonly WorldObjectSummary[]; relations: readonly RelationReadProjectionR0[] };
type Point = { x: number; y: number };
type GraphViewport = { x: number; y: number; scale: number };
type GraphSelection = { kind: "node" | "edge"; id: string } | null;
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
  const [selection, setSelection] = useState<GraphSelection>(() => selectionFromRoute(params));
  const [fitNonce, setFitNonce] = useState(0);
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

  const writeRoute = (next: Partial<{ center: string; mode: ViewMode; type: string; all: boolean; expanded: ReadonlySet<string>; viewport: GraphViewport; selection: GraphSelection }>) => {
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
    const routeSelection = next.selection === undefined ? selection : next.selection;
    if (routeSelection) target.searchParams.set("relationSelection", `${routeSelection.kind}:${routeSelection.id}`); else target.searchParams.delete("relationSelection");
    return `${target.pathname}?${target.searchParams.toString()}`;
  };
  const updateRoute = (next: Parameters<typeof writeRoute>[0]) => window.history.replaceState({}, "", writeRoute(next));
  const selectCenter = (id: string) => { const next = new Set<string>(); setCenterId(id); setExpanded(next); setSelection({ kind: "node", id }); setFitNonce((value) => value + 1); updateRoute({ center: id, expanded: next, selection: { kind: "node", id } }); };
  const selectMode = (next: ViewMode) => { setMode(next); updateRoute({ mode: next }); };
  const selectType = (next: string) => { setTypeFilter(next); updateRoute({ type: next }); };
  const selectScope = (next: boolean) => { setShowAll(next); updateRoute({ all: next }); };
  const updateExpanded = (next: ReadonlySet<string>) => { setExpanded(next); updateRoute({ expanded: next }); };
  const updateViewport = (next: GraphViewport) => { const normalized = normalizeViewport(next); setViewport(normalized); updateRoute({ viewport: normalized }); };
  const selectGraph = (next: GraphSelection) => { setSelection(next); updateRoute({ selection: next }); };
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
      <header className="focused-relations-toolbar"><div className="focused-relations-toolbar-top"><button type="button" onClick={back}><ChevronLeft aria-hidden="true" />{returnLabel(returnTarget)}</button><div className="focused-relations-heading"><strong>{center ? `${objectLabel(center)}的关系` : "关系查看"}</strong><span>{observationLabel(params)}{props.runtime.workVersionLabel ? ` · ${props.runtime.workVersionLabel}` : ""}</span></div><div className="focused-relations-view-switch" role="group" aria-label="关系显示方式"><button type="button" aria-pressed={mode === "graph"} onClick={() => selectMode("graph")}><GitBranch aria-hidden="true" />关系图</button><button type="button" aria-pressed={mode === "list"} onClick={() => selectMode("list")}><List aria-hidden="true" />列表</button></div></div><div className="focused-relations-toolbar-controls"><label>中心对象<select aria-label="选择关系中心" value={centerId} onChange={(event) => selectCenter(event.target.value)}><option value="">请选择人物或地点</option>{data.objects.filter((item) => item.type === "character" || item.type === "location").map((item) => <option key={item.id} value={item.id}>{objectLabel(item)} · {item.type === "character" ? "人物" : "地点"}</option>)}</select></label><label>类型<select aria-label="筛选关系类型" value={typeFilter} onChange={(event) => selectType(event.target.value)}><option value="">全部类型</option>{availableTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><div className="focused-relations-scope" role="group" aria-label="关系范围"><button type="button" aria-pressed={!showAll} onClick={() => selectScope(false)}>直接关系</button><button type="button" aria-pressed={showAll} onClick={() => selectScope(true)}>全局关系</button></div></div></header>
      {observedAt && unknownInScope.length ? <p className="focused-relations-notice">当前范围有 {unknownInScope.length} 条关系缺少、无效或不确定的故事生效时间，未伪装为该节点的历史关系。</p> : null}
      {sourceError ? <p className="focused-relations-notice" role="alert">{sourceError}</p> : null}
      {!center && !showAll ? <section className="focused-relations-empty"><h1>围绕一个对象查看关系</h1><p>选择人物或地点后，只显示它的直接正式关系；事件因果关系仍在事件线中查看。</p></section> : mode === "list" ? <RelationList relations={visibleRelations} labels={labels} onCenter={selectCenter} onEvidence={openEvent} /> : <RelationGraph centerId={centerId} nodeIds={visibleIds} relations={visibleRelations} labels={labels} expanded={expanded} viewport={viewport} fitNonce={fitNonce} selection={selection} onSelection={selectGraph} onViewport={updateViewport} onFit={(next) => setViewport(next)} onRequestFit={() => setFitNonce((value) => value + 1)} onExpand={(id) => updateExpanded(new Set([...expanded, id]))} onCollapse={(id) => { const next = new Set(expanded); next.delete(id); updateExpanded(next); }} onCenter={selectCenter} onEvidence={openEvent} />}
      <footer>范围：{showAll ? `全局已确认关系 ${filtered.length} 条` : `${center ? objectLabel(center) : "未选择中心"}的直接正式关系 ${direct.length} 条`}。</footer>
    </section>
  </main>;
}

function RelationList(props: { relations: readonly RelationReadProjectionR0[]; labels: ReadonlyMap<string, WorldObjectSummary>; onCenter(id: string): void; onEvidence(relation: RelationReadProjectionR0): void }) {
  return <section className="focused-relations-list" aria-label="关系列表">{props.relations.length ? <ul>{props.relations.map((relation) => <li key={relation.relationId}><div><button type="button" onClick={() => props.onCenter(relation.sourceObjectId)}>{endpointLabel(props.labels, relation.sourceObjectId)}</button><span aria-hidden="true">{directionSymbol(relation.direction)}</span><strong>{relationTypeLabel(relation)}</strong><button type="button" onClick={() => props.onCenter(relation.targetObjectId)}>{endpointLabel(props.labels, relation.targetObjectId)}</button>{relation.evidenceRefs.some((item) => item.kind === "confirmed-event") ? <button className="focused-relations-evidence-link" type="button" onClick={() => props.onEvidence(relation)}>依据</button> : null}</div><small>{relationTimeSummary(relation)}{relation.archived ? " · 已归档" : ""}</small></li>)}</ul> : <p>当前范围没有可显示的已确认正式关系。</p>}</section>;
}

function RelationGraph(props: { centerId: string; nodeIds: ReadonlySet<string>; relations: readonly RelationReadProjectionR0[]; labels: ReadonlyMap<string, WorldObjectSummary>; expanded: ReadonlySet<string>; viewport: GraphViewport; fitNonce: number; selection: GraphSelection; onSelection(value: GraphSelection): void; onViewport(value: GraphViewport): void; onFit(value: GraphViewport): void; onRequestFit(): void; onExpand(id: string): void; onCollapse(id: string): void; onCenter(id: string): void; onEvidence(relation: RelationReadProjectionR0): void }) {
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodes = [...props.nodeIds].sort((left, right) => left.localeCompare(right)).map((id) => ({ id, object: props.labels.get(id) ?? null }));
  const positions = graphPositions(nodes.map((node) => node.id), props.centerId);
  const groups = relationGroups(props.relations);
  useLayoutEffect(() => { const frame = window.requestAnimationFrame(() => { const canvas = canvasRef.current; if (canvas) props.onFit(fitViewport(positions, canvas.clientWidth, canvas.clientHeight)); }); return () => window.cancelAnimationFrame(frame); }, [props.fitNonce]);
  useEffect(() => {
    if (!props.selection) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      props.onSelection(null);
      canvasRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [props.selection]);
  const move = (delta: Point) => props.onViewport({ ...props.viewport, x: props.viewport.x + delta.x, y: props.viewport.y + delta.y });
  const selectedGroup = props.selection?.kind === "edge" ? groups.find((group) => group.key === props.selection!.id) ?? null : null;
  const selectedNode = props.selection?.kind === "node" ? nodes.find((node) => node.id === props.selection!.id) ?? null : null;
  return <section className={`focused-relations-graph ${props.selection ? "has-selection" : ""}`} aria-label="对象关系图"><div ref={canvasRef} className="focused-relations-canvas" data-testid="focused-relations-canvas" tabIndex={0} aria-label="关系连线画布" onWheel={(event) => { event.preventDefault(); props.onViewport({ ...props.viewport, scale: props.viewport.scale + (event.deltaY < 0 ? .1 : -.1) }); }} onPointerDown={(event) => { if (!(event.target instanceof Element) || event.target.closest("button")) return; event.currentTarget.setPointerCapture(event.pointerId); setDragStart({ x: event.clientX, y: event.clientY }); }} onPointerMove={(event) => { if (!dragStart) return; move({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y }); setDragStart({ x: event.clientX, y: event.clientY }); }} onPointerUp={() => setDragStart(null)} onKeyDown={(event) => { const step = 24; if (event.key === "ArrowLeft") { event.preventDefault(); move({ x: -step, y: 0 }); } if (event.key === "ArrowRight") { event.preventDefault(); move({ x: step, y: 0 }); } if (event.key === "ArrowUp") { event.preventDefault(); move({ x: 0, y: -step }); } if (event.key === "ArrowDown") { event.preventDefault(); move({ x: 0, y: step }); } if (event.key === "+" || event.key === "=") { event.preventDefault(); props.onViewport({ ...props.viewport, scale: props.viewport.scale + .1 }); } if (event.key === "-") { event.preventDefault(); props.onViewport({ ...props.viewport, scale: props.viewport.scale - .1 }); } if (event.key === "0") { event.preventDefault(); props.onRequestFit(); } }}><div className="focused-relations-canvas-tools"><span><Move aria-hidden="true" />拖动平移，滚轮缩放</span><div><button type="button" aria-label="缩小关系图" onClick={() => props.onViewport({ ...props.viewport, scale: props.viewport.scale - .15 })}><Minus aria-hidden="true" /></button><button type="button" aria-label="放大关系图" onClick={() => props.onViewport({ ...props.viewport, scale: props.viewport.scale + .15 })}><Plus aria-hidden="true" /></button><button type="button" onClick={props.onRequestFit}>适配</button></div></div><div className="focused-relations-canvas-world" style={{ transform: `translate(${props.viewport.x}px, ${props.viewport.y}px) scale(${props.viewport.scale})` }}><svg className="focused-relations-edges" viewBox="0 0 960 560" aria-hidden="true"><defs><marker id="relation-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>{groups.map((group) => { const source = positions.get(group.sourceId); const target = positions.get(group.targetId); if (!source || !target) return null; const directions = new Set(group.relations.map((relation) => relation.direction)); const edge = edgeEndpoints(source, target); return <line key={group.key} x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} markerStart={directions.has("reverse") || directions.has("both") ? "url(#relation-arrow)" : undefined} markerEnd={directions.has("forward") || directions.has("both") ? "url(#relation-arrow)" : undefined} />; })}</svg>{groups.map((group) => { const source = positions.get(group.sourceId); const target = positions.get(group.targetId); if (!source || !target) return null; return <button key={group.key} type="button" className="focused-relations-edge-label" aria-pressed={props.selection?.kind === "edge" && props.selection.id === group.key} style={{ left: `${(source.x + target.x) / 2}px`, top: `${(source.y + target.y) / 2}px` }} onClick={() => props.onSelection({ kind: "edge", id: group.key })}>{group.relations.length > 1 ? `${group.relations.length} 条关系` : relationTypeLabel(group.relations[0])}</button>; })}{nodes.map((node) => { const point = positions.get(node.id)!; return <button key={node.id} type="button" className={`focused-relations-node ${node.id === props.centerId ? "is-center" : ""}`} aria-pressed={props.selection?.kind === "node" && props.selection.id === node.id} style={{ left: `${point.x}px`, top: `${point.y}px` }} onClick={() => props.onSelection({ kind: "node", id: node.id })}>{node.object?.type === "location" ? <MapPin aria-hidden="true" /> : <UserRound aria-hidden="true" />}<span><strong>{node.object ? objectLabel(node.object) : "未解析的正式端点"}</strong><small>{node.object?.type === "location" ? "地点" : node.object?.type === "character" ? "人物" : "对象"}</small></span></button>; })}</div></div>{props.selection ? <aside className="focused-relations-detail" aria-label="所选关系详情"><button type="button" aria-label="关闭详情" onClick={() => props.onSelection(null)}><X aria-hidden="true" /></button>{selectedNode ? <><small>对象</small><h2>{selectedNode.object ? objectLabel(selectedNode.object) : "未解析的正式端点"}</h2><p>{selectedNode.object?.type === "location" ? "地点" : "人物"}</p>{selectedNode.id !== props.centerId ? <button type="button" onClick={() => props.onCenter(selectedNode.id)}>以此为中心</button> : null}{selectedNode.id !== props.centerId ? props.expanded.has(selectedNode.id) ? <button type="button" onClick={() => props.onCollapse(selectedNode.id)}>收起邻居</button> : <button type="button" onClick={() => props.onExpand(selectedNode.id)}><Expand aria-hidden="true" />展开邻居</button> : null}</> : selectedGroup ? <><small>关系组 · {selectedGroup.relations.length} 条</small><h2>{selectedGroup.relations.length > 1 ? "同一对象间的关系" : relationTypeLabel(selectedGroup.relations[0])}</h2><RelationList relations={selectedGroup.relations} labels={props.labels} onCenter={props.onCenter} onEvidence={props.onEvidence} /></> : null}</aside> : <p className="focused-relations-selection-hint">选择对象或关系，查看详情与依据。</p>}</section>;
}

function graphPositions(ids: readonly string[], centerId: string): ReadonlyMap<string, Point> { const ordered = [...ids].sort((left, right) => left === centerId ? -1 : right === centerId ? 1 : left.localeCompare(right)); const positions = new Map<string, Point>(); const center = ordered[0]; if (center) positions.set(center, { x: 480, y: 280 }); const neighbours = ordered.slice(1); for (const [index, id] of neighbours.entries()) { const angle = neighbours.length === 1 ? 0 : (Math.PI * 2 * index / neighbours.length) - Math.PI / 2; positions.set(id, { x: 480 + Math.cos(angle) * 250, y: 280 + Math.sin(angle) * 176 }); } return positions; }
function edgeEndpoints(source: Point, target: Point): { x1: number; y1: number; x2: number; y2: number } { const dx = target.x - source.x; const dy = target.y - source.y; const scale = 1 / Math.max(Math.abs(dx) / 72, Math.abs(dy) / 32, 1); return { x1: source.x + dx * scale, y1: source.y + dy * scale, x2: target.x - dx * scale, y2: target.y - dy * scale }; }
function fitViewport(points: ReadonlyMap<string, Point>, width: number, height: number): GraphViewport { const values = [...points.values()]; if (!values.length || !width || !height) return defaultViewport; const minX = Math.min(...values.map((value) => value.x - 80)); const maxX = Math.max(...values.map((value) => value.x + 80)); const minY = Math.min(...values.map((value) => value.y - 48)); const maxY = Math.max(...values.map((value) => value.y + 48)); const scale = Math.min(1.35, Math.max(.55, Math.min((width - 96) / (maxX - minX), (height - 96) / (maxY - minY)))); return normalizeViewport({ x: width / 2 - ((minX + maxX) / 2) * scale, y: height / 2 - ((minY + maxY) / 2) * scale, scale }); }
function relationGroups(relations: readonly RelationReadProjectionR0[]): Array<{ key: string; sourceId: string; targetId: string; relations: RelationReadProjectionR0[] }> { const groups = new Map<string, { key: string; sourceId: string; targetId: string; relations: RelationReadProjectionR0[] }>(); for (const relation of relations) { const key = [relation.sourceObjectId, relation.targetObjectId].sort().join("\u0000"); const current = groups.get(key) ?? { key, sourceId: relation.sourceObjectId, targetId: relation.targetObjectId, relations: [] }; current.relations.push(relation); groups.set(key, current); } return [...groups.values()]; }
function normalizeViewport(value: GraphViewport): GraphViewport { return { x: Number.isFinite(value.x) ? Math.max(-720, Math.min(720, value.x)) : 0, y: Number.isFinite(value.y) ? Math.max(-440, Math.min(440, value.y)) : 0, scale: Number.isFinite(value.scale) ? Math.max(.55, Math.min(1.8, value.scale)) : 1 }; }
function relationTypeLabel(relation: RelationReadProjectionR0): string { return relation.currentTypeLabel ?? relation.relationLabelSnapshot; }
function isAttached(relation: RelationReadProjectionR0, id: string): boolean { return Boolean(id) && (relation.sourceObjectId === id || relation.targetObjectId === id); }
function addRelationEndpoints(ids: Set<string>, relation: RelationReadProjectionR0) { ids.add(relation.sourceObjectId); ids.add(relation.targetObjectId); }
function objectLabel(object: WorldObjectSummary): string { return `${object.title}${object.status === "archived" ? "（对象已归档）" : ""}`; }
function endpointLabel(labels: ReadonlyMap<string, WorldObjectSummary>, id: string): string { const object = labels.get(id); return object ? objectLabel(object) : "未解析的正式端点"; }
function directionLabel(direction: RelationReadProjectionR0["direction"]): string { return direction === "both" ? "双向" : direction === "forward" ? "由左至右" : direction === "reverse" ? "由右至左" : "方向未指定"; }
function directionSymbol(direction: RelationReadProjectionR0["direction"]): string { return direction === "both" ? "↔" : direction === "forward" ? "→" : direction === "reverse" ? "←" : "—"; }
function relationTimeSummary(relation: RelationReadProjectionR0): string { const from = relation.temporal?.validFrom; if (!from) return "有效时间未知"; return `有效于 ${from.slice(0, 10)}${from.endsWith("Z") ? "（UTC）" : ""}`; }
function selectionFromRoute(params: URLSearchParams): GraphSelection { const value = params.get("relationSelection"); const match = value?.match(/^(node|edge):(.+)$/u); return match ? { kind: match[1] as "node" | "edge", id: match[2] } : null; }
function safeReturn(value: string | null): string | null { return value && value.startsWith("/") && !value.startsWith("//") ? value : null; }
function returnLabel(target: string | null): string { return target?.includes("worldView=character") ? "返回角色" : target?.includes("worldView=map") ? "返回地图" : "返回来源"; }
function observationLabel(params: URLSearchParams): string { if (!params.get("mapObservedAt")) return "当前状态"; return params.get("mapObservationLabel") || `故事节点 · ${params.get("mapObservationEvent") || "未命名"}`; }
