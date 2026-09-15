import { ChevronLeft, Expand, GitBranch, List, MapPin, Minus, Move, Plus, Search, Sparkles, UserRound, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { getVerifiedCanonEvent, getWorldLibrary, listRelations, type WorldObjectSummary } from "../../lib/localTransport";
import { RelationCreateForm } from "./RelationCreateForm";
import { relationActiveAtWorldTime, relationWorldTimeUnknownReason } from "../../../../../src/storyContracts/relationTemporalComparison.ts";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";
import { MaterialsSectionNavigation } from "./MaterialsSectionNavigation";

type ViewMode = "graph" | "list";
type RelationData = { objects: readonly WorldObjectSummary[]; relations: readonly RelationReadProjectionR0[] };
type Point = { x: number; y: number };
type GraphViewport = { x: number; y: number; scale: number };
type GraphSelection = { kind: "node" | "edge"; id: string } | null;
const defaultViewport: GraphViewport = { x: 0, y: 0, scale: 1 };
const MAX_RELATION_HANDOFF_OBJECTS = 2;

/** Read-only object neighbourhood; Relation Owner remains the sole fact owner. */
export function FocusedRelationsWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const params = new URLSearchParams(window.location.search);
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId;
  const workVersionState = props.runtime.workVersionState ?? (props.runtime.connectionState === "loading" ? "loading" : "ready");
  const [centerId, setCenterId] = useState(() => params.get("relationCenter") || "");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set((params.get("relationExpanded") || "").split(",").filter(Boolean)));
  const [mode, setMode] = useState<ViewMode>(() => params.get("relationView") === "list" ? "list" : "graph");
  const [typeFilter, setTypeFilter] = useState(() => params.get("relationType") || "");
  const [objectSearch, setObjectSearch] = useState(() => params.get("relationQuery") || "");
  const [showAll, setShowAll] = useState(() => params.has("relationScope") ? params.get("relationScope") === "all" : !params.get("relationCenter"));
  const [viewport, setViewport] = useState<GraphViewport>(() => normalizeViewport({ x: Number(params.get("relationPanX") || 0), y: Number(params.get("relationPanY") || 0), scale: Number(params.get("relationZoom") || 1) }));
  const hasPersistedViewport = ["relationPanX", "relationPanY", "relationZoom"].some((key) => params.has(key));
  const [selection, setSelection] = useState<GraphSelection>(() => selectionFromRoute(params));
  const [selectedRelationId, setSelectedRelationId] = useState(() => params.get("relationItem") || "");
  const [fitNonce, setFitNonce] = useState(0);
  const [data, setData] = useState<RelationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [writeStatus, setWriteStatus] = useState<string | null>(null);
  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [reloadNonce, setReloadNonce] = useState(0);
  // 建立关系面板与详情/编排互斥：打开面板时收起详情，选对象或关系时收起面板。
  const openCreateForm = () => { setCreateFormOpen(true); };
  const observedAt = params.get("mapObservedAt");

  const lastRelationLoadKey = useRef("");
  useEffect(() => {
    let active = true;
    const loadKey = `${projectId}:${workVersionId}:${observedAt}`;
    // 建立关系后的原地刷新保留现有列表与表单反馈；仅作品/版本切换才清空。
    const isSameScopeRefresh = reloadNonce > 0 && lastRelationLoadKey.current === loadKey;
    lastRelationLoadKey.current = loadKey;
    if (!isSameScopeRefresh) { setData(null); setError(null); setRefreshError(null); setSourceError(null); }
    if (!projectId || !workVersionId) return;
    void Promise.all([getWorldLibrary(projectId), listRelations({ projectId, workVersionId, reviewState: "confirmed", includeArchived: true })]).then(([library, read]) => {
      if (active) { setData({ objects: library.objects, relations: read.relations }); setRefreshError(null); if (isSameScopeRefresh) setWriteStatus("关系已保存，列表已更新。"); }
    }).catch((cause: unknown) => {
      if (!active) return;
      const message = cause instanceof Error ? cause.message : "正式关系暂时无法读取。";
      if (isSameScopeRefresh) setRefreshError(`关系已保存，但列表更新失败：${message}`);
      else setError(`${message}没有将读取失败显示为零条关系。`);
    });
    return () => { active = false; };
  }, [projectId, workVersionId, observedAt, reloadNonce]);

  const writeRoute = (next: Partial<{ center: string; mode: ViewMode; type: string; query: string; all: boolean; expanded: ReadonlySet<string>; viewport: GraphViewport; selection: GraphSelection; selectedRelationId: string }>) => {
    const target = new URL(window.location.href);
    target.pathname = "/library";
    target.searchParams.set("libraryView", "relations");
    target.searchParams.delete("worldView");
    const center = next.center ?? centerId;
    if (center) target.searchParams.set("relationCenter", center); else target.searchParams.delete("relationCenter");
    const nextMode = next.mode ?? mode;
    if (nextMode === "list") target.searchParams.set("relationView", nextMode); else target.searchParams.delete("relationView");
    const type = next.type ?? typeFilter;
    if (type) target.searchParams.set("relationType", type); else target.searchParams.delete("relationType");
    const query = next.query ?? objectSearch;
    if (query) target.searchParams.set("relationQuery", query); else target.searchParams.delete("relationQuery");
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
    const relationItem = next.selectedRelationId ?? selectedRelationId;
    if (routeSelection?.kind === "edge" && relationItem) target.searchParams.set("relationItem", relationItem); else target.searchParams.delete("relationItem");
    return `${target.pathname}?${target.searchParams.toString()}`;
  };
  const updateRoute = (next: Parameters<typeof writeRoute>[0]) => window.history.replaceState({}, "", writeRoute(next));
  const selectCenter = (id: string) => { const next = new Set<string>(); setCenterId(id); setShowAll(false); setExpanded(next); setSelection({ kind: "node", id }); setSelectedRelationId(""); setCreateFormOpen(false); setFitNonce((value) => value + 1); updateRoute({ center: id, all: false, expanded: next, selection: { kind: "node", id }, selectedRelationId: "" }); };
  const selectMode = (next: ViewMode) => { setMode(next); updateRoute({ mode: next }); };
  const selectType = (next: string) => { setTypeFilter(next); setSelection(null); setSelectedRelationId(""); setFitNonce((value) => value + 1); updateRoute({ type: next, selection: null, selectedRelationId: "" }); };
  const updateObjectSearch = (next: string) => { setObjectSearch(next); updateRoute({ query: next }); };
  const selectScope = (next: boolean) => { setShowAll(next); setSelection(null); setSelectedRelationId(""); setFitNonce((value) => value + 1); updateRoute({ all: next, selection: null, selectedRelationId: "" }); };
  const updateExpanded = (next: ReadonlySet<string>) => { setExpanded(next); updateRoute({ expanded: next }); };
  const updateViewport = (next: GraphViewport) => {
    const normalized = normalizeViewport(next);
    if (sameViewport(viewport, normalized)) return;
    setViewport(normalized);
    updateRoute({ viewport: normalized });
  };
  const selectGraph = (next: GraphSelection) => { setCreateFormOpen(false); setSelection(next); if (next?.kind !== "edge") setSelectedRelationId(""); updateRoute({ selection: next, ...(next?.kind !== "edge" ? { selectedRelationId: "" } : {}) }); };
  const selectRelation = (relationId: string) => { setCreateFormOpen(false); setSelectedRelationId(relationId); updateRoute({ selectedRelationId: relationId }); };
  const selectRelationGroup = (groupKey: string, relationId: string) => {
    setCreateFormOpen(false);
    const nextSelection: GraphSelection = { kind: "edge", id: groupKey };
    setSelection(nextSelection);
    setSelectedRelationId(relationId);
    updateRoute({ selection: nextSelection, selectedRelationId: relationId });
  };
  const back = () => { const value = params.get("relationReturn"); window.location.assign(safeReturn(value) ?? "/library?libraryView=map"); };
  const returnTarget = safeReturn(params.get("relationReturn"));

  if (!projectId) return <main className="shell-workspace focused-relations-shell"><MaterialsSectionNavigation current="relations" /><section className="shell-workspace-stage"><h1>先打开一个作品</h1></section></main>;
  if (!workVersionId && workVersionState === "loading") return <main className="shell-workspace focused-relations-shell"><MaterialsSectionNavigation current="relations" /><section className="focused-relations" aria-busy="true"><p>正在恢复当前作品与关系现场……</p></section></main>;
  if (!workVersionId && workVersionState === "error") return <main className="shell-workspace focused-relations-shell"><MaterialsSectionNavigation current="relations" /><section className="focused-relations" role="alert"><h1>作品版本暂时无法读取</h1><p>没有把读取失败显示成无版本作品，也没有读取其他版本的关系。</p><button type="button" onClick={props.runtime.retryConnection}>重新读取</button></section></main>;
  if (!workVersionId) return <main className="shell-workspace focused-relations-shell"><MaterialsSectionNavigation current="relations" /><section className="shell-workspace-stage"><h1>当前作品尚未建立作品版本</h1><p>关系按作品版本读取；没有为旧作品猜造版本，也没有读取其他版本关系。</p><p>建立首个版本的路径：在资料库准备人物与地点，到事件线用“常规创作”确认正式事件，再到创作空间建立主故事版本。</p><div className="focused-relations-empty-actions"><button type="button" className="primary-action" onClick={() => { window.location.assign("/creation"); }}>前往创作空间建立首个版本</button><button type="button" onClick={() => { window.location.assign("/event-line"); }}>前往事件线</button><button type="button" onClick={() => { window.location.assign("/library"); }}>前往资料库</button></div><button type="button" onClick={back}><ChevronLeft aria-hidden="true" />{returnLabel(returnTarget)}</button></section></main>;
  if (error) return <main className="shell-workspace focused-relations-shell"><MaterialsSectionNavigation current="relations" /><section className="focused-relations" role="alert"><h1>关系暂时无法读取</h1><p>{error}</p><button type="button" onClick={back}>返回</button></section></main>;
  if (!data) return <main className="shell-workspace focused-relations-shell"><MaterialsSectionNavigation current="relations" /><section className="focused-relations" aria-busy="true"><p>正在读取当前作品版本的正式关系……</p></section></main>;

  const labels = new Map(data.objects.map((item) => [item.id, item]));
  const searchableObjects = data.objects.filter((item) => item.type === "character" || item.type === "location");
  const normalizedSearch = objectSearch.trim().toLocaleLowerCase();
  const matchingObjects = searchableObjects.filter((item) => !normalizedSearch || [item.title, ...item.aliases, ...item.tags].some((value) => value.toLocaleLowerCase().includes(normalizedSearch))).slice(0, 8);
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
  const openCharacter = (characterId: string) => {
    const query = new URLSearchParams({ worldView: "character", characterId, characterOrigin: writeRoute({}) });
    window.location.assign(`/world?${query.toString()}`);
  };
  const openTianyi = (objectIds: readonly string[], relation: RelationReadProjectionR0 | null) => {
    const query = new URLSearchParams({ tianyiLane: "work", tianyiSource: "relations", materialReturn: writeRoute({}) });
    for (const id of [...new Set(objectIds)].slice(0, MAX_RELATION_HANDOFF_OBJECTS)) if (labels.has(id)) query.append("materialRef", id);
    if (relation) {
      query.set("relationRef", relation.relationId);
      query.set("relationLabel", relationTypeLabel(relation));
      query.set("relationSource", relation.sourceObjectId);
      query.set("relationTarget", relation.targetObjectId);
      query.set("relationDirection", relation.direction);
      const reference = exactEventReference(relation);
      if (reference) { query.append("eventRef", reference.eventId); query.append("eventRevision", reference.revision); }
    }
    window.location.assign(`/tianyi?${query.toString()}`);
  };
  return <main className={`shell-workspace focused-relations-shell ${createFormOpen ? "has-create-form" : ""}`} aria-label="聚焦关系查看">
    <MaterialsSectionNavigation current="relations" />
    <section className="focused-relations" data-testid="focused-relations-workspace">
      <header className="focused-relations-toolbar"><div className="focused-relations-toolbar-top"><button type="button" onClick={back}><ChevronLeft aria-hidden="true" />{returnLabel(returnTarget)}</button><div className="focused-relations-heading"><strong>{center && !showAll ? `${objectLabel(center)}的关系` : "人物关系"}</strong><span>{observationLabel(params)}{props.runtime.workVersionLabel ? ` · ${props.runtime.workVersionLabel}` : ""}</span></div><div className="focused-relations-view-switch" role="group" aria-label="关系显示方式"><button type="button" aria-pressed={mode === "graph"} onClick={() => selectMode("graph")}><GitBranch aria-hidden="true" />关系图</button><button type="button" aria-pressed={mode === "list"} onClick={() => selectMode("list")}><List aria-hidden="true" />列表</button></div></div><div className="focused-relations-toolbar-controls"><div className="focused-relations-object-search"><label><Search aria-hidden="true" /><input aria-label="搜索人物或地点" value={objectSearch} onChange={(event)=>updateObjectSearch(event.target.value)} placeholder="搜索人物或地点并聚焦" /></label>{objectSearch.trim() ? <div className="focused-relations-search-results">{matchingObjects.length ? matchingObjects.map((item)=><button type="button" key={item.id} onClick={()=>{updateObjectSearch("");selectCenter(item.id);}}>{item.title}<small>{item.type === "character" ? "人物" : "地点"}</small></button>) : <span>没有匹配的对象</span>}</div> : null}</div><details className="focused-relations-filters"><summary>{typeFilter ? `筛选：${typeFilter}` : "筛选"}</summary><label>关系类型<select aria-label="筛选关系类型" value={typeFilter} onChange={(event) => selectType(event.target.value)}><option value="">全部类型</option>{availableTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label></details>{center ? <div className="focused-relations-scope" role="group" aria-label="关系范围"><button type="button" aria-pressed={!showAll} onClick={() => selectScope(false)}>聚焦{objectLabel(center)}</button><button type="button" aria-pressed={showAll} onClick={() => selectScope(true)}>完整网络</button></div> : null}<button type="button" className="focused-relations-create-toggle" aria-pressed={createFormOpen} onClick={openCreateForm}><Plus aria-hidden="true" />建立关系</button></div></header>
      {createFormOpen && projectId && workVersionId ? <RelationCreateForm projectId={projectId} workVersionId={workVersionId} objects={data.objects} withConnection={(fn) => props.runtime.withConnection(fn)} onClose={() => setCreateFormOpen(false)} onChanged={() => { setWriteStatus("关系已保存，正在更新列表……"); setReloadNonce((value) => value + 1); }} /> : null}
      {observedAt && unknownInScope.length ? <p className="focused-relations-notice">当前范围有 {unknownInScope.length} 条关系缺少、无效或不确定的故事生效时间，未伪装为该节点的历史关系。</p> : null}
      {refreshError ? <p className="focused-relations-notice" role="alert">{refreshError}<button type="button" onClick={() => setReloadNonce((value) => value + 1)}>重试更新</button></p> : null}
      {!refreshError && writeStatus ? <p className="focused-relations-save-status" role="status">{writeStatus}</p> : null}
      {sourceError ? <p className="focused-relations-notice" role="alert">{sourceError}</p> : null}
      {(center || showAll) ? <div className="focused-relations-filter-summary" aria-live="polite"><span>当前显示 {visibleRelations.length} / {displayable.length} 条已确认关系{typeFilter ? ` · 类型：${typeFilter}` : ""}</span>{typeFilter ? <button type="button" onClick={() => selectType("")}>清除类型筛选</button> : null}</div> : null}
      {!displayable.length ? <section className="focused-relations-empty"><h1>还没有已确认的关系</h1><p>可以直接声明人物设定，也可用已确认事件作为关系依据。</p>{createFormOpen ? null : <button type="button" className="primary-action" onClick={openCreateForm}>建立第一条关系</button>}</section> : mode === "list" ? <RelationList relations={visibleRelations} labels={labels} onCenter={selectCenter} onEvidence={openEvent} onOpenCharacter={openCharacter} onHandoff={(relation)=>openTianyi([relation.sourceObjectId, relation.targetObjectId], relation)} /> : <RelationGraph projectId={projectId} workVersionId={workVersionId} centerId={centerId} nodeIds={visibleIds} relations={visibleRelations} labels={labels} expanded={expanded} viewport={viewport} hasPersistedViewport={hasPersistedViewport} fitNonce={fitNonce} selection={selection} selectedRelationId={selectedRelationId} onSelection={selectGraph} onSelectRelation={selectRelation} onSelectRelationGroup={selectRelationGroup} onViewport={updateViewport} onFit={updateViewport} onRequestFit={() => setFitNonce((value) => value + 1)} onExpand={(id) => updateExpanded(new Set([...expanded, id]))} onCollapse={(id) => { const next = new Set(expanded); next.delete(id); updateExpanded(next); }} onCenter={selectCenter} onEvidence={openEvent} onOpenCharacter={openCharacter} onHandoffNode={(id)=>openTianyi([id], null)} onHandoffRelation={(relation)=>openTianyi([relation.sourceObjectId, relation.targetObjectId], relation)} />}
      <footer>范围：{showAll ? `全局已确认关系 ${filtered.length} 条` : `${center ? objectLabel(center) : "未选择中心"}的直接正式关系 ${direct.length} 条`}。</footer>
    </section>
  </main>;
}

