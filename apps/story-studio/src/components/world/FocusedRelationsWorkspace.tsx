import { ChevronLeft, Expand, GitBranch, List, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { getWorldLibrary, listRelations, type WorldObjectSummary } from "../../lib/localTransport";
import type { RelationReadProjectionR0 } from "../../../../../src/storyControlSurface/storyStudioRelationOperations.ts";
import type { TianyanShellRuntimeState } from "../../product-shell/runtime/TianyanShellRuntime";

type ViewMode = "graph" | "list";
type RelationData = { objects: readonly WorldObjectSummary[]; relations: readonly RelationReadProjectionR0[]; unlocated: number };

/** Read-only object neighbourhood; Relation Owner remains the sole fact owner. */
export function FocusedRelationsWorkspace(props: { runtime: TianyanShellRuntimeState }) {
  const params = new URLSearchParams(window.location.search);
  const projectId = props.runtime.project?.id ?? null;
  const workVersionId = props.runtime.workVersionId;
  const [centerId, setCenterId] = useState(() => params.get("relationCenter") || "");
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [mode, setMode] = useState<ViewMode>(() => params.get("relationView") === "list" ? "list" : "graph");
  const [typeFilter, setTypeFilter] = useState(() => params.get("relationType") || "");
  const [showAll, setShowAll] = useState(() => params.get("relationScope") === "all");
  const [data, setData] = useState<RelationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const observedAt = params.get("mapObservedAt");

  useEffect(() => {
    let active = true;
    setData(null); setError(null); setExpanded(new Set());
    if (!projectId || !workVersionId) return;
    void Promise.all([getWorldLibrary(projectId), listRelations({ projectId, workVersionId, reviewState: "confirmed" })]).then(([library, read]) => {
      if (!active) return;
      const scoped = observedAt
        ? read.relations.filter((relation) => Boolean(relation.temporal?.validFrom && relation.temporal.validFrom <= observedAt && (!relation.temporal.validTo || relation.temporal.validTo > observedAt) && !relation.archived))
        : read.relations.filter((relation) => !relation.archived);
      setData({ objects: library.objects.filter((item) => item.status !== "archived"), relations: scoped, unlocated: observedAt ? read.relations.filter((relation) => !relation.temporal?.validFrom).length : 0 });
    }).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "正式关系暂时无法读取；没有将失败显示为零条关系。"); });
    return () => { active = false; };
  }, [projectId, workVersionId, observedAt]);

  const updateRoute = (next: Partial<{ center: string; mode: ViewMode; type: string; all: boolean }>) => {
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
    window.history.replaceState({}, "", `${target.pathname}?${target.searchParams.toString()}`);
  };
  const selectCenter = (id: string) => { setCenterId(id); setExpanded(new Set()); updateRoute({ center: id }); };
  const selectMode = (next: ViewMode) => { setMode(next); updateRoute({ mode: next }); };
  const selectType = (next: string) => { setTypeFilter(next); updateRoute({ type: next }); };
  const selectScope = (next: boolean) => { setShowAll(next); updateRoute({ all: next }); };
  const back = () => {
    const value = params.get("relationReturn");
    window.location.assign(value && value.startsWith("/") && !value.startsWith("//") ? value : "/world?worldView=map");
  };
  const openEvent = (relation: RelationReadProjectionR0) => {
    const reference = relation.evidenceRefs.find((item) => item.kind === "confirmed-event")?.reference as { eventId?: string } | undefined;
    if (reference?.eventId) window.location.assign(`/event-line?eventId=${encodeURIComponent(reference.eventId)}`);
  };
  if (!projectId) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>先打开一个作品</h1></section></main>;
  if (!workVersionId) return <main className="shell-workspace"><section className="shell-workspace-stage"><h1>正在确定作品版本</h1><p>不会以其他版本的正式关系代替当前范围。</p></section></main>;
  if (error) return <main className="shell-workspace"><section className="focused-relations" role="alert"><h1>关系暂时无法读取</h1><p>{error}</p><button type="button" onClick={back}>返回</button></section></main>;
  if (!data) return <main className="shell-workspace"><section className="focused-relations" aria-busy="true"><p>正在读取当前作品版本的正式关系……</p></section></main>;
  const labels = new Map(data.objects.map((item) => [item.id, item]));
  const availableTypes = [...new Set(data.relations.map((relation) => relation.currentTypeLabel ?? relation.relationLabelSnapshot))].sort((left, right) => left.localeCompare(right, "zh-CN"));
  const filtered = typeFilter ? data.relations.filter((relation) => (relation.currentTypeLabel ?? relation.relationLabelSnapshot) === typeFilter) : data.relations;
  const direct = centerId ? filtered.filter((relation) => relation.sourceObjectId === centerId || relation.targetObjectId === centerId) : [];
  const visibleIds = new Set<string>(centerId ? [centerId] : []);
  for (const relation of showAll ? filtered : direct) { visibleIds.add(relation.sourceObjectId); visibleIds.add(relation.targetObjectId); }
  for (const nodeId of expanded) for (const relation of filtered) if (relation.sourceObjectId === nodeId || relation.targetObjectId === nodeId) { visibleIds.add(relation.sourceObjectId); visibleIds.add(relation.targetObjectId); }
  const visibleRelations = (showAll ? filtered : filtered.filter((relation) => visibleIds.has(relation.sourceObjectId) && visibleIds.has(relation.targetObjectId))).filter((relation) => !centerId || showAll || relation.sourceObjectId === centerId || relation.targetObjectId === centerId || expanded.has(relation.sourceObjectId) || expanded.has(relation.targetObjectId));
  const center = labels.get(centerId) ?? null;
  return <main className="shell-workspace focused-relations-shell" aria-label="聚焦关系查看">
    <section className="focused-relations" data-testid="focused-relations-workspace">
      <header className="focused-relations-toolbar"><button type="button" onClick={back}><ChevronLeft aria-hidden="true" />返回地图</button><div><strong>关系查看</strong><span>{center ? `中心：${center.title}` : "请选择中心对象"} · {props.runtime.workVersionLabel ?? "当前作品版本"} · {observedAt ? "地图故事节点" : "当前状态"}</span></div><label><Search aria-hidden="true" />中心对象<select aria-label="选择关系中心" value={centerId} onChange={(event) => selectCenter(event.target.value)}><option value="">请选择人物或地点</option>{data.objects.filter((item) => item.type === "character" || item.type === "location").map((item) => <option key={item.id} value={item.id}>{item.title} · {item.type === "character" ? "人物" : "地点"}</option>)}</select></label><label>类型<select aria-label="筛选关系类型" value={typeFilter} onChange={(event) => selectType(event.target.value)}><option value="">全部类型</option>{availableTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label><div className="focused-relations-actions"><button type="button" aria-pressed={mode === "graph"} onClick={() => selectMode("graph")}><GitBranch aria-hidden="true" />图</button><button type="button" aria-pressed={mode === "list"} onClick={() => selectMode("list")}><List aria-hidden="true" />列表</button><button type="button" aria-pressed={showAll} onClick={() => selectScope(!showAll)}>{showAll ? "聚焦中心" : "全局查看"}</button></div></header>
      {observedAt && data.unlocated ? <p className="focused-relations-notice">有 {data.unlocated} 条关系缺少故事生效时间，未伪装为该节点的历史关系。</p> : null}
      {!center && !showAll ? <section className="focused-relations-empty"><h1>围绕一个对象查看关系</h1><p>选择人物或地点后，只显示它的直接正式关系；事件因果关系仍在事件线中查看。</p></section> : mode === "list" ? <RelationList relations={visibleRelations} labels={labels} onCenter={selectCenter} onEvidence={openEvent} /> : <RelationGraph centerId={centerId} nodeIds={visibleIds} relations={visibleRelations} labels={labels} expanded={expanded} onExpand={(id) => setExpanded((current) => new Set([...current, id]))} onCenter={selectCenter} onEvidence={openEvent} />}
      <footer>范围：{showAll ? `全局已确认关系 ${filtered.length} 条` : `${center?.title ?? "未选择中心"}的直接正式关系 ${direct.length} 条`}；浏览、筛选与展开均不写入关系、世界状态或人物记忆。</footer>
    </section>
  </main>;
}

