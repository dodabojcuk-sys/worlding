import { useEffect, useMemo, useState } from "react";
import { GitBranch, Link2, ListFilterPlus, Network, RefreshCw, X } from "lucide-react";

import { createStoryStudioEventReference, type StoryStudioEventReference } from "../../../../../src/storyContracts/storyStudioEventReference";
import {
  getCreationSourcePortState,
  getNarrativeArrangement,
  getVerifiedCanonEventList,
  getWorldLibrary,
  listStoryUnits,
  type NarrativeArrangementRead,
  type NuwaN1Storyline,
  type StoryUnit,
  type WorldObjectSummary
} from "../../lib/localTransport";
import { eventLineEventMetadata, eventWorkspaceProjectionSummaries } from "../eventLineCommittedEvents";

export type BrowsedEvent = { eventId: string; title: string; unitTitle: string; inCurrentScope: boolean };

/**
 * The auxiliary event-line rail for the Nuwa-led workspace: a compact vertical
 * projection of the formal story spine around the live run position. Node
 * order comes only from the existing NarrativeArrangement placements; events
 * without a formal placement are listed under 「关联事件」 with no implied
 * narrative order, branch membership, or causality. The rail is read-only:
 * selecting here never mutates the run, the scope, or any story fact.
 */
export function NuwaEventLineRail(props: {
  projectId: string;
  workVersionId: string | null;
  storylines: NuwaN1Storyline[];
  currentStoryUnitId: string | null;
  browsedEventId: string | null;
  onSelectEvent(event: BrowsedEvent | null): void;
  onCollapse?(): void;
  onOpenTianyi(reference: StoryStudioEventReference, initialDraft: string, sourceLabels?: string[]): void;
}) {
  const [units, setUnits] = useState<StoryUnit[]>([]);
  const [events, setEvents] = useState<WorldObjectSummary[]>([]);
  const [arrangements, setArrangements] = useState<NarrativeArrangementRead[] | null>(null);
  const [canonError, setCanonError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setCanonError(false);
    void (async () => {
      const [unitList, library, verified, creationSource] = await Promise.all([
        listStoryUnits(props.projectId),
        getWorldLibrary(props.projectId),
        getVerifiedCanonEventList(props.projectId, props.workVersionId),
        getCreationSourcePortState({ projectId: props.projectId })
      ]);
      const activeUnits = unitList.filter((unit) => unit.lifecycle !== "archived");
      // Order is authoritative only where the existing NarrativeArrangement
      // owner has placed the event on a path. No root / no arrangement simply
      // means everything is shown as unordered related events.
      const rootId = creationSource.root?.id ?? null;
      const reads = rootId
        ? await Promise.all(activeUnits.filter((unit) => unit.kind === "main" || unit.kind === "branch").map((unit) => getNarrativeArrangement(props.projectId, rootId, unit.id).catch(() => null)))
        : [];
      return { activeUnits, library, verified, reads: reads.filter((read): read is NarrativeArrangementRead => Boolean(read)) };
    })()
      .then((result) => {
        if (!active) return;
        setUnits(result.activeUnits);
        setEvents(result.verified.status === "ready" ? eventWorkspaceProjectionSummaries(result.library.objects, result.verified.eventIds) : []);
        setArrangements(result.reads);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setCanonError(true);
        setLoading(false);
      });
    return () => { active = false; };
  }, [props.projectId, props.workVersionId, reloadTick]);
  const titleByUnitId = useMemo(() => new Map(units.map((unit) => [unit.id, unit.title])), [units]);
  const eventById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  /** Placed event ids for a unit, in the arrangement owner's orderKey order. */
  const placedIdsByUnitId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const read of arrangements ?? []) {
      const placed = [...read.projection.placed].sort((left, right) => left.orderKey - right.orderKey);
      for (const placement of placed) {
        map.set(placement.storyUnitId, [...(map.get(placement.storyUnitId) ?? []), placement.eventId]);
      }
    }
    return map;
  }, [arrangements]);
  const orderIndexByEventId = useMemo(() => {
    const map = new Map<string, number>();
    for (const read of arrangements ?? []) {
      for (const placement of read.projection.placed) {
        if (!map.has(placement.eventId) || (map.get(placement.eventId) ?? 0) > placement.narrativeIndex) map.set(placement.eventId, placement.narrativeIndex);
      }
    }
    return map;
  }, [arrangements]);
  const railNodes = (unitId: string) => {
    const linked = units.find((unit) => unit.id === unitId)?.linkedEntityIds.filter((id) => eventById.has(id)) ?? [];
    const placed = (placedIdsByUnitId.get(unitId) ?? []).filter((id) => linked.includes(id)).map((id) => eventById.get(id)!);
    const related = linked.filter((id) => !placed.some((event) => event.id === id)).map((id) => eventById.get(id)!).sort((left, right) => left.title.localeCompare(right.title, "zh-Hans"));
    return { placed, related };
  };
  const currentStoryline = useMemo(() => props.storylines.find((line) => line.units.some((unit) => unit.id === props.currentStoryUnitId)) ?? props.storylines[0] ?? null, [props.storylines, props.currentStoryUnitId]);
  const branchLines = useMemo(() => props.storylines.filter((line) => line !== currentStoryline), [props.storylines, currentStoryline]);
  const selectEvent = (event: WorldObjectSummary, unitId: string) => {
    props.onSelectEvent({ eventId: event.id, title: event.title, unitTitle: titleByUnitId.get(unitId) ?? "", inCurrentScope: unitId === props.currentStoryUnitId });
  };
  const referenceFor = (event: WorldObjectSummary) => createStoryStudioEventReference({ projectId: props.projectId, event, requestedUse: "constraint" });
  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const hasFormalOrder = (arrangements ?? []).some((read) => read.projection.placed.length > 0);
  return <section className="nuwa-n1-event-rail" aria-label="事件线辅助栏" data-testid="nuwa-event-rail" data-formal-order={hasFormalOrder ? "true" : "false"}>
    <header className="nuwa-n1-event-rail-header">
      <div><Network aria-hidden="true" /><span><small>事件线 · 只读浏览</small><strong>正式故事位置</strong></span></div>
      <div className="nuwa-n1-event-rail-actions">
        <button type="button" title="打开事件线空间，管理多条事件线" onClick={() => navigate("/event-line")}><ListFilterPlus aria-hidden="true" />管理</button>
        <button type="button" title="在事件线空间新增节点或单元（复用既有创建流程）" onClick={() => navigate("/event-line?eventTask=story")}>新增</button>
        {props.onCollapse ? <button type="button" title="收起事件线辅助栏（可随时重新打开，浏览位置会保留）" aria-label="收起事件线辅助栏" onClick={props.onCollapse}><X aria-hidden="true" /></button> : null}
      </div>
    </header>
    {loading ? <p className="nuwa-n1-event-rail-state"><RefreshCw aria-hidden="true" />正在读取正式事件线…</p> : null}
    {canonError ? <p className="nuwa-n1-event-rail-state is-error" role="alert">事件线读取失败；正式故事没有被修改。<button type="button" onClick={() => setReloadTick((value) => value + 1)}>重试</button></p> : null}
    {!loading && !canonError ? <div className="nuwa-n1-event-rail-body">
      {currentStoryline ? <div className="nuwa-n1-rail-line">
        <p className="nuwa-n1-rail-line-title">{currentStoryline.title}{hasFormalOrder ? null : " · 尚无正式叙事编排"}</p>
        <ol>
          {currentStoryline.units.map((unit) => {
            const isCurrent = unit.id === props.currentStoryUnitId;
            const { placed, related } = railNodes(unit.id);
            return <li key={unit.id} className={isCurrent ? "is-current" : ""}>
              <div className="nuwa-n1-rail-unit"><strong>{unit.title}</strong>{isCurrent ? <span className="nuwa-n1-rail-now">当前排演位置</span> : null}</div>
              {placed.length ? <ul>{placed.map((event) => <RailEventNode key={event.id} event={event} browsed={props.browsedEventId === event.id} inCurrentScope={isCurrent} unitTitle={unit.title} order={orderIndexByEventId.get(event.id) ?? null} onSelect={() => selectEvent(event, unit.id)} onOpenTianyi={() => props.onOpenTianyi(referenceFor(event), `请结合事件「${event.title}」检查当前排演的走向。`, [event.title])} />)}</ul> : null}
              {related.length ? <details className="nuwa-n1-rail-related">
                <summary><Link2 aria-hidden="true" />关联事件<small>{related.length} 项 · 无正式叙事编排</small></summary>
                <ul>{related.map((event) => <RailEventNode key={event.id} event={event} browsed={props.browsedEventId === event.id} inCurrentScope={isCurrent} unitTitle={unit.title} order={orderIndexByEventId.get(event.id) ?? null} onSelect={() => selectEvent(event, unit.id)} onOpenTianyi={() => props.onOpenTianyi(referenceFor(event), `请结合事件「${event.title}」检查当前排演的走向。`, [event.title])} />)}</ul>
              </details> : null}
              {!placed.length && !related.length ? <p className="nuwa-n1-rail-empty-unit">该单元暂无已确认事件</p> : null}
            </li>;
          })}
        </ol>
      </div> : <p className="nuwa-n1-event-rail-state">当前作品还没有事件线。</p>}
      {branchLines.length ? <div className="nuwa-n1-rail-line is-branch">
        <p className="nuwa-n1-rail-line-title"><GitBranch aria-hidden="true" />分支线</p>
        {branchLines.map((line) => {
          const unit = line.units[0];
          const { placed, related } = unit ? railNodes(unit.id) : { placed: [], related: [] };
          return <details key={line.key} className="nuwa-n1-rail-branch" open={Boolean(props.currentStoryUnitId && unit?.id === props.currentStoryUnitId)}>
            <summary>{line.title.replace(/^分支 · /u, "")}<small>{placed.length + related.length ? `${placed.length + related.length} 个事件` : "暂无事件"}</small></summary>
            {placed.length ? <ul>{placed.map((event) => <RailEventNode key={event.id} event={event} browsed={props.browsedEventId === event.id} inCurrentScope={unit?.id === props.currentStoryUnitId} unitTitle={unit?.title ?? ""} order={orderIndexByEventId.get(event.id) ?? null} onSelect={() => unit && selectEvent(event, unit.id)} onOpenTianyi={() => unit && props.onOpenTianyi(referenceFor(event), `请结合分支事件「${event.title}」说明与主线的差异。`, [event.title])} />)}</ul> : null}
            {related.length ? <details className="nuwa-n1-rail-related">
              <summary><Link2 aria-hidden="true" />关联事件<small>{related.length} 项 · 无正式叙事编排</small></summary>
              <ul>{related.map((event) => <RailEventNode key={event.id} event={event} browsed={props.browsedEventId === event.id} inCurrentScope={unit?.id === props.currentStoryUnitId} unitTitle={unit?.title ?? ""} order={orderIndexByEventId.get(event.id) ?? null} onSelect={() => unit && selectEvent(event, unit.id)} onOpenTianyi={() => unit && props.onOpenTianyi(referenceFor(event), `请结合分支事件「${event.title}」说明与主线的差异。`, [event.title])} />)}</ul>
            </details> : null}
            {!placed.length && !related.length ? <p className="nuwa-n1-rail-empty-unit">该分支暂无已确认事件</p> : null}
          </details>;
        })}
      </div> : null}
    </div> : null}
  </section>;
}