function RelationList(props: { relations: readonly RelationReadProjectionR0[]; labels: ReadonlyMap<string, WorldObjectSummary>; activeRelationId?: string; onSelectRelation?(relationId: string): void; onCenter(id: string): void; onEvidence(relation: RelationReadProjectionR0): void; onOpenCharacter?(id: string): void; onHandoff?(relation: RelationReadProjectionR0): void }) {
  const endpointAction = (id: string) => props.labels.get(id)?.type === "character" && props.onOpenCharacter ? () => props.onOpenCharacter!(id) : () => props.onCenter(id);
  return <section className="focused-relations-list" aria-label="关系列表">{props.relations.length ? <ul>{props.relations.map((relation) => <li key={relation.relationId} className={props.activeRelationId === relation.relationId ? "is-selected" : undefined}><div><button type="button" onClick={endpointAction(relation.sourceObjectId)}>{endpointLabel(props.labels, relation.sourceObjectId)}</button><span aria-hidden="true">{directionSymbol(relation.direction)}</span>{props.onSelectRelation ? <button type="button" className="focused-relations-relation-choice" aria-pressed={props.activeRelationId === relation.relationId} onClick={() => props.onSelectRelation!(relation.relationId)}>{relationTypeLabel(relation)}</button> : <strong>{relationTypeLabel(relation)}</strong>}<button type="button" onClick={endpointAction(relation.targetObjectId)}>{endpointLabel(props.labels, relation.targetObjectId)}</button>{exactEventReference(relation) ? <button className="focused-relations-evidence-link" type="button" onClick={() => props.onEvidence(relation)}>打开依据</button> : <span className="focused-relations-no-evidence">未记录事件依据</span>}{props.onHandoff ? <button type="button" className="focused-relations-handoff" onClick={()=>props.onHandoff!(relation)}><Sparkles aria-hidden="true" />交给天意</button> : null}</div><small>{directionLabel(relation.direction)} · {relationTimeSummary(relation)}{relation.archived ? " · 已归档" : ""}</small></li>)}</ul> : <p>当前范围没有可显示的已确认正式关系。</p>}</section>;
}