function RelationList(props: { relations: readonly RelationReadProjectionR0[]; labels: ReadonlyMap<string, WorldObjectSummary>; onCenter(id: string): void; onEvidence(relation: RelationReadProjectionR0): void }) {
  return <section className="focused-relations-list" aria-label="关系列表">{props.relations.length ? <ul>{props.relations.map((relation) => <li key={relation.relationId}><div><button type="button" onClick={() => props.onCenter(relation.sourceObjectId)}>{props.labels.get(relation.sourceObjectId)?.title ?? "已删除对象"}</button><strong>{relation.currentTypeLabel ?? relation.relationLabelSnapshot}</strong><button type="button" onClick={() => props.onCenter(relation.targetObjectId)}>{props.labels.get(relation.targetObjectId)?.title ?? "已删除对象"}</button></div><small>{directionLabel(relation.direction)} · {relation.temporal?.validFrom ? `${relation.temporal.validFrom} 至 ${relation.temporal.validTo ?? "仍有效"}` : "有效时间未知"}</small>{relation.evidenceRefs.some((item) => item.kind === "confirmed-event") ? <button type="button" onClick={() => props.onEvidence(relation)}>查看支持事件</button> : <small>没有可定位的正式事件依据</small>}</li>)}</ul> : <p>当前范围没有可显示的已确认正式关系。</p>}</section>;
}

function RelationGraph(props: { centerId: string; nodeIds: ReadonlySet<string>; relations: readonly RelationReadProjectionR0[]; labels: ReadonlyMap<string, WorldObjectSummary>; expanded: ReadonlySet<string>; onExpand(id: string): void; onCenter(id: string): void; onEvidence(relation: RelationReadProjectionR0): void }) {
  const nodes = [...props.nodeIds].map((id) => props.labels.get(id)).filter((item): item is WorldObjectSummary => Boolean(item));
  return <section className="focused-relations-graph" aria-label="对象关系图"><div className="focused-relations-nodes">{nodes.map((node) => <article key={node.id} className={node.id === props.centerId ? "is-center" : ""}><small>{node.type === "character" ? "人物" : node.type === "location" ? "地点" : "对象"}</small><strong>{node.title}</strong><div><button type="button" onClick={() => props.onCenter(node.id)}>以此为中心</button>{node.id !== props.centerId && !props.expanded.has(node.id) ? <button type="button" onClick={() => props.onExpand(node.id)}><Expand aria-hidden="true" />展开相关关系</button> : null}</div></article>)}</div><RelationList relations={props.relations} labels={props.labels} onCenter={props.onCenter} onEvidence={props.onEvidence} /></section>;
}

function directionLabel(direction: RelationReadProjectionR0["direction"]): string { return direction === "both" ? "双向" : direction === "forward" ? "由左至右" : direction === "reverse" ? "由右至左" : "方向未指定"; }