function RailEventNode(props: {
  event: WorldObjectSummary;
  browsed: boolean;
  inCurrentScope: boolean;
  unitTitle: string;
  order: number | null;
  onSelect(): void;
  onOpenTianyi(): void;
}) {
  const metadata = eventLineEventMetadata(props.event);
  const statusLabel = props.event.status === "committed" ? "已确认" : props.event.status === "planned" ? "规划中" : props.event.status === "draft" ? "草稿" : null;
  return <li className={props.browsed ? "is-browsed" : ""}>
    <div className="nuwa-n1-rail-event">
      <button type="button" data-testid="nuwa-rail-event" onClick={props.onSelect} aria-pressed={props.browsed}>{props.order != null ? <span className="nuwa-n1-rail-order" aria-label={`叙事顺序第 ${props.order + 1} 位`}>{props.order + 1}</span> : null}<strong>{props.event.title}</strong><small>{[statusLabel, props.inCurrentScope ? "排演现场内" : null].filter(Boolean).join(" · ") || props.unitTitle}</small></button>
      <details>
        <summary>详情</summary>
        <p>{metadata.characterLabels.length ? `关联角色：${metadata.characterLabels.join("、")}` : "暂无关联角色标注"}</p>
        <p>{metadata.locationLabels.length ? `关联地点：${metadata.locationLabels.join("、")}` : "暂无关联地点标注"}</p>
        <button type="button" onClick={props.onOpenTianyi}>引用到天意</button>
      </details>
    </div>
  </li>;
}