function RelationGraph(props: { projectId: string; workVersionId: string; centerId: string; nodeIds: ReadonlySet<string>; relations: readonly RelationReadProjectionR0[]; labels: ReadonlyMap<string, WorldObjectSummary>; expanded: ReadonlySet<string>; viewport: GraphViewport; hasPersistedViewport: boolean; fitNonce: number; selection: GraphSelection; selectedRelationId: string; onSelection(value: GraphSelection): void; onSelectRelation(relationId: string): void; onSelectRelationGroup(groupKey: string, relationId: string): void; onViewport(value: GraphViewport): void; onFit(value: GraphViewport): void; onRequestFit(): void; onExpand(id: string): void; onCollapse(id: string): void; onCenter(id: string): void; onEvidence(relation: RelationReadProjectionR0): void; onOpenCharacter(id: string): void; onHandoffNode(id: string): void; onHandoffRelation(relation: RelationReadProjectionR0): void }) {
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef(props.viewport);
  const didInitialFit = useRef(false);
  const fitNonceRef = useRef(props.fitNonce);
  const nodes = [...props.nodeIds].sort((left, right) => left.localeCompare(right)).map((id) => ({ id, object: props.labels.get(id) ?? null }));
  const positions = graphPositions(nodes.map((node) => node.id), props.centerId);
  const groups = relationGroups(props.relations);
  const labeledGroups = props.centerId
    ? groups.filter((group) => group.sourceId === props.centerId || group.targetId === props.centerId || props.expanded.has(group.sourceId) || props.expanded.has(group.targetId))
    : groups.slice(0, 6);
  viewportRef.current = props.viewport;
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const fitRequested = fitNonceRef.current !== props.fitNonce;
    fitNonceRef.current = props.fitNonce;
    const selectedPoints = () => graphSelectionPoints(props.selection, groups, nodes, positions);
    const updateForCanvas = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      if (!didInitialFit.current) {
        didInitialFit.current = true;
        if (!props.hasPersistedViewport) props.onFit(fitViewport(positions, width, height));
        return;
      }
      if (fitRequested) { props.onFit(fitViewport(positions, width, height)); return; }
      if (props.selection) props.onViewport(keepPointsVisible(viewportRef.current, selectedPoints(), width, height));
    };
    const schedule = () => { window.cancelAnimationFrame(frame); frame = window.requestAnimationFrame(updateForCanvas); };
    const observer = new ResizeObserver(schedule);
    observer.observe(canvas);
    updateForCanvas();
    return () => { window.cancelAnimationFrame(frame); observer.disconnect(); };
  }, [props.fitNonce, props.hasPersistedViewport, props.selection, props.centerId, props.nodeIds, props.relations]);
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
  const selectedRelation = selectedGroup?.relations.find((relation) => relation.relationId === props.selectedRelationId) ?? selectedGroup?.relations[0] ?? null;
  const selectedNode = props.selection?.kind === "node" ? nodes.find((node) => node.id === props.selection!.id) ?? null : null;
  const fitCurrentSelection = () => {
    const canvas = canvasRef.current;
    if (!canvas || !props.selection) return;
    const points = graphSelectionPoints(props.selection, groups, nodes, positions);
    props.onViewport(fitViewport(new Map(points.map((point, index) => [String(index), point])), canvas.clientWidth, canvas.clientHeight));
  };
  return <section className={`focused-relations-graph ${props.selection ? "has-selection" : ""}`} aria-label="对象关系图">
    <div ref={canvasRef} className="focused-relations-canvas" data-testid="focused-relations-canvas" tabIndex={0} aria-label="关系连线画布" onWheel={(event) => { event.preventDefault(); props.onViewport({ ...props.viewport, scale: props.viewport.scale + (event.deltaY < 0 ? .1 : -.1) }); }} onPointerDown={(event) => { if (!(event.target instanceof Element) || event.target.closest("button")) return; event.currentTarget.setPointerCapture(event.pointerId); setDragStart({ x: event.clientX, y: event.clientY }); }} onPointerMove={(event) => { if (!dragStart) return; move({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y }); setDragStart({ x: event.clientX, y: event.clientY }); }} onPointerUp={() => setDragStart(null)} onKeyDown={(event) => { const step = 24; if (event.key === "ArrowLeft") { event.preventDefault(); move({ x: -step, y: 0 }); } if (event.key === "ArrowRight") { event.preventDefault(); move({ x: step, y: 0 }); } if (event.key === "ArrowUp") { event.preventDefault(); move({ x: 0, y: -step }); } if (event.key === "ArrowDown") { event.preventDefault(); move({ x: 0, y: step }); } if (event.key === "+" || event.key === "=") { event.preventDefault(); props.onViewport({ ...props.viewport, scale: props.viewport.scale + .1 }); } if (event.key === "-") { event.preventDefault(); props.onViewport({ ...props.viewport, scale: props.viewport.scale - .1 }); } if (event.key === "0") { event.preventDefault(); props.onRequestFit(); } }}>
      <div className="focused-relations-canvas-tools"><span><Move aria-hidden="true" />拖动平移，滚轮缩放</span><div><button type="button" aria-label="缩小关系图" onClick={() => props.onViewport({ ...props.viewport, scale: props.viewport.scale - .15 })}><Minus aria-hidden="true" /></button><button type="button" aria-label="放大关系图" onClick={() => props.onViewport({ ...props.viewport, scale: props.viewport.scale + .15 })}><Plus aria-hidden="true" /></button><button type="button" onClick={props.onRequestFit}>适配</button></div></div>
      <div className="focused-relations-canvas-world" style={{ transform: `translate(${props.viewport.x}px, ${props.viewport.y}px) scale(${props.viewport.scale})` }}>
        <svg className="focused-relations-edges" viewBox="0 0 960 560" aria-hidden="true"><defs><marker id="relation-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>{groups.map((group) => { const source = positions.get(group.sourceId); const target = positions.get(group.targetId); if (!source || !target) return null; const directions = new Set(group.relations.map((relation) => relation.direction)); const edge = edgeEndpoints(source, target); const curve = curvedEdge(edge, group.key); const isSelected = props.selection?.kind === "edge" && props.selection.id === group.key; const isContext = !labeledGroups.includes(group); return <path key={group.key} className={isSelected ? "is-selected" : isContext ? "is-context" : undefined} d={curve.path} markerStart={directions.has("reverse") || directions.has("both") ? "url(#relation-arrow)" : undefined} markerEnd={directions.has("forward") || directions.has("both") ? "url(#relation-arrow)" : undefined} />; })}</svg>
        {labeledGroups.map((group) => { const source = positions.get(group.sourceId); const target = positions.get(group.targetId); if (!source || !target) return null; const edge = edgeEndpoints(source, target); const curve = curvedEdge(edge, group.key); const nearSource = stableParity(group.key) === 0; const label = curvePoint(curve, group.sourceId === props.centerId ? .7 : group.targetId === props.centerId ? .3 : nearSource ? .24 : .76); return <button key={group.key} type="button" className="focused-relations-edge-label" aria-pressed={props.selection?.kind === "edge" && props.selection.id === group.key} style={{ left: `${label.x}px`, top: `${label.y}px` }} onClick={() => props.onSelectRelationGroup(group.key, group.relations[0]?.relationId ?? "")}>{relationGroupLabel(group.relations)}</button>; })}
        {nodes.map((node) => { const point = positions.get(node.id)!; return <button key={node.id} type="button" className={`focused-relations-node ${node.id === props.centerId ? "is-center" : ""}`} aria-pressed={props.selection?.kind === "node" && props.selection.id === node.id} style={{ left: `${point.x}px`, top: `${point.y}px` }} onClick={() => props.onSelection({ kind: "node", id: node.id })}>{node.object?.type === "location" ? <MapPin aria-hidden="true" /> : <UserRound aria-hidden="true" />}<span><strong>{node.object ? objectLabel(node.object) : "未解析的正式端点"}</strong><small>{node.object?.type === "location" ? "地点" : node.object?.type === "character" ? "人物" : "对象"}</small></span></button>; })}
      </div>
    </div>
    {props.selection ? <aside className="focused-relations-detail" aria-label="所选关系详情"><button type="button" aria-label="关闭详情" onClick={() => props.onSelection(null)}><X aria-hidden="true" /></button>{selectedNode ? <><small>对象</small><h2>{selectedNode.object ? objectLabel(selectedNode.object) : "未解析的正式端点"}</h2><p>{selectedNode.object?.type === "location" ? "地点" : "人物"}</p>{selectedNode.object?.type === "character" ? <button type="button" onClick={()=>props.onOpenCharacter(selectedNode.id)}>查看人物资料</button> : null}{selectedNode.id !== props.centerId ? <button type="button" onClick={() => props.onCenter(selectedNode.id)}>以此为中心</button> : null}{selectedNode.id !== props.centerId ? props.expanded.has(selectedNode.id) ? <button type="button" onClick={() => props.onCollapse(selectedNode.id)}>收起邻居</button> : <button type="button" onClick={() => props.onExpand(selectedNode.id)}><Expand aria-hidden="true" />展开邻居</button> : null}<button type="button" className="primary-action" onClick={()=>props.onHandoffNode(selectedNode.id)}><Sparkles aria-hidden="true" />带着此对象进入天意</button></> : selectedGroup && selectedRelation ? <><small>已确认关系 · {selectedGroup.relations.length} 条</small><h2>{selectedGroup.relations.length > 1 ? "同一对对象的多条关系" : relationTypeLabel(selectedRelation)}</h2><p>{endpointLabel(props.labels, selectedGroup.sourceId)} 与 {endpointLabel(props.labels, selectedGroup.targetId)}；请选择一条关系查看它自己的方向与依据。</p><button type="button" onClick={fitCurrentSelection}>适配当前关系</button><RelationList relations={selectedGroup.relations} labels={props.labels} activeRelationId={selectedRelation.relationId} onSelectRelation={props.onSelectRelation} onCenter={props.onCenter} onEvidence={props.onEvidence} onOpenCharacter={props.onOpenCharacter} /><RelationEvidenceReader key={selectedRelation.relationId} projectId={props.projectId} workVersionId={props.workVersionId} relation={selectedRelation} onOpenFull={() => props.onEvidence(selectedRelation)} /><button type="button" className="primary-action" onClick={()=>props.onHandoffRelation(selectedRelation)}><Sparkles aria-hidden="true" />带着这条关系与依据进入天意</button><small>正式关系与来源事件保持原有权威记录；天意只接收作者明确选择的资料，不会自动改写关系。</small></> : null}</aside> : <p className="focused-relations-selection-hint">选择对象或关系，查看详情与依据。</p>}
  </section>;
}

