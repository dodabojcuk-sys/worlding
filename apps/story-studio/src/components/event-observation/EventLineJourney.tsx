import { useEffect, useMemo, useRef, useState } from "react";
import type { EventLineEventSummary } from "../eventLineCommittedEvents";
import { getVerifiedCanonEvent, type NuwaN1Storyline, type StoryUnit, type VerifiedCanonEventDetailRead, type NarrativeArrangementRead } from "../../lib/localTransport";
import { eventLineJourneyLines, eventLineJourneyUrl, readEventLineJourneyLocation, type EventLineJourneyLocation } from "./eventLineJourneyModel";
import { authorEventBody } from "../EventLineWorkbench";
import { buildEventSemanticNode } from "../../../../../src/storyContracts/eventSemanticHierarchy";

type Props = {
  projectId: string;
  workVersionId: string | null;
  storylines: readonly NuwaN1Storyline[];
  units: readonly StoryUnit[];
  events: readonly EventLineEventSummary[];
  narratives: readonly NarrativeArrangementRead[];
  onOverview(location: EventLineJourneyLocation): void;
};

export function EventLineJourney(props: Props) {
  const [location, setLocation] = useState(() => readEventLineJourneyLocation(window.location.search));
  const [query, setQuery] = useState(() => window.sessionStorage.getItem(`event-line-search:${props.projectId}`) ?? "");
  const [sort, setSort] = useState<"title" | "source">(() => window.sessionStorage.getItem(`event-line-sort:${props.projectId}`) === "title" ? "title" : "source");
  const [detail, setDetail] = useState<VerifiedCanonEventDetailRead | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lines = useMemo(() => eventLineJourneyLines(props.storylines, props.units), [props.storylines, props.units]);
  const line = lines.find((item) => item.key === location.lineKey) ?? null;
  const unit = line?.units.find((item) => item.id === location.unitId) ?? null;
  const node = unit && location.eventId && unit.linkedEntityIds.includes(location.eventId) ? props.events.find((item) => item.id === location.eventId) ?? null : null;
  const semantic = detail?.status === "ready" ? buildEventSemanticNode({ id: detail.event.id, title: detail.event.title, tags: detail.event.tags, properties: detail.event.properties, body: detail.event.body, revision: detail.event.revisionToken, status: detail.event.status }) : null;
  const unitNodes = unit?.linkedEntityIds.flatMap((id) => props.events.find((item) => item.id === id) ?? []) ?? [];
  const visibleLines = lines.filter((item) => item.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  if (sort === "title") visibleLines.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));

  useEffect(() => {
    const onPop = () => setLocation(readEventLineJourneyLocation(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (!listRef.current) return;
    const key = `event-line-scroll:${props.projectId}:${location.lineKey ?? "root"}:${location.unitId ?? "root"}`;
    listRef.current.scrollTop = Number(window.sessionStorage.getItem(key)) || 0;
  }, [props.projectId, location.lineKey, location.unitId]);
  useEffect(() => {
    if (!node) { setDetail(null); return; }
    let active = true;
    setDetail(null);
    void getVerifiedCanonEvent(props.projectId, node.id, props.workVersionId ?? undefined).then((read) => { if (active) setDetail(read); }).catch(() => { if (active) setDetail({ status: "error", error: { kind: "repository-io", message: "正式事件读取失败，请重试。" } }); });
    return () => { active = false; };
  }, [props.projectId, props.workVersionId, node?.id]);

  function navigate(next: EventLineJourneyLocation) {
    window.history.pushState({}, "", eventLineJourneyUrl(next));
    setLocation(next);
  }
  const crumb = <nav className="event-journey-breadcrumb" aria-label="事件线位置"><button type="button" onClick={() => navigate({ lineKey: null, unitId: null, eventId: null })}>事件线</button>{line ? <><span>/</span><button type="button" onClick={() => navigate({ lineKey: line.key, unitId: null, eventId: null })}>{line.title}</button></> : null}{unit && line ? <><span>/</span><button type="button" onClick={() => navigate({ lineKey: line.key, unitId: unit.id, eventId: null })}>{unit.title}</button></> : null}{node ? <><span>/</span><strong>{node.title}</strong></> : null}</nav>;

  return <section className="event-line-journey" data-testid="event-line-journey" data-level={node ? "node" : unit ? "unit" : line ? "line" : "lines"}>
    {crumb}
    {!line ? <><header><h1>选择事件线</h1><p>先确定故事范围，再进入单元与节点。浏览不会修改排演目标。</p><button type="button" onClick={() => props.onOverview(location)}>打开已有管理与画布工具</button></header><div className="event-journey-controls"><label>搜索事件线<input aria-label="搜索事件线" value={query} onChange={(event) => { setQuery(event.target.value); window.sessionStorage.setItem(`event-line-search:${props.projectId}`, event.target.value); }} /></label><label>排序<select aria-label="事件线排序" value={sort} onChange={(event) => { const next = event.target.value as "title" | "source"; setSort(next); window.sessionStorage.setItem(`event-line-sort:${props.projectId}`, next); }}><option value="source">原有顺序</option><option value="title">名称</option></select></label></div><div className="event-journey-list" ref={listRef} onScroll={(event) => window.sessionStorage.setItem(`event-line-scroll:${props.projectId}:root:root`, String(event.currentTarget.scrollTop))}>{visibleLines.length ? visibleLines.map((item) => <button type="button" key={item.key} title={item.title} onClick={() => navigate({ lineKey: item.key, unitId: null, eventId: null })}><strong>{item.title}</strong><span>{item.units.length} 个单元</span></button>) : <p>没有匹配的事件线。</p>}</div></> : null}
    {line && !unit ? <><header><h1>{line.title}</h1><p>{line.units.length} 个单元 · 选一个单元继续，或打开已有画布概览。</p><button type="button" onClick={() => props.onOverview(location)}>画布概览与事件线工具</button></header><div className="event-journey-list" ref={listRef} onScroll={(event) => window.sessionStorage.setItem(`event-line-scroll:${props.projectId}:${line.key}:root`, String(event.currentTarget.scrollTop))}>{line.units.map((item) => <button type="button" key={item.id} title={item.title} onClick={() => navigate({ lineKey: line.key, unitId: item.id, eventId: null })}><strong>{item.title}</strong><span>{item.linkedEntityIds.length} 个关联节点 · {({ draft: "草稿", active: "进行中", candidate: "候选", conflict: "有冲突", archived: "已归档" } as const)[item.status]}</span></button>)}{!line.units.length ? <p>这条事件线还没有单元。</p> : null}</div></> : null}
    {unit && !node ? <><header><h1>{unit.title}</h1><p>{unit.summary || "此单元尚无简介。"}</p><button type="button" onClick={() => props.onOverview(location)}>在画布中查看与管理</button></header><div className="event-journey-list" ref={listRef} onScroll={(event) => window.sessionStorage.setItem(`event-line-scroll:${props.projectId}:${line!.key}:${unit.id}`, String(event.currentTarget.scrollTop))}>{unitNodes.map((item) => <button type="button" key={item.id} title={item.title} onClick={() => navigate({ lineKey: line!.key, unitId: unit.id, eventId: item.id })}><strong>{item.title}</strong><span>{item.status === "committed" ? "已确认" : "草稿"}</span></button>)}{!unitNodes.length ? <p>此单元暂无可读取节点；单元仍保留。</p> : null}</div></> : null}
    {node ? <article className="event-journey-detail"><header><h1>{node.title}</h1><span>{node.status === "committed" ? "已确认事件" : "作者草稿"}</span><button type="button" onClick={() => props.onOverview(location)}>打开完整详情与分析</button></header>{detail?.status === "ready" ? <><div className="event-journey-body">{authorEventBody(detail.event.body).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div><dl><div><dt>故事单元</dt><dd>{unit?.title}</dd></div><div><dt>正式编排</dt><dd>{props.narratives.flatMap((item) => item.projection.placed).filter((placement) => placement.eventId === node.id && placement.storyUnitId === unit?.id).map((placement) => `第 ${placement.narrativeIndex + 1} 位`).join("、") || "尚无正式排列位置"}</dd></div><div><dt>相关人物</dt><dd>{semantic?.participants.join("、") || "来源未记录"}</dd></div><div><dt>时间</dt><dd>{semantic?.time.label ?? "未知"}</dd></div><div><dt>地点</dt><dd>{semantic?.locations.join("、") || "来源未记录"}</dd></div></dl><details><summary>来源与技术详情</summary><p>来源：{semantic?.source.ref ?? "未记录"}</p><p>来源版本：{semantic?.source.version ?? "未知"}</p><p>事件 ID：{detail.event.id}</p><button type="button" onClick={() => void navigator.clipboard.writeText(detail.event.id)}>复制事件 ID</button></details></> : detail?.status === "error" ? <p role="alert">{detail.error.message}</p> : <p role="status">正在读取正式事件…</p>}</article> : null}
    {line && !unit && location.unitId ? <p role="alert">当前单元不属于所选事件线。<button type="button" onClick={() => navigate({ lineKey: line.key, unitId: null, eventId: null })}>返回事件线</button></p> : null}
    {!line && location.lineKey ? <p role="alert">这条事件线在当前项目不可用；已保留原链接。</p> : null}
  </section>;
}