function RelationEvidenceReader(props: { projectId: string; workVersionId: string; relation: RelationReadProjectionR0; onOpenFull(): void }) {
  const reference = exactEventReference(props.relation);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; title?: string; body?: string; message?: string }>(() => reference ? { status: "loading" } : { status: "error", message: "这条关系没有记录来源事件。" });
  useEffect(() => {
    let active = true;
    if (!reference) { setState({ status: "error", message: "这条关系没有记录来源事件。" }); return; }
    setState({ status: "loading" });
    void getVerifiedCanonEvent(props.projectId, reference.eventId, props.workVersionId).then((read) => {
      if (!active) return;
      if (read.status === "error") { setState({ status: "error", message: `来源事件读取失败：${read.error.message}` }); return; }
      if (read.event.revisionToken !== reference.revision) { setState({ status: "error", message: "来源事件版本已变化；没有用较新的正文替代原依据。" }); return; }
      setState({ status: "ready", title: read.event.title, body: read.event.body.trim() });
    }).catch((cause: unknown) => { if (active) setState({ status: "error", message: cause instanceof Error ? `来源事件读取失败：${cause.message}` : "来源事件暂时无法读取。" }); });
    return () => { active = false; };
  }, [props.projectId, props.workVersionId, reference?.eventId, reference?.revision]);
  return <section className="focused-relations-evidence" aria-label={`${relationTypeLabel(props.relation)}的来源事件`} aria-busy={state.status === "loading"}>
    <header><div><small>来源事件</small><strong>{state.title ?? relationTypeLabel(props.relation)}</strong></div>{reference ? <button type="button" onClick={props.onOpenFull}>打开完整事件</button> : null}</header>
    {state.status === "loading" ? <p>正在读取这条关系所引用的事件内容……</p> : state.status === "error" ? <p role="alert">{state.message}</p> : state.body ? <div className="focused-relations-evidence-body">{state.body.split(/\n{2,}/u).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div> : <p>这个来源事件没有可读正文。</p>}
  </section>;
}

function graphPositions(ids: readonly string[], centerId: string): ReadonlyMap<string, Point> { const ordered = [...ids].sort((left, right) => left === centerId ? -1 : right === centerId ? 1 : left.localeCompare(right)); const positions = new Map<string, Point>(); const center = ordered[0]; if (center) positions.set(center, { x: 480, y: 280 }); const neighbours = ordered.slice(1); for (const [index, id] of neighbours.entries()) { const angle = neighbours.length === 1 ? 0 : (Math.PI * 2 * index / neighbours.length) - Math.PI / 2; positions.set(id, { x: 480 + Math.cos(angle) * 250, y: 280 + Math.sin(angle) * 176 }); } return positions; }
function edgeEndpoints(source: Point, target: Point): { x1: number; y1: number; x2: number; y2: number } { const dx = target.x - source.x; const dy = target.y - source.y; const scale = 1 / Math.max(Math.abs(dx) / 72, Math.abs(dy) / 32, 1); return { x1: source.x + dx * scale, y1: source.y + dy * scale, x2: target.x - dx * scale, y2: target.y - dy * scale }; }
function curvedEdge(edge: ReturnType<typeof edgeEndpoints>, key: string): { path: string; start: Point; control: Point; end: Point } { const dx = edge.x2 - edge.x1; const dy = edge.y2 - edge.y1; const length = Math.max(1, Math.hypot(dx, dy)); const sign = stableParity(key) ? 1 : -1; const offset = Math.min(34, Math.max(16, length * .08)) * sign; const nx = -dy / length; const ny = dx / length; const control = { x: (edge.x1 + edge.x2) / 2 + nx * offset, y: (edge.y1 + edge.y2) / 2 + ny * offset }; return { path: `M ${edge.x1} ${edge.y1} Q ${control.x} ${control.y} ${edge.x2} ${edge.y2}`, start: { x: edge.x1, y: edge.y1 }, control, end: { x: edge.x2, y: edge.y2 } }; }
function curvePoint(curve: ReturnType<typeof curvedEdge>, t: number): Point { const inverse = 1 - t; return { x: inverse * inverse * curve.start.x + 2 * inverse * t * curve.control.x + t * t * curve.end.x, y: inverse * inverse * curve.start.y + 2 * inverse * t * curve.control.y + t * t * curve.end.y }; }
function stableParity(value: string): 0 | 1 { return [...value].reduce((sum, item) => sum + item.codePointAt(0)!, 0) % 2 as 0 | 1; }
function fitViewport(points: ReadonlyMap<string, Point>, width: number, height: number): GraphViewport { const values = [...points.values()]; if (!values.length || !width || !height) return defaultViewport; const minX = Math.min(...values.map((value) => value.x - 80)); const maxX = Math.max(...values.map((value) => value.x + 80)); const minY = Math.min(...values.map((value) => value.y - 48)); const maxY = Math.max(...values.map((value) => value.y + 48)); const scale = Math.min(1.35, Math.max(.55, Math.min((width - 96) / (maxX - minX), (height - 96) / (maxY - minY)))); return normalizeViewport({ x: width / 2 - ((minX + maxX) / 2) * scale, y: height / 2 - ((minY + maxY) / 2) * scale, scale }); }
function graphSelectionPoints(selection: GraphSelection, groups: ReturnType<typeof relationGroups>, nodes: readonly { id: string }[], positions: ReadonlyMap<string, Point>): Point[] { const ids = selection?.kind === "edge" ? (() => { const group = groups.find((item) => item.key === selection.id); return group ? [group.sourceId, group.targetId] : []; })() : selection?.kind === "node" ? [selection.id] : nodes.map((node) => node.id); return ids.flatMap((id) => { const point = positions.get(id); return point ? [point] : []; }); }
function keepPointsVisible(viewport: GraphViewport, points: readonly Point[], width: number, height: number): GraphViewport { if (!points.length || !width || !height) return viewport; const padding = 32; const minX = Math.min(...points.map((point) => point.x - 80)); const maxX = Math.max(...points.map((point) => point.x + 80)); const minY = Math.min(...points.map((point) => point.y - 48)); const maxY = Math.max(...points.map((point) => point.y + 48)); const neededScale = Math.min((width - padding * 2) / (maxX - minX), (height - padding * 2) / (maxY - minY)); const scale = neededScale < viewport.scale ? Math.max(.55, neededScale) : viewport.scale; const screenMinX = minX * scale + viewport.x; const screenMaxX = maxX * scale + viewport.x; const screenMinY = minY * scale + viewport.y; const screenMaxY = maxY * scale + viewport.y; const x = viewport.x + (screenMinX < padding ? padding - screenMinX : screenMaxX > width - padding ? width - padding - screenMaxX : 0); const y = viewport.y + (screenMinY < padding ? padding - screenMinY : screenMaxY > height - padding ? height - padding - screenMaxY : 0); const next = normalizeViewport({ x, y, scale }); return sameViewport(viewport, next) ? viewport : next; }
function relationGroups(relations: readonly RelationReadProjectionR0[]): Array<{ key: string; sourceId: string; targetId: string; relations: RelationReadProjectionR0[] }> { const groups = new Map<string, { key: string; sourceId: string; targetId: string; relations: RelationReadProjectionR0[] }>(); for (const relation of relations) { const key = [relation.sourceObjectId, relation.targetObjectId].sort().join("\u0000"); const current = groups.get(key) ?? { key, sourceId: relation.sourceObjectId, targetId: relation.targetObjectId, relations: [] }; current.relations.push(relation); groups.set(key, current); } return [...groups.values()]; }
function normalizeViewport(value: GraphViewport): GraphViewport { return { x: Number.isFinite(value.x) ? Math.max(-720, Math.min(720, value.x)) : 0, y: Number.isFinite(value.y) ? Math.max(-440, Math.min(440, value.y)) : 0, scale: Number.isFinite(value.scale) ? Math.max(.55, Math.min(1.8, value.scale)) : 1 }; }
function sameViewport(left: GraphViewport, right: GraphViewport): boolean { return left.x === right.x && left.y === right.y && left.scale === right.scale; }
function relationTypeLabel(relation: RelationReadProjectionR0): string { return relation.currentTypeLabel ?? relation.relationLabelSnapshot; }
function relationGroupLabel(relations: readonly RelationReadProjectionR0[]): string { const labels = [...new Set(relations.map(relationTypeLabel))]; return labels.length <= 2 ? labels.join(" · ") : `${labels.slice(0, 2).join(" · ")} +${labels.length - 2}`; }
function isAttached(relation: RelationReadProjectionR0, id: string): boolean { return Boolean(id) && (relation.sourceObjectId === id || relation.targetObjectId === id); }
function addRelationEndpoints(ids: Set<string>, relation: RelationReadProjectionR0) { ids.add(relation.sourceObjectId); ids.add(relation.targetObjectId); }
function objectLabel(object: WorldObjectSummary): string { return `${object.title}${object.status === "archived" ? "（对象已归档）" : ""}`; }
function endpointLabel(labels: ReadonlyMap<string, WorldObjectSummary>, id: string): string { const object = labels.get(id); return object ? objectLabel(object) : "未解析的正式端点"; }
function directionLabel(direction: RelationReadProjectionR0["direction"]): string { return direction === "both" ? "双向" : direction === "forward" ? "由左至右" : direction === "reverse" ? "由右至左" : "方向未指定"; }
function directionSymbol(direction: RelationReadProjectionR0["direction"]): string { return direction === "both" ? "↔" : direction === "forward" ? "→" : direction === "reverse" ? "←" : "—"; }
function exactEventReference(relation: RelationReadProjectionR0): { eventId: string; revision: string } | null { const reference = relation.evidenceRefs.find((item) => item.kind === "confirmed-event")?.reference as { eventId?: string; revision?: string; revisionToken?: string } | undefined; const revision = reference?.revision ?? reference?.revisionToken; return reference?.eventId && revision ? { eventId: reference.eventId, revision } : null; }
function relationTimeSummary(relation: RelationReadProjectionR0): string { const from = relation.temporal?.validFrom; if (!from) return "有效时间未知"; return `有效于 ${from.slice(0, 10)}${from.endsWith("Z") ? "（UTC）" : ""}`; }
function selectionFromRoute(params: URLSearchParams): GraphSelection { const value = params.get("relationSelection"); const match = value?.match(/^(node|edge):(.+)$/u); return match ? { kind: match[1] as "node" | "edge", id: match[2] } : null; }
function safeReturn(value: string | null): string | null { return value && value.startsWith("/") && !value.startsWith("//") ? value : null; }
function returnLabel(target: string | null): string { return target?.includes("worldView=character") ? "返回角色" : target?.includes("libraryView=map") || target?.includes("worldView=map") ? "返回地图" : "返回来源"; }
function observationLabel(params: URLSearchParams): string { if (!params.get("mapObservedAt")) return "当前状态"; return params.get("mapObservationLabel") || `故事节点 · ${params.get("mapObservationEvent") || "未命名"}`; }
